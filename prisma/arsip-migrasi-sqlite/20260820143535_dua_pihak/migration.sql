-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Muamalah" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "jenis" TEXT NOT NULL,
    "pihakId" INTEGER NOT NULL,
    "pihakKeduaId" INTEGER,
    "judul" TEXT NOT NULL,
    "pokok" BIGINT NOT NULL,
    "mataUang" TEXT NOT NULL DEFAULT 'IDR',
    "tanggalAkad" DATETIME NOT NULL,
    "jatuhTempo" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'BERJALAN',
    "bagiHasilNisbah" TEXT,
    "margin" BIGINT,
    "porsiModal" TEXT,
    "deskripsi" TEXT,
    "tenorCicilan" INTEGER,
    "periodeCicilan" TEXT,
    "mulaiCicilan" DATETIME,
    "kantorId" INTEGER NOT NULL,
    "dibuatOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Muamalah_pihakId_fkey" FOREIGN KEY ("pihakId") REFERENCES "Pihak" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_pihakKeduaId_fkey" FOREIGN KEY ("pihakKeduaId") REFERENCES "Pihak" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_kantorId_fkey" FOREIGN KEY ("kantorId") REFERENCES "Kantor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Muamalah_dibuatOlehId_fkey" FOREIGN KEY ("dibuatOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Muamalah" ("bagiHasilNisbah", "createdAt", "deskripsi", "dibuatOlehId", "id", "jatuhTempo", "jenis", "judul", "kantorId", "margin", "mataUang", "mulaiCicilan", "periodeCicilan", "pihakId", "pokok", "porsiModal", "status", "tanggalAkad", "tenorCicilan", "updatedAt") SELECT "bagiHasilNisbah", "createdAt", "deskripsi", "dibuatOlehId", "id", "jatuhTempo", "jenis", "judul", "kantorId", "margin", "mataUang", "mulaiCicilan", "periodeCicilan", "pihakId", "pokok", "porsiModal", "status", "tanggalAkad", "tenorCicilan", "updatedAt" FROM "Muamalah";
DROP TABLE "Muamalah";
ALTER TABLE "new_Muamalah" RENAME TO "Muamalah";
CREATE INDEX "Muamalah_status_idx" ON "Muamalah"("status");
CREATE INDEX "Muamalah_jatuhTempo_idx" ON "Muamalah"("jatuhTempo");
CREATE INDEX "Muamalah_kantorId_idx" ON "Muamalah"("kantorId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
