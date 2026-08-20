import { Composer } from "grammy";
import type { BotContext } from "../bot-context.js";
import { rekapRingkasan } from "../services/muamalahService.js";
import { ringkasanJatuhTempoTampilan } from "../services/pengingatService.js";
import { escapeMarkdown, formatRupiah, LABEL_JENIS } from "../utils/format.js";
import { menuUtama } from "./menu.js";
import { lingkupKantor } from "../middlewares/auth.js";
import { prisma } from "../db.js";
import type { JenisMuamalah } from "../types.js";

export const laporanComposer = new Composer<BotContext>();

/**
 * Lingkup kantor pemanggil + labelnya untuk judul laporan, atau null kalau ia
 * memang tidak berhak melihat apa pun.
 */
async function lingkupLaporan(
  ctx: BotContext
): Promise<{ kantorId?: number; label: string } | null> {
  const lingkup = lingkupKantor(ctx);
  if (lingkup === null) {
    await ctx.reply(
      "⛔ Anda belum terdaftar sebagai operator kantor mana pun. Hubungi superadmin untuk didaftarkan."
    );
    return null;
  }
  if (lingkup === undefined) return { label: "Semua Kantor" };
  const kantor = await prisma.kantor.findUnique({ where: { id: lingkup } });
  return { kantorId: lingkup, label: kantor?.nama ?? `Kantor #${lingkup}` };
}

async function kirimRekap(ctx: BotContext, edit: boolean) {
  const lingkup = await lingkupLaporan(ctx);
  if (!lingkup) return;
  const { totals, jatuhTempoBulanIni, jumlahAktif } = await rekapRingkasan(lingkup.kantorId);

  const baris = (Object.keys(totals) as JenisMuamalah[])
    .filter((j) => totals[j] > 0n)
    .map((j) => `• ${LABEL_JENIS[j]}: ${formatRupiah(totals[j])}`);

  const teks =
    `📊 *Rekap Muamalah Aktif — ${escapeMarkdown(lingkup.label)}*\n\n` +
    (baris.length ? baris.join("\n") : "Tidak ada transaksi aktif.") +
    `\n\nTotal transaksi aktif: ${jumlahAktif}\n` +
    `Jatuh tempo bulan ini: ${jatuhTempoBulanIni}`;

  if (edit) await ctx.editMessageText(teks, { parse_mode: "Markdown", reply_markup: menuUtama(ctx) });
  else await ctx.reply(teks, { parse_mode: "Markdown", reply_markup: menuUtama(ctx) });
}

laporanComposer.command("rekap", async (ctx) => kirimRekap(ctx, false));
laporanComposer.callbackQuery("menu:rekap", async (ctx) => {
  await ctx.answerCallbackQuery();
  await kirimRekap(ctx, false);
});

async function kirimRingkasanJatuhTempo(ctx: BotContext) {
  const lingkup = await lingkupLaporan(ctx);
  if (!lingkup) return;
  const items = await ringkasanJatuhTempoTampilan(lingkup.kantorId);
  if (items.length === 0) {
    await ctx.reply(
      `✅ Tidak ada transaksi ${lingkup.label} yang jatuh tempo dalam 7 hari ke depan.`,
      { reply_markup: menuUtama(ctx) }
    );
    return;
  }
  const teks =
    `⏰ *Jatuh Tempo — ${escapeMarkdown(lingkup.label)} (7 hari ke depan & terlambat)*\n\n` +
    items.map((i) => i.teks).join("\n\n");
  await ctx.reply(teks, { parse_mode: "Markdown", reply_markup: menuUtama(ctx) });
}

laporanComposer.command("jatuhtempo", kirimRingkasanJatuhTempo);
laporanComposer.callbackQuery("menu:jatuhtempo", async (ctx) => {
  await ctx.answerCallbackQuery();
  await kirimRingkasanJatuhTempo(ctx);
});
