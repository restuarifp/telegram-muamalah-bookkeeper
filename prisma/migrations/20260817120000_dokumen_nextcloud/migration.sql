-- Penyimpanan dokumen pindah dari disk lokal + file_id Telegram ke Nextcloud.
--
-- Baris lama sengaja TIDAK dimigrasikan: "pathLokal" menunjuk ke berkas di
-- volume container dan "telegramFileId" ke berkas di server Telegram — keduanya
-- tidak punya padanan "remotePath" di Nextcloud tanpa mengunggah ulang isinya,
-- yang tidak bisa dilakukan dari dalam migrasi SQL. Berkas lamanya masih ada di
-- DATA_DIR; unggah ulang lewat bot (atau /template_sync untuk template yang
-- sudah tersimpan di folder Nextcloud) untuk mendaftarkannya kembali.

PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- RedefineTables
CREATE TABLE "new_Dokumen" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "muamalahId" INTEGER NOT NULL,
    "namaFile" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "ukuran" INTEGER NOT NULL DEFAULT 0,
    "remotePath" TEXT NOT NULL,
    "shareToken" TEXT,
    "shareUrl" TEXT,
    "jenis" TEXT NOT NULL DEFAULT 'AKAD',
    "diunggahOlehId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Dokumen_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Dokumen_diunggahOlehId_fkey" FOREIGN KEY ("diunggahOlehId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
DROP TABLE "Dokumen";
ALTER TABLE "new_Dokumen" RENAME TO "Dokumen";
CREATE UNIQUE INDEX "Dokumen_remotePath_key" ON "Dokumen"("remotePath");
CREATE INDEX "Dokumen_muamalahId_idx" ON "Dokumen"("muamalahId");

CREATE TABLE "new_Template" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "kode" TEXT NOT NULL,
    "judul" TEXT NOT NULL,
    "namaFile" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "ukuran" INTEGER NOT NULL DEFAULT 0,
    "remotePath" TEXT NOT NULL,
    "shareToken" TEXT,
    "shareUrl" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
DROP TABLE "Template";
ALTER TABLE "new_Template" RENAME TO "Template";
CREATE UNIQUE INDEX "Template_kode_key" ON "Template"("kode");
CREATE UNIQUE INDEX "Template_remotePath_key" ON "Template"("remotePath");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
