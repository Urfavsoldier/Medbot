(() => {
  if (window.MedBotDomActions) return;

  console.log("MedBot domActions loaded");

  const FIELD_SELECTOR = "input:not([type='hidden']), textarea, select, [contenteditable='true'], [role='textbox']";
  const CLICKABLE_SELECTOR = "button, a[href], input[type='button'], input[type='submit'], [role='button'], [role='tab'], [role='menuitem'], [aria-label], [title], [tabindex]:not([tabindex='-1'])";
  const logs = [];

  const FIELD_LABEL_MAP = {
    complaints: "Жалобы",
    anamnesis: "Анамнез",
    objective_status: "Объективный статус",
    recommendations: "Рекомендации",
    procedure_result: "Результат процедуры",
    schedule: "Расписание",
    patient: "Пациент"
  };

  const DOCUMENT_MAP = {
    primary_exam: "Первичный прием",
    discharge_summary: "Выписной эпикриз",
    procedure_diary: "Дневник процедур",
    schedule_page: "Расписание"
  };

  const SELECTOR_MAP = {
    patient: [
      "[data-testid='patient-search-input']",
      "#patientSearch",
      "[name='patient']",
      "[placeholder*='пациент' i]",
      "[aria-label*='пациент' i]"
    ],
    complaints: [
      "[data-testid='primary-complaints']",
      "[data-testid='discharge-complaints']",
      "[name='complaints']",
      "[placeholder*='жалоб' i]",
      "[aria-label*='жалоб' i]"
    ],
    anamnesis: [
      "[data-testid='primary-anamnesis']",
      "[name='anamnesis']",
      "[placeholder*='анамнез' i]",
      "[aria-label*='анамнез' i]"
    ],
    objective_status: [
      "[data-testid='primary-objective-status']",
      "[data-testid='discharge-objective-status']",
      "[name='objective_status']",
      "[placeholder*='объектив' i]",
      "[aria-label*='объектив' i]"
    ],
    recommendations: [
      "[data-testid='primary-recommendations']",
      "[data-testid='discharge-recommendations']",
      "[name='recommendations']",
      "[placeholder*='рекомендац' i]",
      "[placeholder*='назнач' i]",
      "[aria-label*='рекомендац' i]"
    ],
    procedure_result: [
      "[data-testid='procedure-result']",
      "#procedureResult",
      "[name='procedure_result']",
      "[placeholder*='результат процедуры' i]",
      "[aria-label*='результат процедуры' i]"
    ],
    schedule: [
      "[data-testid='schedule-input']",
      "#schedulePlan",
      "[name='schedule']",
      "[placeholder*='распис' i]",
      "[aria-label*='распис' i]"
    ]
  };

  const TAB_TESTIDS = {
    primary_exam: "[data-testid='tab-primary-exam']",
    discharge_summary: "[data-testid='tab-discharge-summary']",
    procedure_diary: "[data-testid='tab-procedure-diary']",
    schedule_page: "[data-testid='tab-schedule']"
  };

  async function openPatient(patientName) {
    const name = String(patientName || "").trim() || "Иванов";
    log("openPatient", "start", { patientName: name }, "[MedBot DOM] opening patient");

    const directRowResult = await openPatientFromRow(name);
    if (directRowResult.ok) return directRowResult;

    const searchField = await waitForElement(() => findField("patient"), 2500);
    if (searchField) {
      setFieldValue(searchField, name);
      await waitForDomSettled();

      const searchButton = findClickableByText("Поиск", { exact: true }) || findByTestId("patient-search-button");
      if (searchButton) {
        await clickElementSafely(searchButton);
        await waitForDomSettled();
      }

      const rowResult = await openPatientFromRow(name);
      if (rowResult.ok) return rowResult;
    }

    return errorResult("patient_open_failed", `Пациент не найден: ${name}`, { patient_name: name });
  }

  async function switchTab(documentType) {
    const documentLabel = resolveDocumentLabel(documentType);
    log("switchTab", "start", { documentType, documentLabel }, "[MedBot DOM] switching tab");

    const explicit = query(TAB_TESTIDS[documentType]) || query(`[data-tab='${cssEscape(documentType)}']`);
    const tab = explicit || findClickableByText(documentLabel, { exact: true }) || findClickableByText(documentLabel, { exact: false });

    if (!tab) {
      return errorResult("tab_not_found", `Раздел не найден: ${documentLabel}`, { document_type: documentType, document_label: documentLabel });
    }

    await clickElementSafely(tab);
    await waitForDomSettled();

    return successResult("tab_switched", "Переход выполнен.", {
      document_type: documentType,
      document_label: documentLabel
    });
  }

  async function fillMedicalFields(fields = {}) {
    const entries = Object.entries(fields).filter(([, value]) => value != null && String(value).trim());
    if (entries.length === 0) {
      return errorResult("form_fill_failed", "Нет полей для заполнения.", { filled_fields: [] });
    }

    const filledFields = [];
    const failedFields = [];

    for (const [fieldKey, value] of entries) {
      log("fillMedicalFields", "field", { fieldKey, value }, `[MedBot DOM] filling ${fieldKey}`);
      const result = await fillField(fieldKey, value);
      if (result.ok) filledFields.push(fieldKey);
      else failedFields.push({ field: fieldKey, message: result.message });
      await waitForDomSettled();
    }

    if (failedFields.length > 0) {
      return errorResult("form_fill_failed", `Не удалось заполнить: ${failedFields.map((item) => item.field).join(", ")}`, {
        filled_fields: filledFields,
        failed_fields: failedFields
      });
    }

    return successResult("form_filled", "Осмотр заполнен.", {
      filled_fields: filledFields
    });
  }

  async function markCompleted(serviceName) {
    const name = String(serviceName || "").trim() || "Массаж";
    log("markCompleted", "start", { serviceName: name }, "[MedBot DOM] marking service completed");

    const serviceContainer = findServiceContainer(name);
    if (serviceContainer) {
      await clickElementSafely(clickableAncestor(serviceContainer) || serviceContainer);
      await waitForDomSettled();
    } else {
      const serviceButton = findClickableByText(name, { exact: false });
      if (serviceButton) {
        await clickElementSafely(serviceButton);
        await waitForDomSettled();
      }
    }

    const completeButton =
      findScopedClickable(serviceContainer, "Отметить выполнено") ||
      findScopedClickable(serviceContainer, "Выполнено") ||
      findByTestId("complete-selected-service") ||
      findClickableByText("Отметить выполнено", { exact: false }) ||
      findClickableByText("Выполнено", { exact: true });

    if (!completeButton) {
      return errorResult("service_completion_failed", `Кнопка выполнения не найдена для услуги: ${name}`, { service_name: name });
    }

    await clickElementSafely(completeButton);
    await waitForDomSettled();

    return successResult("service_completed", "Услуга отмечена как выполненная.", {
      service_name: name
    });
  }

  async function writeProcedureDiary(text) {
    const value = String(text || "").trim() || "Процедура выполнена, перенесена спокойно.";
    log("writeProcedureDiary", "start", { text: value }, "[MedBot DOM] writing procedure diary");

    const tabResult = await switchTab("procedure_diary");
    if (!tabResult.ok) {
      log("writeProcedureDiary", "tab-warning", tabResult);
    }

    const field = await waitForElement(() => findField("procedure_result"), 3500);
    if (!field) {
      return errorResult("procedure_diary_failed", "Поле «Результат процедуры» не найдено.", {});
    }

    setFieldValue(field, value);
    await waitForDomSettled();

    return successResult("procedure_diary_written", "Данные сохранены.", {
      field: "procedure_result"
    });
  }

  async function applySchedule(days) {
    const scheduleDays = normalizeScheduleDays(days);
    log("applySchedule", "start", { daysCount: scheduleDays.length }, "[MedBot DOM] applying schedule");

    const tabResult = await switchTab("schedule_page");
    if (!tabResult.ok) {
      log("applySchedule", "tab-warning", tabResult);
    }

    const text = formatSchedule(scheduleDays);
    const scheduleField = await waitForElement(() => findField("schedule"), 3500);

    if (scheduleField) {
      setFieldValue(scheduleField, text);
      await waitForDomSettled();
    }

    const confirmButton =
      findByTestId("confirm-schedule") ||
      findClickableByText("Подтвердить расписание", { exact: true }) ||
      findClickableByText("Сохранить расписание", { exact: false });

    if (confirmButton) {
      await clickElementSafely(confirmButton);
      await waitForDomSettled();
    }

    return successResult("schedule_generated", "Расписание успешно создано.", {
      days_count: scheduleDays.length,
      rendered: Boolean(scheduleField)
    });
  }

  async function fillField(fieldKeyOrLabel, value) {
    const field = await waitForElement(() => findField(fieldKeyOrLabel), 3500);
    if (!field) {
      return errorResult("field_not_found", `Поле не найдено: ${fieldKeyOrLabel}`, { field: fieldKeyOrLabel });
    }

    setFieldValue(field, value);
    await waitForDomSettled();
    return successResult("field_filled", `Заполнено: ${resolveFieldLabel(fieldKeyOrLabel)}`, {
      field: normalizeFieldKey(fieldKeyOrLabel)
    });
  }

  function findField(fieldKeyOrLabel) {
    const key = normalizeFieldKey(fieldKeyOrLabel);
    const label = resolveFieldLabel(fieldKeyOrLabel);

    const direct = query(String(fieldKeyOrLabel || ""));
    if (isUsableField(direct)) return direct;

    const mapped = findBySelectorList(SELECTOR_MAP[key]);
    if (mapped) return mapped;

    return findFieldByLabel(label) ||
      findFieldByLabel(fieldKeyOrLabel) ||
      findByPlaceholder(label) ||
      findByAriaOrTitle(label) ||
      findInputOrTextareaNearLabel(label);
  }

  function findFieldByLabel(labelText) {
    const target = normalizeText(labelText);
    if (!target) return null;

    const labels = visibleElements([...document.querySelectorAll("label")]);
    for (const label of labels) {
      const text = normalizeText(label.innerText || label.textContent);
      if (text === target || text.includes(target) || target.includes(text)) {
        const control = controlForLabel(label);
        if (isUsableField(control)) return control;
      }
    }

    return null;
  }

  function findInputOrTextareaNearLabel(labelText) {
    const target = normalizeText(labelText);
    if (!target) return null;

    const fields = visibleElements([...document.querySelectorAll(FIELD_SELECTOR)]).filter((element) => !isDisabled(element));
    let best = null;

    for (const field of fields) {
      const haystack = normalizeText([
        labelTextFor(field),
        field.getAttribute("placeholder"),
        field.getAttribute("aria-label"),
        field.getAttribute("title"),
        field.getAttribute("name"),
        field.getAttribute("id"),
        nearbyText(field)
      ].filter(Boolean).join(" "));
      const score = scoreText(target, haystack);
      if (score >= 0.42 && (!best || score > best.score)) best = { element: field, score };
    }

    return best?.element || null;
  }

  function findClickableByText(text, options = {}) {
    const target = normalizeText(text);
    if (!target) return null;

    const candidates = visibleElements([...document.querySelectorAll(CLICKABLE_SELECTOR)]).filter((element) => !isDisabled(element));
    let partialBest = null;

    for (const element of candidates) {
      const haystack = normalizeText(clickableText(element));
      if (!haystack) continue;
      if (haystack === target) return element;
      if (!options.exact) {
        const score = scoreText(target, haystack);
        if (score >= 0.48 && (!partialBest || score > partialBest.score)) partialBest = { element, score };
      }
    }

    return partialBest?.element || null;
  }

  async function clickElementSafely(element) {
    if (!element) throw new Error("clickElementSafely: element is empty.");
    if (isDisabled(element)) throw new Error(`clickElementSafely: element is disabled (${describe(element)}).`);

    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    await sleep(70);
    element.focus?.({ preventScroll: true });
    flash(element, "click");

    const rect = element.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };

    try {
      element.dispatchEvent(new PointerEvent("pointerdown", eventInit));
      element.dispatchEvent(new PointerEvent("pointerup", eventInit));
    } catch {
      element.dispatchEvent(new MouseEvent("mousedown", eventInit));
      element.dispatchEvent(new MouseEvent("mouseup", eventInit));
    }

    element.dispatchEvent(new MouseEvent("click", eventInit));
    if (typeof element.click === "function") element.click();
  }

  function setFieldValue(element, value) {
    if (!isUsableField(element)) throw new Error(`setFieldValue: unusable field ${describe(element)}`);

    const nextValue = String(value ?? "");
    element.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
    element.focus?.({ preventScroll: true });

    if (element.matches("select")) {
      const normalized = normalizeText(nextValue);
      const option = [...element.options].find((item) => {
        const text = normalizeText(item.textContent);
        const optionValue = normalizeText(item.value);
        return text === normalized || optionValue === normalized || text.includes(normalized);
      });
      element.value = option ? option.value : nextValue;
    } else if (element.isContentEditable || element.getAttribute("role") === "textbox") {
      element.textContent = nextValue;
    } else {
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(element), "value");
      if (descriptor?.set) descriptor.set.call(element, nextValue);
      else element.value = nextValue;
    }

    element.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: nextValue }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true }));
    flash(element, "field");
  }

  async function waitForElement(callback, timeoutMs = 4000) {
    const started = Date.now();
    let result = callback();

    while (!result && Date.now() - started < timeoutMs) {
      await sleep(100);
      result = callback();
    }

    return result || null;
  }

  async function waitForDomSettled(delayMs = 140) {
    await new Promise((resolve) => window.requestAnimationFrame(() => window.requestAnimationFrame(resolve)));
    await sleep(delayMs);
  }

  async function openPatientFromRow(patientName) {
    const target = normalizeText(patientName);
    const targets = [target, target.replace(/[ау]$/u, "")].filter(Boolean);
    const rows = visibleElements([...document.querySelectorAll("tr, [data-testid^='patient-row'], .patient-row, .patient-card")]);
    const row = rows.find((item) => {
      const text = normalizeText(item.innerText || item.textContent);
      return targets.some((candidate) => text.includes(candidate));
    });

    if (!row) return errorResult("patient_row_not_found", `Строка пациента не найдена: ${patientName}`, { patient_name: patientName });

    const openButton =
      visibleElements([...row.querySelectorAll(CLICKABLE_SELECTOR)]).find((button) => normalizeText(clickableText(button)).includes("открыть")) ||
      row.querySelector("button, a, [role='button']");

    await clickElementSafely(openButton || row);
    await waitForDomSettled();

    return successResult("patient_opened", "Пациент открыт. Можно начинать осмотр.", {
      patient_name: patientName
    });
  }

  function findServiceContainer(serviceName) {
    const target = normalizeText(serviceName);
    const candidates = visibleElements([...document.querySelectorAll("[data-testid^='service-'], [data-testid^='procedure-'], tr, .service-card, .procedure-card, li")]);
    return candidates.find((element) => normalizeText(element.innerText || element.textContent).includes(target)) || null;
  }

  function findScopedClickable(scope, text) {
    if (!scope) return null;
    const target = normalizeText(text);
    return visibleElements([...scope.querySelectorAll(CLICKABLE_SELECTOR)]).find((element) => {
      const haystack = normalizeText(clickableText(element));
      return haystack === target || haystack.includes(target);
    }) || null;
  }

  function findByTestId(testId) {
    return query(`[data-testid='${cssEscape(testId)}']`);
  }

  function findBySelectorList(selectors = []) {
    for (const selector of selectors || []) {
      const element = query(selector);
      if (isUsableField(element)) return element;
    }
    return null;
  }

  function findByPlaceholder(labelText) {
    const target = normalizeText(labelText);
    return visibleElements([...document.querySelectorAll(FIELD_SELECTOR)]).find((field) => normalizeText(field.getAttribute("placeholder")).includes(target)) || null;
  }

  function findByAriaOrTitle(labelText) {
    const target = normalizeText(labelText);
    return visibleElements([...document.querySelectorAll(FIELD_SELECTOR)]).find((field) => {
      const text = normalizeText([field.getAttribute("aria-label"), field.getAttribute("title")].filter(Boolean).join(" "));
      return text === target || text.includes(target);
    }) || null;
  }

  function controlForLabel(label) {
    if (label.htmlFor) {
      const direct = document.getElementById(label.htmlFor);
      if (direct) return direct;
    }
    return label.querySelector(FIELD_SELECTOR) || label.parentElement?.querySelector(FIELD_SELECTOR) || null;
  }

  function clickableAncestor(element) {
    return element?.closest?.(CLICKABLE_SELECTOR) || null;
  }

  function normalizeScheduleDays(days) {
    if (Array.isArray(days)) return days;
    if (Array.isArray(days?.days)) return days.days;
    return [];
  }

  function formatSchedule(days) {
    return normalizeScheduleDays(days).map((day, index) => {
      const date = day.date || day.day || `День ${index + 1}`;
      const slots = day.slots || day.items || [];
      const line = slots.map((slot) => {
        const time = slot.time || slot.start || "";
        const procedure = slot.procedure || slot.name || "Процедура";
        const specialist = typeof slot.specialist === "object" ? slot.specialist.name : slot.specialist;
        return `${time} ${procedure}${specialist ? ` (${specialist})` : ""}`.trim();
      }).join("; ");
      return `${date}: ${line}`;
    }).join("\n");
  }

  function resolveFieldLabel(fieldKeyOrLabel) {
    return FIELD_LABEL_MAP[normalizeFieldKey(fieldKeyOrLabel)] || String(fieldKeyOrLabel || "");
  }

  function resolveDocumentLabel(documentTypeOrLabel) {
    return DOCUMENT_MAP[documentTypeOrLabel] || String(documentTypeOrLabel || "");
  }

  function normalizeFieldKey(value) {
    const normalized = normalizeText(value);
    const aliases = {
      complaints: "complaints",
      "жалобы": "complaints",
      anamnesis: "anamnesis",
      "анамнез": "anamnesis",
      objective_status: "objective_status",
      "объективный статус": "objective_status",
      "объективно": "objective_status",
      recommendations: "recommendations",
      "рекомендации": "recommendations",
      "назначить": "recommendations",
      procedure_result: "procedure_result",
      "результат процедуры": "procedure_result",
      "дневник": "procedure_result",
      schedule: "schedule",
      "расписание": "schedule",
      patient: "patient",
      "пациент": "patient"
    };
    return aliases[normalized] || String(value || "");
  }

  function normalizeText(value) {
    return String(value || "")
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/[^\p{L}\p{N}\s-]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function scoreText(target, haystack) {
    if (!target || !haystack) return 0;
    if (target === haystack) return 1;
    if (haystack.includes(target)) return 0.92;
    if (target.includes(haystack)) return 0.82;
    const targetWords = new Set(target.split(" ").filter(Boolean));
    const haystackWords = new Set(haystack.split(" ").filter(Boolean));
    const shared = [...targetWords].filter((word) => haystackWords.has(word)).length;
    return shared / Math.max(targetWords.size, 1);
  }

  function visibleElements(elements) {
    return elements.filter((element) => element && isVisible(element));
  }

  function isVisible(element) {
    if (!element || element.hidden || element.closest("[hidden]")) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function isUsableField(element) {
    return Boolean(element?.matches?.(FIELD_SELECTOR) && isVisible(element) && !isDisabled(element));
  }

  function isDisabled(element) {
    return Boolean(element?.disabled || element?.getAttribute?.("aria-disabled") === "true" || element?.closest?.("[disabled],[aria-disabled='true']"));
  }

  function labelTextFor(element) {
    if (element.id) {
      const label = query(`label[for='${cssEscape(element.id)}']`);
      if (label) return label.innerText || label.textContent || "";
    }
    return element.closest("label")?.innerText || "";
  }

  function nearbyText(element) {
    return [
      element.previousElementSibling?.innerText,
      element.parentElement?.innerText,
      element.closest(".field,.form-group,.row,.ant-form-item,.MuiFormControl-root")?.innerText
    ].filter(Boolean).join(" ");
  }

  function clickableText(element) {
    return [
      element.innerText,
      element.textContent,
      element.getAttribute("aria-label"),
      element.getAttribute("title"),
      element.getAttribute("value"),
      element.getAttribute("data-testid")
    ].filter(Boolean).join(" ");
  }

  function flash(element, type) {
    const previous = element.style.boxShadow;
    element.style.boxShadow = type === "field" ? "0 0 0 3px rgba(47,128,237,.7)" : "0 0 0 3px rgba(76,214,168,.7)";
    element.style.transition = "box-shadow 140ms ease";
    window.setTimeout(() => { element.style.boxShadow = previous; }, 900);
  }

  async function domTestHighlight() {
    log("domTestHighlight", "start", {}, "[MedBot DOM] DOM test highlight");
    const oldOutline = document.documentElement.style.outline;
    document.documentElement.style.outline = "4px solid #ff3b30";
    window.setTimeout(() => {
      document.documentElement.style.outline = oldOutline;
    }, 1800);
    return successResult("dom_test", "Проверка интерфейса выполнена.", {});
  }

  function query(selector) {
    try { return selector ? document.querySelector(selector) : null; } catch { return null; }
  }

  function cssEscape(value) {
    return window.CSS?.escape ? window.CSS.escape(value) : String(value).replace(/["'\\]/g, "\\$&");
  }

  function describe(element) {
    if (!element) return "null";
    return `${element.tagName.toLowerCase()}${element.id ? `#${element.id}` : ""}${element.dataset?.testid ? `[data-testid="${element.dataset.testid}"]` : ""}`;
  }

  function log(action, status, details = {}, message = "") {
    const entry = { action, status, details, timestamp: new Date().toISOString() };
    logs.push(entry);
    if (logs.length > 160) logs.shift();
    console.log(message || "[MedBot DOM]", entry);
  }

  function successResult(eventType, message, context = {}) {
    return { ok: true, event_type: eventType, message, context };
  }

  function errorResult(eventType, message, context = {}) {
    log(eventType, "error", { message, context }, "[MedBot DOM] error");
    return { ok: false, event_type: eventType, message, context };
  }

  function getActionLog() {
    return logs.slice(-40);
  }

  function sleep(ms) {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  window.MedBotDomActions = {
    normalizeText,
    findClickableByText,
    findFieldByLabel,
    findInputOrTextareaNearLabel,
    clickElementSafely,
    setFieldValue,
    waitForElement,
    waitForDomSettled,
    openPatient,
    switchTab,
    fillMedicalFields,
    markCompleted,
    writeProcedureDiary,
    applySchedule,
    domTestHighlight,
    getActionLog,
    log,
    // Backward-compatible names used by earlier router versions.
    clickByText: (text) => {
      const element = findClickableByText(text, { exact: false });
      return element ? clickElementSafely(element).then(() => successResult("clicked", `Нажато: ${text}`, { text })) : Promise.resolve(errorResult("click_failed", `Элемент не найден: ${text}`, { text }));
    },
    clickByRoleOrAria: (text) => {
      const element = findClickableByText(text, { exact: false });
      return element ? clickElementSafely(element).then(() => successResult("clicked", `Нажато: ${text}`, { text })) : Promise.resolve(errorResult("click_failed", `Элемент не найден: ${text}`, { text }));
    },
    fillField,
    navigateToTab: switchTab,
    openPatientRecord: openPatient,
    setCompletedStatus: markCompleted
  };
})();
