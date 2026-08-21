// Nilai-nilai berikut disimpan sebagai String di database, bukan enum native,
// dan divalidasi di sini (lihat alasannya di prisma/schema.prisma).

// SUPERADMIN lintas kantor (lihat semua, kelola kantor & operator); OPERATOR
// terikat pada satu kantor perwakilan dan hanya melihat transaksi kantornya.
export const ROLES = ["SUPERADMIN", "OPERATOR"] as const;
export type Role = (typeof ROLES)[number];

export const JENIS_MUAMALAH = [
  "UTANG",
  "PIUTANG",
  "INVESTASI",
  "QARDH",
  "MURABAHAH",
  "MUDHARABAH",
  "MUSYARAKAH",
  "LAINNYA",
] as const;
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
export const JENIS_AKTIF = [
  "QARDH",
  "MURABAHAH",
  "MUDHARABAH",
  "MUSYARAKAH",
] as const satisfies readonly JenisMuamalah[];

export function isJenisAktif(v: string): v is JenisMuamalah {
  return (JENIS_AKTIF as readonly string[]).includes(v);
}

/**
 * Bentuk akad menentukan field mana yang berlaku, dan tiga daftar di bawah ini
 * yang jadi satu-satunya sumbernya — dipakai bersama oleh wizard bot, formulir
 * web, dan tampilan detail. Tanpa ini, "jenis apa saja yang punya nisbah" akan
 * tersebar sebagai perbandingan `jenis === "INVESTASI"` di banyak berkas dan
 * pasti tertinggal saat jenis baru ditambahkan.
 */

/**
 * Akad jual beli dengan margin: kewajiban pembeli bukan pokok, melainkan
 * pokok + margin (harga jual). Lihat totalKewajiban() di src/utils/cicilan.ts —
 * di situlah selisih ini diperhitungkan, bukan di masing-masing pemanggil.
 */
export const JENIS_BERMARGIN = ["MURABAHAH"] as const satisfies readonly JenisMuamalah[];

/** Akad bagi hasil: yang disepakati nisbahnya, bukan imbal hasil pasti. */
export const JENIS_BAGI_HASIL = [
  "INVESTASI",
  "MUDHARABAH",
  "MUSYARAKAH",
] as const satisfies readonly JenisMuamalah[];

/**
 * Akad dengan modal patungan — kedua pihak menyetor, jadi porsi modalnya perlu
 * dicatat terpisah dari nisbah bagi hasil (keduanya boleh berbeda).
 */
export const JENIS_BERPORSI_MODAL = ["MUSYARAKAH"] as const satisfies readonly JenisMuamalah[];

export function pakaiMargin(jenis: string): boolean {
  return (JENIS_BERMARGIN as readonly string[]).includes(jenis);
}

export function pakaiBagiHasil(jenis: string): boolean {
  return (JENIS_BAGI_HASIL as readonly string[]).includes(jenis);
}

export function pakaiPorsiModal(jenis: string): boolean {
  return (JENIS_BERPORSI_MODAL as readonly string[]).includes(jenis);
}

// Catatan: "terlambat" bukan status, melainkan turunan dari jatuhTempo pada
// transaksi BERJALAN — lihat sudahTerlambat() di src/utils/cicilan.ts.
export const STATUS_MUAMALAH = ["DRAFT", "BERJALAN", "SELESAI", "BATAL"] as const;
export type StatusMuamalah = (typeof STATUS_MUAMALAH)[number];

// Jenis yang boleh punya skema cicilan. Murabahah ikut karena harga jualnya
// memang lazim diangsur; akad bagi hasil tidak, karena yang mengalir ke sana
// bagian keuntungan, bukan angsuran berjadwal.
export const JENIS_BERCICILAN = ["UTANG", "PIUTANG", "QARDH", "MURABAHAH"] as const;

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

export function isSuperadmin(operator?: { role: string } | null): boolean {
  return operator?.role === "SUPERADMIN";
}
