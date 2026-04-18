const STATUS = Object.freeze({
  IDLE: "Idle",
  LISTENING: "Listening",
  PROCESSING: "Processing"
});

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const statusDot = document.getElementById("statusDot");
const statusLabel = document.getElementById("statusLabel");
const statusHelp = document.getElementById("statusHelp");
const appShell = document.getElementById("appShell");
const liveTranscript = document.getElementById("liveTranscript");
const lastCommand = document.getElementById("lastCommand");
const systemPill = document.querySelector(".system-pill");
const aiState = document.getElementById("aiState");
const aiIntent = document.getElementById("aiIntent");
const aiProvider = document.getElementById("aiProvider");
const pipelineVoice = document.getElementById("pipelineVoice");
const pipelineAI = document.getElementById("pipelineAI");
const pipelineRPA = document.getElementById("pipelineRPA");
const transcriptBadge = document.getElementById("transcriptBadge");
const actionLog = document.getElementById("actionLog");
const logCount = document.getElementById("logCount");
const testAiButton = document.getElementById("testAiButton");
const testAiText = document.getElementById("testAiText");
const testAiResult = document.getElementById("testAiResult");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isListening = false;
let isProcessing = false;
let userWantsListening = false;
let activeCommandId = 0;
let uiActionLog = [];

init();

console.log("MedBot popup loaded");

async function init() {
  bindEvents();
  setupSpeechRecognition();
  await hydrateState();
  renderControls();
}

function bindEvents() {
  startButton.addEventListener("click", startListening);
  stopButton.addEventListener("click", stopListening);
  testAiButton.addEventListener("click", testAi);

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type === "MEDBOT_PROACTIVE_SUGGESTION") {
      const suggestionText = message.suggestion?.message;
      if (suggestionText) {
        setHelp(suggestionText);
        renderAIStatus("Assistant suggestion", "done");
        pushActionLog({
          action: "proactive_suggestion",
          status: "spoken",
          details: { message: suggestionText },
          timestamp: new Date().toISOString()
        });
        speak(suggestionText);
      }
      return;
    }

    if (message?.type !== "MEDBOT_COMMAND_RESULT") {
      return;
    }

    const result = message.result;
    const text = result?.message || "Command completed.";
    setHelp(result?.ok ? text : `Action failed: ${text}`);
    aiIntent.textContent = result?.structuredCommand?.intent || "Completed";
    renderAIStatus(result?.ok ? "Action completed" : "Action failed", result?.ok ? "done" : "error");
    updateActionLogFromResult(result);
    speak(buildVoiceResponse(result));
    setStatus(STATUS.IDLE);
  });
}

async function testAi() {
  const payload = testAiText.value.trim() || testAiText.placeholder;
  testAiResult.textContent = "Processing...";
  renderAIStatus("Testing parser", "ai");

  const response = await sendRuntimeMessage({
    type: "PROCESS_COMMAND",
    payload
  });

  testAiResult.textContent = JSON.stringify(response, null, 2);
  aiIntent.textContent = response?.result?.intent || "Test result";
  renderAIStatus(response?.ok ? "Test complete" : "Test failed", response?.ok ? "done" : "error");
}

function setupSpeechRecognition() {
  if (!SpeechRecognition) {
    startButton.disabled = true;
    setHelp("Speech recognition is not available in this browser.");
    renderAIStatus("Voice unavailable", "error");
    return;
  }

  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = selectRecognitionLanguage();

  recognition.onstart = () => {
    isListening = true;
    userWantsListening = true;
    transcriptBadge.textContent = "Live";
    setStatus(STATUS.LISTENING);
    renderControls();
  };

  recognition.onend = () => {
    isListening = false;

    if (userWantsListening && !isProcessing) {
      restartListening();
      return;
    }

    setStatus(isProcessing ? STATUS.PROCESSING : STATUS.IDLE);
    renderControls();
  };

  recognition.onerror = (event) => {
    isListening = false;
    isProcessing = false;
    userWantsListening = false;
    setStatus(STATUS.IDLE);
    setHelp(readableSpeechError(event.error));
    renderAIStatus("Voice error", "error");
    renderControls();
  };

  recognition.onresult = async (event) => {
    const transcript = getTranscriptParts(event);
    renderTranscript(transcript);

    if (transcript.finalText && !isProcessing) {
      await handleFinalTranscript(transcript.finalText);
    }
  };
}

