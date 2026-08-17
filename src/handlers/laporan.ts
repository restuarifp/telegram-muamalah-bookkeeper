import { Composer } from "grammy";
import type { BotContext } from "../bot-context.js";
import { rekapRingkasan } from "../services/muamalahService.js";
import { ringkasanJatuhTempoTampilan } from "../services/pengingatService.js";
import { formatRupiah, LABEL_JENIS } from "../utils/format.js";
import { menuUtama } from "./menu.js";
import type { JenisMuamalah } from "../types.js";

export const laporanComposer = new Composer<BotContext>();

async function kirimRekap(ctx: BotContext, edit: boolean) {
  const { totals, jatuhTempoBulanIni, jumlahAktif } = await rekapRingkasan();

  const baris = (Object.keys(totals) as JenisMuamalah[])
    .filter((j) => totals[j] > 0n)
    .map((j) => `• ${LABEL_JENIS[j]}: ${formatRupiah(totals[j])}`);

  const teks =
    `📊 *Rekap Muamalah Aktif*\n\n` +
    (baris.length ? baris.join("\n") : "Tidak ada transaksi aktif.") +
    `\n\nTotal transaksi aktif: ${jumlahAktif}\n` +
    `Jatuh tempo bulan ini: ${jatuhTempoBulanIni}`;

  if (edit) await ctx.editMessageText(teks, { parse_mode: "Markdown", reply_markup: menuUtama() });
  else await ctx.reply(teks, { parse_mode: "Markdown", reply_markup: menuUtama() });
}

laporanComposer.command("rekap", async (ctx) => kirimRekap(ctx, false));
laporanComposer.callbackQuery("menu:rekap", async (ctx) => {
  await ctx.answerCallbackQuery();
  await kirimRekap(ctx, false);
});

async function kirimRingkasanJatuhTempo(ctx: BotContext) {
  const items = await ringkasanJatuhTempoTampilan();
  if (items.length === 0) {
    await ctx.reply("✅ Tidak ada transaksi yang jatuh tempo dalam 7 hari ke depan.", {
      reply_markup: menuUtama(),
    });
    return;
  }
  const teks = "⏰ *Jatuh Tempo (7 hari ke depan & terlambat)*\n\n" + items.map((i) => i.teks).join("\n\n");
  await ctx.reply(teks, { parse_mode: "Markdown", reply_markup: menuUtama() });
}

laporanComposer.command("jatuhtempo", kirimRingkasanJatuhTempo);
laporanComposer.callbackQuery("menu:jatuhtempo", async (ctx) => {
  await ctx.answerCallbackQuery();
  await kirimRingkasanJatuhTempo(ctx);
});
