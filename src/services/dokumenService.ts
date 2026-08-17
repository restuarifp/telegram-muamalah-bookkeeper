import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "../db.js";
import { config } from "../config.js";
import type { JenisDokumen } from "../types.js";

const MIME_DIIZINKAN = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const MAX_BYTES = 20 * 1024 * 1024; // batas Bot API untuk download file

export function validasiDokumen(mimeType: string | undefined, fileSize: number | undefined) {
  if (!mimeType || !MIME_DIIZINKAN.has(mimeType)) {
    return "Jenis file tidak didukung. Gunakan PDF, JPG, PNG, atau DOC/DOCX.";
  }
  if (fileSize && fileSize > MAX_BYTES) {
    return "Ukuran file melebihi 20 MB.";
  }
  return null;
}

export async function simpanDokumen(opts: {
  muamalahId: number;
  namaFile: string;
  mimeType: string;
  telegramFileId: string;
  isiFile: Buffer;
  jenis: JenisDokumen;
  diunggahOlehId: number;
}) {
  const dir = path.join(config.documentsDir, String(opts.muamalahId));
  await fs.mkdir(dir, { recursive: true });
  const pathLokal = path.join(dir, `${Date.now()}-${opts.namaFile}`);
  await fs.writeFile(pathLokal, opts.isiFile);

  return prisma.dokumen.create({
    data: {
      muamalahId: opts.muamalahId,
      namaFile: opts.namaFile,
      mimeType: opts.mimeType,
      telegramFileId: opts.telegramFileId,
      pathLokal,
      jenis: opts.jenis,
      diunggahOlehId: opts.diunggahOlehId,
    },
  });
}

export async function daftarDokumen(muamalahId: number) {
  return prisma.dokumen.findMany({ where: { muamalahId }, orderBy: { createdAt: "desc" } });
}

export async function ambilDokumen(id: number) {
  return prisma.dokumen.findUnique({ where: { id } });
}

export async function daftarTemplate() {
  return prisma.template.findMany({ orderBy: { judul: "asc" } });
}

export async function ambilTemplate(kode: string) {
  return prisma.template.findUnique({ where: { kode } });
}

export async function tambahTemplate(opts: {
  kode: string;
  judul: string;
  telegramFileId: string;
  isiFile: Buffer;
  namaFile: string;
}) {
  const dir = config.templatesDir;
  await fs.mkdir(dir, { recursive: true });
  const pathLokal = path.join(dir, opts.namaFile);
  await fs.writeFile(pathLokal, opts.isiFile);

  return prisma.template.upsert({
    where: { kode: opts.kode },
    create: {
      kode: opts.kode,
      judul: opts.judul,
      telegramFileId: opts.telegramFileId,
      pathLokal,
    },
    update: {
      judul: opts.judul,
      telegramFileId: opts.telegramFileId,
      pathLokal,
    },
  });
}