async function hydrateState() {
  const response = await sendRuntimeMessage({ type: "MEDBOT_GET_STATE" });
  const aiConfig = await chrome.storage.local.get(["medbot.ai.provider", "medbot.ai.model"]);

  if (response?.ok) {
    renderStatus(response.state.status || STATUS.IDLE);
    lastCommand.textContent = response.state.lastCommand || "No command yet.";
  }

  aiProvider.textContent = aiConfig["medbot.ai.provider"] || "Not configured";
  aiIntent.textContent = "Waiting";
  renderAIStatus("Standby", "idle");
  renderActionLog();
}

function startListening() {
  if (!recognition || isListening || isProcessing) return;

  try {
    userWantsListening = true;
    liveTranscript.textContent = "Listening...";
    liveTranscript.classList.add("is-interim");
    transcriptBadge.textContent = "Live";
    renderAIStatus("Voice stream", "voice");
    recognition.start();
  } catch (error) {
    setHelp(error.message || "Could not start listening.");
  }
}

function stopListening() {
  if (!recognition) return;

  try {
    userWantsListening = false;
    activeCommandId += 1;
    if ("speechSynthesis" in window) {
      speechSynthesis.cancel();
    }
    recognition.stop();
  } finally {
    isListening = false;
    isProcessing = false;
    setStatus(STATUS.IDLE);
    renderControls();
  }
}

function setStatus(status, command) {
  renderStatus(status);

  chrome.runtime.sendMessage({
    type: "MEDBOT_SET_STATUS",
    status,
    lastCommand: command
  });
}

function renderStatus(status) {
  statusDot.className = "status-dot";
  systemPill.classList.toggle("is-listening", status === STATUS.LISTENING);
  systemPill.classList.toggle("is-processing", status === STATUS.PROCESSING);
  appShell.classList.toggle("is-listening", status === STATUS.LISTENING);
  appShell.classList.toggle("is-processing", status === STATUS.PROCESSING);
  statusLabel.textContent = status;

  if (status === STATUS.LISTENING) {
    statusDot.classList.add("is-listening");
    setHelp("Listening for a page-control command.");
    renderAIStatus("Listening", "voice");
  }

  if (status === STATUS.PROCESSING) {
    statusDot.classList.add("is-processing");
    setHelp("Processing command.");
    renderAIStatus("Parsing command", "ai");
  }

  if (status === STATUS.IDLE) {
    setHelp("Ready to control the active medical page.");
    renderAIStatus("Standby", "idle");
  }
}

function renderControls() {
  const speechReady = Boolean(recognition);

  startButton.disabled = !speechReady || isListening || isProcessing;
  stopButton.disabled = !speechReady || (!isListening && !isProcessing);
}

