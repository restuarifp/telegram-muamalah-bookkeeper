import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import type { Operator } from "@prisma/client";
import { prisma } from "../db.js";
import { config } from "../config.js";

/**
 * Login web tanpa password: identitas yang sudah dipercaya sistem ini adalah
 * telegramUserId operator, jadi web pun memakai itu. Operator memasukkan Telegram
 * User ID-nya, bot mengirim kode 6 angka lewat chat pribadi, dan kode itu ditukar
 * jadi sesi. Konsekuensinya, yang bisa login hanya orang yang benar-benar
 * memegang akun Telegram operator — tidak ada kredensial kedua yang bisa bocor,
 * dan mencabut akses cukup dengan menonaktifkan operatornya.
 */

export const KODE_BERLAKU_MENIT = 5;
/** Salah ketik masih dimaafkan; tebakan beruntun tidak. */
export const MAX_PERCOBAAN = 5;
const MAX_PERMINTAAN = 5;
const JENDELA_PERMINTAAN_MENIT = 15;

/** Enam angka, termasuk yang berawalan nol — dibaca manusia dari chat Telegram. */
export function buatKode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * Kode & token sesi tidak disimpan apa adanya: baris yang masih hidup setara
 * dengan sesi yang bisa dipakai, dan database ini ikut ke backup. BOT_TOKEN
 * dipakai sebagai kunci karena ia sudah wajib ada, unik per instalasi, dan
 * kerahasiaannya memang sudah jadi syarat sistem ini aman.
 */
export function hashRahasia(nilai: string): string {
  return createHmac("sha256", config.botToken).update(nilai).digest("hex");
}

