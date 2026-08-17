-- CreateTable
CREATE TABLE "Operator" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "telegramUserId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Pihak" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nama" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "kontak" TEXT,
    "catatan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Muamalah" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jenis" TEXT NOT NULL,
    "pihakId" INTEGER NOT NULL,
    "judul" TEXT NOT NULL,
    "pokok" BIGINT NOT NULL,
    "mataUang" TEXT NOT NULL DEFAULT 'IDR',
    "tanggalAkad" DATETIME NOT NULL,
    "jatuhTempo" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'AKTIF',
    "bagiHasilNisbah" TEXT,
    "catatan" TEXT,
    "dibuatOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Muamalah_pihakId_fkey" FOREIGN KEY ("pihakId") REFERENCES "Pihak" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Angsuran" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "muamalahId" INTEGER NOT NULL,
    "jumlah" BIGINT NOT NULL,
    "tanggal" DATETIME NOT NULL,
    "buktiFileId" TEXT,
    "dicatatOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Angsuran_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Angsuran_dicatatOlehId_fkey" FOREIGN KEY ("dicatatOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Dokumen" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "muamalahId" INTEGER NOT NULL,
    "namaFile" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "pathLokal" TEXT NOT NULL,
    "jenis" TEXT NOT NULL DEFAULT 'AKAD',
    "diunggahOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Dokumen_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dokumen_diunggahOlehId_fkey" FOREIGN KEY ("diunggahOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Template" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kode" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "telegramFileId" TEXT NOT NULL,
    "pathLokal" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "operatorId" INTEGER NOT NULL,
    "aksi" TEXT NOT NULL,
    "entitas" TEXT NOT NULL,
    "entitasId" INTEGER NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pengingat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "muamalahId" INTEGER NOT NULL,
    "offsetHari" INTEGER NOT NULL,
    "terkirimPada" DATETIME,
    CONSTRAINT "Pengingat_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Operator_telegramUserId_key" ON "Operator"("telegramUserId");

-- CreateIndex
CREATE INDEX "Muamalah_status_idx" ON "Muamalah"("status");

-- CreateIndex
CREATE INDEX "Muamalah_jatuhTempo_idx" ON "Muamalah"("jatuhTempo");

-- CreateIndex
CREATE INDEX "Angsuran_muamalahId_idx" ON "Angsuran"("muamalahId");

-- CreateIndex
CREATE INDEX "Dokumen_muamalahId_idx" ON "Dokumen"("muamalahId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_kode_key" ON "Template"("kode");

-- CreateIndex
CREATE INDEX "AuditLog_entitas_entitasId_idx" ON "AuditLog"("entitas", "entitasId");

-- CreateIndex
CREATE UNIQUE INDEX "Pengingat_muamalahId_offsetHari_key" ON "Pengingat"("muamalahId", "offsetHari");
