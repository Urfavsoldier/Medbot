console.log("MedBot smartScheduler module loaded");

export function generateTreatmentSchedule(input = {}) {
  console.log("MedBot generateTreatmentSchedule", input);

  const daysCount = clampNumber(input.days || 9, 1, 9);
  const workingHours = normalizeWorkingHours(input.workingHours);
  const days = buildWorkingDays(input.startDate, daysCount, workingHours.weekdays);
  const procedures = normalizeProcedures(input.procedures, days.length);
  const specialists = normalizeSpecialists(input.specialists);

  const patientBusy = new Map(days.map((day) => [day.date, []]));
  const specialistBusy = new Map(specialists.map((specialist) => [specialist.id, new Map(days.map((day) => [day.date, []]))]));
  const specialistLoad = new Map(specialists.map((specialist) => [specialist.id, 0]));
  const assignments = [];

  for (const day of days) {
    for (const procedure of procedures) {
      if (day.index > procedure.sessions) continue;

      const assignment = assignSlot({
        day,
        procedure,
        specialists,
        workingHours,
        patientBusy,
        specialistBusy,
        specialistLoad
      });

      if (assignment) assignments.push(assignment);
    }
  }

  return {
    days: days.map((day) => ({
      date: day.date,
      weekday: day.weekday,
      slots: assignments.filter((item) => item.date === day.date).map((item) => ({
        time: item.start,
        end: item.end,
        specialist: item.specialist.name,
        specialistId: item.specialist.id,
        procedure: item.procedure,
        durationMinutes: item.durationMinutes
      }))
    })),
    assignments,
    specialistLoad: specialists.map((specialist) => {
      const items = assignments.filter((item) => item.specialist.id === specialist.id);
      return {
        specialistId: specialist.id,
        specialist: specialist.name,
        specialty: specialist.specialty,
        totalMinutes: items.reduce((sum, item) => sum + item.durationMinutes, 0),
        totalSessions: items.length
      };
    }),
    meta: {
      workingDays: days.length,
      totalSessions: assignments.length,
      slotMinutes: { min: 30, max: 40 },
      workingHours: { start: workingHours.start, end: workingHours.end }
    }
  };
}

function assignSlot({ day, procedure, specialists, workingHours, patientBusy, specialistBusy, specialistLoad }) {
  const candidates = specialists
    .filter((specialist) => canPerform(specialist, procedure))
    .sort((a, b) => specialistLoad.get(a.id) - specialistLoad.get(b.id));
  const usable = candidates.length > 0 ? candidates : specialists;

  for (const specialist of usable) {
    const slot = findAvailableSlot(
      procedure.durationMinutes,
      workingHours,
      patientBusy.get(day.date),
      specialistBusy.get(specialist.id).get(day.date)
    );

    if (!slot) continue;

    patientBusy.get(day.date).push(slot);
    specialistBusy.get(specialist.id).get(day.date).push(slot);
    specialistLoad.set(specialist.id, specialistLoad.get(specialist.id) + procedure.durationMinutes);

    return {
      date: day.date,
      weekday: day.weekday,
      start: minutesToTime(slot.start),
      end: minutesToTime(slot.end),
      durationMinutes: procedure.durationMinutes,
      procedure: procedure.name,
      specialist: {
        id: specialist.id,
        name: specialist.name,
        specialty: specialist.specialty
      }
    };
  }

  return null;
}

function findAvailableSlot(durationMinutes, workingHours, patientBusy, specialistBusy) {
  const start = timeToMinutes(workingHours.start);
  const end = timeToMinutes(workingHours.end);

  for (let cursor = start; cursor + durationMinutes <= end; cursor += 5) {
    const slot = { start: cursor, end: cursor + durationMinutes };
    if (!overlaps(slot, patientBusy) && !overlaps(slot, specialistBusy)) return slot;
  }

  return null;
}

function overlaps(slot, items) {
  return items.some((item) => slot.start < item.end && slot.end > item.start);
}

function canPerform(specialist, procedure) {
  if (!procedure.specialistType && !procedure.specialty) return true;
  const required = normalize(procedure.specialistType || procedure.specialty);
  return normalize(specialist.specialty).includes(required) || required.includes(normalize(specialist.specialty)) || specialist.procedures.map(normalize).includes(normalize(procedure.name));
}

function normalizeProcedures(value, defaultSessions) {
  const raw = Array.isArray(value) ? value : value ? proceduresFromText(value) : defaultProcedures();
  return raw.map((item, index) => {
    if (typeof item === "string") {
      const known = defaultProcedures().find((procedure) => normalize(item).includes(normalize(procedure.name)));
      return known ? { ...known, sessions: defaultSessions } : { name: item, specialistType: "", durationMinutes: 30, sessions: defaultSessions };
    }
    return {
      name: item.name || item.title || `Процедура ${index + 1}`,
      specialistType: item.specialistType || item.specialty || "",
      durationMinutes: clampNumber(Math.round(Number(item.durationMinutes || item.duration || 30)), 30, 40),
      sessions: clampNumber(Math.round(Number(item.sessions || defaultSessions)), 1, defaultSessions)
    };
  });
}

function proceduresFromText(value) {
  if (typeof value !== "string") return [value];
  const text = normalize(value);
  const matched = defaultProcedures().filter((procedure) => text.includes(normalize(procedure.name)));
  if (matched.length > 0) return matched;
  return String(value).split(/,|;|\s+и\s+/iu).map((item) => item.trim()).filter(Boolean);
}

function normalizeSpecialists(value) {
  const raw = Array.isArray(value) && value.length > 0 ? value : defaultSpecialists();
  return raw.map((item, index) => {
    if (typeof item === "string") {
      return { id: `specialist-${index + 1}`, name: item, specialty: item, procedures: [] };
    }
    return {
      id: item.id || `specialist-${index + 1}`,
      name: item.name || item.fullName || `Специалист ${index + 1}`,
      specialty: item.specialty || item.type || "",
      procedures: Array.isArray(item.procedures) ? item.procedures : []
    };
  });
}

function normalizeWorkingHours(value = {}) {
  return {
    start: value.start || "09:00",
    end: value.end || "17:00",
    weekdays: Array.isArray(value.weekdays) && value.weekdays.length > 0 ? value.weekdays : [1, 2, 3, 4, 5]
  };
}

function buildWorkingDays(startDate, count, weekdays) {
  const cursor = startDate ? new Date(`${startDate}T00:00:00`) : today();
  const allowed = new Set(weekdays);
  const days = [];

  while (days.length < count) {
    if (allowed.has(cursor.getDay())) {
      days.push({
        index: days.length + 1,
        date: formatDate(cursor),
        weekday: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][cursor.getDay()]
      });
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
}

function defaultProcedures() {
  return [
    { name: "Массаж", specialistType: "Массажист", durationMinutes: 30, sessions: 9 },
    { name: "ЛФК", specialistType: "Инструктор ЛФК", durationMinutes: 40, sessions: 9 }
  ];
}

function defaultSpecialists() {
  return [
    { id: "massage-1", name: "Массажист", specialty: "Массажист", procedures: ["Массаж"] },
    { id: "lfk-1", name: "Инструктор ЛФК", specialty: "Инструктор ЛФК", procedures: ["ЛФК"] }
  ];
}

function today() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function timeToMinutes(time) {
  const [hours, minutes] = String(time).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
