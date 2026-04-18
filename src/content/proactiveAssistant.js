(() => {
  if (window.__MEDBOT_PROACTIVE_ASSISTANT_READY__) {
    return;
  }

  window.__MEDBOT_PROACTIVE_ASSISTANT_READY__ = true;

  const DEFAULT_REQUIRED_EXAM_FIELDS = Object.freeze(["complaints", "anamnesis", "objective_status"]);
  const TOAST_ID = "medbot-proactive-toast";
  const TOAST_STYLE_ID = "medbot-proactive-style";
  const SUGGESTION_COOLDOWN_MS = 12000;

  class ProactiveAssistant {
    constructor(options = {}) {
      this.logger = options.logger || (() => {});
      this.onAccept = options.onAccept || (() => {});
      this.requiredExamFields = options.requiredExamFields || DEFAULT_REQUIRED_EXAM_FIELDS;
      this.context = {
        currentStep: "idle",
        completedFields: new Set(),
        lastIntent: "",
        lastSuggestionKey: "",
        lastSuggestionAt: 0,
        scheduleCreated: false
      };
    }

    getContext() {
      return {
        currentStep: this.context.currentStep,
        completedFields: [...this.context.completedFields],
        lastIntent: this.context.lastIntent,
        scheduleCreated: this.context.scheduleCreated
      };
    }

    async recordAction(command, result) {
      if (!command?.intent) {
        return null;
      }

      this.context.lastIntent = command.intent;
      this.context.currentStep = this.stepForIntent(command.intent);

      if (command.intent === "fill_medical_form") {
        for (const fieldName of Object.keys(command.fields || {})) {
          this.context.completedFields.add(fieldName);
        }
      }

      if (command.intent === "generate_schedule" && result?.ok) {
        this.context.scheduleCreated = true;
      }

      return this.suggest(command, result);
    }

    async recordFieldInteraction(fieldName) {
      if (!fieldName) {
        return null;
      }

      this.context.currentStep = "exam";
      this.context.completedFields.add(fieldName);

      if (this.context.completedFields.size < 2) {
        return null;
      }

      return this.suggest({
        intent: "fill_medical_form",
        fields: Object.fromEntries([...this.context.completedFields].map((field) => [field, true]))
      }, { ok: true });
    }

    async suggest(command, result) {
      if (!result?.ok) {
        return this.emit({
          key: `action_failed:${command.intent}`,
          message: "Действие не выполнено. Проверьте страницу и повторите.",
          tone: "warning"
        });
      }

      if (command.intent === "fill_medical_form") {
        const missing = this.getMissingExamFields();

        if (missing.includes("anamnesis")) {
          return this.emit({
            key: "missing_anamnesis",
            message: "Вы забыли заполнить анамнез.",
            tone: "warning",
            actionLabel: "Заполнить позже"
          });
        }

        if (missing.length > 0) {
          return this.emit({
            key: `missing_fields:${missing.join(",")}`,
            message: `Не заполнено: ${missing.map(localizeMedicalField).join(", ")}.`,
            tone: "warning"
          });
        }

        if (!this.context.scheduleCreated) {
          return this.emit({
            key: "offer_schedule",
            message: "Осмотр заполнен. Сформировать расписание?",
            tone: "success",
            actionLabel: "Сформировать",
            action: {
              type: "route_intent",
              command: {
                intent: "generate_schedule",
                target: "schedule"
              }
            }
          });
        }
      }

      if (command.intent === "open_patient_record") {
        return this.emit({
          key: "patient_opened_next_exam",
          message: "Карта пациента открыта. Перейти к первичному осмотру?",
          tone: "info",
          actionLabel: "Открыть",
          action: {
            type: "route_intent",
            command: {
              intent: "navigate_to_document",
              document_type: "primary_exam"
            }
          }
        });
      }

      if (command.intent === "generate_schedule") {
        return this.emit({
          key: "schedule_ready",
          message: "Расписание сформировано. Отметить услугу после выполнения?",
          tone: "success"
        });
      }

      return null;
    }

    async emit(suggestion) {
      if (!suggestion?.message || this.isCoolingDown(suggestion.key)) {
        return null;
      }

      this.context.lastSuggestionKey = suggestion.key;
      this.context.lastSuggestionAt = Date.now();
      this.logger("proactive_assistant", "suggest", suggestion);
      this.showToast(suggestion);
      this.sendVoiceMessage(suggestion.message);
      return suggestion;
    }

    showToast(suggestion) {
      ensureToastStyle();

      const previousToast = document.getElementById(TOAST_ID);
      if (previousToast) {
        previousToast.remove();
      }

      const toast = document.createElement("div");
      toast.id = TOAST_ID;
      toast.className = `medbot-proactive-toast medbot-proactive-toast-${suggestion.tone || "info"}`;
      toast.setAttribute("role", "status");

      const body = document.createElement("div");
      body.className = "medbot-proactive-body";
      body.textContent = suggestion.message;
      toast.append(body);

      const controls = document.createElement("div");
      controls.className = "medbot-proactive-controls";

      if (suggestion.action && suggestion.actionLabel) {
        const accept = document.createElement("button");
        accept.type = "button";
        accept.className = "medbot-proactive-button medbot-proactive-button-primary";
        accept.textContent = suggestion.actionLabel;
        accept.addEventListener("click", async () => {
          toast.remove();
          await this.onAccept(suggestion.action);
        });
        controls.append(accept);
      }

      const dismiss = document.createElement("button");
      dismiss.type = "button";
      dismiss.className = "medbot-proactive-button";
      dismiss.textContent = "Позже";
      dismiss.addEventListener("click", () => toast.remove());
      controls.append(dismiss);
      toast.append(controls);

      document.documentElement.append(toast);
      window.setTimeout(() => toast.remove(), 14000);
    }

    sendVoiceMessage(message) {
      try {
        chrome.runtime.sendMessage({
          type: "MEDBOT_PROACTIVE_SUGGESTION",
          suggestion: {
            message,
            context: this.getContext()
          }
        });
      } catch {
        // The in-page toast is enough when the extension runtime is unavailable.
      }
    }

    getMissingExamFields() {
      return this.requiredExamFields.filter((fieldName) => !this.context.completedFields.has(fieldName));
    }

    stepForIntent(intent) {
      const steps = {
        open_patient_record: "patient_record",
        navigate_to_document: "document",
        fill_medical_form: "exam",
        generate_schedule: "schedule",
        mark_service_completed: "service_completion",
        suggest_next_step: "guidance"
      };

      return steps[intent] || "idle";
    }

    isCoolingDown(key) {
      return this.context.lastSuggestionKey === key && Date.now() - this.context.lastSuggestionAt < SUGGESTION_COOLDOWN_MS;
    }
  }

  function localizeMedicalField(fieldName) {
    const labels = {
      complaints: "жалобы",
      anamnesis: "анамнез",
      objective_status: "объективный статус",
      recommendations: "рекомендации",
      procedure_result: "результат процедуры"
    };

    return labels[fieldName] || fieldName;
  }

  function ensureToastStyle() {
    if (document.getElementById(TOAST_STYLE_ID)) {
      return;
    }

    const style = document.createElement("style");
    style.id = TOAST_STYLE_ID;
    style.textContent = `
      .medbot-proactive-toast {
        position: fixed;
        right: 20px;
        bottom: 20px;
        z-index: 2147483647;
        width: min(360px, calc(100vw - 40px));
        padding: 14px;
        border: 1px solid rgba(106, 183, 255, 0.28);
        border-radius: 8px;
        background: rgba(12, 15, 20, 0.96);
        color: #f4f7fb;
        box-shadow: 0 18px 60px rgba(0, 0, 0, 0.38);
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        letter-spacing: 0;
      }

      .medbot-proactive-toast-success {
        border-color: rgba(114, 224, 196, 0.34);
      }

      .medbot-proactive-toast-warning {
        border-color: rgba(255, 190, 95, 0.42);
      }

      .medbot-proactive-body {
        font-size: 14px;
        line-height: 1.45;
      }

      .medbot-proactive-controls {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
        margin-top: 12px;
      }

      .medbot-proactive-button {
        min-height: 32px;
        border: 1px solid #2a3340;
        border-radius: 8px;
        background: #151a21;
        color: #f4f7fb;
        cursor: pointer;
        font: inherit;
        font-size: 12px;
        font-weight: 700;
        padding: 0 10px;
      }

      .medbot-proactive-button-primary {
        border-color: transparent;
        background: #6ab7ff;
        color: #06111c;
      }
    `;

    document.documentElement.append(style);
  }

  window.MedBotProactive = {
    ProactiveAssistant,
    createProactiveAssistant: (options) => new ProactiveAssistant(options)
  };
})();
