const WEBHOOKS = Object.freeze({
  COMMAND: "https://vamp98.app.n8n.cloud/webhook/medbot-command",
  SCHEDULE: "https://vamp98.app.n8n.cloud/webhook/medbot-schedule",
  EVENT: "https://vamp98.app.n8n.cloud/webhook/medbot-event"
});

export async function sendCommand(text, context = {}) {
  return postJson("COMMAND", WEBHOOKS.COMMAND, {
    text: String(text || "").trim(),
    context,
    source: "medbot-extension",
    timestamp: new Date().toISOString()
  });
}

export async function sendEvent(eventType, context = {}) {
  return postJson("EVENT", WEBHOOKS.EVENT, {
    eventType,
    context,
    source: "medbot-extension",
    timestamp: new Date().toISOString()
  });
}

export async function generateSchedule(payload = {}) {
  return postJson("SCHEDULE", WEBHOOKS.SCHEDULE, {
    ...payload,
    source: "medbot-extension",
    timestamp: new Date().toISOString()
  });
}

async function postJson(label, url, payload) {
  console.log(`MedBot n8n ${label} request`, { url, payload });

  let response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.error(`MedBot n8n ${label} network error`, error);
    throw new Error(`n8n ${label} webhook unavailable: ${error?.message || String(error)}`);
  }

  const responseText = await response.text();
  const data = parseResponseBody(responseText);
  console.log(`MedBot n8n ${label} response`, { status: response.status, ok: response.ok, data });

  if (!response.ok) {
    throw new Error(`n8n ${label} webhook failed: ${response.status} ${response.statusText}`);
  }

  return data;
}

function parseResponseBody(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return {};

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    console.warn("MedBot n8n returned non-JSON body", { text: trimmed, error });
    return { raw: trimmed };
  }
}
