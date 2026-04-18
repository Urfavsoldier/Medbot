import { SYSTEM_PROMPT } from "./systemPrompt.js";
import { formatExamplesForPrompt } from "./examples.js";

console.log("MedBot AI module loaded");

const SUPPORTED_INTENTS = new Set([
  "open_patient_record",
  "navigate_to_document",
  "fill_medical_form",
  "generate_schedule",
  "mark_service_completed",
  "write_procedure_diary",
  "suggest_next_step",
  "ask_clarification"
]);

const DOCUMENT_TYPES = new Set(["primary_exam", "discharge_summary", "procedure_diary", "schedule_page"]);
const MEDICAL_FIELDS = ["complaints", "anamnesis", "objective_status", "recommendations", "procedure_result"];

export async function processCommand(text) {
  const input = normalizeInput(text);
  console.log("MedBot processCommand", input);

  try {
    const config = await getGeminiConfig();
    if (!config.apiKey) {
      console.warn("Gemini API key is not configured. Using local fallback parser.");
      return fallbackCommand(input);
    }

    const rawText = await callGemini(input, config);
    const parsed = parseJsonStrict(rawText);
    return normalizeCommand(parsed, input);
  } catch (error) {
    console.error("MedBot AI error", error);
    return fallbackCommand(input);
  }
}

async function getGeminiConfig() {
  if (!globalThis.chrome?.storage?.local) {
    return { apiKey: "", model: "gemini-1.5-flash" };
  }

  const stored = await chrome.storage.local.get(["medbot.gemini.apiKey", "medbot.gemini.model"]);
  return {
    apiKey: stored["medbot.gemini.apiKey"] || "",
    model: stored["medbot.gemini.model"] || "gemini-1.5-flash"
  };
}

async function callGemini(input, config) {
  const prompt = [
    SYSTEM_PROMPT,
    "High quality examples:",
    formatExamplesForPrompt(),
    `Doctor utterance: ${input}`,
    "Return strict JSON only."
  ].join("\n\n");

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.apiKey)}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json"
      }
    })
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error?.message || "Gemini request failed.");
  }

  return payload?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("").trim() || "";
}

