import { processCommand } from "../ai/processCommand.js";
import { generateTreatmentSchedule } from "../scheduling/smartScheduler.js";

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

async function handleMessage(message) {
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
      return processCommand(message.payload || "");

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

  try {
    const aiCommand = await processCommand(commandText);
    const structuredCommand = enrichCommand(aiCommand);
    const tab = await getAutomationTargetTab();
    const contentResult = await sendToContent(tab.id, {
      type: "MEDBOT_EXECUTE_COMMAND",
      command: commandText,
      structuredCommand
    });

    const result = {
      ...(contentResult || {}),
      structuredCommand
    };

    await chrome.storage.local.set({
      [LAST_COMMAND_KEY]: commandText,
      [LAST_RESULT_KEY]: summarizeResult(result)
    });

    await setStatus(STATUS.IDLE, commandText);
    return result;
  } catch (error) {
    await setStatus(STATUS.ERROR, commandText);
    throw error;
  }
}

async function runDomTest() {
  const tab = await getAutomationTargetTab();
  return sendToContent(tab.id, { type: "MEDBOT_DOM_TEST" });
}

function enrichCommand(command) {
  if (command.intent !== "generate_schedule") {
    return command;
  }

  try {
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
  } catch (error) {
    console.warn("MedBot schedule generation failed", error);
    return { ...command, schedule_error: error?.message || String(error) };
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
    time: new Date().toISOString()
  };
}
