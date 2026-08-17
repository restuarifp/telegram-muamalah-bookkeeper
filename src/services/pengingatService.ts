import { prisma } from "../db.js";
import { config } from "../config.js";
import {
  escapeMarkdown,
  formatRupiah,
  formatTanggal,
  ringkasSkemaCicilan,
  LABEL_JENIS,
} from "../utils/format.js";
import type { Bot } from "grammy";
import type { BotContext } from "../bot-context.js";

const OFFSET_PENGINGAT = [7, 3, 1, 0]; // H-7, H-3, H-1, H-0

function tanggalHariIni(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

function tambahHari(d: Date, hari: number): Date {
  const hasil = new Date(d);
  hasil.setUTCDate(hasil.getUTCDate() + hari);
  return hasil;
}

/**
 * Cari muamalah aktif yang jatuh tempo persis pada H-7/H-3/H-1/H-0 (kirim sekali per offset,
 * dicatat di tabel Pengingat), plus yang sudah lewat jatuh tempo dan belum diingatkan minggu ini.
 * Mengembalikan daftar pesan siap kirim, dikelompokkan per urgensi.
 */
export async function prosesPengingatJatuhTempo() {
  const hariIni = tanggalHariIni();

  // Tidak ada lagi penulisan status di sini: keterlambatan dihitung dari
  // jatuhTempo saat dibaca, jadi mengedit jatuhTempo langsung tercermin tanpa
  // perlu ada job yang membetulkan status. DRAFT & BATAL tidak diingatkan.
  const kandidat = await prisma.muamalah.findMany({
    where: {
      status: "BERJALAN",
      jatuhTempo: { not: null },
    },
    include: { pihak: true, angsuran: true },
  });

  const akanDikirim: { muamalahId: number; offsetHari: number; teks: string; urgensi: string }[] = [];

  for (const m of kandidat) {
    if (!m.jatuhTempo) continue;
    const jt = new Date(Date.UTC(m.jatuhTempo.getFullYear(), m.jatuhTempo.getMonth(), m.jatuhTempo.getDate()));
    const selisihHari = Math.round((jt.getTime() - hariIni.getTime()) / 86_400_000);

    let offsetKey: number | null = null;
    let urgensi = "";
    if (OFFSET_PENGINGAT.includes(selisihHari)) {
      offsetKey = selisihHari;
      urgensi = selisihHari === 0 ? "Jatuh tempo hari ini" : `H-${selisihHari}`;
    } else if (selisihHari < 0) {
      // Sudah lewat: kirim ulang setiap kelipatan 7 hari keterlambatan, key negatif unik per minggu.
      const mingguTerlambat = Math.floor(-selisihHari / 7);
      offsetKey = -1000 - mingguTerlambat; // namespace terpisah dari offset utama
      urgensi = `Terlambat ${-selisihHari} hari`;
    }
    if (offsetKey === null) continue;

    const sudah = await prisma.pengingat.findUnique({
      where: { muamalahId_offsetHari: { muamalahId: m.id, offsetHari: offsetKey } },
    });
    if (sudah?.terkirimPada) continue;

    const sisa = m.pokok - m.angsuran.reduce((s, a) => s + a.jumlah, 0n);
    const skema = ringkasSkemaCicilan(m);
    // judul & nama pihak diketik operator, jadi harus di-escape: teks ini dikirim
    // dengan parse_mode "Markdown".
    const teks =
      `#${m.id} ${LABEL_JENIS[m.jenis as keyof typeof LABEL_JENIS] ?? m.jenis} — ${escapeMarkdown(m.judul)}\n` +
      `Pihak: ${escapeMarkdown(m.pihak.nama)} | Sisa: ${formatRupiah(sisa < 0n ? 0n : sisa)}\n` +
      (skema ? `Cicilan: ${skema}\n` : "") +
      `Jatuh tempo: ${formatTanggal(m.jatuhTempo)}`;

    akanDikirim.push({ muamalahId: m.id, offsetHari: offsetKey, teks, urgensi });
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
      jatuhTempo: { not: null },
    },
    include: { pihak: true, angsuran: true },
    orderBy: { jatuhTempo: "asc" },
  });

  return items
    .filter((m) => m.jatuhTempo && Math.round((m.jatuhTempo.getTime() - hariIni.getTime()) / 86_400_000) <= 7)
    .map((m) => {
      const sisa = m.pokok - m.angsuran.reduce((s, a) => s + a.jumlah, 0n);
      const selisihHari = Math.round((m.jatuhTempo!.getTime() - hariIni.getTime()) / 86_400_000);
      const status = selisihHari < 0 ? `terlambat ${-selisihHari} hari` : selisihHari === 0 ? "hari ini" : `H-${selisihHari}`;
      return {
        id: m.id,
        teks: `#${m.id} ${LABEL_JENIS[m.jenis as keyof typeof LABEL_JENIS] ?? m.jenis} — ${escapeMarkdown(m.judul)} (${escapeMarkdown(m.pihak.nama)})\nSisa: ${formatRupiah(sisa < 0n ? 0n : sisa)} | Jatuh tempo: ${formatTanggal(m.jatuhTempo)} (${status})`,
      };
    });
}

export async function tandaiTerkirim(muamalahId: number, offsetHari: number) {
  await prisma.pengingat.upsert({
    where: { muamalahId_offsetHari: { muamalahId, offsetHari } },
    create: { muamalahId, offsetHari, terkirimPada: new Date() },
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
    await tandaiTerkirim(item.muamalahId, item.offsetHari);
  }

  return items.length;
}
