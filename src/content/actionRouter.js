(() => {
  if (window.MedBotActionRouter) return;

  console.log("MedBot actionRouter loaded");

  async function route(command) {
    console.log("MedBot route intent", command?.intent, command);
    const dom = window.MedBotDomActions;
    if (!dom) return fail("DOM actions module is not loaded");

    try {
      let result;

      switch (command.intent) {
        case "open_patient_record":
          result = await dom.openPatientRecord(command.patient_name || command.patient?.name || "");
          if (result.ok && command.document_type) await dom.navigateToTab(documentLabel(command.document_type));
          break;

        case "navigate_to_document":
          result = await dom.navigateToTab(documentLabel(command.document_type || command.target));
          break;

        case "fill_medical_form":
          result = await fillMedicalFields(command.fields || {});
          break;

        case "generate_schedule":
          result = await renderSchedule(command);
          break;

        case "mark_service_completed":
          result = await dom.setCompletedStatus(command.service || command.target || "Выполнено");
          break;

        case "write_procedure_diary":
          result = await dom.writeProcedureDiary(command.fields?.procedure_result || command.text || "Процедура выполнена");
          break;

        case "suggest_next_step":
          result = ok(command.next_suggestion || "Следующий шаг готов");
          break;

        case "ask_clarification":
          result = fail(command.message || "Нужно уточнение команды");
          break;

        default:
          result = fail(`Unsupported intent: ${command.intent}`);
      }

      const suggestion = window.MedBotProactiveAssistant?.afterAction(command, result);
      return { ...result, suggestion, actionLog: dom.getActionLog() };
    } catch (error) {
      console.error("MedBot router error", error);
      return { ...fail(error?.message || String(error)), actionLog: dom.getActionLog() };
    }
  }

  async function fillMedicalFields(fields) {
    const dom = window.MedBotDomActions;
    const entries = Object.entries(fields);
    if (entries.length === 0) return fail("Нет полей для заполнения");

    const failed = [];
    for (const [field, value] of entries) {
      const result = await dom.fillField(field, value);
      if (!result.ok) failed.push(field);
    }

    return failed.length > 0 ? fail(`Не заполнено: ${failed.join(", ")}`) : ok(`Заполнено полей: ${entries.length}`);
  }

  async function renderSchedule(command) {
    const dom = window.MedBotDomActions;
    const schedule = command.schedule_result;
    await dom.navigateToTab("расписание");

    if (!schedule) {
      return command.schedule_error ? fail(command.schedule_error) : ok("Расписание не передано");
    }

    const text = formatSchedule(schedule);
    const filled = await dom.fillField("schedule", text);
    return filled.ok ? ok("Расписание сформировано", { schedule }) : ok("Расписание сформировано", { schedule, warning: "Поле расписания не найдено" });
  }

  function formatSchedule(schedule) {
    return (schedule.days || []).map((day) => {
      const slots = day.slots || day.items || [];
      const line = slots.map((slot) => `${slot.time || slot.start} ${slot.procedure} (${slot.specialist?.name || slot.specialist})`).join("; ");
      return `${day.date}: ${line}`;
    }).join("\n");
  }

  function documentLabel(documentType) {
    const labels = {
      primary_exam: "первичный прием",
      discharge_summary: "выписной эпикриз",
      procedure_diary: "дневник процедур",
      schedule_page: "расписание"
    };
    return labels[documentType] || documentType || "документ";
  }

  function ok(message, extra = {}) { return { ok: true, message, ...extra }; }
  function fail(message) { return { ok: false, message }; }

  window.MedBotActionRouter = { route };
})();
