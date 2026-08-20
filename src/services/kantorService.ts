import { prisma } from "../db.js";

export const KANTOR_PUSAT = "Kantor Pusat";

export async function daftarKantor(opts: { termasukNonaktif?: boolean } = {}) {
  return prisma.kantor.findMany({
    where: opts.termasukNonaktif ? {} : { aktif: true },
    orderBy: { nama: "asc" },
  });
}

export async function cariKantor(idAtauNama: string) {
  const id = Number(idAtauNama);
  if (Number.isInteger(id) && id > 0) {
    const byId = await prisma.kantor.findUnique({ where: { id } });
    if (byId) return byId;
  }
  return prisma.kantor.findFirst({
    where: { nama: { contains: idAtauNama.trim() } },
    orderBy: { nama: "asc" },
  });
}

export async function buatKantor(nama: string) {
  return prisma.kantor.create({ data: { nama: nama.trim() } });
}

export async function nonaktifkanKantor(id: number) {
  return prisma.kantor.update({ where: { id }, data: { aktif: false } });
}

/**
 * Kantor default untuk instalasi baru, sekaligus penadah data lama (lihat
 * migrasi 20260819090000_kantor_acl). Dibuat saat boot supaya operator pertama
 * selalu punya kantor yang bisa dipilih.
 */
export async function pastikanKantorPusat() {
  const ada = await prisma.kantor.findUnique({ where: { nama: KANTOR_PUSAT } });
  if (ada) return ada;
  return prisma.kantor.create({ data: { nama: KANTOR_PUSAT } });
}
