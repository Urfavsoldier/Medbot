(() => {
  if (window.MedBotDomActions) return;

  console.log("MedBot domActions loaded");

  const FIELD_SELECTOR = "input:not([type='hidden']), textarea, select, [contenteditable='true'], [role='textbox']";
  const CLICKABLE_SELECTOR = "button, a[href], input[type='button'], input[type='submit'], [role='button'], [role='tab'], [role='menuitem'], [aria-label], [tabindex]:not([tabindex='-1'])";
  const logs = [];

  const SELECTOR_MAP = {
    complaints: ["[name*='complaint' i]", "[id*='complaint' i]", "[placeholder*='жалоб' i]", "[aria-label*='жалоб' i]"],
    anamnesis: ["[name*='anamnesis' i]", "[id*='anamnesis' i]", "[placeholder*='анамнез' i]", "[aria-label*='анамнез' i]"],
    objective_status: ["[name*='objective' i]", "[id*='objective' i]", "[placeholder*='объектив' i]", "[aria-label*='объектив' i]"],
    recommendations: ["[name*='recommend' i]", "[id*='recommend' i]", "[placeholder*='рекоменд' i]", "[aria-label*='назнач' i]"],
    procedure_result: ["[name*='result' i]", "[id*='result' i]", "[placeholder*='результат' i]", "[aria-label*='дневник' i]"],
    schedule: ["[name*='schedule' i]", "[id*='schedule' i]", "[placeholder*='распис' i]", "[aria-label*='график' i]"],
    patient: ["[name*='patient' i]", "[id*='patient' i]", "[placeholder*='пациент' i]", "[aria-label*='пациент' i]"]
  };

  async function clickByText(text) {
    const label = normalizeRaw(text);
    log("clickByText", "start", { label });
    const element = await waitFor(() => findClickable(label), 4500);
    if (!element) return fail(`Не найден элемент для нажатия: ${label}`);
    await humanClick(element);
    log("clickByText", "success", { label, element: describe(element) });
    return ok(`Нажато: ${label}`);
  }

  async function clickByRoleOrAria(label) {
    const target = normalizeRaw(label);
    log("clickByRoleOrAria", "start", { label: target });
    const element = await waitFor(() => {
      const candidates = visible([...document.querySelectorAll("[role], [aria-label], [title]")]);
      return bestMatch(candidates, target, semanticText);
    }, 4500);
    if (!element) return fail(`Не найден role/aria элемент: ${target}`);
    await humanClick(element);
    log("clickByRoleOrAria", "success", { label: target, element: describe(element) });
    return ok(`Нажато: ${target}`);
  }

  async function fillField(selectorOrLabel, value) {
    const label = normalizeRaw(selectorOrLabel);
    log("fillField", "start", { label, value: String(value ?? "") });
    const field = await waitFor(() => findField(selectorOrLabel), 4500);
    if (!field) return fail(`Не найдено поле: ${label}`);
    await fillElement(field, value);
    log("fillField", "success", { label, element: describe(field) });
    return ok(`Заполнено: ${label}`);
  }

  function findFieldByLabel(labelText) {
    const field = findField(labelText);
    log("findFieldByLabel", field ? "success" : "failure", { labelText, element: field ? describe(field) : "" });
    return field;
  }

  async function navigateToTab(tabName) {
    const label = normalizeRaw(tabName);
    log("navigateToTab", "start", { tabName: label });
    const tab = await waitFor(() => {
      const scoped = visible([...document.querySelectorAll("[role='tab'], [aria-controls], nav a, nav button, .tabs button, .tabs a, aside a, aside button")]);
      return bestMatch(scoped, label, semanticText);
    }, 4500);
    if (tab) {
      await humanClick(tab);
      log("navigateToTab", "success", { tabName: label, element: describe(tab) });
      return ok(`Открыт раздел: ${label}`);
    }
    return clickByText(label);
  }

  async function openPatientRecord(patientName) {
    log("openPatientRecord", "start", { patientName });
    if (patientName) {
      const filled = await fillField("patient", patientName);
      if (filled.ok) {
        const search = await clickByText("поиск");
        if (search.ok) return ok(`Открыт поиск пациента: ${patientName}`);
      }
    }
    return clickByText("пациенты");
  }

  async function setCompletedStatus(serviceName) {
    log("setCompletedStatus", "start", { serviceName });
    if (serviceName) await clickByText(serviceName);
    const result = await clickByText("выполнено");
    return result.ok ? result : clickByText("completed");
  }

  async function writeProcedureDiary(text) {
    log("writeProcedureDiary", "start", { text });
    for (const candidate of ["procedure_result", "дневник", "результат", "procedure diary"]) {
      const result = await fillField(candidate, text);
      if (result.ok) return result;
    }
    return fail("Не удалось заполнить дневник процедуры");
  }

  async function domTestHighlight() {
    log("domTestHighlight", "start");
    const oldOutline = document.documentElement.style.outline;
    document.documentElement.style.outline = "4px solid #ff3b30";
    window.setTimeout(() => {
      document.documentElement.style.outline = oldOutline;
    }, 1800);
    return ok("DOM test: page border highlighted red");
  }

  function findField(selectorOrLabel) {
    const raw = String(selectorOrLabel || "");
    const direct = query(raw);
    if (direct?.matches?.(FIELD_SELECTOR)) return direct;
    const mapped = findBySelectorMap(raw);
    if (mapped) return mapped;
    const fields = visible([...document.querySelectorAll(FIELD_SELECTOR)]).filter((item) => !isDisabled(item));
    return bestMatch(fields, raw, fieldText);
  }

  function findClickable(label) {
    const candidates = visible([...document.querySelectorAll(CLICKABLE_SELECTOR)]).filter((item) => !isDisabled(item));
    return bestMatch(candidates, label, semanticText);
  }

  function findBySelectorMap(key) {
    const selectors = SELECTOR_MAP[normalizeKey(key)] || [];
    for (const selector of selectors) {
      const element = query(selector);
      if (element && visible([element]).length > 0 && !isDisabled(element)) return element;
    }
    return null;
  }

  async function fillElement(element, value) {
    scrollAndFocus(element);
    await sleep(40);
    setValue(element, String(value ?? ""));
    triggerFieldEvents(element);
    flash(element, "field");
  }

  async function humanClick(element) {
    scrollAndFocus(element);
    await sleep(40);
    flash(element, "click");
    const rect = element.getBoundingClientRect();
    const eventInit = { bubbles: true, cancelable: true, composed: true, view: window, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 };
    element.dispatchEvent(new PointerEvent("pointerdown", eventInit));
    element.dispatchEvent(new MouseEvent("mousedown", eventInit));
    element.dispatchEvent(new PointerEvent("pointerup", eventInit));
    element.dispatchEvent(new MouseEvent("mouseup", eventInit));
    element.click();
  }

  function setValue(element, value) {
    if (element.matches("select")) {
      const normalized = normalize(value);
      const option = [...element.options].find((item) => normalize(item.textContent) === normalized || normalize(item.value) === normalized || normalize(item.textContent).includes(normalized));
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

  function triggerFieldEvents(element) {
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
  }

  function fieldText(element) {
    return [labelFor(element), element.getAttribute("placeholder"), element.getAttribute("aria-label"), element.getAttribute("name"), element.getAttribute("id"), nearbyText(element)].filter(Boolean).join(" ");
  }

  function semanticText(element) {
    return [element.innerText, element.textContent, element.getAttribute("aria-label"), element.getAttribute("role"), element.getAttribute("title"), element.getAttribute("value"), element.getAttribute("name"), element.getAttribute("id")].filter(Boolean).join(" ");
  }

  function labelFor(element) {
    if (element.id) {
      const label = query(`label[for="${cssEscape(element.id)}"]`);
      if (label) return label.innerText || label.textContent || "";
    }
    return element.closest("label")?.innerText || "";
  }

  function nearbyText(element) {
    return [element.previousElementSibling?.innerText, element.parentElement?.innerText, element.closest(".form-group,.field,.row,.ant-form-item,.MuiFormControl-root")?.innerText].filter(Boolean).join(" ");
  }

  function bestMatch(elements, label, textGetter) {
    const target = normalize(label);
    let best = null;
    for (const element of elements) {
      const haystack = normalize(textGetter(element));
      if (!haystack) continue;
      const score = scoreText(target, haystack);
      if (score >= 0.42 && (!best || score > best.score)) best = { element, score };
    }
    return best?.element || null;
  }

  function scoreText(target, haystack) {
    if (!target || !haystack) return 0;
    if (target === haystack) return 1;
    if (haystack.includes(target) || target.includes(haystack)) return 0.88;
    const targetWords = new Set(target.split(" ").filter(Boolean));
    const haystackWords = new Set(haystack.split(" ").filter(Boolean));
    const shared = [...targetWords].filter((word) => haystackWords.has(word)).length;
    return shared / Math.max(targetWords.size, haystackWords.size, 1);
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

  function scrollAndFocus(element) {
    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    element.focus?.({ preventScroll: true });
  }

  function visible(elements) {
    return elements.filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
    });
  }

  function isDisabled(element) {
    return Boolean(element.disabled || element.getAttribute("aria-disabled") === "true" || element.closest("[disabled],[aria-disabled='true']"));
  }

  function flash(element, type) {
    const previous = element.style.boxShadow;
    element.style.boxShadow = type === "field" ? "0 0 0 3px rgba(112,199,255,.75)" : "0 0 0 3px rgba(127,240,210,.75)";
    element.style.transition = "box-shadow 140ms ease";
    window.setTimeout(() => { element.style.boxShadow = previous; }, 900);
  }

  function query(selector) {
    try { return document.querySelector(selector); } catch { return null; }
  }

  function log(action, status, details = {}) {
    const entry = { action, status, details, timestamp: new Date().toISOString() };
    logs.push(entry);
    if (logs.length > 120) logs.shift();
    console.log("MedBot DOM action", entry);
  }

  function ok(message, extra = {}) { return { ok: true, message, ...extra }; }
  function fail(message) { log("failure", "error", { message }); return { ok: false, message }; }
  function getActionLog() { return logs.slice(-30); }
  function normalize(value) { return normalizeRaw(value).toLowerCase().replace(/[^\p{L}\p{N}\s-]/gu, "").replace(/\s+/g, " ").trim(); }
  function normalizeRaw(value) { return String(value || "").trim().replace(/\s+/g, " "); }
  function normalizeKey(value) {
    const normalized = normalize(value);
    const aliases = { complaints: "complaints", "жалобы": "complaints", anamnesis: "anamnesis", "анамнез": "anamnesis", objective_status: "objective_status", "объективно": "objective_status", recommendations: "recommendations", "назначить": "recommendations", procedure_result: "procedure_result", "результат": "procedure_result", schedule: "schedule", "расписание": "schedule", patient: "patient", "пациент": "patient" };
    return aliases[normalized] || value;
  }
  function cssEscape(value) { return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["\\]/g, "\\$&"); }
  function describe(element) { return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}`; }
  function sleep(ms) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

  window.MedBotDomActions = { clickByText, clickByRoleOrAria, fillField, findFieldByLabel, navigateToTab, openPatientRecord, setCompletedStatus, writeProcedureDiary, domTestHighlight, getActionLog, log };
})();
