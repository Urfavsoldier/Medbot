export function generateTreatmentSchedule(input = {}) {
  const daysCount = Number.isFinite(input.days) ? input.days : 9;
  const workingHours = normalizeWorkingHours(input.workingHours);
  const days = buildWorkingDays(input.startDate, daysCount, workingHours.weekdays);
  const procedures = normalizeProcedures(input.procedures, days.length);
  const specialists = normalizeSpecialists(input.specialists);

  if (procedures.length === 0) {
    procedures.push({ name: "Treatment", durationMinutes: 30, sessions: days.length, specialty: "" });
  }

  if (specialists.length === 0) {
    specialists.push({ id: "specialist-1", name: "Available specialist", specialty: "", procedures: [] });
  }

  const busyByDay = new Map(days.map((day) => [day.date, []]));
  const busyBySpecialist = new Map();
  const loadBySpecialist = new Map();
  const assignments = [];

  for (const specialist of specialists) {
    busyBySpecialist.set(specialist.id, new Map(days.map((day) => [day.date, []])));
    loadBySpecialist.set(specialist.id, 0);
  }

  for (const day of days) {
    for (const procedure of procedures) {
      if (day.index > procedure.sessions) continue;

      const assignment = assignProcedure({
        day,
        procedure,
        specialists,
        workingHours,
        busyByDay,
        busyBySpecialist,
        loadBySpecialist
      });

      if (assignment) assignments.push(assignment);
    }
  }

  return {
    days: days.map((day) => ({
      ...day,
      items: assignments.filter((item) => item.date === day.date)
    })),
    assignments,
    specialistLoad: specialists.map((specialist) => {
      const items = assignments.filter((item) => item.specialist.id === specialist.id);
      return {
        specialistId: specialist.id,
        specialistName: specialist.name,
        specialty: specialist.specialty,
        totalMinutes: items.reduce((total, item) => total + item.durationMinutes, 0),
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

function assignProcedure({ day, procedure, specialists, workingHours, busyByDay, busyBySpecialist, loadBySpecialist }) {
  const candidates = specialists
    .filter((specialist) => canPerform(specialist, procedure))
    .sort((a, b) => loadBySpecialist.get(a.id) - loadBySpecialist.get(b.id));

  const usableCandidates = candidates.length > 0 ? candidates : specialists;

  for (const specialist of usableCandidates) {
    const slot = findSlot(
      procedure.durationMinutes,
      workingHours,
      busyByDay.get(day.date),
      busyBySpecialist.get(specialist.id).get(day.date)
    );

    if (!slot) continue;

    busyByDay.get(day.date).push(slot);
    busyBySpecialist.get(specialist.id).get(day.date).push(slot);
    loadBySpecialist.set(specialist.id, loadBySpecialist.get(specialist.id) + procedure.durationMinutes);

    return {
      day: day.index,
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

function findSlot(durationMinutes, workingHours, patientBusy, specialistBusy) {
  const start = timeToMinutes(workingHours.start);
  const end = timeToMinutes(workingHours.end);

  for (let cursor = start; cursor + durationMinutes <= end; cursor += 5) {
    const slot = { start: cursor, end: cursor + durationMinutes };
    if (!overlaps(slot, patientBusy) && !overlaps(slot, specialistBusy)) {
      return slot;
    }
  }

  return null;
}

function overlaps(slot, items) {
  return items.some((item) => slot.start < item.end && slot.end > item.start);
}

function canPerform(specialist, procedure) {
  if (!procedure.specialty) return true;
  const required = normalize(procedure.specialty);
  return normalize(specialist.specialty).includes(required) || specialist.procedures.map(normalize).includes(normalize(procedure.name));
}

function normalizeProcedures(value, defaultSessions) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((item, index) => {
    if (typeof item === "string") {
      return { name: item, durationMinutes: 30, sessions: defaultSessions, specialty: "" };
    }
    return {
      name: item.name || item.title || `Procedure ${index + 1}`,
      durationMinutes: clampDuration(Number(item.durationMinutes || item.duration || 30)),
      sessions: Math.max(1, Math.min(defaultSessions, Number(item.sessions || defaultSessions))),
      specialty: item.specialty || item.specialistType || ""
    };
  });
}

function normalizeSpecialists(value) {
  const items = Array.isArray(value) ? value : value ? [value] : [];
  return items.map((item, index) => {
    if (typeof item === "string") {
      return { id: `specialist-${index + 1}`, name: item, specialty: "", procedures: [] };
    }
    return {
      id: item.id || `specialist-${index + 1}`,
      name: item.name || item.fullName || `Specialist ${index + 1}`,
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
  const days = [];
  const cursor = startDate ? new Date(`${startDate}T00:00:00`) : today();
  const allowed = new Set(weekdays);

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

function today() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function clampDuration(value) {
  if (!Number.isFinite(value)) return 30;
  return Math.max(30, Math.min(40, Math.round(value)));
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value).split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(value) {
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function formatDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}
