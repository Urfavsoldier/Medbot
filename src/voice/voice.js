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
const lastCommand = document.getElementById("lastCommand");
const lastAction = document.getElementById("lastAction");
const resultStatus = document.getElementById("resultStatus");
const stateHint = document.getElementById("stateHint");
const shell = document.querySelector(".voice-shell");

init();

function init() {
  console.log("MedBot voice init");
  startButton.addEventListener("click", startListening);
  stopButton.addEventListener("click", stopListening);

  if (!recognition) {
    console.error("SpeechRecognition is not supported.");
    recognizedText.textContent = "Распознавание речи недоступно в этом браузере.";
    aiResult.textContent = "Откройте страницу в браузере Chromium с поддержкой Web Speech API.";
    resultStatus.textContent = "Недоступно";
    startButton.disabled = true;
    stopButton.disabled = true;
    updateUI("IDLE");
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
    recognizedText.textContent = text || "Команда не распознана.";
    lastCommand.textContent = text || "Команда не зафиксирована.";
    isListening = false;
    updateUI("PROCESSING");
    sendToBackground(text);
  };

  recognition.onerror = (event) => {
    console.error("Recognition error:", event.error);
    isListening = false;
    updateUI("IDLE");
  };

  recognition.onend = () => {
    console.log("Recognition ended");
    isListening = false;
    if (statusText.textContent === "Слушаю") updateUI("IDLE");
  };

  updateUI("IDLE");
}

function startListening() {
  console.log("startListening called", { isListening });
  if (!recognition || isListening) return;

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

async function sendToBackground(text) {
  console.log("sendToBackground", text);
  if (!text || !text.trim()) {
    updateUI("IDLE");
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({ type: "MEDBOT_RUN_COMMAND", command: text });
    console.log("MedBot command response", response);
    aiResult.textContent = formatAiInterpretation(response?.result || response);
    lastAction.textContent = response?.result?.message || response?.error || "Команда выполнена.";
    resultStatus.textContent = response?.ok === false ? "Требуется внимание" : "Выполнено";
    speak(buildVoiceResponse(response?.result));
  } catch (error) {
    console.error("sendToBackground error:", error);
    aiResult.textContent = "Не удалось распознать команду. Повторите, пожалуйста.";
    lastAction.textContent = "Команда не выполнена.";
    resultStatus.textContent = "Ошибка";
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
  const labels = { IDLE: "Ожидание", LISTENING: "Слушаю", PROCESSING: "Обработка", SPEAKING: "Ответ" };
  const storageLabels = { IDLE: "Idle", LISTENING: "Listening", PROCESSING: "Processing", SPEAKING: "Speaking" };
  const hints = {
    IDLE: "Готов к голосовой команде.",
    LISTENING: "Слушаю. Говорите естественно.",
    PROCESSING: "Обрабатываю команду и готовлю действие.",
    SPEAKING: "Ассистент озвучивает следующий шаг."
  };
  statusText.textContent = labels[state] || "Ожидание";
  statusPill.className = "status-pill";
  shell.classList.remove("is-listening", "is-processing", "is-speaking");
  shell.classList.toggle("is-listening", state === "LISTENING");
  shell.classList.toggle("is-processing", state === "PROCESSING");
  shell.classList.toggle("is-speaking", state === "SPEAKING");
  if (state === "LISTENING") statusPill.classList.add("listening");
  if (state === "PROCESSING") statusPill.classList.add("processing");
  if (state === "SPEAKING") statusPill.classList.add("speaking");
  stateHint.textContent = hints[state] || hints.IDLE;
  if (state === "LISTENING") resultStatus.textContent = "Слушаю";
  if (state === "PROCESSING") resultStatus.textContent = "Обработка";
  if (state === "SPEAKING") resultStatus.textContent = "Ответ";
  if (state === "IDLE" && resultStatus.textContent === "Ответ") resultStatus.textContent = "Выполнено";
  if (state === "IDLE" && resultStatus.textContent === "Обработка") resultStatus.textContent = "Ожидание";
  if (state === "IDLE" && resultStatus.textContent === "Слушаю") resultStatus.textContent = "Ожидание";
  startButton.disabled = state === "LISTENING" || state === "PROCESSING" || state === "SPEAKING";
  stopButton.disabled = state !== "LISTENING";
  chrome.runtime.sendMessage({ type: "MEDBOT_SET_STATUS", status: storageLabels[state] || "Idle" }).catch((error) => console.warn("Status sync failed", error));
}

function formatAiInterpretation(result) {
  const command = result?.structuredCommand || result;
  if (!result?.ok && result?.error) return `Не удалось выполнить действие\n${result.error}`;
  if (!command?.intent) return "Команда выполнена.";

  const intent = {
    open_patient_record: "Открыть пациента",
    navigate_to_document: "Перейти к документу",
    fill_medical_form: "Заполнить медицинскую форму",
    generate_schedule: "Сформировать расписание процедур",
    mark_service_completed: "Отметить услугу выполненной",
    write_procedure_diary: "Записать дневник процедуры",
    suggest_next_step: "Подсказать следующий шаг",
    ask_clarification: "Уточнить команду"
  }[command.intent] || command.intent;

  const fields = Object.keys(command.fields || {});
  const fieldText = fields.length > 0 ? ` → ${fields.map(formatFieldName).join(", ")}` : "";
  const documentText = command.document_type ? `\nДокумент: ${formatDocumentName(command.document_type)}` : "";
  const suggestionText = command.next_suggestion ? `\nСледующий шаг: ${command.next_suggestion}` : "";

  return `${intent}${fieldText}${documentText}${suggestionText}`;
}

function formatFieldName(field) {
  const labels = {
    complaints: "Жалобы",
    anamnesis: "Анамнез",
    objective_status: "Объективный статус",
    recommendations: "Рекомендации",
    procedure_result: "Результат процедуры"
  };
  return labels[field] || field;
}

function formatDocumentName(documentType) {
  const labels = {
    primary_exam: "Первичный осмотр",
    discharge_summary: "Выписной эпикриз",
    procedure_diary: "Дневник процедуры",
    schedule_page: "Расписание"
  };
  return labels[documentType] || documentType;
}

function buildVoiceResponse(result) {
  const command = result?.structuredCommand || result;
  if (!result?.ok && !command?.intent) return "Не удалось распознать команду. Повторите, пожалуйста.";
  if (command?.intent === "fill_medical_form") {
    if (result?.suggestion?.message?.startsWith("Вы не")) return `Осмотр заполнен. ${result.suggestion.message}`;
    return "Осмотр заполнен. Сформировать расписание процедур?";
  }
  if (command?.intent === "generate_schedule") return "Расписание успешно создано.";
  if (command?.intent === "mark_service_completed") return "Услуга отмечена как выполненная. Дневник процедуры не заполнен. Записать результат?";
  if (command?.intent === "write_procedure_diary") return "Данные сохранены.";
  if (command?.intent === "open_patient_record") return "Пациент открыт. Можно начинать осмотр.";
  if (command?.intent === "navigate_to_document") return "Переход выполнен.";
  if (result?.suggestion?.message) return result.suggestion.message;
  if (command?.next_suggestion) return command.next_suggestion;
  return "Готово.";
}
