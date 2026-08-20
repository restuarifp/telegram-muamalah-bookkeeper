import { isSuperadmin } from "../types.js";

/**
 * Aturan lingkup kantor, terlepas dari antarmukanya.
 *
 * Bot membacanya lewat ctx (src/middlewares/auth.ts) dan web lewat sesi login
 * (src/web/sesi.ts), tapi keputusannya harus sama persis di keduanya — kalau
 * tidak, membuka halaman web jadi cara memutari batas kantor yang dijaga bot.
 * Karena itu logikanya tinggal di sini, bukan diduplikasi di masing-masing.
 */
export interface OperatorAkses {
  role: string;
  kantorId: number | null;
}

/**
 * Kantor mana saja yang boleh dibaca operator, dalam bentuk yang langsung bisa
 * dipakai sebagai filter query:
 *   number    → dibatasi ke satu kantor (operator, atau superadmin yang memfilter)
 *   undefined → semua kantor (superadmin tanpa filter)
 *   null      → tidak berhak melihat apa pun (bukan operator, atau operator
 *               tanpa kantor — data yang tidak sah, jangan diam-diam dibuka)
 */
export function lingkupKantorUntuk(
  operator: OperatorAkses | null | undefined,
  kantorFilter?: number | null
): number | undefined | null {
  if (!operator) return null;
  if (isSuperadmin(operator)) return kantorFilter ?? undefined;
  return operator.kantorId ?? null;
}

/** Apakah operator boleh membuka satu transaksi milik kantor tertentu. */
export function bolehAksesKantorUntuk(
  operator: OperatorAkses | null | undefined,
  kantorId: number,
  kantorFilter?: number | null
): boolean {
  const lingkup = lingkupKantorUntuk(operator, kantorFilter);
  if (lingkup === null) return false;
  // Filter tampilan superadmin sengaja tidak ikut membatasi akses per-transaksi:
  // itu alat bantu lihat, bukan pembatasan wewenang.
  if (isSuperadmin(operator)) return true;
  return lingkup === kantorId;
}
