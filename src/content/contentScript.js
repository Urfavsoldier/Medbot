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
          event_type: "content_error",
          message: error?.message || String(error),
          context: {},
          actionLog: window.MedBotDomActions?.getActionLog?.() || []
        });
      });

    return true;
  });

  async function handleMessage(message) {
    if (message?.type === "MEDBOT_DOM_TEST") {
      if (!window.MedBotDomActions?.domTestHighlight) {
        return failure("dom_unavailable", "DOM-модуль MedBot не загружен.");
      }
      return window.MedBotDomActions.domTestHighlight();
    }

    if (message?.type !== "MEDBOT_EXECUTE_COMMAND") {
      return failure("unsupported_content_message", "Неподдерживаемое сообщение интерфейса.");
    }

    if (!window.MedBotActionRouter?.route) {
      return failure("router_unavailable", "Маршрутизатор действий не загружен.");
    }

    return window.MedBotActionRouter.route(message.structuredCommand);
  }

  function failure(eventType, message) {
    return {
      ok: false,
      event_type: eventType,
      message,
      context: {},
      actionLog: window.MedBotDomActions?.getActionLog?.() || []
    };
  }
})();
