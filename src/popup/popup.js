console.log("MedBot popup loaded");

const openVoiceButton = document.getElementById("openVoiceButton");
const statusText = document.getElementById("statusText");
const statusDot = document.getElementById("statusDot");

init();

async function init() {
  openVoiceButton.addEventListener("click", openVoiceMode);
  await refreshStatus();
}

async function openVoiceMode() {
  console.log("Open Voice Mode clicked");

  try {
    await chrome.tabs.create({
      url: chrome.runtime.getURL("src/voice/voice.html")
    });
  } catch (error) {
    console.error("Failed to open voice mode:", error);
    statusText.textContent = "Could not open voice mode";
  }
}

async function refreshStatus() {
  try {
    const response = await chrome.runtime.sendMessage({ type: "MEDBOT_GET_STATE" });
    const state = response?.result || response?.state || {};
    renderStatus(state.status || "Idle");
  } catch (error) {
    console.error("Failed to load MedBot status:", error);
    renderStatus("Idle");
  }
}

function renderStatus(status) {
  statusText.textContent = status;
  statusDot.className = "status-dot";

  if (status === "Listening") statusDot.classList.add("is-listening");
  if (status === "Processing") statusDot.classList.add("is-processing");
  if (status === "Speaking") statusDot.classList.add("is-speaking");
}
