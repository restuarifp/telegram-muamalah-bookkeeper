import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../bot-context.js";

export const menuComposer = new Composer<BotContext>();

export function menuUtama(): InlineKeyboard {
  return new InlineKeyboard()
    .text("➕ Tambah", "menu:tambah")
    .text("📋 Daftar", "menu:list")
    .row()
    .text("📎 Dokumen & Template", "menu:dokumen")
    .row()
    .text("📊 Rekap", "menu:rekap")
    .text("⏰ Jatuh Tempo", "menu:jatuhtempo")
    .row()
    .text("👤 Operator", "menu:operator");
}

const TEKS_SAMBUTAN =
  "🕌 *Bot Muamalah*\n\n" +
  "Pencatatan utang-piutang, investasi, dan akad non-tunai lainnya.\n" +
  "Pilih menu di bawah, atau ketik perintah langsung (mis. /list, /rekap).";

menuComposer.command(["start", "menu"], async (ctx) => {
  await ctx.reply(TEKS_SAMBUTAN, { parse_mode: "Markdown", reply_markup: menuUtama() });
});

menuComposer.callbackQuery("menu:utama", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageText(TEKS_SAMBUTAN, { parse_mode: "Markdown", reply_markup: menuUtama() });
});

menuComposer.callbackQuery("menu:tambah", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator. Hubungi admin grup.");
    return;
  }
  await ctx.conversation.enter("tambahMuamalah");
});

menuComposer.command("tambah", async (ctx) => {
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator. Hubungi admin grup.");
    return;
  }
  await ctx.conversation.enter("tambahMuamalah");
});

menuComposer.callbackQuery("menu:dokumen", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply(
    "📎 Dokumen & Template\n\n" +
      "/list — pilih transaksi lalu unggah/unduh dokumen akadnya\n" +
      "/template — daftar template akad siap unduh"
  );
});

menuComposer.callbackQuery("menu:operator", async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.reply("👤 Manajemen operator:\n/operator_list — lihat daftar operator\n/operator_tambah — tambah operator (admin)");
});
