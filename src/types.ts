// SQLite tidak mendukung enum native di Prisma (lihat prisma/schema.prisma),
// jadi nilai-nilai berikut disimpan sebagai String dan divalidasi di sini.

export const ROLES = ["ADMIN", "OPERATOR"] as const;
export type Role = (typeof ROLES)[number];

export const JENIS_MUAMALAH = ["UTANG", "PIUTANG", "INVESTASI", "QARDH", "LAINNYA"] as const;
export type JenisMuamalah = (typeof JENIS_MUAMALAH)[number];

/**
 * Jenis yang boleh dipilih operator saat mencatat transaksi baru.
 *
 * Sengaja dipisah dari JENIS_MUAMALAH, bukan memangkasnya: daftar di atas tetap
 * berisi semua nilai yang *dikenali* sistem, supaya transaksi lama berjenis lain
 * tetap tampil dengan label yang benar, ikut terhitung di rekap, dan tetap punya
 * folder Nextcloud sendiri. Yang dibatasi hanya apa yang bisa dibuat baru.
 *
 * Untuk membuka jenis lain, cukup tambahkan di sini — tidak ada tempat lain yang
 * perlu disentuh.
 */
export const JENIS_AKTIF = ["QARDH"] as const satisfies readonly JenisMuamalah[];

export function isJenisAktif(v: string): v is JenisMuamalah {
  return (JENIS_AKTIF as readonly string[]).includes(v);
}

// Catatan: "terlambat" bukan status, melainkan turunan dari jatuhTempo pada
// transaksi BERJALAN — lihat sudahTerlambat() di src/utils/cicilan.ts.
export const STATUS_MUAMALAH = ["DRAFT", "BERJALAN", "SELESAI", "BATAL"] as const;
export type StatusMuamalah = (typeof STATUS_MUAMALAH)[number];

// Jenis yang boleh punya skema cicilan.
export const JENIS_BERCICILAN = ["UTANG", "PIUTANG", "QARDH"] as const;

export const PERIODE_CICILAN = ["BULANAN", "MINGGUAN"] as const;
export type PeriodeCicilan = (typeof PERIODE_CICILAN)[number];

export const JENIS_DOKUMEN = ["AKAD", "BUKTI", "LAINNYA"] as const;
export type JenisDokumen = (typeof JENIS_DOKUMEN)[number];

export function isJenisMuamalah(v: string): v is JenisMuamalah {
  return (JENIS_MUAMALAH as readonly string[]).includes(v);
}

export function isStatusMuamalah(v: string): v is StatusMuamalah {
  return (STATUS_MUAMALAH as readonly string[]).includes(v);
}

export function isJenisDokumen(v: string): v is JenisDokumen {
  return (JENIS_DOKUMEN as readonly string[]).includes(v);
}

export function isPeriodeCicilan(v: string): v is PeriodeCicilan {
  return (PERIODE_CICILAN as readonly string[]).includes(v);
}

export function bolehBercicilan(jenis: string): boolean {
  return (JENIS_BERCICILAN as readonly string[]).includes(jenis);
}

export function isRole(v: string): v is Role {
  return (ROLES as readonly string[]).includes(v);
}
