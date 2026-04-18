(() => {
  if (window.__MEDBOT_CONTENT_LOADED__) {
    return;
  }

  window.__MEDBOT_CONTENT_LOADED__ = true;
  console.log("MedBot content loaded");

  const FIELD_SELECTOR = "input:not([type='hidden']), textarea, select, [contenteditable='true'], [role='textbox']";
  const CLICKABLE_SELECTOR = "button, a[href], input[type='button'], input[type='submit'], [role='button'], [role='tab'], [role='menuitem']";

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log("MedBot content message", message?.type);

    handleMessage(message, sender)
      .then((result) => sendResponse(result))
      .catch((error) => {
        console.error("MedBot content error", error);
        sendResponse({ ok: false, message: error?.message || String(error), actionLog: getActionLog() });
      });

    return true;
  });

  const actionLog = [];

  async function handleMessage(message) {
    if (message?.type !== "MEDBOT_EXECUTE_COMMAND") {
      return { ok: false, message: "Unsupported content message.", actionLog: getActionLog() };
    }

    const command = message.structuredCommand || parseTextCommand(message.command || "");
    const result = await executeCommand(command);
    return { ...result, actionLog: getActionLog() };
  }

  async function executeCommand(command) {
    if (!command || typeof command !== "object") {
      return fail("Command must be an object.");
    }

    switch (command.intent) {
      case "open_patient_record":
        return openPatientRecord(command);

      case "navigate_to_document":
        return navigateToTab(command.document_type || command.target || "document");

      case "fill_medical_form":
        return fillMedicalForm(command.fields || {});

      case "generate_schedule":
        return applySchedule(command);

      case "mark_service_completed":
        return clickByText(command.service || command.target || "completed");

      case "suggest_next_step":
        return ok(command.next_step || "Next step is ready.");

      default:
        return fail(`Unsupported intent: ${command.intent}`);
    }
  }

  async function openPatientRecord(command) {
    const patient = command.patient?.name || command.patient?.id || command.target || "";
    if (patient) {
      const filled = await fillField("patient", patient);
      if (filled.ok) {
        const clicked = await clickByText("search");
        return clicked.ok ? ok("Patient search started.") : filled;
      }
    }
    return clickByText("patients");
  }

  async function fillMedicalForm(fields) {
    const entries = Object.entries(fields);
    if (entries.length === 0) return fail("No medical fields to fill.");

    const failures = [];
    for (const [name, value] of entries) {
      const result = await fillField(name, value);
      if (!result.ok) failures.push(name);
    }

    if (failures.length > 0) {
      return fail(`Could not fill: ${failures.join(", ")}`);
    }

    return ok(`Filled ${entries.length} medical field(s).`);
  }

  async function applySchedule(command) {
    const schedule = command.schedule_result;
    const readable = schedule ? formatSchedule(schedule) : command.service || "Schedule generated.";
    const filled = await fillField("schedule", readable);
    if (filled.ok) return ok("Schedule filled.", { schedule });
    return ok("Schedule generated.", { schedule });
  }

  async function clickByText(text) {
    const target = String(text || "").trim();
    log("clickByText", "start", { text: target });

    const element = await waitFor(() => findBestClickable(target), 4000);
    if (!element) return fail(`No clickable element found for "${target}".`);

    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    element.focus?.({ preventScroll: true });
    element.click();
    log("clickByText", "success", { text: target, element: describe(element) });
    return ok(`Clicked ${target}.`);
  }

  async function fillField(selectorOrLabel, value) {
    const target = String(selectorOrLabel || "").trim();
    log("fillField", "start", { target });

    const field = await waitFor(() => findField(target), 4000);
    if (!field) return fail(`No field found for "${target}".`);

    field.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    field.focus?.({ preventScroll: true });
    setValue(field, String(value ?? ""));
    triggerInputEvents(field);
    log("fillField", "success", { target, element: describe(field) });
    return ok(`Filled ${target}.`);
  }

  function findFieldByLabel(labelText) {
    return findField(labelText);
  }

  async function navigateToTab(tabName) {
    log("navigateToTab", "start", { tabName });
    const tab = await waitFor(() => findBestTab(tabName), 4000);
    if (tab) {
      tab.click();
      log("navigateToTab", "success", { tabName, element: describe(tab) });
      return ok(`Navigated to ${tabName}.`);
    }
    return clickByText(tabName);
  }

  window.MedBotRPA = {
    clickByText,
    fillField,
    findFieldByLabel,
    navigateToTab,
    getActionLog
  };

  function parseTextCommand(text) {
    const value = String(text || "").trim();
    const fill = value.match(/^(?:fill|set|enter|type)\s+(.+?)\s+(?:with|to)\s+(.+)$/i);
    if (fill) return { intent: "fill_medical_form", fields: { [fill[1]]: fill[2] } };
    const click = value.match(/^(?:click|press|open)\s+(.+)$/i);
    if (click) return { intent: "navigate_to_document", target: click[1] };
    return { intent: "suggest_next_step", next_step: "Command parsed locally." };
  }

  function findField(target) {
    const direct = query(target);
    if (direct?.matches?.(FIELD_SELECTOR)) return direct;

    const fields = visible([...document.querySelectorAll(FIELD_SELECTOR)]);
    return bestMatch(fields, target, fieldText);
  }

  function findBestClickable(target) {
    const elements = visible([...document.querySelectorAll(CLICKABLE_SELECTOR)]);
    return bestMatch(elements, target, elementText);
  }

  function findBestTab(target) {
    const tabs = visible([...document.querySelectorAll("[role='tab'], [aria-controls], nav a, nav button")]);
    return bestMatch(tabs, target, elementText);
  }

  function bestMatch(elements, target, getText) {
    const normalizedTarget = normalize(target);
    let best = null;

    for (const element of elements) {
      const text = normalize(getText(element));
      if (!text) continue;

      let score = 0;
      if (text === normalizedTarget) score = 1;
      else if (text.includes(normalizedTarget) || normalizedTarget.includes(text)) score = 0.85;
      else score = wordScore(normalizedTarget, text);

      if (score > 0.42 && (!best || score > best.score)) {
        best = { element, score };
      }
    }

    return best?.element || null;
  }

  function fieldText(element) {
    return [
      labelFor(element),
      element.getAttribute("aria-label"),
      element.getAttribute("placeholder"),
      element.getAttribute("name"),
      element.getAttribute("id"),
      element.closest("label")?.innerText,
      element.parentElement?.innerText
    ].filter(Boolean).join(" ");
  }

  function elementText(element) {
    return [
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("value")
    ].filter(Boolean).join(" ");
  }

  function labelFor(element) {
    if (!element.id) return "";
    return document.querySelector(`label[for="${cssEscape(element.id)}"]`)?.innerText || "";
  }

  function setValue(element, value) {
    if (element.matches("select")) {
      const option = [...element.options].find((item) => normalize(item.textContent) === normalize(value) || normalize(item.value) === normalize(value));
      element.value = option ? option.value : value;
      return;
    }

    if (element.isContentEditable || element.getAttribute("role") === "textbox") {
      element.textContent = value;
      return;
    }

    const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
    if (descriptor?.set) descriptor.set.call(element, value);
    else element.value = value;
  }

  function triggerInputEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  async function waitFor(callback, timeoutMs) {
    const started = Date.now();
    let result = callback();
    while (!result && Date.now() - started < timeoutMs) {
      await sleep(120);
      result = callback();
    }
    return result;
  }

  function visible(elements) {
    return elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    });
  }

  function wordScore(a, b) {
    const left = new Set(a.split(" ").filter(Boolean));
    const right = new Set(b.split(" ").filter(Boolean));
    const shared = [...left].filter((word) => right.has(word)).length;
    return shared / Math.max(left.size, right.size, 1);
  }

  function query(selector) {
    try {
      return document.querySelector(selector);
    } catch {
      return null;
    }
  }

  function formatSchedule(schedule) {
    return (schedule.days || []).map((day) => {
      const items = (day.items || []).map((item) => `${item.start}-${item.end} ${item.procedure} (${item.specialist.name})`).join("; ");
      return `${day.date}: ${items}`;
    }).join("\n");
  }

  function normalize(value) {
    return String(value || "").toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim();
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&");
  }

  function describe(element) {
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`;
  }

  function ok(message, extra = {}) {
    return { ok: true, message, ...extra };
  }

  function fail(message) {
    log("error", "failure", { message });
    return { ok: false, message };
  }

  function log(action, status, details = {}) {
    const entry = { action, status, details, timestamp: new Date().toISOString() };
    actionLog.push(entry);
    if (actionLog.length > 50) actionLog.shift();
    console.log("MedBot content log", entry);
  }

  function getActionLog() {
    return actionLog.slice(-20);
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
})();
