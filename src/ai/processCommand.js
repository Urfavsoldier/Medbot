export async function processCommand(text) {
  const input = normalizeInput(text);
  console.log("MedBot AI processCommand", input);

  try {
    const config = await getAiConfig();
    if (config.apiKey) {
      const raw = await requestLlmJson(input, config);
      return validateCommand(JSON.parse(raw));
    }
  } catch (error) {
    console.warn("MedBot AI LLM fallback used", error);
  }

  return buildFallbackCommand(input);
}

const SUPPORTED_INTENTS = Object.freeze([
  "open_patient_record",
  "navigate_to_document",
  "fill_medical_form",
  "generate_schedule",
  "mark_service_completed",
  "suggest_next_step"
]);

const MEDICAL_FIELDS = Object.freeze([
  "complaints",
  "anamnesis",
  "objective_status",
  "recommendations",
  "procedure_result"
]);

const SYSTEM_PROMPT = `
You are MedBot, a medical RPA command parser.
Return strict JSON only. No markdown. No prose.
Use one intent: open_patient_record, navigate_to_document, fill_medical_form, generate_schedule, mark_service_completed, suggest_next_step.
For medical forms, split doctor's speech into granular fields:
complaints, anamnesis, objective_status, recommendations, procedure_result.
Never put the whole note into one field.
Return unknown values by omitting the key.
`.trim();

async function getAiConfig() {
  if (!globalThis.chrome?.storage?.local) {
    return {
      provider: "openai",
      apiKey: "",
      model: "gpt-4o-mini"
    };
  }

  const stored = await chrome.storage.local.get([
    "medbot.ai.provider",
    "medbot.ai.apiKey",
    "medbot.ai.model"
  ]);

  const provider = String(stored["medbot.ai.provider"] || "openai").toLowerCase();

  return {
    provider,
    apiKey: stored["medbot.ai.apiKey"] || "",
    model: stored["medbot.ai.model"] || (provider === "claude" ? "claude-3-5-sonnet-latest" : "gpt-4o-mini")
  };
}

async function requestLlmJson(text, config) {
  if (config.provider === "claude") {
    return requestClaude(text, config);
  }

  return requestOpenAI(text, config);
}

async function requestOpenAI(text, config) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text }
      ]
    })
  });

  const payload = await readApiJson(response, "OpenAI");
  const content = payload?.choices?.[0]?.message?.content;

  if (!isStrictJsonObjectString(content)) {
    throw new Error("OpenAI returned invalid JSON content.");
  }

  return content.trim();
}

async function requestClaude(text, config) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": config.apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: 900,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: text }]
    })
  });

  const payload = await readApiJson(response, "Claude");
  const content = payload?.content?.find((item) => item?.type === "text")?.text;

  if (!isStrictJsonObjectString(content)) {
    throw new Error("Claude returned invalid JSON content.");
  }

  return content.trim();
}

async function readApiJson(response, provider) {
  const body = await response.text();
  let payload = null;

  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`${provider} returned a non-JSON API response.`);
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || payload?.message || `${provider} request failed.`);
  }

  return payload;
}

function buildFallbackCommand(text) {
  const fields = parseMedicalFields(text);

  if (Object.keys(fields).length > 0) {
    return {
      intent: "fill_medical_form",
      document_type: "primary_exam",
      fields
    };
  }

  const lower = text.toLowerCase();

  if (containsAny(lower, ["schedule", "распис", "график"])) {
    return {
      intent: "generate_schedule",
      target: "schedule",
      service: extractAfter(text, ["schedule", "расписание", "график"]) || "Treatment"
    };
  }

  if (containsAny(lower, ["patient", "пациент", "карта"])) {
    return {
      intent: "open_patient_record",
      target: "patients",
      patient: { name: text }
    };
  }

  if (containsAny(lower, ["document", "осмотр", "документ"])) {
    return {
      intent: "navigate_to_document",
      document_type: "primary_exam",
      target: "primary_exam"
    };
  }

  return {
    intent: "suggest_next_step",
    next_step: "Уточните действие для MedBot."
  };
}