async function handleFinalTranscript(text) {
  const commandId = activeCommandId + 1;
  activeCommandId = commandId;
  isProcessing = true;
  stopRecognitionQuietly();

  lastCommand.textContent = text;
  liveTranscript.textContent = text;
  liveTranscript.classList.remove("is-interim");
  transcriptBadge.textContent = "Final";
  aiIntent.textContent = "Parsing";
  setStatus(STATUS.PROCESSING, text);
  setHelp("Sending command to MedBot AI.");
  pushActionLog({
    action: "voice_capture",
    status: "final",
    details: { text },
    timestamp: new Date().toISOString()
  });
  renderControls();

  const response = await sendRuntimeMessage({
    type: "MEDBOT_RUN_COMMAND",
    command: text
  });

  const result = response?.result;

  if (commandId !== activeCommandId) {
    return;
  }

  if (!response?.ok) {
    const error = response?.error || "The command could not be sent to the page.";
    isProcessing = false;
    setStatus(STATUS.IDLE, text);
    setHelp(error);
    renderAIStatus("AI error", "error");
    pushActionLog({
      action: "command_failed",
      status: "error",
      details: { error },
      timestamp: new Date().toISOString()
    });
    speak(`${RU.commandFailed} ${error}`);
    renderControls();
    return;
  }

  const message = result?.message || "Command finished.";
  setHelp(result?.ok ? message : `Action failed: ${message}`);
  aiIntent.textContent = result?.structuredCommand?.intent || "Completed";
  renderAIStatus(result?.ok ? "Action completed" : "Action failed", result?.ok ? "done" : "error");
  updateActionLogFromResult(result);

  if (!result?.suggestion) {
    speak(buildVoiceResponse(result));
  }

  isProcessing = false;
  if (userWantsListening) {
    restartListening();
  } else {
    setStatus(STATUS.IDLE, text);
    setHelp(result?.ok ? message : `Action failed: ${message}`);
    renderAIStatus(result?.ok ? "Action completed" : "Action failed", result?.ok ? "done" : "error");
  }
  renderControls();
}

function getTranscriptParts(event) {
  let finalText = "";
  let interimText = "";

  for (let index = event.resultIndex; index < event.results.length; index += 1) {
    const result = event.results[index];
    const transcript = result?.[0]?.transcript?.trim();
    if (!transcript) continue;

    if (result.isFinal) {
      finalText = `${finalText} ${transcript}`.trim();
    } else {
      interimText = `${interimText} ${transcript}`.trim();
    }
  }

  return { finalText, interimText };
}

function renderTranscript({ finalText, interimText }) {
  const text = interimText || finalText;
  if (!text) return;

  liveTranscript.textContent = text;
  liveTranscript.classList.toggle("is-interim", Boolean(interimText));
  transcriptBadge.textContent = interimText ? "Live" : "Final";
}

function stopRecognitionQuietly() {
  if (!recognition || !isListening) return;

  try {
    recognition.stop();
  } catch {
    // Web Speech can throw if stop is called during an internal state change.
  }
}

function restartListening() {
  if (!recognition || isListening || isProcessing) return;

  window.setTimeout(() => {
    if (!recognition || isListening || isProcessing || !userWantsListening) return;

    try {
      recognition.start();
    } catch {
      renderControls();
    }
  }, 180);
}

function renderAIStatus(label, phase) {
  aiState.textContent = label;

  for (const item of [pipelineVoice, pipelineAI, pipelineRPA]) {
    item.className = "";
  }

  if (phase === "voice") {
    pipelineVoice.classList.add("is-active");
  }

  if (phase === "ai") {
    pipelineVoice.classList.add("is-done");
    pipelineAI.classList.add("is-active");
  }

  if (phase === "done") {
    pipelineVoice.classList.add("is-done");
    pipelineAI.classList.add("is-done");
    pipelineRPA.classList.add("is-done");
  }

  if (phase === "error") {
    pipelineVoice.classList.add("is-done");
    pipelineAI.classList.add("is-active");
  }
}

function updateActionLogFromResult(result) {
  if (Array.isArray(result?.actionLog)) {
    uiActionLog = result.actionLog.slice(-6).reverse();
    renderActionLog();
    return;
  }

  pushActionLog({
    action: result?.structuredCommand?.intent || "command",
    status: result?.ok ? "success" : "failure",
    details: { message: result?.message || "" },
    timestamp: new Date().toISOString()
  });
}

function pushActionLog(entry) {
  uiActionLog = [entry, ...uiActionLog].slice(0, 6);
  renderActionLog();
}

