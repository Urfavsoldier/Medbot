(() => {
  if (window.__MEDBOT_CONTENT_LOADED__) return;
  window.__MEDBOT_CONTENT_LOADED__ = true;

  console.log("MedBot content loaded");

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("MedBot content message", message?.type, message);

    handleMessage(message)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("MedBot content error", error);
        sendResponse({
          ok: false,
          message: error?.message || String(error),
          actionLog: window.MedBotDomActions?.getActionLog?.() || []
        });
      });

    return true;
  });

  async function handleMessage(message) {
    if (message?.type === "MEDBOT_DOM_TEST") {
      return window.MedBotDomActions.domTestHighlight();
    }

    if (message?.type !== "MEDBOT_EXECUTE_COMMAND") {
      return { ok: false, message: "Unsupported content message" };
    }

    if (!window.MedBotActionRouter?.route) {
      return { ok: false, message: "Action router is not loaded" };
    }

    return window.MedBotActionRouter.route(message.structuredCommand);
  }
})();
