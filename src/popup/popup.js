console.log("MedBot popup loaded");

const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

let recognition = SpeechRecognition ? new SpeechRecognition() : null;
let isListening = false;
let finalTranscript = "";

const popupShell = document.querySelector(".popup-shell");
const startListeningButton = document.getElementById("startListeningButton");
const stopListeningButton = document.getElementById("stopListeningButton");
const runTextButton = document.getElementById("runTextButton");
const transcriptText = document.getElementById("transcriptText");
const statusPill = document.getElementById("statusPill");
const statusText = document.getElementById("statusText");
const voiceHint = document.getElementById("voiceHint");
const aiActionText = document.getElementById("aiActionText");
const assistantResponseText = document.getElementById("assistantResponseText");
const suggestionText = document.getElementById("suggestionText");
const quickActions = [...document.querySelectorAll("[data-command]")];

init();

async function init() {
  startListeningButton.addEventListener("click", startListening);
  stopListeningButton.addEventListener("click", stopListening);
  runTextButton.addEventListener("click", () => runCommand(transcriptText.value));
  transcriptText.addEventListener("keydown", handleTranscriptKeydown);
  quickActions.forEach((button) => {
    button.addEventListener("click", () => {
      transcriptText.value = button.dataset.command || "";
      runCommand(transcriptText.value);
    });
  });

  configureRecognition();
  await saveCurrentTabAsTarget();
  await refreshStatus();
  updateUI("IDLE");
}

function configureRecognition() {
  if (!recognition) {
    aiActionText.textContent = "Распознавание речи недоступно в этом браузере.";
    startListeningButton.disabled = true;
    stopListeningButton.disabled = true;
    return;
  }

  recognition.lang = "ru-RU";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    console.log("MedBot popup listening started");
    isListening = true;
    finalTranscript = "";
    updateUI("LISTENING");
  };

  recognition.onresult = (event) => {
    let interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const text = event.results[index][0]?.transcript || "";
      if (event.results[index].isFinal) finalTranscript += `${text} `;
      else interimTranscript += text;
    }

    transcriptText.value = `${finalTranscript}${interimTranscript}`.trim();
    if (finalTranscript.trim()) {
      updateAction("Команда распознана. Выполняю действие.");
    }
  };

  recognition.onerror = (event) => {
    console.error("MedBot popup recognition error", event.error);
    isListening = false;
    updateUI("IDLE");
    updateAction("Не удалось распознать команду. Повторите, пожалуйста.");
  };

  recognition.onend = () => {
    console.log("MedBot popup recognition ended");
    const command = transcriptText.value.trim();
    isListening = false;

    if (command) {
      runCommand(command);
    } else {
      updateUI("IDLE");
    }
  };
}

function startListening() {
  console.log("MedBot popup startListening", { isListening });
  if (!recognition || isListening) return;

  try {
    speechSynthesis.cancel();
    transcriptText.value = "";
    finalTranscript = "";
    recognition.start();
    isListening = true;
    updateUI("LISTENING");
  } catch (error) {
    console.error("MedBot popup start error", error);
    isListening = false;
    updateUI("IDLE");
  }
}

function stopListening() {
  console.log("MedBot popup stopListening", { isListening });
  if (!recognition) return;
  if (!isListening) {
    updateUI("IDLE");
    return;
  }

  try {
    recognition.stop();
  } catch (error) {
    console.error("MedBot popup stop error", error);
  } finally {
    isListening = false;
  }
}

async function runCommand(text) {
  const command = resolveFollowUpCommand(String(text || "").trim());
  if (!command) {
    updateAction("Введите или произнесите команду.");
    return;
  }

  await saveCurrentTabAsTarget();
  updateUI("PROCESSING");
  updateAction("Обрабатываю команду и выполняю действие в интерфейсе.");
  suggestionText.textContent = "Ожидаю результат выполнения.";

  try {
    const response = await chrome.runtime.sendMessage({ type: "MEDBOT_RUN_COMMAND", command });
    console.log("MedBot popup command response", response);
    const result = response?.result || response;
    renderCommandResult(result);
  } catch (error) {
    console.error("MedBot popup command error", error);
    const message = "Не удалось распознать команду. Повторите, пожалуйста.";
    updateUI("IDLE");
    updateAction(message);
    assistantResponseText.textContent = message;
    speak(message);
  }
}

function resolveFollowUpCommand(command) {
  const normalized = command.toLowerCase().trim();
  const suggestion = suggestionText.textContent.toLowerCase();
  if (/^(да|давай|хорошо|сформируй|формируй|создай)$/i.test(normalized) && suggestion.includes("распис")) {
    transcriptText.value = "Сформируй расписание на 9 рабочих дней";
    return transcriptText.value;
  }
  if (/^(да|давай|хорошо|запиши)$/i.test(normalized) && suggestion.includes("результат")) {
    transcriptText.value = "Ребенок перенес процедуру спокойно";
    return transcriptText.value;
  }
  return command;
}

