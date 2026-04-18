import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const body = await request.json().catch(() => ({}));
  const days = Array.isArray(body.days) ? body.days : [];

  await prisma.scheduleEntry.deleteMany({ where: { patientId: params.id } });

  const created = [];
  for (const day of days.slice(0, 9)) {
    const slots = Array.isArray(day.slots) ? day.slots : [];
    for (const slot of slots) {
      created.push(await prisma.scheduleEntry.create({
        data: {
          patientId: params.id,
          date: new Date(`${day.date}T00:00:00`),
          time: String(slot.time || "09:00"),
          specialist: typeof slot.specialist === "object" ? String(slot.specialist.name || "Специалист") : String(slot.specialist || "Специалист"),
          procedure: String(slot.procedure || "Процедура"),
          status: String(slot.status || "Запланировано"),
          duration: Number(slot.durationMinutes || slot.duration || 40)
        }
      }));
    }
  }

  return NextResponse.json({ ok: true, entries: created });
}
