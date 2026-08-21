-- CreateTable
CREATE TABLE "Kantor" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kantor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operator" (
    "id" SERIAL NOT NULL,
    "telegramUserId" TEXT NOT NULL,
    "nama" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'OPERATOR',
    "kantorId" INTEGER,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operator_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KodeLogin" (
    "id" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "kodeHash" TEXT NOT NULL,
    "percobaan" INTEGER NOT NULL DEFAULT 0,
    "kedaluwarsa" TIMESTAMP(3) NOT NULL,
    "dipakaiPada" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KodeLogin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SesiWeb" (
    "tokenHash" TEXT NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "kantorFilter" INTEGER,
    "userAgent" TEXT,
    "kedaluwarsa" TIMESTAMP(3) NOT NULL,
    "terakhirAktif" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SesiWeb_pkey" PRIMARY KEY ("tokenHash")
);

-- CreateTable
CREATE TABLE "Pihak" (
    "id" SERIAL NOT NULL,
    "nama" TEXT NOT NULL,
    "telegramUserId" TEXT,
    "kontak" TEXT,
    "catatan" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pihak_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Muamalah" (
    "id" SERIAL NOT NULL,
    "jenis" TEXT NOT NULL,
    "pihakId" INTEGER NOT NULL,
    "pihakKeduaId" INTEGER,
    "judul" TEXT NOT NULL,
    "pokok" BIGINT NOT NULL,
    "mataUang" TEXT NOT NULL DEFAULT 'IDR',
    "tanggalAkad" TIMESTAMP(3) NOT NULL,
    "jatuhTempo" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'BERJALAN',
    "bagiHasilNisbah" TEXT,
    "margin" BIGINT,
    "porsiModal" TEXT,
    "deskripsi" TEXT,
    "tenorCicilan" INTEGER,
    "periodeCicilan" TEXT,
    "mulaiCicilan" TIMESTAMP(3),
    "kantorId" INTEGER NOT NULL,
    "dibuatOlehId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Muamalah_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Angsuran" (
    "id" SERIAL NOT NULL,
    "muamalahId" INTEGER NOT NULL,
    "jumlah" BIGINT NOT NULL,
    "tanggal" TIMESTAMP(3) NOT NULL,
    "buktiFileId" TEXT,
    "dicatatOlehId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Angsuran_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dokumen" (
    "id" SERIAL NOT NULL,
    "muamalahId" INTEGER NOT NULL,
    "namaFile" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ukuran" INTEGER NOT NULL DEFAULT 0,
    "remotePath" TEXT NOT NULL,
    "shareToken" TEXT,
    "shareUrl" TEXT,
    "jenis" TEXT NOT NULL DEFAULT 'AKAD',
    "sumber" TEXT NOT NULL DEFAULT 'UNGGAH',
    "diunggahOlehId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dokumen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" SERIAL NOT NULL,
    "kode" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "namaFile" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "ukuran" INTEGER NOT NULL DEFAULT 0,
    "remotePath" TEXT NOT NULL,
    "shareToken" TEXT,
    "shareUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "operatorId" INTEGER NOT NULL,
    "aksi" TEXT NOT NULL,
    "entitas" TEXT NOT NULL,
    "entitasId" INTEGER NOT NULL,
    "payloadJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pengingat" (
    "id" SERIAL NOT NULL,
    "muamalahId" INTEGER NOT NULL,
    "urutanCicilan" INTEGER NOT NULL DEFAULT 0,
    "offsetHari" INTEGER NOT NULL,
    "terkirimPada" TIMESTAMP(3),

    CONSTRAINT "Pengingat_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Kantor_nama_key" ON "Kantor"("nama");

-- CreateIndex
CREATE UNIQUE INDEX "Operator_telegramUserId_key" ON "Operator"("telegramUserId");

-- CreateIndex
CREATE INDEX "KodeLogin_operatorId_idx" ON "KodeLogin"("operatorId");

-- CreateIndex
CREATE INDEX "KodeLogin_kedaluwarsa_idx" ON "KodeLogin"("kedaluwarsa");

-- CreateIndex
CREATE INDEX "SesiWeb_operatorId_idx" ON "SesiWeb"("operatorId");

-- CreateIndex
CREATE INDEX "SesiWeb_kedaluwarsa_idx" ON "SesiWeb"("kedaluwarsa");

-- CreateIndex
CREATE INDEX "Muamalah_status_idx" ON "Muamalah"("status");

-- CreateIndex
CREATE INDEX "Muamalah_jatuhTempo_idx" ON "Muamalah"("jatuhTempo");

-- CreateIndex
CREATE INDEX "Muamalah_kantorId_idx" ON "Muamalah"("kantorId");

-- CreateIndex
CREATE INDEX "Angsuran_muamalahId_idx" ON "Angsuran"("muamalahId");

-- CreateIndex
CREATE UNIQUE INDEX "Dokumen_remotePath_key" ON "Dokumen"("remotePath");

-- CreateIndex
CREATE INDEX "Dokumen_muamalahId_idx" ON "Dokumen"("muamalahId");

-- CreateIndex
CREATE UNIQUE INDEX "Template_kode_key" ON "Template"("kode");

-- CreateIndex
CREATE UNIQUE INDEX "Template_remotePath_key" ON "Template"("remotePath");

-- CreateIndex
CREATE INDEX "AuditLog_entitas_entitasId_idx" ON "AuditLog"("entitas", "entitasId");

-- CreateIndex
CREATE UNIQUE INDEX "Pengingat_muamalahId_urutanCicilan_offsetHari_key" ON "Pengingat"("muamalahId", "urutanCicilan", "offsetHari");

-- AddForeignKey
ALTER TABLE "Operator" ADD CONSTRAINT "Operator_kantorId_fkey" FOREIGN KEY ("kantorId") REFERENCES "Kantor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KodeLogin" ADD CONSTRAINT "KodeLogin_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SesiWeb" ADD CONSTRAINT "SesiWeb_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muamalah" ADD CONSTRAINT "Muamalah_pihakId_fkey" FOREIGN KEY ("pihakId") REFERENCES "Pihak"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muamalah" ADD CONSTRAINT "Muamalah_pihakKeduaId_fkey" FOREIGN KEY ("pihakKeduaId") REFERENCES "Pihak"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muamalah" ADD CONSTRAINT "Muamalah_kantorId_fkey" FOREIGN KEY ("kantorId") REFERENCES "Kantor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Muamalah" ADD CONSTRAINT "Muamalah_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angsuran" ADD CONSTRAINT "Angsuran_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Angsuran" ADD CONSTRAINT "Angsuran_dicatatOlehId_fkey" FOREIGN KEY ("dicatatOlehId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumen" ADD CONSTRAINT "Dokumen_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dokumen" ADD CONSTRAINT "Dokumen_diunggahOlehId_fkey" FOREIGN KEY ("diunggahOlehId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pengingat" ADD CONSTRAINT "Pengingat_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
