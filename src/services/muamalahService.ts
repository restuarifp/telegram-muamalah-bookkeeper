import { prisma } from "../db.js";
import type { JenisMuamalah, PeriodeCicilan, StatusMuamalah } from "../types.js";

export interface BuatMuamalahInput {
  jenis: JenisMuamalah;
  pihakId: number;
  judul: string;
  pokok: bigint;
  tanggalAkad: Date;
  jatuhTempo?: Date | null;
  bagiHasilNisbah?: string | null;
  deskripsi?: string | null;
  status?: StatusMuamalah;
  tenorCicilan?: number | null;
  periodeCicilan?: PeriodeCicilan | null;
  mulaiCicilan?: Date | null;
  dibuatOlehId: number;
}

export async function buatMuamalah(input: BuatMuamalahInput) {
  return prisma.muamalah.create({ data: input, include: { pihak: true } });
}

export async function daftarMuamalah(opts: {
  jenis?: string;
  status?: string;
  skip?: number;
  take?: number;
}) {
  const where = {
    ...(opts.jenis ? { jenis: opts.jenis } : {}),
    ...(opts.status ? { status: opts.status } : { status: { not: "BATAL" } }),
  };
  const [items, total] = await Promise.all([
    prisma.muamalah.findMany({
      where,
      include: { pihak: true },
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
      angsuran: { orderBy: { tanggal: "asc" }, include: { dicatatOleh: true } },
      dokumen: { orderBy: { createdAt: "desc" } },
      dibuatOleh: true,
    },
  });
  if (!muamalah) return null;
  const sisaSaldo = hitungSisaSaldo(muamalah.pokok, muamalah.angsuran);
  return { ...muamalah, sisaSaldo };
}

export function hitungSisaSaldo(pokok: bigint, angsuran: { jumlah: bigint }[]): bigint {
  const totalDibayar = angsuran.reduce((sum, a) => sum + a.jumlah, 0n);
  const sisa = pokok - totalDibayar;
  return sisa < 0n ? 0n : sisa;
}

export type FieldMuamalahDapatDiedit =
  | "judul"
  | "pokok"
  | "tanggalAkad"
  | "jatuhTempo"
  | "bagiHasilNisbah"
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
    const sisa = hitungSisaSaldo(muamalah.pokok, muamalah.angsuran);
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

export async function rekapRingkasan() {
  // DRAFT sengaja tidak dihitung: transaksi yang belum diakadkan tidak boleh
  // ikut menambah total utang/piutang maupun memicu pengingat.
  const berjalan = await prisma.muamalah.findMany({
    where: { status: "BERJALAN" },
    include: { angsuran: true },
  });

  const totals: Record<string, bigint> = {
    UTANG: 0n,
    PIUTANG: 0n,
    INVESTASI: 0n,
    QARDH: 0n,
    LAINNYA: 0n,
  };
  for (const m of berjalan) {
    const sisa = hitungSisaSaldo(m.pokok, m.angsuran);
    totals[m.jenis] = (totals[m.jenis] ?? 0n) + sisa;
  }

  const now = new Date();
  const awalBulan = new Date(now.getFullYear(), now.getMonth(), 1);
  const akhirBulan = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const jatuhTempoBulanIni = await prisma.muamalah.count({
    where: {
      status: "BERJALAN",
      jatuhTempo: { gte: awalBulan, lt: akhirBulan },
    },
  });

  return { totals, jatuhTempoBulanIni, jumlahAktif: berjalan.length };
}