function validateCommand(command) {
  if (!command || typeof command !== "object" || Array.isArray(command)) {
    throw new Error("AI response must be a JSON object.");
  }

  if (!SUPPORTED_INTENTS.includes(command.intent)) {
    throw new Error(`Unsupported intent: ${command.intent}`);
  }

  const output = { intent: command.intent };
  copyString(command, output, "document_type");
  copyString(command, output, "target");
  copyString(command, output, "service");
  copyString(command, output, "next_step");
  copyString(command, output, "startDate");
  copyNumber(command, output, "days");

  const fields = pickStringMap(command.fields, MEDICAL_FIELDS);
  if (Object.keys(fields).length > 0) {
    output.fields = fields;
  }

  const patient = pickStringMap(command.patient, ["name", "id"]);
  if (Object.keys(patient).length > 0) {
    output.patient = patient;
  }

  if (isPlainObject(command.schedule)) output.schedule = cloneJson(command.schedule);
  if (Array.isArray(command.procedures)) output.procedures = cloneJson(command.procedures);
  if (Array.isArray(command.specialists)) output.specialists = cloneJson(command.specialists);
  if (isPlainObject(command.workingHours)) output.workingHours = cloneJson(command.workingHours);

  if (output.intent === "fill_medical_form") {
    output.fields = {
      ...parseMedicalFields(Object.values(output.fields || {}).join(" ")),
      ...(output.fields || {})
    };

    if (!output.fields || Object.keys(output.fields).length === 0) {
      throw new Error("fill_medical_form requires fields.");
    }
  }

  return output;
}

function parseMedicalFields(text) {
  const source = String(text || "");
  const markers = [
    { field: "complaints", labels: ["жалобы", "жалуется на", "жалуется", "complaints"] },
    { field: "anamnesis", labels: ["анамнез", "history", "anamnesis"] },
    { field: "objective_status", labels: ["объективно", "объективный статус", "objective"] },
    { field: "recommendations", labels: ["назначить", "назначено", "рекомендации", "лечение", "treatment", "recommendations"] },
    { field: "procedure_result", labels: ["результат процедуры", "результат", "выполнено", "result"] }
  ];
  const found = [];
  const lower = source.toLowerCase();

  for (const marker of markers) {
    for (const label of marker.labels) {
      const index = lower.indexOf(label);
      if (index >= 0) {
        found.push({
          field: marker.field,
          start: index,
          end: consumeLabel(source, index + label.length)
        });
        break;
      }
    }
  }

  found.sort((a, b) => a.start - b.start);

  const fields = {};
  for (let index = 0; index < found.length; index += 1) {
    const current = found[index];
    const next = found[index + 1];
    const value = cleanFieldValue(source.slice(current.end, next ? next.start : source.length));
    if (value) fields[current.field] = value;
  }

  return fields;
}

function consumeLabel(text, index) {
  let cursor = index;
  while (cursor < text.length && /[\s:;,\-.—]/u.test(text[cursor])) {
    cursor += 1;
  }
  return cursor;
}

function cleanFieldValue(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .replace(/^[\s:;,\-.—]+/u, "")
    .replace(/[\s:;,\-.—]+$/u, "")
    .trim();
}

function containsAny(text, values) {
  return values.some((value) => text.includes(value));
}

function extractAfter(text, labels) {
  const lower = text.toLowerCase();
  for (const label of labels) {
    const index = lower.indexOf(label);
    if (index >= 0) return cleanFieldValue(text.slice(index + label.length));
  }
  return "";
}

function normalizeInput(text) {
  const input = String(text || "").trim();
  if (!input) throw new Error("processCommand(text) requires text.");
  return input;
}

function isStrictJsonObjectString(value) {
  return typeof value === "string" && value.trim().startsWith("{") && value.trim().endsWith("}");
}

function pickStringMap(value, allowedKeys) {
  const output = {};
  if (!isPlainObject(value)) return output;
  for (const key of allowedKeys) copyString(value, output, key);
  return output;
}

function copyString(source, target, key) {
  if (typeof source[key] === "string" && source[key].trim()) {
    target[key] = source[key].trim();
  }
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
