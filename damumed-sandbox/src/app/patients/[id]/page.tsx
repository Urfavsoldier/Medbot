import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { PatientWorkspace } from "@/components/PatientWorkspace";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PatientProfilePage({ params }: { params: { id: string } }) {
  const user = await requireUser();
  const patient = await prisma.patient.findUnique({
    where: { id: params.id },
    include: {
      diagnosis: true,
      primaryExam: true,
      dischargeSummary: true,
      procedures: {
        orderBy: { name: "asc" }
      },
      diaries: {
        include: {
          procedure: { select: { name: true } },
          doctor: { select: { name: true } }
        },
        orderBy: { savedAt: "desc" }
      },
      scheduleEntries: {
        orderBy: [
          { date: "asc" },
          { time: "asc" }
        ]
      }
    }
  });

  if (!patient) notFound();

  const payload = JSON.parse(JSON.stringify(patient));

  return (
    <AppShell>
      <PatientWorkspace patient={payload} doctorName={user.name} />
    </AppShell>
  );
}
