const patients = [
  { id: "p-ivanov", name: "Иванов Андрей Сергеевич", shortName: "Иванов", age: 9, diagnosis: "Последствия перинатального поражения ЦНС, моторная задержка", department: "Неврологическая реабилитация" },
  { id: "p-petrova", name: "Петрова Мария Ильинична", shortName: "Петрова", age: 12, diagnosis: "Сколиотическая осанка, курс ЛФК", department: "Ортопедическая реабилитация" },
  { id: "p-sadykov", name: "Садыков Тимур Ерланович", shortName: "Садыков", age: 7, diagnosis: "Задержка речевого развития, комплексная реабилитация", department: "Детская реабилитация" },
  { id: "p-kim", name: "Ким Анна Викторовна", shortName: "Ким", age: 15, diagnosis: "Посттравматическое восстановление после перелома", department: "Физиотерапия" },
  { id: "p-smirnov", name: "Смирнов Павел Олегович", shortName: "Смирнов", age: 10, diagnosis: "Нарушение координации, курс нейрореабилитации", department: "Нейрореабилитация" }
];

const services = [
  { id: "massage", name: "Массаж", specialist: "Массажист", status: "Запланировано" },
  { id: "lfk", name: "ЛФК", specialist: "Инструктор ЛФК", status: "Запланировано" },
  { id: "psychologist", name: "Психолог", specialist: "Психолог", status: "Запланировано" }
];

const defaultSchedule = [
  { date: "2026-04-20", slots: [{ time: "09:00", specialist: "Массажист", procedure: "Массаж" }, { time: "09:40", specialist: "Инструктор ЛФК", procedure: "ЛФК" }] },
  { date: "2026-04-21", slots: [{ time: "09:00", specialist: "Массажист", procedure: "Массаж" }, { time: "09:40", specialist: "Психолог", procedure: "Психолог" }] },
  { date: "2026-04-22", slots: [{ time: "09:00", specialist: "Инструктор ЛФК", procedure: "ЛФК" }, { time: "10:00", specialist: "Массажист", procedure: "Массаж" }] },
  { date: "2026-04-23", slots: [{ time: "09:00", specialist: "Массажист", procedure: "Массаж" }, { time: "09:40", specialist: "Инструктор ЛФК", procedure: "ЛФК" }] },
  { date: "2026-04-24", slots: [{ time: "09:00", specialist: "Психолог", procedure: "Психолог" }, { time: "09:40", specialist: "Массажист", procedure: "Массаж" }] },
  { date: "2026-04-27", slots: [{ time: "09:00", specialist: "Инструктор ЛФК", procedure: "ЛФК" }, { time: "09:40", specialist: "Массажист", procedure: "Массаж" }] },
  { date: "2026-04-28", slots: [{ time: "09:00", specialist: "Массажист", procedure: "Массаж" }, { time: "09:40", specialist: "Инструктор ЛФК", procedure: "ЛФК" }] },
  { date: "2026-04-29", slots: [{ time: "09:00", specialist: "Психолог", procedure: "Психолог" }, { time: "09:40", specialist: "Массажист", procedure: "Массаж" }] },
  { date: "2026-04-30", slots: [{ time: "09:00", specialist: "Массажист", procedure: "Массаж" }, { time: "09:40", specialist: "Инструктор ЛФК", procedure: "ЛФК" }] }
];

let selectedPatient = null;
let selectedServiceId = "massage";
let currentSchedule = clone(defaultSchedule);

const elements = {
  pageTitle: document.getElementById("pageTitle"),
  patientsView: document.getElementById("patientsView"),
  patientCardView: document.getElementById("patientCardView"),
  patientsTableBody: document.getElementById("patientsTableBody"),
  patientSearch: document.getElementById("patientSearch"),
  patientNameTitle: document.getElementById("patientNameTitle"),
  patientMeta: document.getElementById("patientMeta"),
  backToPatientsButton: document.getElementById("backToPatientsButton"),
  servicesList: document.getElementById("servicesList"),
  completeSelectedServiceButton: document.getElementById("completeSelectedServiceButton"),
  scheduleGrid: document.getElementById("scheduleGrid"),
  schedulePlan: document.getElementById("schedulePlan"),
  toast: document.getElementById("toast")
};