function samaAman(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function token(): string {
  return randomBytes(32).toString("hex");
}

export type HasilPermintaanKode =
  | { status: "terkirim"; idPermintaan: string; kode: string; operator: Operator }
  | { status: "tidak_terdaftar" }
  | { status: "terlalu_sering" };

/**
 * Membuat kode login untuk sebuah Telegram User ID. Kodenya dikembalikan (bukan
 * dikirim di sini) supaya pengiriman lewat Telegram tetap urusan pemanggil —
 * dan supaya fungsi ini bisa diuji tanpa menyentuh Bot API.
 */
export async function mintaKodeLogin(telegramUserId: string): Promise<HasilPermintaanKode> {
  const operator = await prisma.operator.findUnique({ where: { telegramUserId } });
  if (!operator || !operator.aktif) return { status: "tidak_terdaftar" };

  const sejak = new Date(Date.now() - JENDELA_PERMINTAAN_MENIT * 60_000);
  const jumlah = await prisma.kodeLogin.count({
    where: { operatorId: operator.id, createdAt: { gte: sejak } },
  });
  if (jumlah >= MAX_PERMINTAAN) return { status: "terlalu_sering" };

  // Permintaan lama dibatalkan: satu operator hanya boleh punya satu kode hidup,
  // supaya kode yang sudah telanjur terkirim ke chat tidak menumpuk jadi lima
  // kunci yang sama-sama berlaku.
  await prisma.kodeLogin.updateMany({
    where: { operatorId: operator.id, dipakaiPada: null },
    data: { dipakaiPada: new Date() },
  });

  const kode = buatKode();
  const idPermintaan = token();
  await prisma.kodeLogin.create({
    data: {
      id: idPermintaan,
      operatorId: operator.id,
      kodeHash: hashRahasia(kode),
      kedaluwarsa: new Date(Date.now() + KODE_BERLAKU_MENIT * 60_000),
    },
  });

  return { status: "terkirim", idPermintaan, kode, operator };
}

export type HasilVerifikasi =
  | { status: "ok"; tokenSesi: string; operator: Operator }
  | { status: "kode_salah"; sisaPercobaan: number }
  | { status: "kedaluwarsa" }
  | { status: "percobaan_habis" }
  | { status: "tidak_ada" };

/**
 * Menukar kode dengan sesi. Kode hanya bisa ditukar oleh browser yang memintanya
 * (idPermintaan ada di cookie), jadi enam angka yang terbaca di layar Telegram
 * orang lain tidak cukup untuk masuk dari perangkat lain.
 */
export async function verifikasiKode(
  idPermintaan: string,
  kode: string,
  userAgent?: string
): Promise<HasilVerifikasi> {
  const permintaan = await prisma.kodeLogin.findUnique({
    where: { id: idPermintaan },
    include: { operator: true },
  });
  if (!permintaan || permintaan.dipakaiPada) return { status: "tidak_ada" };
  if (permintaan.kedaluwarsa.getTime() < Date.now()) return { status: "kedaluwarsa" };
  if (permintaan.percobaan >= MAX_PERCOBAAN) return { status: "percobaan_habis" };

  if (!samaAman(hashRahasia(kode.trim()), permintaan.kodeHash)) {
    const setelah = await prisma.kodeLogin.update({
      where: { id: idPermintaan },
      data: { percobaan: { increment: 1 } },
    });
    return { status: "kode_salah", sisaPercobaan: Math.max(0, MAX_PERCOBAAN - setelah.percobaan) };
  }

  // Operator bisa saja dinonaktifkan di sela pengiriman kode dan penukarannya.
  if (!permintaan.operator.aktif) return { status: "tidak_ada" };

  await prisma.kodeLogin.update({
    where: { id: idPermintaan },
    data: { dipakaiPada: new Date() },
  });

  const tokenSesi = token();
  await prisma.sesiWeb.create({
    data: {
      tokenHash: hashRahasia(tokenSesi),
      operatorId: permintaan.operatorId,
      userAgent: userAgent?.slice(0, 200) ?? null,
      kedaluwarsa: new Date(Date.now() + config.web.sesiJam * 3_600_000),
    },
  });

  return { status: "ok", tokenSesi, operator: permintaan.operator };
}

export interface SesiAktif {
  operator: Operator;
  kantorFilter: number | null;
  tokenSesi: string;
}

/** Sesi yang masih berlaku beserta operatornya, atau null bila tidak sah lagi. */
export async function ambilSesi(tokenSesi: string): Promise<SesiAktif | null> {
  const sesi = await prisma.sesiWeb.findUnique({
    where: { tokenHash: hashRahasia(tokenSesi) },
    include: { operator: true },
  });
  if (!sesi) return null;
  if (sesi.kedaluwarsa.getTime() < Date.now()) return null;
  // Operator yang dinonaktifkan langsung kehilangan aksesnya tanpa perlu
  // menunggu sesinya habis.
  if (!sesi.operator.aktif) return null;

  // Ditulis paling sering sekali per 5 menit: kolom ini cuma untuk jejak
  // "terakhir dipakai", tidak sepadan dengan satu UPDATE tiap permintaan.
  if (Date.now() - sesi.terakhirAktif.getTime() > 5 * 60_000) {
    await prisma.sesiWeb.update({
      where: { tokenHash: sesi.tokenHash },
      data: { terakhirAktif: new Date() },
    });
  }

  return { operator: sesi.operator, kantorFilter: sesi.kantorFilter, tokenSesi };
}

export async function hapusSesi(tokenSesi: string): Promise<void> {
  await prisma.sesiWeb
    .delete({ where: { tokenHash: hashRahasia(tokenSesi) } })
    .catch(() => undefined);
}

/** Filter kantor superadmin, disimpan di sesi (server) bukan di cookie. */
export async function simpanKantorFilter(
  tokenSesi: string,
  kantorId: number | null
): Promise<void> {
  await prisma.sesiWeb.update({
    where: { tokenHash: hashRahasia(tokenSesi) },
    data: { kantorFilter: kantorId },
  });
}

/**
 * Membuang sesi & kode yang sudah lewat masa berlakunya. Dijalankan berkala:
 * baris kedaluwarsa tidak berbahaya (selalu ditolak saat dibaca), tapi tidak ada
 * gunanya menumpuk di database yang ikut dibackup.
 */
export async function bersihkanKedaluwarsa(): Promise<void> {
  const sekarang = new Date();
  await prisma.sesiWeb.deleteMany({ where: { kedaluwarsa: { lt: sekarang } } });
  await prisma.kodeLogin.deleteMany({ where: { kedaluwarsa: { lt: sekarang } } });
}

/**
 * Token anti-CSRF: turunan dari token sesi, jadi tidak perlu disimpan dan tetap
 * tidak bisa ditebak pihak lain. SameSite=Lax saja tidak cukup — ia tidak
 * menghalangi POST lintas situs dari form biasa di semua browser.
 */
export function tokenCsrf(tokenSesi: string): string {
  return hashRahasia(`csrf:${tokenSesi}`);
}

export function csrfSah(tokenSesi: string, dikirim: string | undefined): boolean {
  if (!dikirim) return false;
  return samaAman(tokenCsrf(tokenSesi), dikirim);
}
