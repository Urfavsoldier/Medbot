import { AppShell } from "@/components/AppShell";
import { PatientListClient } from "@/components/PatientListClient";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function PatientsPage() {
  const patients = await prisma.patient.findMany({
    orderBy: { fullName: "asc" },
    include: { diagnosis: true }
  });

  return (
    <AppShell>
      <PatientListClient patients={patients} />
    </AppShell>
  );
}
