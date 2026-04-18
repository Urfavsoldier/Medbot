import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await requireUser();
  const body = await request.json().catch(() => ({}));
  const result = String(body.procedure_result || body.result || "");
  const procedureId = body.procedureId ? String(body.procedureId) : undefined;

  const diary = await prisma.procedureDiary.create({
    data: {
      patientId: params.id,
      doctorId: user.id,
      procedureId,
      result,
      status: "Сохранено",
      savedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true, diary });
}
