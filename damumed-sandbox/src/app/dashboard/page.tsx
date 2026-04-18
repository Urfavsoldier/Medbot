import Link from "next/link";
import { AppShell } from "@/components/AppShell";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [patientsCount, proceduresCount, completedCount, upcoming, recentPatients] = await Promise.all([
    prisma.patient.count(),
    prisma.procedure.count(),
    prisma.procedure.count({ where: { status: "Выполнено" } }),
    prisma.scheduleEntry.findMany({
      take: 6,
      orderBy: [{ date: "asc" }, { time: "asc" }],
      include: { patient: true }
    }),
    prisma.patient.findMany({
      take: 4,
      orderBy: { updatedAt: "desc" },
      include: { diagnosis: true }
    })
  ]);

  return (
    <AppShell>
      <div className="grid gap-6">
        <section className="rounded-[2rem] bg-gradient-to-br from-emerald-600 to-blue-700 p-8 text-white shadow-soft">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-emerald-100">Сегодня</p>
          <h1 className="mt-3 max-w-3xl text-4xl font-black leading-tight">
            Рабочая панель врача реабилитационного центра
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-blue-50">
            Пациенты, документы, процедуры и расписание подготовлены для демонстрации MedBot как внешнего DOM-агента.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <StatCard label="Пациенты" value={patientsCount} testId="stat-patients" />
          <StatCard label="Назначенные услуги" value={proceduresCount} testId="stat-procedures" />
          <StatCard label="Выполнено" value={completedCount} testId="stat-completed" />
        </section>

        <section className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
          <div className="card p-6">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-black text-slate-950">Ближайшие процедуры</h2>
                <p className="mt-1 text-sm text-slate-500">Расписание на 9 рабочих дней</p>
              </div>
              <Link href="/patients" className="btn-secondary" data-testid="dashboard-open-patients">
                Открыть пациентов
              </Link>
            </div>
            <div className="grid gap-3" data-testid="dashboard-upcoming-procedures">
              {upcoming.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-100 bg-slate-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-black text-slate-900">{entry.procedure}</p>
                      <p className="mt-1 text-sm text-slate-500">{entry.patient.shortName} · {entry.specialist}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-blue-700">{entry.time}</p>
                      <p className="text-xs text-slate-500">{formatDate(entry.date)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-6">
            <h2 className="text-xl font-black text-slate-950">Последняя активность</h2>
            <div className="mt-5 grid gap-3" data-testid="dashboard-recent-activity">
              {recentPatients.map((patient) => (
                <Link
                  key={patient.id}
                  href={`/patients/${patient.id}`}
                  className="rounded-2xl border border-slate-100 bg-white p-4 transition hover:border-blue-200 hover:bg-blue-50"
                  data-testid={`dashboard-patient-${patient.shortName.toLowerCase()}`}
                >
                  <p className="font-black text-slate-900">{patient.fullName}</p>
                  <p className="mt-1 text-sm text-slate-500">{patient.diagnosis.title}</p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function StatCard({ label, value, testId }: { label: string; value: number; testId: string }) {
  return (
    <div className="card p-6" data-testid={testId}>
      <p className="text-sm font-bold text-slate-500">{label}</p>
      <p className="mt-3 text-4xl font-black text-slate-950">{value}</p>
    </div>
  );
}
