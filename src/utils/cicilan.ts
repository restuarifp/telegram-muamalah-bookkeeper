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

/**
 * Nilai akad yang sebenarnya harus dibayar.
 *
 * Untuk hampir semua jenis ini sama dengan pokok, tapi pada murabahah yang
 * ditagih adalah **harga jual** = harga pokok + margin. Semua turunan angka —
 * jadwal cicilan, sisa saldo, rekap, pengingat — wajib lewat sini, bukan
 * membaca `pokok` langsung; kalau tidak, transaksi murabahah akan tampak lunas
 * padahal marginnya belum dibayar.
 */
export function totalKewajiban(m: { pokok: bigint; margin?: bigint | null }): bigint {
  return m.pokok + (m.margin ?? 0n);
}

export function punyaCicilan(m: SkemaCicilan): boolean {
  return m.tenorCicilan !== null && m.tenorCicilan > 0 && m.mulaiCicilan !== null;
}

/**
 * Nominal tiap cicilan atas sebuah nilai akad. Pembagian jarang bulat, jadi
 * sisa pembagian ditumpuk ke cicilan terakhir — totalnya selalu persis sama
 * dengan nilai yang dibagi.
 *
 * Yang dibagi adalah totalKewajiban(), bukan pokok: pada murabahah margin ikut
 * diangsur bersama harga pokoknya.
 */
export function nominalCicilan(nilai: bigint, tenor: number, urutan: number): bigint {
  if (tenor <= 0) return 0n;
  const dasar = nilai / BigInt(tenor);
  if (urutan >= tenor) {
    // Cicilan terakhir menyerap sisa pembagian.
    return dasar + (nilai - dasar * BigInt(tenor));
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
export function jadwalCicilan(
  m: SkemaCicilan & { pokok: bigint; margin?: bigint | null }
): BarisCicilan[] {
  if (!punyaCicilan(m)) return [];
  const tenor = m.tenorCicilan!;
  const mulai = m.mulaiCicilan!;
  const periode = m.periodeCicilan ?? "BULANAN";
  const nilai = totalKewajiban(m);
  const hasil: BarisCicilan[] = [];
  for (let urutan = 1; urutan <= tenor; urutan++) {
    hasil.push({
      urutan,
      jatuhTempo: tambahPeriode(mulai, periode, urutan - 1),
      jumlah: nominalCicilan(nilai, tenor, urutan),
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
  m: SkemaCicilan & { pokok: bigint; margin?: bigint | null },
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
