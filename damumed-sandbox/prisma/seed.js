const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const doctorEmail = "doctor@aqbobek.local";
const doctorPassword = "demo12345";

async function main() {
  await prisma.scheduleEntry.deleteMany();
  await prisma.procedureDiary.deleteMany();
  await prisma.procedure.deleteMany();
  await prisma.dischargeSummary.deleteMany();
  await prisma.primaryExam.deleteMany();
  await prisma.medicalRecord.deleteMany();
  await prisma.patient.deleteMany();
  await prisma.diagnosis.deleteMany();
  await prisma.user.deleteMany();

  const doctor = await prisma.user.create({
    data: {
      email: doctorEmail,
      passwordHash: doctorPassword,
      name: "Д-р Алия Нурланова",
      role: "doctor"
    }
  });

  const diagnoses = await Promise.all([
    prisma.diagnosis.create({ data: { title: "Последствия перинатального поражения ЦНС, моторная задержка", code: "G96.8" } }),
    prisma.diagnosis.create({ data: { title: "Сколиотическая осанка, курс ЛФК", code: "M41.9" } }),
    prisma.diagnosis.create({ data: { title: "Задержка речевого развития, комплексная реабилитация", code: "F80.9" } }),
    prisma.diagnosis.create({ data: { title: "Посттравматическое восстановление после перелома", code: "T14.2" } }),
    prisma.diagnosis.create({ data: { title: "Нарушение координации, нейрореабилитация", code: "R27.8" } })
  ]);

  const patients = [
    ["Иванов Андрей Сергеевич", "Иванов", 9, diagnoses[0].id, "На лечении"],
    ["Петрова Мария Ильинична", "Петрова", 12, diagnoses[1].id, "Первичный прием"],
    ["Садыков Тимур Ерланович", "Садыков", 7, diagnoses[2].id, "На лечении"],
    ["Ким Анна Викторовна", "Ким", 15, diagnoses[3].id, "Восстановление"],
    ["Смирнов Павел Олегович", "Смирнов", 10, diagnoses[4].id, "На лечении"]
  ];

  for (const [fullName, shortName, age, diagnosisId, status] of patients) {
    const patient = await prisma.patient.create({
      data: { fullName, shortName, age, diagnosisId, status }
    });

    await prisma.medicalRecord.create({
      data: { patientId: patient.id, doctorId: doctor.id, status: "Открыта" }
    });

    await prisma.primaryExam.create({
      data: {
        patientId: patient.id,
        complaints: shortName === "Иванов" ? "Периодическая слабость, быстрая утомляемость" : "",
        anamnesis: "",
        objectiveStatus: shortName === "Иванов" ? "Мышечный тонус снижен" : "",
        recommendations: ""
      }
    });

    await prisma.dischargeSummary.create({
      data: { patientId: patient.id }
    });

    const procedureRows = [
      { name: "Массаж", specialist: "Массажист" },
      { name: "ЛФК", specialist: "Инструктор ЛФК" },
      { name: "Психолог", specialist: "Психолог" }
    ];

    const procedures = [];
    for (const item of procedureRows) {
      procedures.push(await prisma.procedure.create({
        data: { patientId: patient.id, name: item.name, specialist: item.specialist, status: "Запланировано" }
      }));
    }

    await prisma.procedureDiary.create({
      data: {
        patientId: patient.id,
        procedureId: procedures[0].id,
        doctorId: doctor.id,
        result: "",
        status: "Черновик"
      }
    });

    if (shortName === "Иванов") {
      await seedSchedule(patient.id, procedures);
    }
  }

  console.log(`Seed complete. Login: ${doctorEmail} / ${doctorPassword}`);
}

async function seedSchedule(patientId, procedures) {
  const days = [
    "2026-04-20", "2026-04-21", "2026-04-22", "2026-04-23", "2026-04-24",
    "2026-04-27", "2026-04-28", "2026-04-29", "2026-04-30"
  ];

  for (const [index, date] of days.entries()) {
    const first = procedures[index % 2 === 0 ? 0 : 1];
    const second = procedures[index % 3 === 0 ? 2 : 0];

    await prisma.scheduleEntry.create({
      data: {
        patientId,
        procedureId: first.id,
        date: new Date(`${date}T00:00:00`),
        time: "09:00",
        specialist: first.specialist,
        procedure: first.name,
        duration: first.name === "ЛФК" ? 40 : 30
      }
    });

    await prisma.scheduleEntry.create({
      data: {
        patientId,
        procedureId: second.id,
        date: new Date(`${date}T00:00:00`),
        time: "09:40",
        specialist: second.specialist,
        procedure: second.name,
        duration: second.name === "ЛФК" ? 40 : 30
      }
    });
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
