export const AI_EXAMPLES = [
  {
    input: "Открой первичный прием Иванова",
    output: {
      intent: "open_patient_record",
      document_type: "primary_exam",
      patient_name: "Иванов",
      next_suggestion: "Заполнить жалобы пациента?"
    }
  },
  {
    input: "Перейди к выписному эпикризу",
    output: {
      intent: "navigate_to_document",
      document_type: "discharge_summary"
    }
  },
  {
    input: "Жалобы на слабость, головную боль, сон плохой",
    output: {
      intent: "fill_medical_form",
      document_type: "primary_exam",
      fields: {
        complaints: "Слабость, головная боль, плохой сон"
      },
      next_suggestion: "Заполнить анамнез?"
    }
  },
  {
    input: "Объективно тонус снижен, координация нарушена",
    output: {
      intent: "fill_medical_form",
      document_type: "primary_exam",
      fields: {
        objective_status: "Мышечный тонус снижен, координация нарушена"
      }
    }
  },
  {
    input: "Назначить массаж и ЛФК",
    output: {
      intent: "fill_medical_form",
      document_type: "primary_exam",
      fields: {
        recommendations: "Назначить массаж и ЛФК"
      },
      procedures: [
        { name: "Массаж", specialistType: "Массажист", durationMinutes: 30, sessions: 9 },
        { name: "ЛФК", specialistType: "Инструктор ЛФК", durationMinutes: 40, sessions: 9 }
      ],
      next_suggestion: "Сформировать расписание процедур?"
    }
  },
  {
    input: "Жалобы: головная боль. Объективно: слабость. Назначить ЛФК.",
    output: {
      intent: "fill_medical_form",
      document_type: "primary_exam",
      fields: {
        complaints: "Головная боль",
        objective_status: "Слабость",
        recommendations: "Назначить ЛФК"
      },
      procedures: [
        { name: "ЛФК", specialistType: "Инструктор ЛФК", durationMinutes: 40, sessions: 9 }
      ],
      next_suggestion: "Сформировать расписание процедур?"
    }
  },
  {
    input: "Сформируй расписание на 9 рабочих дней",
    output: {
      intent: "generate_schedule",
      document_type: "schedule_page",
      days: 9,
      procedures: [
        { name: "Массаж", specialistType: "Массажист", durationMinutes: 30, sessions: 9 },
        { name: "ЛФК", specialistType: "Инструктор ЛФК", durationMinutes: 40, sessions: 9 }
      ]
    }
  },
  {
    input: "Поставь выполнено по массажу",
    output: {
      intent: "mark_service_completed",
      service: "Массаж",
      next_suggestion: "Заполнить дневник процедуры?"
    }
  },
  {
    input: "Запиши дневник процедуры: ребенок перенес процедуру спокойно",
    output: {
      intent: "write_procedure_diary",
      document_type: "procedure_diary",
      service: "Процедура",
      fields: {
        procedure_result: "Ребенок перенес процедуру спокойно"
      }
    }
  },
  {
    input: "Поставь выполнено по массажу и напиши краткий дневник",
    output: {
      intent: "write_procedure_diary",
      document_type: "procedure_diary",
      service: "Массаж",
      fields: {
        procedure_result: "Процедура массажа выполнена, перенесена спокойно"
      },
      next_suggestion: "Отметить услугу выполненной?"
    }
  },
  {
    input: "Открой дневник процедур",
    output: {
      intent: "navigate_to_document",
      document_type: "procedure_diary"
    }
  },
  {
    input: "Что дальше",
    output: {
      intent: "suggest_next_step",
      next_suggestion: "Проверьте заполнение анамнеза и сформируйте расписание процедур"
    }
  }
];

export function formatExamplesForPrompt() {
  return AI_EXAMPLES.map((example, index) => {
    return `Example ${index + 1}\nInput: ${example.input}\nOutput: ${JSON.stringify(example.output)}`;
  }).join("\n\n");
}
