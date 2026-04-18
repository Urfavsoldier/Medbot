console.log("MedBot popup loaded");

const openVoiceButton = document.getElementById("openVoiceButton");
const pingButton = document.getElementById("pingButton");
const domTestButton = document.getElementById("domTestButton");
const testAiButton = document.getElementById("testAiButton");
const testAiText = document.getElementById("testAiText");
const testResult = document.getElementById("testResult");
const statusText = document.getElementById("statusText");
const lastCommand = document.getElementById("lastCommand");

init();

async function init() {
  openVoiceButton.addEventListener("click", openVoiceMode);
  pingButton.addEventListener("click", pingTest);
  domTestButton.addEventListener("click", domTest);
  testAiButton.addEventListener("click", testAi);
  await refreshStatus();
}

async function openVoiceMode() {
  console.log("MedBot popup open voice mode");
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id && /^(https?:|file:)/i.test(tab.url || "")) {
    await chrome.storage.local.set({ "medbot.targetTabId": tab.id });
    console.log("MedBot target tab saved", tab.id);
  }
  await chrome.tabs.create({ url: chrome.runtime.getURL("src/voice/voice.html") });
}

async function pingTest() {
  testResult.textContent = "Pinging...";
  const response = await chrome.runtime.sendMessage({ type: "PING" });
  testResult.textContent = JSON.stringify(response, null, 2);
}

async function domTest() {
  testResult.textContent = "Running DOM test...";
  const response = await chrome.runtime.sendMessage({ type: "MEDBOT_DOM_TEST" });
  testResult.textContent = JSON.stringify(response, null, 2);
}

async function testAi() {
  const payload = testAiText.value.trim();
  testResult.textContent = "Processing AI...";
  const response = await chrome.runtime.sendMessage({ type: "PROCESS_COMMAND", payload });
  testResult.textContent = JSON.stringify(response, null, 2);
}

async function refreshStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "MEDBOT_GET_STATE" });
    const state = response?.result || {};
    statusText.textContent = state.status || "Idle";
    lastCommand.textContent = state.lastCommand || "No command yet.";
    if (state.lastResult) {
      testResult.textContent = JSON.stringify(state.lastResult, null, 2);
    }
  } catch (error) {
    console.error("MedBot popup status error", error);
    statusText.textContent = "Error";
  }
}
