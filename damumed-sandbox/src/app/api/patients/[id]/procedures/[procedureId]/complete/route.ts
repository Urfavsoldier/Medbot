import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { id: string; procedureId: string } }) {
  await requireUser();

  const procedure = await prisma.procedure.update({
    where: { id: params.procedureId },
    data: {
      status: "Выполнено",
      completedAt: new Date()
    }
  });

  await prisma.scheduleEntry.updateMany({
    where: {
      patientId: params.id,
      procedureId: params.procedureId
    },
    data: { status: "Выполнено" }
  });

  return NextResponse.json({ ok: true, procedure });
}
