"use client";

import { useMemo, useState } from "react";
import { formatDate, formatDateTime } from "@/lib/format";

type PrimaryExamPayload = {
  complaints?: string;
  anamnesis?: string;
  objectiveStatus?: string;
  recommendations?: string;
  savedAt?: string;
} | null;

type DischargeSummaryPayload = {
  complaints?: string;
  objectiveStatus?: string;
  recommendations?: string;
  savedAt?: string;
} | null;

type ProcedurePayload = {
  id: string;
  name: string;
  specialist: string;
  status: string;
  completedAt?: string | null;
};

type DiaryPayload = {
  id: string;
  result: string;
  status: string;
  savedAt: string;
  procedure?: { name: string } | null;
  doctor?: { name: string } | null;
};

type ScheduleEntryPayload = {
  id: string;
  date: string;
  time: string;
  specialist: string;
  procedure: string;
  status: string;
  duration: number;
};

type PatientPayload = {
  id: string;
  fullName: string;
  shortName: string;
  age: number;
  status: string;
  diagnosis: {
    title: string;
    code?: string | null;
  };
  primaryExam: PrimaryExamPayload;
  dischargeSummary: DischargeSummaryPayload;
  procedures: ProcedurePayload[];
  diaries: DiaryPayload[];
  scheduleEntries: ScheduleEntryPayload[];
};

type ScheduleDay = {
  date: string;
  slots: {
    time: string;
    specialist: string;
    procedure: string;
    status?: string;
    duration?: number;
  }[];
};

const tabs = [
  { id: "primary_exam", label: "Первичный прием", testId: "tab-primary-exam" },
  { id: "discharge_summary", label: "Выписной эпикриз", testId: "tab-discharge-summary" },
  { id: "procedure_diary", label: "Дневник процедур", testId: "tab-procedure-diary" },
  { id: "schedule_page", label: "Расписание", testId: "tab-schedule" }
] as const;

const procedureTestIdMap: Record<string, string> = {
  "массаж": "massage",
  "лфк": "lfk",
  "психолог": "psychologist"
};

