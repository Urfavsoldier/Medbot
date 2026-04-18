import { processCommand } from "../ai/processCommand.js";
import { generateTreatmentSchedule } from "../scheduling/smartScheduler.js";
import { generateSchedule, sendCommand, sendEvent } from "./n8nClient.js";

console.log("MedBot background loaded");

const STATUS_KEY = "medbot.status";
const LAST_COMMAND_KEY = "medbot.lastCommand";
const LAST_RESULT_KEY = "medbot.lastResult";
const TARGET_TAB_KEY = "medbot.targetTabId";

const STATUS = Object.freeze({
  IDLE: "Idle",
  LISTENING: "Listening",
  PROCESSING: "Processing",
  SPEAKING: "Speaking",
  ERROR: "Error"
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("MedBot installed");
  chrome.storage.local.set({
    [STATUS_KEY]: STATUS.IDLE,
    [LAST_COMMAND_KEY]: "",
    [LAST_RESULT_KEY]: null
  }).catch((error) => console.error("MedBot install init failed", error));
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("MedBot background message", message?.type, message);

  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      console.error("MedBot background error", error);
      sendResponse({ ok: false, error: error?.message || String(error) });
    });

  return true;
});

async function handleMessage(message, sender = null) {
  if (!message || typeof message.type !== "string") {
    throw new Error("Invalid message.");
  }

  switch (message.type) {
    case "PING":
      return { pong: true, layer: "background", time: new Date().toISOString() };

    case "MEDBOT_GET_STATE":
      return getState();

    case "MEDBOT_SET_STATUS":
      await setStatus(message.status, message.lastCommand);
      return getState();

    case "PROCESS_COMMAND":
      return processCommandPreview(message.payload || "", sender);

    case "MEDBOT_RUN_COMMAND":
      return runCommandOnActiveTab(message.command || "");

    case "MEDBOT_DOM_TEST":
      return runDomTest();

    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function getState() {
  const stored = await chrome.storage.local.get([STATUS_KEY, LAST_COMMAND_KEY, LAST_RESULT_KEY]);
  return {
    status: stored[STATUS_KEY] || STATUS.IDLE,
    lastCommand: stored[LAST_COMMAND_KEY] || "",
    lastResult: stored[LAST_RESULT_KEY] || null
  };
}

async function setStatus(status, lastCommand) {
  const patch = {};

  if (Object.values(STATUS).includes(status)) {
    patch[STATUS_KEY] = status;
  }

  if (typeof lastCommand === "string") {
    patch[LAST_COMMAND_KEY] = lastCommand.trim();
  }

  if (Object.keys(patch).length > 0) {
    await chrome.storage.local.set(patch);
  }
}

async function runCommandOnActiveTab(text) {
  const commandText = String(text || "").trim();
  if (!commandText) throw new Error("Command is empty.");

  await setStatus(STATUS.PROCESSING, commandText);
  let context = {
    source: "voice_or_text",
    commandText,
    locale: "ru-RU"
  };

  try {
    const tab = await getAutomationTargetTab();
    context = {
      ...await buildContext(commandText, "voice_or_text"),
      tab: tabToContext(tab)
    };
    const aiCommand = await processTextCommand(commandText, null, context);
    const structuredCommand = await enrichCommand(aiCommand, context);
    const contentResult = await sendToContent(tab.id, {
      type: "MEDBOT_EXECUTE_COMMAND",
      command: commandText,
      structuredCommand
    });

    const result = {
      ...(contentResult || {}),
      structuredCommand
    };

    const eventResponse = await safeSendEvent(contentResult?.ok === false ? "dom_action_failed" : (contentResult?.event_type || "dom_action_completed"), {
      ...context,
      tab: tabToContext(tab),
      commandText,
      structuredCommand,
      contentResult
    });

    const eventSuggestion = extractEventSuggestion(eventResponse);
    if (eventSuggestion) {
      result.suggestion = { message: eventSuggestion, source: "n8n" };
      result.next_suggestion = eventSuggestion;
    }
    result.event_response = eventResponse;

    await chrome.storage.local.set({
      [LAST_COMMAND_KEY]: commandText,
      [LAST_RESULT_KEY]: summarizeResult(result)
    });

    await setStatus(STATUS.IDLE, commandText);
    return result;
  } catch (error) {
    await setStatus(STATUS.ERROR, commandText);
    await safeSendEvent("command_failed", {
      ...context,
      commandText,
      error: error?.message || String(error)
    });
    throw error;
  }
}

async function runDomTest() {
  const tab = await getAutomationTargetTab();
  return sendToContent(tab.id, { type: "MEDBOT_DOM_TEST" });
}

async function processTextCommand(text, sender = null, existingContext = null) {
  const commandText = String(text || "").trim();
  if (!commandText) throw new Error("Command is empty.");

  const context = existingContext || await buildContext(commandText, "text", sender);

  try {
    const webhookResponse = await sendCommand(commandText, context);
    return normalizeWebhookCommand(webhookResponse);
  } catch (error) {
    console.error("MedBot n8n command failed, using local AI fallback", error);
    await safeSendEvent("command_webhook_failed", {
      ...context,
      commandText,
      error: error?.message || String(error)
    });
    return processCommand(commandText);
  }
}

async function processCommandPreview(text, sender = null) {
  const commandText = String(text || "").trim();
  if (!commandText) throw new Error("Command is empty.");

  const context = await buildContext(commandText, "text", sender);
  const command = await processTextCommand(commandText, sender, context);
  return enrichCommand(command, context);
}

async function enrichCommand(command, context = {}) {
  if (!command || typeof command !== "object") {
    throw new Error("Structured command is empty or invalid.");
  }

  if (command.intent !== "generate_schedule") {
    return command;
  }

  try {
    const schedulePayload = {
      context,
      command,
      procedures: command.procedures || command.schedule?.procedures || command.service || command.fields?.recommendations,
      specialists: command.specialists || command.schedule?.specialists,
      workingHours: command.workingHours || command.schedule?.workingHours,
      startDate: command.startDate || command.schedule?.startDate || command.schedule?.date,
      days: command.days || command.schedule?.days || 9
    };
    const scheduleResponse = await generateSchedule(schedulePayload);
    const scheduleResult = normalizeScheduleResponse(scheduleResponse);

    if (!isUsableSchedule(scheduleResult)) {
      throw new Error("n8n schedule webhook returned no schedule days.");
    }

    await safeSendEvent("schedule_generated", {
      ...context,
      command,
      scheduleResult
    });

    return {
      ...command,
      schedule_result: scheduleResult,
      n8n_schedule_response: scheduleResponse
    };
  } catch (error) {
    console.error("MedBot n8n schedule failed, using local scheduler fallback", error);
    await safeSendEvent("schedule_webhook_failed", {
      ...context,
      command,
      error: error?.message || String(error)
    });

    return {
      ...command,
      schedule_result: generateTreatmentSchedule({
        procedures: command.procedures || command.schedule?.procedures || command.service || command.fields?.recommendations,
        specialists: command.specialists || command.schedule?.specialists,
        workingHours: command.workingHours || command.schedule?.workingHours,
        startDate: command.startDate || command.schedule?.startDate || command.schedule?.date,
        days: command.days || command.schedule?.days || 9
      })
    };
  }
}

function normalizeWebhookCommand(payload) {
  const candidate = unwrapWebhookPayload(payload);
  if (candidate?.intent) return candidate;
  throw new Error("n8n command webhook returned no valid intent.");
}

function normalizeScheduleResponse(payload) {
  const candidate = unwrapWebhookPayload(payload);
  if (candidate?.schedule_result) return candidate.schedule_result;
  if (candidate?.schedule) return candidate.schedule;
  if (Array.isArray(candidate?.days)) return candidate;
  return candidate;
}

function isUsableSchedule(schedule) {
  return Array.isArray(schedule?.days) && schedule.days.length > 0;
}

function unwrapWebhookPayload(payload) {
  let current = unwrapArray(payload);

  if (typeof current === "string") {
    current = parseJsonString(current);
  }

  const keys = ["command", "result", "data", "body", "json", "output", "response"];
  for (const key of keys) {
    if (current?.[key] == null) continue;
    const next = unwrapArray(typeof current[key] === "string" ? parseJsonString(current[key]) : current[key]);
    if (next?.intent || next?.schedule_result || next?.schedule || Array.isArray(next?.days)) return next;
    current = next;
  }

  return current || {};
}

function unwrapArray(value) {
  return Array.isArray(value) ? value[0] : value;
}

function parseJsonString(value) {
  const text = String(value || "")
    .trim()
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/```$/i, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    return { raw: value };
  }
}

async function buildContext(commandText, source, sender = null) {
  const state = await getState();
  const tab = await getContextTab(sender);
  return {
    source,
    commandText,
    locale: "ru-RU",
    status: state.status,
    lastCommand: state.lastCommand,
    tab
  };
}

async function getContextTab(sender) {
  if (sender?.tab) return tabToContext(sender.tab);

  try {
    const tab = await getActiveTab();
    return tabToContext(tab);
  } catch {
    return null;
  }
}

function tabToContext(tab) {
  if (!tab) return null;
  return {
    id: tab.id,
    url: tab.url || "",
    title: tab.title || ""
  };
}

async function safeSendEvent(eventType, context) {
  try {
    return await sendEvent(eventType, context);
  } catch (error) {
    console.error("MedBot n8n event failed", eventType, error);
    return { ok: false, error: error?.message || String(error) };
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active tab found.");
  return tab;
}

async function getAutomationTargetTab() {
  const stored = await chrome.storage.local.get(TARGET_TAB_KEY);
  const storedTabId = Number(stored[TARGET_TAB_KEY]);

  if (Number.isFinite(storedTabId)) {
    try {
      const storedTab = await chrome.tabs.get(storedTabId);
      if (isControllableTab(storedTab)) return storedTab;
    } catch (error) {
      console.warn("MedBot stored target tab unavailable", error);
    }
  }

  const activeTab = await getActiveTab();
  if (isControllableTab(activeTab)) {
    await chrome.storage.local.set({ [TARGET_TAB_KEY]: activeTab.id });
    return activeTab;
  }

  const tabs = await chrome.tabs.query({ currentWindow: true });
  const fallback = tabs.find((tab) => isControllableTab(tab));
  if (fallback?.id) {
    await chrome.storage.local.set({ [TARGET_TAB_KEY]: fallback.id });
    return fallback;
  }

  throw new Error("No controllable webpage tab found. Open the Damumed mock page first.");
}

function isControllableTab(tab) {
  if (!tab?.id || !tab.url) return false;
  return /^(https?:|file:)/i.test(tab.url);
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) throw error;

    await chrome.scripting.executeScript({
      target: { tabId },
      files: [
        "src/content/domActions.js",
        "src/content/proactiveAssistant.js",
        "src/content/actionRouter.js",
        "src/content/contentScript.js"
      ]
    });

    return chrome.tabs.sendMessage(tabId, message);
  }
}

function isMissingContentScriptError(error) {
  return /receiving end does not exist|could not establish connection/i.test(error?.message || "");
}

function summarizeResult(result) {
  return {
    ok: Boolean(result?.ok),
    message: result?.message || "",
    intent: result?.structuredCommand?.intent || "",
    suggestion: result?.suggestion?.message || result?.next_suggestion || "",
    time: new Date().toISOString()
  };
}

function extractEventSuggestion(response) {
  const candidate = unwrapWebhookPayload(response);
  const value = candidate?.next_suggestion || candidate?.suggestion || candidate?.message || candidate?.response;
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value?.message === "string" && value.message.trim()) return value.message.trim();
  return "";
}
