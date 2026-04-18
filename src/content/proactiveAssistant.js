(() => {
  if (window.MedBotProactiveAssistant) return;

  console.log("MedBot proactiveAssistant loaded");

  const state = {
    currentStep: "idle",
    completedFields: new Set(),
    scheduleGenerated: false,
    lastSuggestion: "",
    lastSuggestionAt: 0
  };

  function afterAction(command, result) {
    console.log("MedBot proactive afterAction", command?.intent, result);
    if (!command || !result?.ok) return null;

    state.currentStep = stepForIntent(command.intent);

    if (command.intent === "fill_medical_form") {
      Object.keys(command.fields || {}).forEach((field) => state.completedFields.add(field));
      return suggestAfterExam(command);
    }

    if (command.intent === "generate_schedule") {
      state.scheduleGenerated = true;
      return suggest("Расписание успешно создано.");
    }

    if (command.intent === "mark_service_completed") {
      return suggest("Дневник процедуры не заполнен. Записать результат?");
    }

    if (command.intent === "write_procedure_diary") {
      return suggest("Данные сохранены.");
    }

    if (command.next_suggestion) return suggest(command.next_suggestion);
    return null;
  }

  function suggestAfterExam(command) {
    if (!state.completedFields.has("anamnesis")) return suggest("Вы не заполнили раздел «Анамнез».");
    if (!state.completedFields.has("complaints")) return suggest("Вы не заполнили раздел «Жалобы».");
    if (!state.completedFields.has("objective_status")) return suggest("Вы не заполнили раздел «Объективный статус».");
    if (!state.scheduleGenerated && (command.procedures || []).length > 0) return suggest("Сформировать расписание процедур?");
    return command.next_suggestion ? suggest(command.next_suggestion) : null;
  }

  function suggest(message) {
    if (!message) return null;
    if (state.lastSuggestion === message && Date.now() - state.lastSuggestionAt < 10000) return null;
    state.lastSuggestion = message;
    state.lastSuggestionAt = Date.now();
    showToast(message);
    return { message };
  }

  function showToast(message) {
    const old = document.getElementById("medbot-proactive-toast");
    if (old) old.remove();
    const toast = document.createElement("div");
    toast.id = "medbot-proactive-toast";
    toast.textContent = message;
    toast.style.cssText = [
      "position:fixed",
      "right:20px",
      "bottom:20px",
      "z-index:2147483647",
      "max-width:360px",
      "padding:14px 16px",
      "border:1px solid rgba(112,199,255,.32)",
      "border-radius:8px",
      "background:rgba(8,10,14,.96)",
      "color:#f6f8fb",
      "font:600 14px Inter,system-ui,sans-serif",
      "box-shadow:0 18px 60px rgba(0,0,0,.38)"
    ].join(";");
    document.documentElement.append(toast);
    window.setTimeout(() => toast.remove(), 9000);
  }

  function getContext() {
    return {
      currentStep: state.currentStep,
      completedFields: [...state.completedFields],
      scheduleGenerated: state.scheduleGenerated,
      lastSuggestion: state.lastSuggestion
    };
  }

  function stepForIntent(intent) {
    const map = {
      open_patient_record: "patient",
      navigate_to_document: "document",
      fill_medical_form: "exam",
      generate_schedule: "schedule",
      mark_service_completed: "completion",
      write_procedure_diary: "diary"
    };
    return map[intent] || "idle";
  }

  window.MedBotProactiveAssistant = { afterAction, suggest, getContext };
})();
