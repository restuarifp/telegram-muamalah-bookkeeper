-- ACL per kantor perwakilan.
--
-- Tiga perubahan yang harus terjadi dalam satu transaksi, karena kolom
-- Muamalah.kantorId NOT NULL tanpa default: kantor default harus sudah ada
-- sebelum baris lama bisa diisi.

CREATE TABLE "Kantor" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "nama" TEXT NOT NULL,
    "aktif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "Kantor_nama_key" ON "Kantor"("nama");

-- Semua data yang ada sekarang berasal dari satu kantor; namanya dipatok di
-- sini supaya migrasi tidak bergantung pada isi tabel lain.
INSERT INTO "Kantor" ("id", "nama") VALUES (1, 'Kantor Pusat');

-- Operator: tambah keterikatan kantor, dan naikkan admin lama jadi SUPERADMIN.
-- Admin lama memang berperan lintas kantor, jadi kantorId-nya dibiarkan NULL.
ALTER TABLE "Operator" ADD COLUMN "kantorId" INTEGER REFERENCES "Kantor"("id") ON DELETE SET NULL ON UPDATE CASCADE;
UPDATE "Operator" SET "role" = 'SUPERADMIN' WHERE "role" = 'ADMIN';
UPDATE "Operator" SET "kantorId" = 1 WHERE "role" <> 'SUPERADMIN';

-- Muamalah: kolom NOT NULL tanpa default, jadi tabel dibangun ulang (cara
-- standar SQLite) alih-alih ADD COLUMN dengan default yang akan jadi drift
-- terhadap schema.prisma.
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Muamalah" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jenis" TEXT NOT NULL,
    "pihakId" INTEGER NOT NULL,
    "judul" TEXT NOT NULL,
    "pokok" BIGINT NOT NULL,
    "mataUang" TEXT NOT NULL DEFAULT 'IDR',
    "tanggalAkad" DATETIME NOT NULL,
    "jatuhTempo" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'BERJALAN',
    "bagiHasilNisbah" TEXT,
    "deskripsi" TEXT,
    "tenorCicilan" INTEGER,
    "periodeCicilan" TEXT,
    "mulaiCicilan" DATETIME,
    "kantorId" INTEGER NOT NULL,
    "dibuatOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Muamalah_pihakId_fkey" FOREIGN KEY ("pihakId") REFERENCES "Pihak" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_kantorId_fkey" FOREIGN KEY ("kantorId") REFERENCES "Kantor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Muamalah" ("id", "jenis", "pihakId", "judul", "pokok", "mataUang", "tanggalAkad", "jatuhTempo", "status", "bagiHasilNisbah", "deskripsi", "tenorCicilan", "periodeCicilan", "mulaiCicilan", "kantorId", "dibuatOlehId", "createdAt", "updatedAt")
SELECT "id", "jenis", "pihakId", "judul", "pokok", "mataUang", "tanggalAkad", "jatuhTempo", "status", "bagiHasilNisbah", "deskripsi", "tenorCicilan", "periodeCicilan", "mulaiCicilan", 1, "dibuatOlehId", "createdAt", "updatedAt"
FROM "Muamalah";
DROP TABLE "Muamalah";
ALTER TABLE "new_Muamalah" RENAME TO "Muamalah";
CREATE INDEX "Muamalah_status_idx" ON "Muamalah"("status");
CREATE INDEX "Muamalah_jatuhTempo_idx" ON "Muamalah"("jatuhTempo");
CREATE INDEX "Muamalah_kantorId_idx" ON "Muamalah"("kantorId");
PRAGMA foreign_keys=ON;