init();

function init() {
  renderPatients(patients);
  renderServices();
  renderProcedureList();
  renderSchedule(currentSchedule);
  syncScheduleTextarea();

  document.querySelector("[data-testid='patient-search-form']").addEventListener("submit", handlePatientSearch);
  elements.patientSearch.addEventListener("input", handlePatientFilter);
  elements.backToPatientsButton.addEventListener("click", showPatientsPage);
  elements.completeSelectedServiceButton.addEventListener("click", completeSelectedService);
  elements.schedulePlan.addEventListener("input", handleScheduleTextInput);
  elements.schedulePlan.addEventListener("change", handleScheduleTextInput);
  document.getElementById("confirmScheduleButton").addEventListener("click", () => showToast("Расписание подтверждено"));

  document.querySelectorAll("[role='tab']").forEach((button) => {
    button.addEventListener("click", () => activateTab(button.dataset.tab));
  });

  document.querySelectorAll("[data-tab-target]").forEach((button) => {
    button.addEventListener("click", () => {
      if (!selectedPatient) openPatient(patients[0].id);
      activateTab(button.dataset.tabTarget);
    });
  });

  document.querySelectorAll(".save-button").forEach((button) => {
    button.addEventListener("click", () => showToast("Данные сохранены"));
  });
}

function renderPatients(list) {
  elements.patientsTableBody.innerHTML = "";

  list.forEach((patient) => {
    const row = document.createElement("tr");
    row.dataset.testid = `patient-row-${patient.shortName.toLowerCase()}`;
    row.innerHTML = `
      <td><strong>${patient.name}</strong></td>
      <td>${patient.age} лет</td>
      <td>${patient.diagnosis}</td>
      <td>${patient.department}</td>
      <td><button class="secondary" type="button" data-testid="open-patient-${patient.shortName.toLowerCase()}" aria-label="Открыть ${patient.shortName}">Открыть</button></td>
    `;
    row.querySelector("button").addEventListener("click", () => openPatient(patient.id));
    elements.patientsTableBody.append(row);
  });
}

function handlePatientFilter() {
  const query = normalize(elements.patientSearch.value);
  const filtered = patients.filter((patient) => normalize(patient.name).includes(query) || normalize(patient.shortName).includes(query));
  renderPatients(filtered.length ? filtered : patients);
}

function handlePatientSearch(event) {
  event.preventDefault();
  const query = normalize(elements.patientSearch.value);
  const found = patients.find((patient) => normalize(patient.name).includes(query) || normalize(patient.shortName).includes(query));
  if (found) {
    openPatient(found.id);
    return;
  }
  showToast("Пациент не найден");
}

function openPatient(patientId) {
  selectedPatient = patients.find((patient) => patient.id === patientId) || patients[0];
  elements.pageTitle.textContent = "Карта пациента";
  elements.patientNameTitle.textContent = selectedPatient.name;
  elements.patientMeta.textContent = `${selectedPatient.age} лет · ${selectedPatient.diagnosis}`;
  elements.patientsView.classList.remove("active");
  elements.patientCardView.hidden = false;
  elements.patientCardView.classList.add("active");
  activateTab("primary_exam");
  showToast(`Пациент открыт: ${selectedPatient.shortName}`);
}

function showPatientsPage() {
  elements.pageTitle.textContent = "Список пациентов";
  elements.patientCardView.classList.remove("active");
  elements.patientCardView.hidden = true;
  elements.patientsView.classList.add("active");
}

