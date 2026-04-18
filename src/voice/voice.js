console.log("MedBot voice page loaded");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = SpeechRecognition ? new SpeechRecognition() : null;
let isListening = false;

const startButton = document.getElementById("startButton");
const stopButton = document.getElementById("stopButton");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const recognizedText = document.getElementById("recognizedText");
const aiResult = document.getElementById("aiResult");
const shell = document.querySelector(".voice-shell");

init();

function init() {
  console.log("MedBot voice init");

  startButton.addEventListener("click", startListening);
  stopButton.addEventListener("click", stopListening);

  if (!recognition) {
    console.error("SpeechRecognition is not supported in this browser.");
    updateUI("IDLE");
    recognizedText.textContent = "Speech recognition is not supported in this browser.";
    startButton.disabled = true;
    stopButton.disabled = true;
    return;
  }

  recognition.lang = "ru-RU";
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("Listening started");
    isListening = true;
    updateUI("LISTENING");
  };

  recognition.onresult = (event) => {
    const resultIndex = event.resultIndex ?? 0;
    const text = event.results?.[resultIndex]?.[0]?.transcript || event.results?.[0]?.[0]?.transcript || "";
    console.log("Recognized:", text);

    recognizedText.textContent = text || "No speech recognized.";
    updateUI("PROCESSING");
    isListening = false;

    sendToAI(text);
  };

  recognition.onerror = (event) => {
    console.error("Recognition error:", event.error);
    updateUI("IDLE");
    isListening = false;
  };

  recognition.onend = () => {
    console.log("Recognition ended");
    if (isListening) {
      isListening = false;
    }

    if (statusText.textContent === "Listening") {
      updateUI("IDLE");
    }
  };

  updateUI("IDLE");
}

function startListening() {
  console.log("startListening called", { isListening });

  if (!recognition) return;
  if (isListening) return;

  try {
    speechSynthesis.cancel();
    recognition.start();
    isListening = true;
    updateUI("LISTENING");
  } catch (e) {
    console.error("Start error:", e);
    isListening = false;
    updateUI("IDLE");
  }
}

function stopListening() {
  console.log("stopListening called", { isListening });

  if (!recognition) return;
  if (!isListening) {
    updateUI("IDLE");
    return;
  }

  try {
    recognition.stop();
  } catch (e) {
    console.error("Stop error:", e);
  } finally {
    isListening = false;
    updateUI("IDLE");
  }
}

async function sendToAI(text) {
  console.log("sendToAI called", text);

  if (!text || !text.trim()) {
    updateUI("IDLE");
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      type: "PROCESS_COMMAND",
      payload: text
    });

    console.log("AI response:", response);
    aiResult.textContent = JSON.stringify(response?.result || response, null, 2);

    const spoken = buildVoiceResponse(response?.result);
    speak(spoken);
  } catch (error) {
    console.error("sendToAI error:", error);
    aiResult.textContent = JSON.stringify({ ok: false, error: error?.message || String(error) }, null, 2);
    updateUI("IDLE");
  }
}

function speak(text) {
  console.log("speak called", text);

  if (!("speechSynthesis" in window) || !text) {
    updateUI("IDLE");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";

  utterance.onstart = () => updateUI("SPEAKING");
  utterance.onend = () => updateUI("IDLE");
  utterance.onerror = (event) => {
    console.error("Speech synthesis error:", event.error);
    updateUI("IDLE");
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function updateUI(state) {
  console.log("updateUI:", state);

  const labelMap = {
    IDLE: "Idle",
    LISTENING: "Listening",
    PROCESSING: "Processing",
    SPEAKING: "Speaking"
  };

  statusText.textContent = labelMap[state] || "Idle";
  statusPill.className = "status-pill";
  shell.classList.toggle("is-listening", state === "LISTENING");

  if (state === "LISTENING") statusPill.classList.add("listening");
  if (state === "PROCESSING") statusPill.classList.add("processing");
  if (state === "SPEAKING") statusPill.classList.add("speaking");

  startButton.disabled = state === "LISTENING" || state === "PROCESSING" || state === "SPEAKING";
  stopButton.disabled = state !== "LISTENING";

  chrome.runtime.sendMessage({
    type: "MEDBOT_SET_STATUS",
    status: labelMap[state] || "Idle"
  }).catch((error) => {
    console.warn("Status sync failed:", error);
  });
}

function buildVoiceResponse(command) {
  if (!command || command.ok === false) {
    return "Не удалось обработать команду.";
  }

  if (command.intent === "fill_medical_form") {
    return "Осмотр заполнен. Сформировать расписание?";
  }

  if (command.intent === "generate_schedule") {
    return "Расписание сформировано.";
  }

  if (command.intent === "open_patient_record") {
    return "Карта пациента найдена.";
  }

  if (command.intent === "navigate_to_document") {
    return "Документ открыт.";
  }

  if (command.next_step) {
    return command.next_step;
  }

  return "Готово.";
}
