import { processCommand } from "../ai/processCommand.js";
import { generateTreatmentSchedule } from "../scheduling/smartScheduler.js";

console.log("MedBot background loaded");

const STATUS_KEY = "medbot.status";
const LAST_COMMAND_KEY = "medbot.lastCommand";

const STATUS = Object.freeze({
  IDLE: "Idle",
  LISTENING: "Listening",
  PROCESSING: "Processing"
});

chrome.runtime.onInstalled.addListener(() => {
  console.log("MedBot installed");
  chrome.storage.local.set({
    [STATUS_KEY]: STATUS.IDLE,
    [LAST_COMMAND_KEY]: ""
  }).catch((error) => {
    console.error("MedBot install init failed", error);
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("MedBot background message", message?.type);

  handleMessage(message, sender)
    .then((result) => sendResponse({ ok: true, result }))
    .catch((error) => {
      console.error("MedBot background error", error);
      sendResponse({
        ok: false,
        error: error?.message || String(error)
      });
    });

  return true;
});

async function handleMessage(message) {
  if (!message || typeof message.type !== "string") {
    throw new Error("Invalid message.");
  }

  switch (message.type) {
    case "MEDBOT_GET_STATE":
      return getState();

    case "MEDBOT_SET_STATUS":
      await setStatus(message.status, message.lastCommand);
      return getState();

    case "PROCESS_COMMAND":
      return processCommand(message.payload || "");

    case "MEDBOT_RUN_COMMAND":
      return runCommandOnActiveTab(message.command || "");

    default:
      throw new Error(`Unsupported message type: ${message.type}`);
  }
}

async function getState() {
  const stored = await chrome.storage.local.get([STATUS_KEY, LAST_COMMAND_KEY]);
  return {
    status: stored[STATUS_KEY] || STATUS.IDLE,
    lastCommand: stored[LAST_COMMAND_KEY] || ""
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
  if (!commandText) {
    throw new Error("Command is empty.");
  }

  await setStatus(STATUS.PROCESSING, commandText);

  try {
    const structuredCommand = await processCommand(commandText);
    const enrichedCommand = enrichCommand(structuredCommand);
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab?.id) {
      throw new Error("No active tab found.");
    }

    const contentResult = await sendCommandToTab(tab.id, commandText, enrichedCommand);

    return {
      ...(contentResult || {}),
      structuredCommand: enrichedCommand
    };
  } finally {
    await setStatus(STATUS.IDLE, commandText);
  }
}

function enrichCommand(command) {
  if (command.intent !== "generate_schedule") {
    return command;
  }

  try {
    return {
      ...command,
      schedule_result: generateTreatmentSchedule({
        procedures: command.procedures || command.schedule?.procedures || command.service || command.schedule?.service,
        specialists: command.specialists || command.schedule?.specialists,
        workingHours: command.workingHours || command.schedule?.workingHours,
        startDate: command.startDate || command.schedule?.startDate || command.schedule?.date,
        days: command.days || command.schedule?.days || 9
      })
    };
  } catch (error) {
    console.warn("MedBot schedule generation failed", error);
    return {
      ...command,
      schedule_error: error?.message || String(error)
    };
  }
}

async function sendCommandToTab(tabId, command, structuredCommand) {
  const message = {
    type: "MEDBOT_EXECUTE_COMMAND",
    command,
    structuredCommand
  };

  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (error) {
    if (!isMissingContentScriptError(error)) {
      throw error;
    }

    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["src/content/contentScript.js"]
    });

    return chrome.tabs.sendMessage(tabId, message);
  }
}

function isMissingContentScriptError(error) {
  return /receiving end does not exist|could not establish connection/i.test(error?.message || "");
}
