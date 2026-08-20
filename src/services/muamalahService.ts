import { prisma } from "../db.js";
import type { JenisMuamalah, PeriodeCicilan, StatusMuamalah } from "../types.js";
import { JENIS_MUAMALAH } from "../types.js";
import { totalKewajiban } from "../utils/cicilan.js";

export interface BuatMuamalahInput {
  jenis: JenisMuamalah;
  pihakId: number;
  pihakKeduaId?: number | null;
  judul: string;
  pokok: bigint;
  tanggalAkad: Date;
  jatuhTempo?: Date | null;
  bagiHasilNisbah?: string | null;
  margin?: bigint | null;
  porsiModal?: string | null;
  deskripsi?: string | null;
  status?: StatusMuamalah;
  tenorCicilan?: number | null;
  periodeCicilan?: PeriodeCicilan | null;
  mulaiCicilan?: Date | null;
  kantorId: number;
  dibuatOlehId: number;
}

export async function buatMuamalah(input: BuatMuamalahInput) {
  return prisma.muamalah.create({ data: input, include: { pihak: true } });
}

export async function daftarMuamalah(opts: {
  jenis?: string;
  status?: string;
  // undefined = semua kantor (hanya superadmin yang boleh sampai ke sini —
  // lihat lingkupKantor() di src/middlewares/auth.ts).
  kantorId?: number;
  /** Pencarian bebas atas judul transaksi dan nama pihak (dipakai web UI). */
  cari?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(opts.jenis ? { jenis: opts.jenis } : {}),
    ...(opts.status ? { status: opts.status } : { status: { not: "BATAL" } }),
    ...(opts.kantorId !== undefined ? { kantorId: opts.kantorId } : {}),
    ...(opts.cari
      ? {
          OR: [
            { judul: { contains: opts.cari } },
            { pihak: { nama: { contains: opts.cari } } },
            { pihakKedua: { nama: { contains: opts.cari } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.muamalah.findMany({
      where,
      include: { pihak: true, pihakKedua: true, kantor: true },
      orderBy: [{ jatuhTempo: "asc" }, { createdAt: "desc" }],
      skip: opts.skip ?? 0,
      take: opts.take ?? 5,
    }),
    prisma.muamalah.count({ where }),
  ]);
  return { items, total };
}

export async function detailMuamalah(id: number) {
  const muamalah = await prisma.muamalah.findUnique({
    where: { id },
    include: {
      pihak: true,
      pihakKedua: true,
      angsuran: { orderBy: { tanggal: "asc" }, include: { dicatatOleh: true } },
      dokumen: { orderBy: { createdAt: "desc" } },
      dibuatOleh: true,
      kantor: true,
    },
  });
  if (!muamalah) return null;
  const sisaSaldo = hitungSisaSaldo(muamalah, muamalah.angsuran);
  return { ...muamalah, sisaSaldo };
}

/**
 * Sisa yang masih harus dibayar. Yang dikurangi adalah totalKewajiban(), bukan
 * pokok — akad murabahah baru lunas setelah margin ikut terbayar.
 *
 * Akadnya diminta utuh (bukan cuma angka pokok) justru supaya margin tidak bisa
 * kelupaan diikutkan oleh pemanggil baru.
 */
export function hitungSisaSaldo(
  akad: { pokok: bigint; margin?: bigint | null },
  angsuran: { jumlah: bigint }[]
): bigint {
  const totalDibayar = angsuran.reduce((sum, a) => sum + a.jumlah, 0n);
  const sisa = totalKewajiban(akad) - totalDibayar;
  return sisa < 0n ? 0n : sisa;
}

export type FieldMuamalahDapatDiedit =
  | "judul"
  | "pokok"
  | "tanggalAkad"
  | "jatuhTempo"
  | "bagiHasilNisbah"
  | "margin"
  | "porsiModal"
  | "deskripsi"
  | "tenorCicilan"
  | "periodeCicilan"
  | "mulaiCicilan";

export async function editMuamalahField(
  id: number,
  field: FieldMuamalahDapatDiedit,
  value: string | bigint | Date | number | null
) {
  return prisma.muamalah.update({ where: { id }, data: { [field]: value } });
}

/**
 * Perubahan sekaligus atas seluruh field yang boleh diedit — pasangan
 * editMuamalahField() untuk antarmuka yang menyunting satu formulir penuh
 * (web), bukan satu field per langkah wizard (bot).
 */
export type UbahMuamalahInput = Pick<
  BuatMuamalahInput,
  | "pihakId"
  | "pihakKeduaId"
  | "judul"
  | "pokok"
  | "tanggalAkad"
  | "jatuhTempo"
  | "bagiHasilNisbah"
  | "margin"
  | "porsiModal"
  | "deskripsi"
  | "tenorCicilan"
  | "periodeCicilan"
  | "mulaiCicilan"
>;

export async function perbaruiMuamalah(id: number, input: UbahMuamalahInput) {
  return prisma.muamalah.update({ where: { id }, data: input });
}

export async function ubahStatus(id: number, status: StatusMuamalah) {
  return prisma.muamalah.update({ where: { id }, data: { status } });
}

export async function hapusMuamalah(id: number, hardDelete: boolean) {
  if (hardDelete) {
    await prisma.angsuran.deleteMany({ where: { muamalahId: id } });
    await prisma.dokumen.deleteMany({ where: { muamalahId: id } });
    await prisma.pengingat.deleteMany({ where: { muamalahId: id } });
    return prisma.muamalah.delete({ where: { id } });
  }
  return prisma.muamalah.update({ where: { id }, data: { status: "BATAL" } });
}

export async function catatAngsuran(input: {
  muamalahId: number;
  jumlah: bigint;
  tanggal: Date;
  buktiFileId?: string | null;
  dicatatOlehId: number;
}) {
  const angsuran = await prisma.angsuran.create({ data: input });

  // Jika sisa saldo mencapai 0, tandai otomatis SELESAI.
  const muamalah = await prisma.muamalah.findUnique({
    where: { id: input.muamalahId },
    include: { angsuran: true },
  });
  if (muamalah) {
    const sisa = hitungSisaSaldo(muamalah, muamalah.angsuran);
    if (sisa === 0n && muamalah.status === "BERJALAN") {
      await prisma.muamalah.update({
        where: { id: muamalah.id },
        data: { status: "SELESAI" },
      });
    }
  }
  return angsuran;
}

export async function cariPihak(nama: string) {
  return prisma.pihak.findMany({
    where: { nama: { contains: nama } },
    take: 10,
    orderBy: { nama: "asc" },
  });
}

export async function buatPihak(nama: string, telegramUserId?: string | null) {
  return prisma.pihak.create({ data: { nama, telegramUserId } });
}

/**
 * Mencari pihak bernama persis sama, atau membuatnya bila belum ada. Dipakai
 * formulir web yang menerima nama sebagai teks bebas — tanpa pencocokan ini,
 * mencatat transaksi kedua untuk orang yang sama akan melahirkan pihak kembar.
 */
export async function pihakDariNama(nama: string) {
  const ada = await prisma.pihak.findFirst({ where: { nama } });
  return ada ?? buatPihak(nama);
}

export async function rekapRingkasan(kantorId?: number) {
  // DRAFT sengaja tidak dihitung: transaksi yang belum diakadkan tidak boleh
  // ikut menambah total utang/piutang maupun memicu pengingat.
  const lingkup = kantorId !== undefined ? { kantorId } : {};
  const berjalan = await prisma.muamalah.findMany({
    where: { status: "BERJALAN", ...lingkup },
    include: { angsuran: true },
  });

  // Disusun dari daftar jenis, bukan ditulis tangan: jenis baru yang lupa
  // didaftarkan di sini akan hilang diam-diam dari rekap.
  const totals: Record<string, bigint> = Object.fromEntries(
    JENIS_MUAMALAH.map((j) => [j, 0n])
  );
  for (const m of berjalan) {
    const sisa = hitungSisaSaldo(m, m.angsuran);
    totals[m.jenis] = (totals[m.jenis] ?? 0n) + sisa;
  }

  const now = new Date();
  const awalBulan = new Date(now.getFullYear(), now.getMonth(), 1);
  const akhirBulan = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const jatuhTempoBulanIni = await prisma.muamalah.count({
    where: {
      status: "BERJALAN",
      ...lingkup,
      jatuhTempo: { gte: awalBulan, lt: akhirBulan },
    },
  });

  return { totals, jatuhTempoBulanIni, jumlahAktif: berjalan.length };
}