function parseJsonStrict(rawText) {
  const text = String(rawText || "").trim().replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```$/i, "").trim();

  if (!text.startsWith("{") || !text.endsWith("}")) {
    throw new Error("AI returned non-JSON text.");
  }

  return JSON.parse(text);
}

function normalizeCommand(command, sourceText) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error("AI command must be a JSON object.");
  }

  const intent = SUPPORTED_INTENTS.has(command.intent) ? command.intent : "ask_clarification";
  const output = { intent };

  if (DOCUMENT_TYPES.has(command.document_type)) output.document_type = command.document_type;
  copyString(command, output, "patient_name");
  copyString(command, output, "service");
  copyString(command, output, "message");
  copyString(command, output, "next_suggestion");
  copyNumber(command, output, "days");

  const fields = normalizeFields(command.fields);
  const deterministicFields = parseMedicalFields(sourceText);
  const mergedFields = { ...fields, ...deterministicFields };
  if (Object.keys(mergedFields).length > 0) output.fields = mergedFields;

  if (Array.isArray(command.procedures)) output.procedures = cloneJson(command.procedures);
  else output.procedures = inferProcedures(sourceText, output.fields);

  if (Array.isArray(command.specialists)) output.specialists = cloneJson(command.specialists);
  if (isPlainObject(command.workingHours)) output.workingHours = cloneJson(command.workingHours);
  if (isPlainObject(command.schedule)) output.schedule = cloneJson(command.schedule);

  if (intent === "fill_medical_form" && !output.document_type) output.document_type = "primary_exam";
  if (intent === "generate_schedule" && !output.document_type) output.document_type = "schedule_page";
  if (intent === "write_procedure_diary" && !output.document_type) output.document_type = "procedure_diary";

  if (intent === "ask_clarification" && !output.message) {
    output.message = "Не удалось точно распознать команду";
  }

  return output;
}

function fallbackCommand(text) {
  const fields = parseMedicalFields(text);
  const procedures = inferProcedures(text, fields);
  const lower = text.toLowerCase();

  if (/первич|при[её]м|карт|пациент|иванов/.test(lower)) {
    return {
      intent: "open_patient_record",
      document_type: lower.includes("первич") ? "primary_exam" : undefined,
      patient_name: extractPatientName(text) || "Иванов",
      next_suggestion: "Заполнить жалобы пациента?"
    };
  }

  if (/эпикриз|выпис/.test(lower)) {
    return { intent: "navigate_to_document", document_type: "discharge_summary" };
  }

  if (/дневник/.test(lower) && /запиши|напиши|процедур/.test(lower)) {
    return {
      intent: "write_procedure_diary",
      document_type: "procedure_diary",
      service: extractService(text) || "Процедура",
      fields: {
        procedure_result: fields.procedure_result || extractAfterColon(text) || "Процедура выполнена, перенесена спокойно"
      },
      next_suggestion: "Отметить услугу выполненной?"
    };
  }

  if (/выполнено|заверш/.test(lower)) {
    return {
      intent: "mark_service_completed",
      service: extractService(text) || "Массаж",
      next_suggestion: "Заполнить дневник процедуры?"
    };
  }

  if (/распис|график|9 рабочих/.test(lower)) {
    return {
      intent: "generate_schedule",
      document_type: "schedule_page",
      days: 9,
      procedures: procedures.length > 0 ? procedures : defaultProcedures()
    };
  }

  if (Object.keys(fields).length > 0 || procedures.length > 0) {
    return {
      intent: "fill_medical_form",
      document_type: "primary_exam",
      fields,
      procedures,
      next_suggestion: procedures.length > 0 ? "Сформировать расписание процедур?" : "Продолжить заполнение осмотра?"
    };
  }

  return {
    intent: "ask_clarification",
    message: "Не удалось точно распознать команду"
  };
}

function parseMedicalFields(text) {
  const source = String(text || "");
  const markers = [
    { field: "complaints", labels: ["жалобы", "жалоба", "жалуется на", "жалуется"] },
    { field: "anamnesis", labels: ["анамнез", "анамнестически"] },
    { field: "objective_status", labels: ["объективно", "объективный статус", "тонус", "координация"] },
    { field: "recommendations", labels: ["назначить", "рекомендации", "лечение"] },
    { field: "procedure_result", labels: ["результат процедуры", "ребенок перенес", "перенес процедуру", "процедуру спокойно"] }
  ];
  const found = [];
  const lower = source.toLowerCase();

  for (const marker of markers) {
    for (const label of marker.labels) {
      const index = lower.indexOf(label);
      if (index !== -1) {
        found.push({ field: marker.field, start: index, end: consumeLabel(source, index + label.length), label });
        break;
      }
    }
  }

  found.sort((a, b) => a.start - b.start);

  const fields = {};
  for (let index = 0; index < found.length; index += 1) {
    const current = found[index];
    const next = found[index + 1];
    let value = cleanValue(source.slice(current.end, next ? next.start : source.length));

    if (!value && current.field === "complaints") value = cleanValue(source.slice(current.start, next ? next.start : source.length));
    if (!value && current.field === "objective_status") value = cleanValue(source.slice(current.start, next ? next.start : source.length));
    if (!value && current.field === "procedure_result") value = cleanValue(source.slice(current.start, next ? next.start : source.length));

    if (value) fields[current.field] = stripLeadingMarker(value);
  }

  if (Object.keys(fields).length === 0 && /головн|боль|слабость|сон плох|тошнот|жалоб/u.test(lower) && !/объектив|анамнез|назнач|рекоменд/u.test(lower)) {
    fields.complaints = source;
  }

  return normalizeFields(fields);
}

function inferProcedures(text, fields = {}) {
  const haystack = `${text} ${fields.recommendations || ""}`.toLowerCase();
  const procedures = [];

  if (/массаж/.test(haystack)) {
    procedures.push({ name: "Массаж", specialistType: "Массажист", durationMinutes: 30, sessions: 9 });
  }

  if (/лфк|лечебн/.test(haystack)) {
    procedures.push({ name: "ЛФК", specialistType: "Инструктор ЛФК", durationMinutes: 40, sessions: 9 });
  }

  return procedures;
}

function defaultProcedures() {
  return [
    { name: "Массаж", specialistType: "Массажист", durationMinutes: 30, sessions: 9 },
    { name: "ЛФК", specialistType: "Инструктор ЛФК", durationMinutes: 40, sessions: 9 }
  ];
}

function normalizeFields(fields) {
  const output = {};
  if (!isPlainObject(fields)) return output;

  for (const field of MEDICAL_FIELDS) {
    if (typeof fields[field] === "string" && fields[field].trim()) {
      output[field] = fields[field].trim();
    }
  }

  return output;
}

function extractPatientName(text) {
  const match = String(text).match(/(?:пациент[а-я]*|при[её]м)\s+([А-ЯЁA-Z][а-яёa-z-]+)/u);
  return match?.[1] || "";
}

function extractService(text) {
  if (/массаж/i.test(text)) return "Массаж";
  if (/лфк/i.test(text)) return "ЛФК";
  return "";
}

function extractAfterColon(text) {
  const index = String(text).indexOf(":");
  return index >= 0 ? cleanValue(String(text).slice(index + 1)) : "";
}

function consumeLabel(text, index) {
  let cursor = index;
  while (cursor < text.length && /[\s:;,\-.—]/u.test(text[cursor])) cursor += 1;
  return cursor;
}

function stripLeadingMarker(value) {
  return cleanValue(value.replace(/^(жалобы|жалуется на|жалуется|объективно|назначить|анамнез)\s*[:\-—]?\s*/iu, ""));
}

function cleanValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-.—]+/u, "")
    .replace(/[\s:;,\-.—]+$/u, "")
    .trim();
}

function normalizeInput(text) {
  const input = String(text || "").trim();
  if (!input) throw new Error("Empty command text.");
  return input;
}

function copyString(source, target, key) {
  if (typeof source[key] === "string" && source[key].trim()) target[key] = source[key].trim();
}

function copyNumber(source, target, key) {
  if (Number.isFinite(source[key])) target[key] = source[key];
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