function renderCommandResult(result) {
  const command = result?.structuredCommand || {};
  const responseText = chooseAssistantResponse(result, command);
  const suggestion = result?.suggestion?.message || result?.next_suggestion || command.next_suggestion || "";

  updateAction(formatAction(command, result));
  assistantResponseText.textContent = responseText;
  suggestionText.textContent = suggestion || "Готов к следующей команде.";
  updateUI("SPEAKING");
  speak(suggestion || responseText);
}

function chooseAssistantResponse(result, command) {
  if (result?.ok === false) return result.message || "Не удалось распознать команду. Повторите, пожалуйста.";
  if (command.intent === "open_patient_record") return "Пациент открыт. Можно начинать осмотр.";
  if (command.intent === "navigate_to_document") return "Переход выполнен.";
  if (command.intent === "fill_medical_form") return "Осмотр заполнен. Сформировать расписание процедур?";
  if (command.intent === "generate_schedule") return "Расписание успешно создано.";
  if (command.intent === "mark_service_completed") return "Услуга отмечена как выполненная.";
  if (command.intent === "write_procedure_diary") return "Данные сохранены.";
  return result?.message || "Готово.";
}

function formatAction(command, result) {
  const labels = {
    open_patient_record: "Открытие пациента",
    navigate_to_document: "Переход к документу",
    fill_medical_form: "Заполнение формы",
    generate_schedule: "Формирование расписания",
    mark_service_completed: "Отметка услуги",
    write_procedure_diary: "Запись дневника"
  };

  const action = labels[command.intent] || result?.event_type || "Действие выполнено";
  const fields = Object.keys(command.fields || {});
  if (fields.length > 0) return `${action}: ${fields.map(formatFieldName).join(", ")}`;
  return action;
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

function speak(text) {
  if (!("speechSynthesis" in window) || !text) {
    updateUI("IDLE");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  utterance.onstart = () => updateUI("SPEAKING");
  utterance.onend = () => updateUI("IDLE");
  utterance.onerror = (event) => {
    console.error("MedBot popup speech error", event.error);
    updateUI("IDLE");
  };

  speechSynthesis.cancel();
  speechSynthesis.speak(utterance);
}

function updateUI(state) {
  const labels = { IDLE: "Ожидание", LISTENING: "Слушаю", PROCESSING: "Обработка", SPEAKING: "Ответ" };
  const hints = {
    IDLE: "Готов к команде врача",
    LISTENING: "Слушаю. Говорите естественно.",
    PROCESSING: "Выполняю действие в системе.",
    SPEAKING: "Озвучиваю результат."
  };
  const storageLabels = { IDLE: "Idle", LISTENING: "Listening", PROCESSING: "Processing", SPEAKING: "Speaking" };

  statusText.textContent = labels[state] || labels.IDLE;
  voiceHint.textContent = hints[state] || hints.IDLE;
  statusPill.className = "status-pill";
  popupShell.classList.remove("is-listening", "is-processing", "is-speaking");
  if (state === "LISTENING") {
    statusPill.classList.add("listening");
    popupShell.classList.add("is-listening");
  }
  if (state === "PROCESSING") {
    statusPill.classList.add("processing");
    popupShell.classList.add("is-processing");
  }
  if (state === "SPEAKING") {
    statusPill.classList.add("speaking");
    popupShell.classList.add("is-speaking");
  }

  startListeningButton.disabled = state === "LISTENING" || state === "PROCESSING" || state === "SPEAKING";
  stopListeningButton.disabled = state !== "LISTENING";
  runTextButton.disabled = state === "PROCESSING" || state === "SPEAKING";

  chrome.runtime.sendMessage({ type: "MEDBOT_SET_STATUS", status: storageLabels[state] || "Idle" }).catch((error) => {
    console.warn("MedBot popup status sync failed", error);
  });
}

function updateAction(text) {
  aiActionText.textContent = text;
}

async function saveCurrentTabAsTarget() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id && /^(https?:|file:)/i.test(tab.url || "")) {
      await chrome.storage.local.set({ "medbot.targetTabId": tab.id });
      console.log("MedBot target tab saved", tab.id);
    }
  } catch (error) {
    console.warn("MedBot popup target tab save failed", error);
  }
}

async function refreshStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "MEDBOT_GET_STATE" });
    const state = response?.result || {};
    if (state.lastCommand) transcriptText.value = state.lastCommand;
    if (state.lastResult?.message) assistantResponseText.textContent = state.lastResult.message;
    if (state.lastResult?.suggestion) suggestionText.textContent = state.lastResult.suggestion;
  } catch (error) {
    console.warn("MedBot popup refresh failed", error);
  }
}

function handleTranscriptKeydown(event) {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    runCommand(transcriptText.value);
  }
}
