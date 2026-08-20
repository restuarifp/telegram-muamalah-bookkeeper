import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { config } from "../config.js";
import { prisma } from "../db.js";
import { bolehAksesKantorUntuk, lingkupKantorUntuk } from "../services/akses.js";
import { ambilSesi, csrfSah, type SesiAktif } from "../services/webAuthService.js";
import type { Pesan } from "./layout.js";

export type Lingkungan = { Variables: { sesi: SesiAktif } };
// Path generic dibiarkan longgar: helper di bawah dipanggil dari handler rute
// mana pun, dan Hono menyempitkan tipe path per rute.
export type Ctx = Context<Lingkungan, any>;

export const COOKIE_SESI = "sesi_muamalah";
export const COOKIE_PERMINTAAN = "permintaan_kode";
const COOKIE_PESAN = "pesan_muamalah";

function opsiCookie(maxAge?: number) {
  return {
    path: "/",
    httpOnly: true,
    sameSite: "Lax" as const,
    secure: config.web.secureCookie,
    ...(maxAge !== undefined ? { maxAge } : {}),
  };
}

export function pasangCookieSesi(c: Ctx, tokenSesi: string) {
  setCookie(c, COOKIE_SESI, tokenSesi, opsiCookie(config.web.sesiJam * 3600));
}

export function pasangCookiePermintaan(c: Ctx, idPermintaan: string, detik: number) {
  setCookie(c, COOKIE_PERMINTAAN, idPermintaan, opsiCookie(detik));
}

export function buangCookieSesi(c: Ctx) {
  deleteCookie(c, COOKIE_SESI, opsiCookie());
}

export function buangCookiePermintaan(c: Ctx) {
  deleteCookie(c, COOKIE_PERMINTAAN, opsiCookie());
}

/**
 * Pesan singkat yang harus selamat melewati redirect (pola Post/Redirect/Get).
 * Ditaruh di cookie sekali pakai, bukan di query string, supaya teksnya tidak
 * ikut tersalin saat operator membagikan URL halaman.
 */
export function simpanPesan(c: Ctx, pesan: Pesan) {
  setCookie(c, COOKIE_PESAN, `${pesan.jenis}:${pesan.teks}`, opsiCookie(60));
}

export function ambilPesan(c: Ctx): Pesan | null {
  const nilai = getCookie(c, COOKIE_PESAN);
  if (!nilai) return null;
  deleteCookie(c, COOKIE_PESAN, opsiCookie());
  const pemisah = nilai.indexOf(":");
  if (pemisah < 0) return null;
  const jenis = nilai.slice(0, pemisah);
  const teks = nilai.slice(pemisah + 1);
  if (jenis !== "ok" && jenis !== "galat" && jenis !== "info") return null;
  return { jenis, teks };
}

/** Redirect + pesan; dipakai sebagai penutup hampir semua handler POST. */
export function kembali(c: Ctx, url: string, pesan?: Pesan) {
  if (pesan) simpanPesan(c, pesan);
  return c.redirect(url, 303);
}

/**
 * Gerbang halaman web: tanpa sesi yang sah, semuanya dialihkan ke /masuk.
 * Padanan requireOperator di bot — bedanya di web tidak ada "pengunjung yang
 * boleh melihat sebagian", karena tiap halaman menampilkan data transaksi.
 */
export const wajibMasuk: MiddlewareHandler<Lingkungan> = async (c, next) => {
  const token = getCookie(c, COOKIE_SESI);
  const sesi = token ? await ambilSesi(token) : null;
  if (!sesi) {
    if (token) buangCookieSesi(c);
    const tujuan = c.req.path + (new URL(c.req.url).search || "");
    return c.redirect(
      tujuan === "/" ? "/masuk" : `/masuk?tujuan=${encodeURIComponent(tujuan)}`,
      303
    );
  }
  c.set("sesi", sesi);
  await next();
};

/**
 * Setiap permintaan yang mengubah data harus membawa token turunan sesi.
 * Cookie SameSite=Lax saja tidak menutup semua jalur POST lintas situs, dan
 * seluruh mutasi di sini berupa form biasa.
 */
export const periksaCsrf: MiddlewareHandler<Lingkungan> = async (c, next) => {
  if (c.req.method === "GET" || c.req.method === "HEAD") return next();
  const sesi = c.get("sesi");
  const body = await c.req.parseBody();
  const dikirim = typeof body._csrf === "string" ? body._csrf : undefined;
  if (!sesi || !csrfSah(sesi.tokenSesi, dikirim)) {
    return c.text("Permintaan ditolak: token sesi tidak cocok. Muat ulang halaman.", 403);
  }
  await next();
};

export function lingkupWeb(sesi: SesiAktif): number | undefined | null {
  return lingkupKantorUntuk(sesi.operator, sesi.kantorFilter);
}

export function bolehAkses(sesi: SesiAktif, kantorId: number): boolean {
  return bolehAksesKantorUntuk(sesi.operator, kantorId, sesi.kantorFilter);
}

/** Label lingkup untuk header & judul laporan, mis. "Kanwil Surabaya". */
export async function labelLingkup(sesi: SesiAktif): Promise<string> {
  const lingkup = lingkupWeb(sesi);
  if (lingkup === null) return "tanpa kantor";
  if (lingkup === undefined) return "semua kantor";
  const kantor = await prisma.kantor.findUnique({ where: { id: lingkup } });
  return kantor?.nama ?? `kantor #${lingkup}`;
}