function activateTab(tabName) {
  document.querySelectorAll("[role='tab']").forEach((button) => {
    button.setAttribute("aria-selected", String(button.dataset.tab === tabName));
  });

  document.querySelectorAll(".document-panel").forEach((panel) => {
    const active = panel.dataset.document === tabName;
    panel.hidden = !active;
    panel.classList.toggle("active", active);
  });
}

function renderServices() {
  elements.servicesList.innerHTML = "";

  services.forEach((service) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = `service-card ${service.id === selectedServiceId ? "active" : ""} ${service.status === "Выполнено" ? "completed" : ""}`;
    card.dataset.testid = `service-${service.id}`;
    card.setAttribute("aria-label", service.name);
    card.innerHTML = `
      <span><strong>${service.name}</strong><p>${service.specialist}</p></span>
      <span class="service-status">${service.status}</span>
    `;
    card.addEventListener("click", () => {
      selectedServiceId = service.id;
      renderServices();
      showToast(`Выбрана услуга: ${service.name}`);
    });
    elements.servicesList.append(card);
  });
}

function renderProcedureList() {
  const list = document.querySelector("[data-testid='procedure-list']");
  list.innerHTML = "";

  services.forEach((service) => {
    const item = document.createElement("div");
    item.className = `service-card ${service.status === "Выполнено" ? "completed" : ""}`;
    item.dataset.testid = `procedure-${service.id}`;
    item.innerHTML = `
      <span><strong>${service.name}</strong><p>${service.specialist}</p></span>
      <span class="service-status">${service.status}</span>
    `;
    list.append(item);
  });
}

function completeSelectedService() {
  const service = services.find((item) => item.id === selectedServiceId);
  if (!service) return;

  service.status = "Выполнено";
  renderServices();
  renderProcedureList();
  showToast(`${service.name}: выполнено`);
}

function renderSchedule(days) {
  elements.scheduleGrid.innerHTML = "";

  days.slice(0, 9).forEach((day, index) => {
    const card = document.createElement("article");
    card.className = "schedule-card";
    card.dataset.testid = `schedule-day-${index + 1}`;
    card.innerHTML = `
      <h3>День ${index + 1}</h3>
      <p>${formatDate(day.date)}</p>
      ${(day.slots || []).map((slot) => `
        <div class="schedule-slot">
          <span><strong>${slot.procedure}</strong><span>${slot.specialist}</span></span>
          <strong>${slot.time}</strong>
        </div>
      `).join("")}
    `;
    elements.scheduleGrid.append(card);
  });
}

function syncScheduleTextarea() {
  elements.schedulePlan.value = currentSchedule.map((day) => {
    const slots = day.slots.map((slot) => `${slot.time} ${slot.procedure} (${slot.specialist})`).join("; ");
    return `${day.date}: ${slots}`;
  }).join("\n");
}

function handleScheduleTextInput() {
  const parsed = parseScheduleText(elements.schedulePlan.value);
  if (parsed.length > 0) {
    currentSchedule = parsed;
    renderSchedule(currentSchedule);
  }
}

function parseScheduleText(text) {
  return String(text || "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 9)
    .map((line, index) => {
      const match = line.match(/^\s*([^:]+):\s*(.*)$/);
      const datePart = match?.[1] || `День ${index + 1}`;
      const rest = match?.[2] || line;
      const slots = rest.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
        const time = part.match(/\b\d{2}:\d{2}\b/)?.[0] || "09:00";
        const procedure = part.replace(time, "").replace(/\(.+\)/, "").trim() || "Процедура";
        const specialist = part.match(/\((.+)\)/)?.[1] || "Специалист";
        return { time, procedure, specialist };
      });
      return {
        date: datePart?.trim() || `День ${index + 1}`,
        slots: slots.length ? slots : [{ time: "09:00", procedure: "Процедура", specialist: "Специалист" }]
      };
    });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.hidden = true;
  }, 2400);
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function formatDate(value) {
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "long", weekday: "short" });
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}
