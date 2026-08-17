import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  escapeMarkdown,
  formatRupiah,
  formatTanggal,
  ringkasSkemaCicilan,
  LABEL_JENIS,
} from "../utils/format.js";
import {
  cicilanBerikutnya,
  cicilanTerbayar,
  jadwalCicilan,
  punyaCicilan,
} from "../utils/cicilan.js";
import type { Bot } from "grammy";
import type { BotContext } from "../bot-context.js";

const OFFSET_PENGINGAT = [7, 3, 1, 0]; // H-7, H-3, H-1, H-0

/** Nomor cicilan semu untuk pengingat tingkat transaksi (tanpa skema cicilan). */
const URUTAN_TRANSAKSI = 0;

function tanggalHariIni(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

/** Tanggal kalender sebuah Date, dinormalkan ke tengah malam UTC. */
function keHariUtc(d: Date): number {
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

function selisihHariDari(target: Date, hariIni: Date): number {
  return Math.round((keHariUtc(target) - hariIni.getTime()) / 86_400_000);
}

/**
 * Key dedup untuk keterlambatan: dikirim ulang tiap kelipatan 7 hari, dengan
 * namespace negatif terpisah agar tidak bentrok dengan offset H-7..H-0.
 */
function keyTerlambat(hariTerlambat: number): number {
  return -1000 - Math.floor(hariTerlambat / 7);
}

export interface KandidatPengingat {
  urutanCicilan: number;
  offsetHari: number;
  urgensi: string;
  rincian: string;
}

export interface MuamalahUntukPengingat {
  pokok: bigint;
  jatuhTempo: Date | null;
  tenorCicilan: number | null;
  periodeCicilan: string | null;
  mulaiCicilan: Date | null;
  angsuran: { jumlah: bigint }[];
}

/**
 * Menentukan pengingat apa saja yang layak dikirim hari ini untuk satu transaksi.
 * Murni (tanpa akses database) supaya bisa diuji langsung.
 *
 * Transaksi bercicilan diingatkan per cicilan yang belum tertutup pembayaran;
 * jatuhTempo transaksi tidak lagi ikut memicu pengingat agar tidak dobel dengan
 * cicilan terakhir. Transaksi tanpa cicilan tetap memakai jatuhTempo.
 */
export function pilihPengingat(
  m: MuamalahUntukPengingat,
  hariIni: Date
): KandidatPengingat[] {
  const hasil: KandidatPengingat[] = [];
  const totalDibayar = m.angsuran.reduce((s, a) => s + a.jumlah, 0n);

  if (punyaCicilan(m)) {
    const jadwal = jadwalCicilan({ ...m, pokok: m.pokok });
    const lunas = cicilanTerbayar(jadwal, totalDibayar);
    // Cicilan yang sudah tertutup pembayaran berhenti diingatkan dengan
    // sendirinya — tidak perlu ada penandaan manual.
    const belumBayar = jadwal.slice(lunas);
    const tenor = m.tenorCicilan!;

    const terlambat = belumBayar.filter((b) => selisihHariDari(b.jatuhTempo, hariIni) < 0);
    if (terlambat.length > 0) {
      // Tunggakan digabung jadi satu entri, dikunci pada cicilan terlambat
      // paling lama — kalau tidak, 6 cicilan tertunggak berarti 6 pesan.
      const paling = terlambat[0];
      const hariTerlambat = -selisihHariDari(paling.jatuhTempo, hariIni);
      const totalTunggakan = terlambat.reduce((s, b) => s + b.jumlah, 0n);
      hasil.push({
        urutanCicilan: paling.urutan,
        offsetHari: keyTerlambat(hariTerlambat),
        urgensi: `Terlambat ${hariTerlambat} hari`,
        rincian:
          terlambat.length === 1
            ? `Cicilan ke-${paling.urutan}/${tenor} — ${formatRupiah(paling.jumlah)}, jatuh tempo ${formatTanggal(paling.jatuhTempo)}`
            : `${terlambat.length} cicilan tertunggak (ke-${paling.urutan} s/d ke-${terlambat[terlambat.length - 1].urutan}) — total ${formatRupiah(totalTunggakan)}, terlama jatuh tempo ${formatTanggal(paling.jatuhTempo)}`,
      });
    }

    for (const baris of belumBayar) {
      const selisih = selisihHariDari(baris.jatuhTempo, hariIni);
      if (!OFFSET_PENGINGAT.includes(selisih)) continue;
      hasil.push({
        urutanCicilan: baris.urutan,
        offsetHari: selisih,
        urgensi: selisih === 0 ? "Jatuh tempo hari ini" : `H-${selisih}`,
        rincian: `Cicilan ke-${baris.urutan}/${tenor} — ${formatRupiah(baris.jumlah)}, jatuh tempo ${formatTanggal(baris.jatuhTempo)}`,
      });
    }

    return hasil;
  }

  if (!m.jatuhTempo) return hasil;

  const selisih = selisihHariDari(m.jatuhTempo, hariIni);
  if (OFFSET_PENGINGAT.includes(selisih)) {
    hasil.push({
      urutanCicilan: URUTAN_TRANSAKSI,
      offsetHari: selisih,
      urgensi: selisih === 0 ? "Jatuh tempo hari ini" : `H-${selisih}`,
      rincian: `Jatuh tempo: ${formatTanggal(m.jatuhTempo)}`,
    });
  } else if (selisih < 0) {
    hasil.push({
      urutanCicilan: URUTAN_TRANSAKSI,
      offsetHari: keyTerlambat(-selisih),
      urgensi: `Terlambat ${-selisih} hari`,
      rincian: `Jatuh tempo: ${formatTanggal(m.jatuhTempo)}`,
    });
  }
  return hasil;
}

/**
 * Kumpulkan pengingat yang layak dikirim hari ini: per cicilan untuk transaksi
 * bercicilan, per jatuhTempo untuk sisanya. Tiap kandidat dicek ke tabel
 * Pengingat agar tidak terkirim dua kali.
 */
export async function prosesPengingatJatuhTempo() {
  const hariIni = tanggalHariIni();

  // Tidak ada lagi penulisan status di sini: keterlambatan dihitung dari
  // jatuhTempo saat dibaca, jadi mengedit jatuhTempo langsung tercermin tanpa
  // perlu ada job yang membetulkan status. DRAFT & BATAL tidak diingatkan.
  const kandidat = await prisma.muamalah.findMany({
    where: {
      status: "BERJALAN",
      // Transaksi bercicilan tidak wajib punya jatuhTempo — jadwal cicilannya
      // sendiri yang jadi sumber pengingat.
      OR: [{ jatuhTempo: { not: null } }, { tenorCicilan: { not: null } }],
    },
    include: { pihak: true, angsuran: true },
  });

  const akanDikirim: {
    muamalahId: number;
    urutanCicilan: number;
    offsetHari: number;
    teks: string;
    urgensi: string;
  }[] = [];

  for (const m of kandidat) {
    for (const kand of pilihPengingat(m, hariIni)) {
      const sudah = await prisma.pengingat.findUnique({
        where: {
          muamalahId_urutanCicilan_offsetHari: {
            muamalahId: m.id,
            urutanCicilan: kand.urutanCicilan,
            offsetHari: kand.offsetHari,
          },
        },
      });
      if (sudah?.terkirimPada) continue;

      const sisa = m.pokok - m.angsuran.reduce((s, a) => s + a.jumlah, 0n);
      const skema = ringkasSkemaCicilan(m);
      // judul & nama pihak diketik operator, jadi harus di-escape: teks ini dikirim
      // dengan parse_mode "Markdown".
      const teks =
        `#${m.id} ${LABEL_JENIS[m.jenis as keyof typeof LABEL_JENIS] ?? m.jenis} — ${escapeMarkdown(m.judul)}\n` +
        `Pihak: ${escapeMarkdown(m.pihak.nama)} | Sisa: ${formatRupiah(sisa < 0n ? 0n : sisa)}\n` +
        (skema ? `Skema: ${skema}\n` : "") +
        kand.rincian;

      akanDikirim.push({
        muamalahId: m.id,
        urutanCicilan: kand.urutanCicilan,
        offsetHari: kand.offsetHari,
        teks,
        urgensi: kand.urgensi,
      });
    }
  }

  return akanDikirim;
}

/**
 * Ringkasan jatuh tempo untuk ditampilkan langsung (perintah /jatuhtempo), terlepas dari
 * status kirim di tabel Pengingat — tidak menandai apa pun sebagai terkirim.
 */
export async function ringkasanJatuhTempoTampilan() {
  const hariIni = tanggalHariIni();
  const items = await prisma.muamalah.findMany({
    where: {
      status: "BERJALAN",
      OR: [{ jatuhTempo: { not: null } }, { tenorCicilan: { not: null } }],
    },
    include: { pihak: true, angsuran: true },
    orderBy: { jatuhTempo: "asc" },
  });

  const hasil: { id: number; teks: string; selisih: number }[] = [];

  for (const m of items) {
    // Tanggal yang relevan: cicilan berikutnya yang belum dibayar kalau ada
    // skema cicilan, selain itu jatuhTempo transaksi.
    const totalDibayar = m.angsuran.reduce((s, a) => s + a.jumlah, 0n);
    const berikut = punyaCicilan(m) ? cicilanBerikutnya(m, totalDibayar) : null;
    const tanggalAcuan = berikut?.jatuhTempo ?? (punyaCicilan(m) ? null : m.jatuhTempo);
    if (!tanggalAcuan) continue;

    const selisih = selisihHariDari(tanggalAcuan, hariIni);
    if (selisih > 7) continue;

    const status =
      selisih < 0 ? `terlambat ${-selisih} hari` : selisih === 0 ? "hari ini" : `H-${selisih}`;
    const sisa = m.pokok - totalDibayar;
    const label = berikut
      ? `Cicilan ke-${berikut.urutan}/${m.tenorCicilan}: ${formatRupiah(berikut.jumlah)} pada ${formatTanggal(berikut.jatuhTempo)}`
      : `Jatuh tempo: ${formatTanggal(tanggalAcuan)}`;

    hasil.push({
      id: m.id,
      selisih,
      teks: `#${m.id} ${LABEL_JENIS[m.jenis as keyof typeof LABEL_JENIS] ?? m.jenis} — ${escapeMarkdown(m.judul)} (${escapeMarkdown(m.pihak.nama)})\nSisa: ${formatRupiah(sisa < 0n ? 0n : sisa)} | ${label} (${status})`,
    });
  }

  // Urut berdasarkan tanggal acuan, bukan jatuhTempo transaksi — untuk yang
  // bercicilan keduanya bisa jauh berbeda.
  return hasil.sort((a, b) => a.selisih - b.selisih).map(({ id, teks }) => ({ id, teks }));
}

export async function tandaiTerkirim(
  muamalahId: number,
  urutanCicilan: number,
  offsetHari: number
) {
  await prisma.pengingat.upsert({
    where: {
      muamalahId_urutanCicilan_offsetHari: { muamalahId, urutanCicilan, offsetHari },
    },
    create: { muamalahId, urutanCicilan, offsetHari, terkirimPada: new Date() },
    update: { terkirimPada: new Date() },
  });
}

/**
 * Tujuan pengingat: grup bila GROUP_ID diset, selain itu chat pribadi tiap admin env.
 */
export function targetPengingat(): string[] {
  return config.groupId ? [config.groupId] : config.adminIds;
}

export async function kirimPengingatKeGrup(bot: Bot<BotContext>) {
  const items = await prosesPengingatJatuhTempo();
  if (items.length === 0) return 0;

  const kelompok = new Map<string, string[]>();
  for (const item of items) {
    const list = kelompok.get(item.urgensi) ?? [];
    list.push(item.teks);
    kelompok.set(item.urgensi, list);
  }

  const bagian = [...kelompok.entries()].map(
    ([urgensi, teksList]) => `*${urgensi}*\n` + teksList.join("\n\n")
  );
  const pesan = "⏰ *Pengingat Jatuh Tempo*\n\n" + bagian.join("\n\n");

  let berhasil = 0;
  for (const chatId of targetPengingat()) {
    try {
      await bot.api.sendMessage(chatId, pesan, { parse_mode: "Markdown" });
      berhasil++;
    } catch (err) {
      console.error(`[reminder] Gagal mengirim pengingat ke chat ${chatId}:`, err);
    }
  }
  // Jangan tandai terkirim kalau tidak ada satu pun tujuan yang berhasil,
  // supaya pengingat yang sama dicoba lagi besok.
  if (berhasil === 0) return 0;

  for (const item of items) {
    await tandaiTerkirim(item.muamalahId, item.urutanCicilan, item.offsetHari);
  }

  return items.length;
}
