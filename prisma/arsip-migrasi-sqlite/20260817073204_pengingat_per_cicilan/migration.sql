-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Pengingat" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "muamalahId" INTEGER NOT NULL,
    "urutanCicilan" INTEGER NOT NULL DEFAULT 0,
    "offsetHari" INTEGER NOT NULL,
    "terkirimPada" DATETIME,
    CONSTRAINT "Pengingat_muamalahId_fkey" FOREIGN KEY ("muamalahId") REFERENCES "Muamalah" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Pengingat" ("id", "muamalahId", "offsetHari", "terkirimPada") SELECT "id", "muamalahId", "offsetHari", "terkirimPada" FROM "Pengingat";
DROP TABLE "Pengingat";
ALTER TABLE "new_Pengingat" RENAME TO "Pengingat";
CREATE UNIQUE INDEX "Pengingat_muamalahId_urutanCicilan_offsetHari_key" ON "Pengingat"("muamalahId", "urutanCicilan", "offsetHari");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
