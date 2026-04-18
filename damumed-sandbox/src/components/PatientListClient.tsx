"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type PatientListItem = {
  id: string;
  fullName: string;
  shortName: string;
  age: number;
  status: string;
  diagnosis: { title: string };
};

export function PatientListClient({ patients }: { patients: PatientListItem[] }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();

  const filtered = useMemo(() => {
    if (!normalizedQuery) return patients;
    return patients.filter((patient) => {
      const haystack = `${patient.fullName} ${patient.shortName} ${patient.diagnosis.title}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, patients]);

  return (
    <div className="card p-6">
      <div className="mb-5 flex flex-col justify-between gap-4 md:flex-row md:items-end">
        <div>
          <h1 className="text-3xl font-black text-slate-950">Пациенты</h1>
          <p className="mt-2 text-sm text-slate-500">Поиск пациента и открытие медицинской карты.</p>
        </div>
        <label className="grid w-full max-w-md gap-2" data-testid="patient-search">
          <span className="field-label">Поиск пациента</span>
          <input
            className="field-control"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Введите пациента"
            data-testid="patient-search-input"
            data-medbot-testid="patient-search"
            aria-label="Пациент"
            name="patient"
          />
        </label>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200">
        <table className="w-full border-collapse" data-testid="patients-table">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">ФИО</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">Возраст</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">Диагноз</th>
              <th className="px-4 py-3 text-left text-xs font-black uppercase tracking-wide text-slate-500">Статус</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((patient) => {
              const patientSlug = patientTestSlug(patient.shortName);
              return (
              <tr key={patient.id} className="border-t border-slate-100" data-testid={`patient-row-${patientSlug}`}>
                <td className="px-4 py-4">
                  <p className="font-black text-slate-950">{patient.fullName}</p>
                  <p className="text-sm text-slate-500">{patient.shortName}</p>
                </td>
                <td className="px-4 py-4 text-sm font-semibold text-slate-600">{patient.age} лет</td>
                <td className="max-w-md px-4 py-4 text-sm text-slate-600">{patient.diagnosis.title}</td>
                <td className="px-4 py-4">
                  <span className="status-badge border-emerald-200 bg-emerald-50 text-emerald-700">{patient.status}</span>
                </td>
                <td className="px-4 py-4 text-right">
                  <Link
                    href={`/patients/${patient.id}`}
                    className="btn-primary"
                    data-testid={`open-patient-${patientSlug}`}
                    aria-label={`Открыть ${patient.shortName}`}
                  >
                    Открыть
                  </Link>
                </td>
              </tr>
            );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function patientTestSlug(shortName: string) {
  const aliases: Record<string, string> = {
    "иванов": "ivanov",
    "петрова": "petrova",
    "садыков": "sadykov",
    "ким": "kim",
    "смирнов": "smirnov"
  };
  return aliases[shortName.trim().toLowerCase()] || shortName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