export function PatientWorkspace({ patient, doctorName }: { patient: PatientPayload; doctorName: string }) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["id"]>("primary_exam");
  const [primaryForm, setPrimaryForm] = useState({
    complaints: patient.primaryExam?.complaints || "",
    anamnesis: patient.primaryExam?.anamnesis || "",
    objective_status: patient.primaryExam?.objectiveStatus || "",
    recommendations: patient.primaryExam?.recommendations || ""
  });
  const [dischargeForm, setDischargeForm] = useState({
    complaints: patient.dischargeSummary?.complaints || "",
    objective_status: patient.dischargeSummary?.objectiveStatus || "",
    recommendations: patient.dischargeSummary?.recommendations || ""
  });
  const [procedures, setProcedures] = useState(patient.procedures);
  const [diaries, setDiaries] = useState(patient.diaries);
  const [procedureResult, setProcedureResult] = useState(patient.diaries[0]?.result || "");
  const [scheduleDays, setScheduleDays] = useState<ScheduleDay[]>(() => groupSchedule(patient.scheduleEntries));
  const [scheduleText, setScheduleText] = useState(() => formatScheduleText(groupSchedule(patient.scheduleEntries)));
  const [isSaving, setIsSaving] = useState(false);
  const [notice, setNotice] = useState("Карта пациента открыта.");

  const selectedProcedure = useMemo(() => procedures[0] || null, [procedures]);
  const activeTabLabel = tabs.find((tab) => tab.id === activeTab)?.label || "Раздел";

  async function savePrimaryExam() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/patients/${patient.id}/primary-exam`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(primaryForm)
      });
      if (!response.ok) throw new Error("Не удалось сохранить первичный прием.");
      setNotice("Первичный прием сохранен.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка сохранения.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveDischargeSummary() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/patients/${patient.id}/discharge-summary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dischargeForm)
      });
      if (!response.ok) throw new Error("Не удалось сохранить выписной эпикриз.");
      setNotice("Выписной эпикриз сохранен.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка сохранения.");
    } finally {
      setIsSaving(false);
    }
  }

  async function saveProcedureDiary() {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/patients/${patient.id}/procedure-diary`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          result: procedureResult,
          procedureId: selectedProcedure?.id
        })
      });
      const payload = await response.json();
      if (!response.ok) throw new Error("Не удалось сохранить дневник процедуры.");
      setDiaries((current) => [payload.diary, ...current]);
      setNotice("Дневник процедуры сохранен.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка сохранения.");
    } finally {
      setIsSaving(false);
    }
  }

  async function markCompleted(procedure: ProcedurePayload) {
    setIsSaving(true);
    try {
      const response = await fetch(`/api/patients/${patient.id}/procedures/${procedure.id}/complete`, {
        method: "POST"
      });
      const payload = await response.json();
      if (!response.ok) throw new Error("Не удалось отметить услугу выполненной.");
      setProcedures((current) => current.map((item) => item.id === procedure.id ? payload.procedure : item));
      setNotice(`Услуга «${procedure.name}» отмечена как выполненная.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка изменения статуса.");
    } finally {
      setIsSaving(false);
    }
  }

  async function confirmSchedule() {
    setIsSaving(true);
    try {
      const days = parseScheduleText(scheduleText);
      const response = await fetch(`/api/patients/${patient.id}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days })
      });
      if (!response.ok) throw new Error("Не удалось подтвердить расписание.");
      setScheduleDays(days);
      setNotice("Расписание подтверждено.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Ошибка расписания.");
    } finally {
      setIsSaving(false);
    }
  }

  function updateScheduleText(value: string) {
    setScheduleText(value);
    const parsed = parseScheduleText(value);
    if (parsed.length > 0) setScheduleDays(parsed);
  }

  return (
    <div className="space-y-6" data-testid="patient-workspace">
      <section className="card overflow-hidden">
        <div className="border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-blue-50 p-6">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.18em] text-emerald-600">Медицинская карта</p>
              <h1 className="mt-2 text-3xl font-black text-slate-950" data-testid="patient-card-title">{patient.fullName}</h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                {patient.age} лет. {patient.diagnosis.code ? `${patient.diagnosis.code}: ` : ""}{patient.diagnosis.title}
              </p>
            </div>
            <div className="rounded-3xl border border-white/80 bg-white/80 p-4 shadow-soft">
              <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Ответственный врач</p>
              <p className="mt-1 font-black text-slate-950">{doctorName}</p>
              <p className="mt-2 text-sm text-slate-500">Текущий раздел: {activeTabLabel}</p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white p-4" role="tablist" aria-label="Разделы карты пациента">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              data-tab={tab.id}
              data-testid={tab.testId}
              onClick={() => setActiveTab(tab.id)}
              className={`rounded-2xl px-4 py-3 text-sm font-black transition ${
                activeTab === tab.id
                  ? "bg-blue-600 text-white shadow-soft"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          {activeTab === "primary_exam" && (
            <FormCard
              title="Первичный прием"
              subtitle="Основная карта первичного осмотра. Поля доступны для внешней DOM-автоматизации."
              savedAt={patient.primaryExam?.savedAt}
              onSave={savePrimaryExam}
              isSaving={isSaving}
              saveTestId="save-primary-exam"
            >
              <MedicalTextarea
                id="primary-complaints"
                label="Жалобы"
                value={primaryForm.complaints}
                onChange={(value) => setPrimaryForm((current) => ({ ...current, complaints: value }))}
                placeholder="Например: головная боль, слабость, нарушение сна"
                testId="field-complaints"
                name="complaints"
              />
              <MedicalTextarea
                id="primary-anamnesis"
                label="Анамнез"
                value={primaryForm.anamnesis}
                onChange={(value) => setPrimaryForm((current) => ({ ...current, anamnesis: value }))}
                placeholder="Краткий анамнез заболевания и реабилитации"
                testId="field-anamnesis"
                name="anamnesis"
              />
              <MedicalTextarea
                id="primary-objective-status"
                label="Объективный статус"
                value={primaryForm.objective_status}
                onChange={(value) => setPrimaryForm((current) => ({ ...current, objective_status: value }))}
                placeholder="Тонус, координация, активность, неврологический статус"
                testId="field-objective-status"
                name="objective_status"
              />
              <MedicalTextarea
                id="primary-recommendations"
                label="Рекомендации"
                value={primaryForm.recommendations}
                onChange={(value) => setPrimaryForm((current) => ({ ...current, recommendations: value }))}
                placeholder="Назначения: массаж, ЛФК, психолог, режим"
                testId="field-recommendations"
                name="recommendations"
              />
            </FormCard>
          )}

          {activeTab === "discharge_summary" && (
            <FormCard
              title="Выписной эпикриз"
              subtitle="Итоговый медицинский документ по завершению курса."
              savedAt={patient.dischargeSummary?.savedAt}
              onSave={saveDischargeSummary}
              isSaving={isSaving}
              saveTestId="save-discharge-summary"
            >
              <MedicalTextarea
                id="discharge-complaints"
                label="Жалобы"
                value={dischargeForm.complaints}
                onChange={(value) => setDischargeForm((current) => ({ ...current, complaints: value }))}
                placeholder="Жалобы на момент выписки"
                testId="discharge-complaints"
                name="complaints"
              />
              <MedicalTextarea
                id="discharge-objective-status"
                label="Объективный статус"
                value={dischargeForm.objective_status}
                onChange={(value) => setDischargeForm((current) => ({ ...current, objective_status: value }))}
                placeholder="Динамика объективного статуса"
                testId="discharge-objective-status"
                name="objective_status"
              />
              <MedicalTextarea
                id="discharge-recommendations"
                label="Рекомендации"
                value={dischargeForm.recommendations}
                onChange={(value) => setDischargeForm((current) => ({ ...current, recommendations: value }))}
                placeholder="Рекомендации после выписки"
                testId="discharge-recommendations"
                name="recommendations"
              />
            </FormCard>
          )}

          {activeTab === "procedure_diary" && (
            <div className="grid gap-6">
              <div className="card p-6">
                <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
                  <div>
                    <h2 className="text-2xl font-black text-slate-950">Дневник процедур</h2>
                    <p className="mt-1 text-sm text-slate-500">Фиксация результата и статуса услуги.</p>
                  </div>
                  <span className="status-badge border-blue-200 bg-blue-50 text-blue-700">Сегодня</span>
                </div>

                <div className="mt-6 grid gap-4">
                  <MedicalTextarea
                    id="procedure-result"
                    label="Результат процедуры"
                    value={procedureResult}
                    onChange={setProcedureResult}
                    placeholder="Например: ребенок перенес процедуру спокойно, жалоб не предъявлял"
                    testId="field-procedure-result"
                    name="procedure_result"
                  />
                  <button
                    type="button"
                    className="btn-primary w-fit"
                    onClick={saveProcedureDiary}
                    disabled={isSaving}
                    data-testid="save-procedure-diary"
                  >
                    Сохранить дневник
                  </button>
                </div>
              </div>

              <div className="card p-6" data-testid="procedure-diary-history">
                <h3 className="font-black text-slate-950">История записей</h3>
                <div className="mt-4 grid gap-3">
                  {diaries.length === 0 ? (
                    <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-500">Записей пока нет.</p>
                  ) : diaries.map((diary) => (
                    <article key={diary.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                        <span>{formatDateTime(diary.savedAt)}</span>
                        <span>•</span>
                        <span>{diary.procedure?.name || "Процедура"}</span>
                        <span>•</span>
                        <span>{diary.doctor?.name || doctorName}</span>
                      </div>
                      <p className="mt-2 text-sm leading-6 text-slate-700">{diary.result || "Результат не заполнен."}</p>
                    </article>
                  ))}
                </div>
              </div>
            </div>
          )}

          {activeTab === "schedule_page" && (
            <div className="grid gap-6">
              <div className="card p-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
                  <div>
                    <h2 className="text-2xl font-black text-slate-950">Расписание процедур</h2>
                    <p className="mt-1 text-sm text-slate-500">План на 9 рабочих дней. MedBot может вставить расписание в поле ниже.</p>
                  </div>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={confirmSchedule}
                    disabled={isSaving}
                    data-testid="confirm-schedule"
                  >
                    Подтвердить расписание
                  </button>
                </div>
                <label className="mt-6 grid gap-2">
                  <span className="field-label">Расписание</span>
                  <textarea
                    id="schedulePlan"
                    name="schedule"
                    className="field-control min-h-36 font-mono text-xs leading-6"
                    value={scheduleText}
                    onChange={(event) => updateScheduleText(event.target.value)}
                    placeholder="2026-04-20: 09:00 Массаж (Массажист); 09:40 ЛФК (Инструктор ЛФК)"
                    aria-label="Расписание"
                    data-testid="schedule-input"
                  />
                </label>
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="schedule-grid">
                {scheduleDays.slice(0, 9).map((day, dayIndex) => (
                  <article key={`${day.date}-${dayIndex}`} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-soft" data-testid={`schedule-day-${dayIndex + 1}`}>
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-blue-500">День {dayIndex + 1}</p>
                    <h3 className="mt-2 font-black text-slate-950">{formatScheduleDate(day.date)}</h3>
                    <div className="mt-4 grid gap-3">
                      {day.slots.map((slot, slotIndex) => (
                        <div key={`${slot.time}-${slot.procedure}-${slotIndex}`} className="rounded-2xl bg-slate-50 p-3" data-testid={`schedule-slot-${dayIndex + 1}-${slotIndex + 1}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-black text-slate-950">{slot.time}</p>
                            <span className="status-badge border-emerald-200 bg-emerald-50 text-emerald-700">{slot.status || "Запланировано"}</span>
                          </div>
                          <p className="mt-2 text-sm font-bold text-slate-700">{slot.procedure}</p>
                          <p className="mt-1 text-xs text-slate-500">{slot.specialist} • {slot.duration || 40} мин</p>
                        </div>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card p-6" data-testid="procedure-status-panel">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-xl font-black text-slate-950">Услуги</h2>
                <p className="mt-1 text-sm text-slate-500">Статусы процедур пациента.</p>
              </div>
              <span className="status-badge border-emerald-200 bg-emerald-50 text-emerald-700">{patient.status}</span>
            </div>

            <div className="mt-5 grid gap-3">
              {procedures.map((procedure) => {
                const slug = procedureSlug(procedure.name);
                const isComplete = procedure.status === "Выполнено";
                return (
                  <article
                    key={procedure.id}
                    className="rounded-3xl border border-slate-200 bg-white p-4"
                    data-testid={`procedure-row-${slug}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-black text-slate-950">{procedure.name}</p>
                        <p className="mt-1 text-sm text-slate-500">{procedure.specialist}</p>
                      </div>
                      <span className={`status-badge ${isComplete ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>
                        {procedure.status}
                      </span>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary mt-4 w-full"
                      onClick={() => markCompleted(procedure)}
                      disabled={isSaving || isComplete}
                      data-testid={`mark-completed-${slug}`}
                    >
                      {isComplete ? "Выполнено" : "Отметить выполнено"}
                    </button>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="card p-6" data-testid="assistant-context">
            <h2 className="text-xl font-black text-slate-950">Контекст MedBot</h2>
            <div className="mt-4 grid gap-3 text-sm">
              <div className="rounded-2xl bg-blue-50 p-4">
                <p className="font-bold text-blue-900">Последнее действие</p>
                <p className="mt-1 text-blue-700">{notice}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="font-bold text-emerald-900">Подсказка</p>
                <p className="mt-1 text-emerald-700">Заполните поля осмотра, затем сформируйте расписание процедур.</p>
              </div>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function FormCard({
  title,
  subtitle,
  savedAt,
  children,
  onSave,
  isSaving,
  saveTestId
}: {
  title: string;
  subtitle: string;
  savedAt?: string;
  children: React.ReactNode;
  onSave: () => void;
  isSaving: boolean;
  saveTestId: string;
}) {
  return (
    <div className="card p-6">
      <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
        <div>
          <h2 className="text-2xl font-black text-slate-950">{title}</h2>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
          {savedAt ? <p className="mt-2 text-xs font-semibold text-slate-400">Последнее сохранение: {formatDateTime(savedAt)}</p> : null}
        </div>
        <button type="button" className="btn-primary" onClick={onSave} disabled={isSaving} data-testid={saveTestId}>
          {isSaving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
      <div className="mt-6 grid gap-5">{children}</div>
    </div>
  );
}

function MedicalTextarea({
  id,
  label,
  value,
  onChange,
  placeholder,
  testId,
  name
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  testId: string;
  name: string;
}) {
  return (
    <label className="grid gap-2" htmlFor={id} data-testid={`${testId}-group`}>
      <span className="field-label">{label}</span>
      <textarea
        id={id}
        name={name}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field-control min-h-32 resize-y leading-6"
        placeholder={placeholder}
        aria-label={label}
        title={label}
        data-testid={testId}
      />
    </label>
  );
}

function groupSchedule(entries: ScheduleEntryPayload[]): ScheduleDay[] {
  const map = new Map<string, ScheduleDay>();
  for (const entry of entries) {
    const date = entry.date.slice(0, 10);
    if (!map.has(date)) map.set(date, { date, slots: [] });
    map.get(date)?.slots.push({
      time: entry.time,
      specialist: entry.specialist,
      procedure: entry.procedure,
      status: entry.status,
      duration: entry.duration
    });
  }

  return [...map.values()].map((day) => ({
    ...day,
    slots: day.slots.sort((a, b) => a.time.localeCompare(b.time))
  })).sort((a, b) => a.date.localeCompare(b.date));
}

function formatScheduleText(days: ScheduleDay[]) {
  return days.map((day, index) => {
    const date = day.date || `День ${index + 1}`;
    const slots = day.slots.map((slot) => `${slot.time} ${slot.procedure} (${slot.specialist})`).join("; ");
    return `${date}: ${slots}`;
  }).join("\n");
}

function parseScheduleText(value: string): ScheduleDay[] {
  const lines = value.split("\n").map((line) => line.trim()).filter(Boolean);
  const days = lines.map((line, index) => {
    const [datePart, ...rest] = line.split(":");
    const schedulePart = rest.join(":").trim();
    const fallbackDate = nextWorkingDate(index);
    const date = normalizeDate(datePart.trim()) || fallbackDate;
    const slots = schedulePart.split(";").map((rawSlot, slotIndex) => parseSlot(rawSlot.trim(), slotIndex)).filter(isScheduleSlot);
    return { date, slots };
  }).filter((day) => day.slots.length > 0);

  return days.slice(0, 9);
}

function parseSlot(rawSlot: string, index: number) {
  if (!rawSlot) return null;
  const match = rawSlot.match(/(\d{1,2}:\d{2})\s+(.+?)(?:\s+\((.+)\))?$/);
  if (!match) {
    return {
      time: index === 0 ? "09:00" : "09:40",
      procedure: rawSlot,
      specialist: "Специалист",
      status: "Запланировано",
      duration: 40
    };
  }

  const procedure = match[2].replace(/\(.+\)$/, "").trim() || "Процедура";
  return {
    time: match[1],
    procedure,
    specialist: (match[3] || specialistForProcedure(procedure)).trim(),
    status: "Запланировано",
    duration: procedure.toLowerCase().includes("лфк") ? 40 : 30
  };
}

function isScheduleSlot(slot: ReturnType<typeof parseSlot>): slot is NonNullable<ReturnType<typeof parseSlot>> {
  return Boolean(slot);
}

function normalizeDate(value: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function nextWorkingDate(index: number) {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  let added = 0;
  while (added <= index) {
    date.setDate(date.getDate() + 1);
    const day = date.getDay();
    if (day !== 0 && day !== 6) added += 1;
  }
  return date.toISOString().slice(0, 10);
}

function formatScheduleDate(value: string) {
  try {
    return formatDate(value);
  } catch {
    return value;
  }
}

function specialistForProcedure(procedure: string) {
  const normalized = procedure.toLowerCase();
  if (normalized.includes("массаж")) return "Массажист";
  if (normalized.includes("лфк")) return "Инструктор ЛФК";
  if (normalized.includes("психолог")) return "Психолог";
  return "Специалист";
}

function procedureSlug(name: string) {
  return procedureTestIdMap[name.trim().toLowerCase()] || name.toLowerCase().replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "");
}