function renderActionLog() {
  logCount.textContent = String(uiActionLog.length);

  if (uiActionLog.length === 0) {
    actionLog.innerHTML = '<li class="empty-log">No RPA actions yet.</li>';
    return;
  }

  actionLog.replaceChildren(
    ...uiActionLog.map((entry) => {
      const item = document.createElement("li");
      const title = document.createElement("span");
      const time = document.createElement("span");

      title.className = "log-title";
      title.textContent = formatActionTitle(entry);
      time.className = "log-time";
      time.textContent = formatLogTime(entry.timestamp);

      item.append(title, time);
      return item;
    })
  );
}

function formatActionTitle(entry) {
  const action = String(entry?.action || "action").replaceAll("_", " ");
  const status = entry?.status ? ` - ${entry.status}` : "";
  return `${action}${status}`;
}

function formatLogTime(timestamp) {
  if (!timestamp) return "now";

  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "now";

  return date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildVoiceResponse(result) {
  if (!result?.ok) {
    return `${RU.commandFailed} ${result?.message || ""}`.trim();
  }

  const intent = result.structuredCommand?.intent;

  if (intent === "fill_medical_form") {
    return RU.examFilled;
  }

  if (intent === "generate_schedule") {
    return RU.scheduleCreated;
  }

  if (intent === "mark_service_completed") {
    return RU.serviceCompleted;
  }

  if (intent === "open_patient_record") {
    return RU.patientOpened;
  }

  if (intent === "navigate_to_document") {
    return RU.documentOpened;
  }

  return RU.done;
}

function speak(text) {
  if (!("speechSynthesis" in window) || !text) return;

  speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  utterance.rate = 0.96;
  utterance.pitch = 1;
  speechSynthesis.speak(utterance);
}

function selectRecognitionLanguage() {
  const language = navigator.language || "ru-RU";
  return /^ru|^kk/i.test(language) ? language : "ru-RU";
}

function setHelp(text) {
  statusHelp.textContent = text;
}

function readableSpeechError(error) {
  const messages = {
    "not-allowed": "Microphone permission was denied.",
    "audio-capture": "No microphone was found.",
    network: "Speech recognition is temporarily unavailable.",
    "no-speech": "No speech was detected."
  };

  return messages[error] || "Speech recognition stopped.";
}

function sendRuntimeMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve({ ok: false, error: chrome.runtime.lastError.message });
        return;
      }

      resolve(response);
    });
  });
}

const RU = Object.freeze({
  commandFailed: "\u041d\u0435 \u0443\u0434\u0430\u043b\u043e\u0441\u044c \u0432\u044b\u043f\u043e\u043b\u043d\u0438\u0442\u044c \u043a\u043e\u043c\u0430\u043d\u0434\u0443.",
  examFilled: "\u041e\u0441\u043c\u043e\u0442\u0440 \u0437\u0430\u043f\u043e\u043b\u043d\u0435\u043d. \u0421\u043e\u0437\u0434\u0430\u0442\u044c \u0440\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435?",
  scheduleCreated: "\u0420\u0430\u0441\u043f\u0438\u0441\u0430\u043d\u0438\u0435 \u0441\u043e\u0437\u0434\u0430\u043d\u043e.",
  serviceCompleted: "\u0423\u0441\u043b\u0443\u0433\u0430 \u043e\u0442\u043c\u0435\u0447\u0435\u043d\u0430 \u043a\u0430\u043a \u0432\u044b\u043f\u043e\u043b\u043d\u0435\u043d\u043d\u0430\u044f.",
  patientOpened: "\u041a\u0430\u0440\u0442\u0430 \u043f\u0430\u0446\u0438\u0435\u043d\u0442\u0430 \u043e\u0442\u043a\u0440\u044b\u0442\u0430.",
  documentOpened: "\u0414\u043e\u043a\u0443\u043c\u0435\u043d\u0442 \u043e\u0442\u043a\u0440\u044b\u0442.",
  done: "\u0413\u043e\u0442\u043e\u0432\u043e."
});
