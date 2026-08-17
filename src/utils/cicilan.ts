import type { PeriodeCicilan } from "../types.js";

/**
 * Skema cicilan disimpan parametrik (tenor + periode + tanggal mulai) di tabel
 * Muamalah, bukan sebagai baris jadwal. Semua turunannya — nominal per cicilan,
 * tanggal tiap cicilan, cicilan berikutnya — dihitung di modul ini supaya hanya
 * ada satu tempat yang perlu dipercaya.
 */
export interface SkemaCicilan {
  tenorCicilan: number | null;
  periodeCicilan: string | null;
  mulaiCicilan: Date | null;
}

export function punyaCicilan(m: SkemaCicilan): boolean {
  return m.tenorCicilan !== null && m.tenorCicilan > 0 && m.mulaiCicilan !== null;
}

/**
 * Nominal tiap cicilan. Pembagian pokok jarang bulat, jadi sisa pembagian
 * ditumpuk ke cicilan terakhir — total selalu persis sama dengan pokok.
 */
export function nominalCicilan(pokok: bigint, tenor: number, urutan: number): bigint {
  if (tenor <= 0) return 0n;
  const dasar = pokok / BigInt(tenor);
  if (urutan >= tenor) {
    // Cicilan terakhir menyerap sisa pembagian.
    return dasar + (pokok - dasar * BigInt(tenor));
  }
  return dasar;
}

function tambahPeriode(mulai: Date, periode: string, kelipatan: number): Date {
  const d = new Date(mulai);
  if (periode === "MINGGUAN") {
    d.setUTCDate(d.getUTCDate() + 7 * kelipatan);
  } else {
    // BULANAN, sekaligus default kalau nilainya tak dikenali.
    const targetHari = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + kelipatan);
    // Tanggal 31 di bulan berikutnya yang hanya 30 hari dijepit ke akhir bulan,
    // supaya tidak melompat ke bulan sesudahnya.
    const hariTerakhir = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(targetHari, hariTerakhir));
  }
  return d;
}

export interface BarisCicilan {
  urutan: number;
  jatuhTempo: Date;
  jumlah: bigint;
}

/** Seluruh jadwal cicilan, dihitung dari parameter. Kosong bila skema tidak lengkap. */
export function jadwalCicilan(m: SkemaCicilan & { pokok: bigint }): BarisCicilan[] {
  if (!punyaCicilan(m)) return [];
  const tenor = m.tenorCicilan!;
  const mulai = m.mulaiCicilan!;
  const periode = m.periodeCicilan ?? "BULANAN";
  const hasil: BarisCicilan[] = [];
  for (let urutan = 1; urutan <= tenor; urutan++) {
    hasil.push({
      urutan,
      jatuhTempo: tambahPeriode(mulai, periode, urutan - 1),
      jumlah: nominalCicilan(m.pokok, tenor, urutan),
    });
  }
  return hasil;
}

/**
 * Berapa cicilan yang sudah tertutup oleh total pembayaran — dihitung dari
 * akumulasi nominal, bukan dari jumlah baris angsuran, karena satu angsuran
 * bisa melunasi beberapa cicilan sekaligus (atau sebagian saja).
 */
export function cicilanTerbayar(jadwal: BarisCicilan[], totalDibayar: bigint): number {
  let sisa = totalDibayar;
  let lunas = 0;
  for (const baris of jadwal) {
    if (sisa < baris.jumlah) break;
    sisa -= baris.jumlah;
    lunas++;
  }
  return lunas;
}

/** Cicilan pertama yang belum tertutup pembayaran. Null bila semua sudah lunas. */
export function cicilanBerikutnya(
  m: SkemaCicilan & { pokok: bigint },
  totalDibayar: bigint
): BarisCicilan | null {
  const jadwal = jadwalCicilan(m);
  if (jadwal.length === 0) return null;
  const lunas = cicilanTerbayar(jadwal, totalDibayar);
  return jadwal[lunas] ?? null;
}

/** Terlambat = punya jatuh tempo yang sudah lewat dan masih berjalan. */
export function sudahTerlambat(
  m: { jatuhTempo: Date | null; status: string },
  hariIni: Date = new Date()
): boolean {
  if (m.status !== "BERJALAN" || !m.jatuhTempo) return false;
  // Tanggal kalender lokal (TZ bot = WIB) dinyatakan sebagai tengah malam UTC —
  // sama seperti cara parseTanggal menyimpan tanggal dan cara pengingatService
  // menghitung hari ini. Memakai getUTC* di sini akan salah 7 jam tiap hari.
  const batas = Date.UTC(hariIni.getFullYear(), hariIni.getMonth(), hariIni.getDate());
  return m.jatuhTempo.getTime() < batas;
}
