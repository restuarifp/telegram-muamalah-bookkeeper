import type { Muamalah } from "@prisma/client";
import type { StatusMuamalah, JenisMuamalah, PeriodeCicilan } from "../types.js";
import {
  cicilanBerikutnya,
  nominalCicilan,
  punyaCicilan,
  sudahTerlambat,
  totalKewajiban,
  type SkemaCicilan,
} from "./cicilan.js";

/**
 * Meloloskan karakter yang jadi penanda entity di Telegram parse_mode "Markdown"
 * (legacy). Wajib dipakai untuk teks dinamis — nama grup, nama pihak, judul —
 * karena satu `_` atau `*` yang tak berpasangan bikin seluruh pesan ditolak
 * dengan "can't parse entities".
 */
export function escapeMarkdown(teks: string): string {
  return teks.replace(/([_*`\[])/g, "\\$1");
}

export function formatRupiah(amount: bigint | number): string {
  const value = typeof amount === "bigint" ? Number(amount) : amount;
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatTanggal(date: Date | null | undefined): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat("id-ID", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Jakarta",
  }).format(date);
}

export const LABEL_JENIS: Record<JenisMuamalah, string> = {
  UTANG: "Utang",
  PIUTANG: "Piutang",
  INVESTASI: "Investasi",
  QARDH: "Qardh",
  MURABAHAH: "Murabahah",
  MUDHARABAH: "Mudharabah",
  MUSYARAKAH: "Musyarakah",
  LAINNYA: "Lainnya",
};

export const LABEL_STATUS: Record<StatusMuamalah, string> = {
  DRAFT: "Draft",
  BERJALAN: "Berjalan",
  SELESAI: "Selesai",
  BATAL: "Batal",
};

/**
 * Sebutan kedua pihak menurut jenis akadnya. Yang berbeda bukan sekadar kata:
 * pada qardh arah kewajiban mengalir dari pihak pertama ke kedua, sedangkan
 * pada musyarakah keduanya setara — menampilkan "Pihak 1/Pihak 2" untuk semua
 * akan menghapus perbedaan yang justru jadi inti dokumennya.
 *
 * Pihak pertama selalu yang menyerahkan (uang, barang, atau modal), pihak kedua
 * yang menerima atau mengelola.
 */
export const PERAN_PIHAK: Record<JenisMuamalah, { pertama: string; kedua: string }> = {
  UTANG: { pertama: "Pemberi pinjaman", kedua: "Penerima pinjaman" },
  PIUTANG: { pertama: "Pemberi pinjaman", kedua: "Penerima pinjaman" },
  QARDH: { pertama: "Pemberi pinjaman", kedua: "Penerima pinjaman" },
  MURABAHAH: { pertama: "Penjual", kedua: "Pembeli" },
  INVESTASI: { pertama: "Pemodal", kedua: "Pengelola" },
  MUDHARABAH: { pertama: "Pemilik modal", kedua: "Pengelola" },
  MUSYARAKAH: { pertama: "Mitra pertama", kedua: "Mitra kedua" },
  LAINNYA: { pertama: "Pihak pertama", kedua: "Pihak kedua" },
};

export function peranPihak(jenis: string): { pertama: string; kedua: string } {
  return PERAN_PIHAK[jenis as JenisMuamalah] ?? PERAN_PIHAK.LAINNYA;
}

export const LABEL_PERIODE: Record<PeriodeCicilan, string> = {
  BULANAN: "bulanan",
  MINGGUAN: "mingguan",
};

/**
 * Baris ringkas skema cicilan, mis. "12x bulanan @ Rp 500.000".
 * Null bila transaksi tidak punya skema cicilan.
 */
export function ringkasSkemaCicilan(
  m: SkemaCicilan & { pokok: bigint; margin?: bigint | null }
): string | null {
  if (!punyaCicilan(m)) return null;
  const periode = LABEL_PERIODE[(m.periodeCicilan ?? "BULANAN") as PeriodeCicilan] ?? "bulanan";
  // Yang diangsur adalah nilai akad, bukan pokok — pada murabahah margin ikut
  // terbagi ke tiap cicilan.
  const perCicilan = nominalCicilan(totalKewajiban(m), m.tenorCicilan!, 1);
  return `${m.tenorCicilan}x ${periode} @ ${formatRupiah(perCicilan)}`;
}

export function ringkasanMuamalah(
  m: Muamalah & {
    pihak: { nama: string };
    pihakKedua?: { nama: string } | null;
    sisaSaldo?: bigint;
  }
): string {
  const labelJenis = LABEL_JENIS[m.jenis as JenisMuamalah] ?? m.jenis;
  const labelStatus = LABEL_STATUS[m.status as StatusMuamalah] ?? m.status;
  const peran = peranPihak(m.jenis);
  const baris = [
    `#${m.id} — ${labelJenis} — ${m.judul}`,
    `${peran.pertama}: ${m.pihak.nama}`,
    // Transaksi lama bisa saja belum punya pihak kedua; barisnya dilewati
    // ketimbang menampilkan sebutan peran dengan nama kosong.
    ...(m.pihakKedua ? [`${peran.kedua}: ${m.pihakKedua.nama}`] : []),
    `Pokok: ${formatRupiah(m.pokok)}`,
  ];
  // Pada murabahah, angka yang ditagih adalah harga jualnya — menampilkan pokok
  // saja membuat sisa saldo terbaca seolah lebih besar dari nilai akadnya.
  if (m.margin) {
    baris.push(`Margin: ${formatRupiah(m.margin)}`);
    baris.push(`Harga jual: ${formatRupiah(totalKewajiban(m))}`);
  }
  if (m.sisaSaldo !== undefined) {
    baris.push(`Sisa: ${formatRupiah(m.sisaSaldo)}`);
  }
  baris.push(`Akad: ${formatTanggal(m.tanggalAkad)}`);
  baris.push(`Jatuh tempo: ${formatTanggal(m.jatuhTempo)}`);
  // "Terlambat" ditempelkan ke status saat ditampilkan, bukan disimpan.
  baris.push(`Status: ${labelStatus}${sudahTerlambat(m) ? " (terlambat)" : ""}`);

  const skema = ringkasSkemaCicilan(m);
  if (skema) {
    baris.push(`Cicilan: ${skema}`);
    // Sisa saldo hanya tersedia di detail (bukan di list), jadi cicilan
    // berikutnya ikut ditampilkan hanya kalau kita tahu sudah dibayar berapa.
    if (m.sisaSaldo !== undefined) {
      const berikut = cicilanBerikutnya(m, totalKewajiban(m) - m.sisaSaldo);
      baris.push(
        berikut
          ? `Cicilan berikutnya: ke-${berikut.urutan}/${m.tenorCicilan} — ${formatRupiah(berikut.jumlah)} pada ${formatTanggal(berikut.jatuhTempo)}`
          : `Cicilan berikutnya: — (semua cicilan sudah tertutup)`
      );
    }
  }

  if (m.bagiHasilNisbah) baris.push(`Nisbah: ${m.bagiHasilNisbah}`);
  if (m.porsiModal) baris.push(`Porsi modal: ${m.porsiModal}`);
  if (m.deskripsi) baris.push(`Deskripsi: ${m.deskripsi}`);
  return baris.join("\n");
}
