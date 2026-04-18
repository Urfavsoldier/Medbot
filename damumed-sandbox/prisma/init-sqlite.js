const { DatabaseSync } = require("node:sqlite");
const path = require("node:path");

const dbPath = path.join(__dirname, "dev.db");
const db = new DatabaseSync(dbPath);

db.exec(`
PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS "ScheduleEntry";
DROP TABLE IF EXISTS "ProcedureDiary";
DROP TABLE IF EXISTS "Procedure";
DROP TABLE IF EXISTS "DischargeSummary";
DROP TABLE IF EXISTS "PrimaryExam";
DROP TABLE IF EXISTS "MedicalRecord";
DROP TABLE IF EXISTS "Patient";
DROP TABLE IF EXISTS "Diagnosis";
DROP TABLE IF EXISTS "User";

PRAGMA foreign_keys = ON;

CREATE TABLE "User" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" TEXT NOT NULL DEFAULT 'doctor',
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

CREATE TABLE "Diagnosis" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "title" TEXT NOT NULL,
  "code" TEXT
);

CREATE TABLE "Patient" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "fullName" TEXT NOT NULL,
  "shortName" TEXT NOT NULL,
  "age" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'На лечении',
  "diagnosisId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Patient_diagnosisId_fkey" FOREIGN KEY ("diagnosisId") REFERENCES "Diagnosis" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "MedicalRecord" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "doctorId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Открыта',
  "notes" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MedicalRecord_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "MedicalRecord_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "MedicalRecord_patientId_key" ON "MedicalRecord"("patientId");

CREATE TABLE "PrimaryExam" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "complaints" TEXT NOT NULL DEFAULT '',
  "anamnesis" TEXT NOT NULL DEFAULT '',
  "objectiveStatus" TEXT NOT NULL DEFAULT '',
  "recommendations" TEXT NOT NULL DEFAULT '',
  "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PrimaryExam_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "PrimaryExam_patientId_key" ON "PrimaryExam"("patientId");

CREATE TABLE "DischargeSummary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "complaints" TEXT NOT NULL DEFAULT '',
  "objectiveStatus" TEXT NOT NULL DEFAULT '',
  "recommendations" TEXT NOT NULL DEFAULT '',
  "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DischargeSummary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "DischargeSummary_patientId_key" ON "DischargeSummary"("patientId");

CREATE TABLE "Procedure" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "specialist" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Запланировано',
  "completedAt" DATETIME,
  CONSTRAINT "Procedure_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProcedureDiary" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "procedureId" TEXT,
  "doctorId" TEXT NOT NULL,
  "result" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL DEFAULT 'Черновик',
  "savedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProcedureDiary_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProcedureDiary_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProcedureDiary_doctorId_fkey" FOREIGN KEY ("doctorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE "ScheduleEntry" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "patientId" TEXT NOT NULL,
  "procedureId" TEXT,
  "date" DATETIME NOT NULL,
  "time" TEXT NOT NULL,
  "specialist" TEXT NOT NULL,
  "procedure" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'Запланировано',
  "duration" INTEGER NOT NULL DEFAULT 40,
  CONSTRAINT "ScheduleEntry_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ScheduleEntry_procedureId_fkey" FOREIGN KEY ("procedureId") REFERENCES "Procedure" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
`);

db.close();
console.log(`SQLite database initialized: ${dbPath}`);
