import { Composer, InlineKeyboard, InputFile } from "grammy";
import type { BotContext } from "../bot-context.js";
import { daftarTemplate, ambilDokumen } from "../services/dokumenService.js";
import { menuUtama } from "./menu.js";

export const dokumenComposer = new Composer<BotContext>();

async function kirimUlangFile(
  ctx: BotContext,
  telegramFileId: string,
  pathLokal: string,
  namaFile: string
) {
  try {
    // Jalur cepat: kirim ulang via file_id Telegram tanpa upload ulang.
    await ctx.replyWithDocument(telegramFileId);
  } catch {
    // Fallback: file_id sudah kedaluwarsa, kirim dari salinan lokal.
    await ctx.replyWithDocument(new InputFile(pathLokal, namaFile));
  }
}

dokumenComposer.command("template", async (ctx) => {
  const templates = await daftarTemplate();
  if (templates.length === 0) {
    await ctx.reply("Belum ada template akad yang tersedia. Admin bisa menambah lewat /template_tambah.");
    return;
  }
  const kb = new InlineKeyboard();
  for (const t of templates) kb.text(t.judul, `dokumen:template:${t.id}`).row();
  kb.text("🏠 Menu", "menu:utama");
  await ctx.reply("📎 Template akad tersedia:", { reply_markup: kb });
});

dokumenComposer.callbackQuery(/^dokumen:template:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  const templates = await daftarTemplate();
  const t = templates.find((x) => x.id === id);
  if (!t) {
    await ctx.reply("Template tidak ditemukan.");
    return;
  }
  await kirimUlangFile(ctx, t.telegramFileId, t.pathLokal, t.judul);
});

dokumenComposer.command("template_tambah", async (ctx) => {
  if (!ctx.operator || ctx.operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await ctx.conversation.enter("tambahTemplate");
});

dokumenComposer.callbackQuery(/^dokumen:unduh:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  const dok = await ambilDokumen(id);
  if (!dok) {
    await ctx.reply("Dokumen tidak ditemukan.");
    return;
  }
  await kirimUlangFile(ctx, dok.telegramFileId, dok.pathLokal, dok.namaFile);
});
