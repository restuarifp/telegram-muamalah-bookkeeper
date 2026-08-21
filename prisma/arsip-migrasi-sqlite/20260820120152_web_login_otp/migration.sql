-- CreateTable
CREATE TABLE "KodeLogin" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operatorId" INTEGER NOT NULL,
    "kodeHash" TEXT NOT NULL,
    "percobaan" INTEGER NOT NULL DEFAULT 0,
    "kedaluwarsa" DATETIME NOT NULL,
    "dipakaiPada" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "KodeLogin_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SesiWeb" (
    "tokenHash" TEXT NOT NULL PRIMARY KEY,
    "operatorId" INTEGER NOT NULL,
    "kantorFilter" INTEGER,
    "userAgent" TEXT,
    "kedaluwarsa" DATETIME NOT NULL,
    "terakhirAktif" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SesiWeb_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "Operator" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "KodeLogin_operatorId_idx" ON "KodeLogin"("operatorId");

-- CreateIndex
CREATE INDEX "KodeLogin_kedaluwarsa_idx" ON "KodeLogin"("kedaluwarsa");

-- CreateIndex
CREATE INDEX "SesiWeb_operatorId_idx" ON "SesiWeb"("operatorId");

-- CreateIndex
CREATE INDEX "SesiWeb_kedaluwarsa_idx" ON "SesiWeb"("kedaluwarsa");
