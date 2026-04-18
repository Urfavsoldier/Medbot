import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: { id: string } }) {
  await requireUser();
  const body = await request.json().catch(() => ({}));

  const summary = await prisma.dischargeSummary.upsert({
    where: { patientId: params.id },
    create: {
      patientId: params.id,
      complaints: String(body.complaints || ""),
      objectiveStatus: String(body.objective_status || body.objectiveStatus || ""),
      recommendations: String(body.recommendations || ""),
      savedAt: new Date()
    },
    update: {
      complaints: String(body.complaints || ""),
      objectiveStatus: String(body.objective_status || body.objectiveStatus || ""),
      recommendations: String(body.recommendations || ""),
      savedAt: new Date()
    }
  });

  return NextResponse.json({ ok: true, summary });
}
