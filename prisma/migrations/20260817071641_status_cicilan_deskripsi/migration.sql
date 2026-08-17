/*
  Perubahan struktur transaksi:

  1. `catatan` -> `deskripsi`. INSERT di bawah disunting manual supaya isinya
     ikut pindah (generator Prisma defaultnya membuang kolom ini).
  2. Status dipetakan ke himpunan baru DRAFT | BERJALAN | SELESAI | BATAL:
       AKTIF        -> BERJALAN
       JATUH_TEMPO  -> BERJALAN  (terlambat kini dihitung dari jatuhTempo,
                                  bukan disimpan sebagai status)
       LUNAS        -> SELESAI
       DIBATALKAN   -> BATAL
     Nilai lain dibiarkan apa adanya agar migrasi ini idempotent kalau
     dijalankan di database yang sudah memakai nilai baru.
  3. Kolom skema cicilan (tenorCicilan, periodeCicilan, mulaiCicilan) baru,
     NULL untuk semua baris lama.
*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
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
    "dibuatOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Muamalah_pihakId_fkey" FOREIGN KEY ("pihakId") REFERENCES "Pihak" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Muamalah" ("bagiHasilNisbah", "createdAt", "deskripsi", "dibuatOlehId", "id", "jatuhTempo", "jenis", "judul", "mataUang", "pihakId", "pokok", "status", "tanggalAkad", "updatedAt")
SELECT
    "bagiHasilNisbah",
    "createdAt",
    "catatan",
    "dibuatOlehId",
    "id",
    "jatuhTempo",
    "jenis",
    "judul",
    "mataUang",
    "pihakId",
    "pokok",
    CASE "status"
        WHEN 'AKTIF'       THEN 'BERJALAN'
        WHEN 'JATUH_TEMPO' THEN 'BERJALAN'
        WHEN 'LUNAS'       THEN 'SELESAI'
        WHEN 'DIBATALKAN'  THEN 'BATAL'
        ELSE "status"
    END,
    "tanggalAkad",
    "updatedAt"
FROM "Muamalah";
DROP TABLE "Muamalah";
ALTER TABLE "new_Muamalah" RENAME TO "Muamalah";
CREATE INDEX "Muamalah_status_idx" ON "Muamalah"("status");
CREATE INDEX "Muamalah_jatuhTempo_idx" ON "Muamalah"("jatuhTempo");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
