import { createHash } from "node:crypto";
import { JS } from "./script.js";
import { CSS } from "./style.js";

/**
 * Sidik jari isi aset, dipakai sebagai query string di URL-nya.
 *
 * Tanpa ini, aset yang boleh di-cache lama akan terus dipakai browser walau
 * gayanya sudah berubah — dan halaman muncul dengan markup baru tapi CSS lama,
 * yang jauh lebih kacau daripada sekadar "belum terbarui": kelas yang belum
 * dikenal CSS lama kehilangan seluruh gayanya (checkbox pengalih menu jadi
 * terlihat, tombol hamburger jadi tak terlihat).
 *
 * Karena URL-nya ikut berubah tiap kali isinya berubah, aset justru boleh
 * di-cache selamanya — perubahan berikutnya datang lewat URL yang berbeda.
 */
function versi(isi: string): string {
  return createHash("sha256").update(isi).digest("hex").slice(0, 10);
}

export const URL_CSS = `/aset/app.css?v=${versi(CSS)}`;
export const URL_JS = `/aset/app.js?v=${versi(JS)}`;
