(() => {
  if (window.MedBotActionRouter) return;

  console.log("MedBot actionRouter loaded");

  async function route(command) {
    console.log("MedBot route intent", command?.intent, command);

    const dom = window.MedBotDomActions;
    if (!dom) {
      return failure("dom_unavailable", "DOM-модуль MedBot не загружен.");
    }

    if (!command || typeof command !== "object") {
      return failure("invalid_command", "Команда пустая или некорректная.");
    }

    try {
      let result;

      switch (command.intent) {
        case "open_patient_record":
          result = await dom.openPatient(command.patient_name || command.patient?.name || command.patient || "Иванов");
          if (result.ok && command.document_type) await dom.switchTab(command.document_type);
          break;

        case "navigate_to_document":
          result = await dom.switchTab(command.document_type || command.target || "primary_exam");
          break;

        case "fill_medical_form":
          if (command.document_type) await dom.switchTab(command.document_type);
          result = await dom.fillMedicalFields(command.fields || {});
          break;

        case "generate_schedule":
          result = await dom.applySchedule(command.schedule_result?.days || command.schedule_result || command.schedule?.days || command.days || []);
          break;

        case "mark_service_completed":
          result = await dom.markCompleted(command.service || command.service_name || command.target || "Массаж");
          break;

        case "write_procedure_diary":
          result = await dom.writeProcedureDiary(command.fields?.procedure_result || command.procedure_result || command.text || "Процедура выполнена, перенесена спокойно.");
          break;

        case "suggest_next_step":
          result = success("suggest_next_step", command.next_suggestion || "Сформировать расписание процедур?", {});
          break;

        case "ask_clarification":
          result = failure("ask_clarification", command.message || "Не удалось распознать команду. Повторите, пожалуйста.");
          break;

        default:
          result = failure("unsupported_intent", `Неподдерживаемое действие: ${command.intent || "unknown"}`);
      }

      const suggestion = window.MedBotProactiveAssistant?.afterAction?.(command, result) || null;
      return {
        ...result,
        intent: command.intent,
        suggestion,
        actionLog: dom.getActionLog?.() || []
      };
    } catch (error) {
      console.error("MedBot router error", error);
      return {
        ...failure("router_error", error?.message || String(error)),
        intent: command.intent,
        actionLog: dom.getActionLog?.() || []
      };
    }
  }

  function success(eventType, message, context = {}) {
    return { ok: true, event_type: eventType, message, context };
  }

  function failure(eventType, message, context = {}) {
    return { ok: false, event_type: eventType, message, context };
  }

  window.MedBotActionRouter = { route };
})();
