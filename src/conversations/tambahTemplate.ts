import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { config } from "../config.js";
import { validasiDokumen, tambahTemplate } from "../services/dokumenService.js";
import { catatAudit } from "../middlewares/audit.js";
import { menuUtama } from "../handlers/menu.js";

async function unduhFileTelegram(ctx: BotContext, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh file dari Telegram: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export async function tambahTemplateConvo(conversation: Convo, ctx: BotContext) {
  const operator = ctx.operator;
  if (!operator || operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }

  const batalKb = new InlineKeyboard().text("❌ Batal", "wizard:batal");

  await ctx.reply("Kode singkat template ini? (contoh: qardh, mudharabah)", { reply_markup: batalKb });
  let kode: string | null = null;
  while (!kode) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }
    kode = next.message?.text?.trim().toLowerCase().replace(/\s+/g, "-") ?? null;
  }

  await ctx.reply("Judul lengkap template ini?", { reply_markup: batalKb });
  let judul: string | null = null;
  while (!judul) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }
    judul = next.message?.text?.trim() ?? null;
  }

  await ctx.reply("Kirim file template-nya (PDF/DOC/DOCX):", { reply_markup: batalKb });
  while (true) {
    const next = await conversation.waitFor(["message:document", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }
    const doc = next.message?.document;
    if (!doc) continue;

    const error = validasiDokumen(doc.mime_type, doc.file_size);
    if (error) {
      await ctx.reply(`⚠️ ${error} Kirim ulang file yang sesuai.`);
      continue;
    }

    const isiFile = await conversation.external(() => unduhFileTelegram(ctx, doc.file_id));
    const template = await conversation.external(() =>
      tambahTemplate({
        kode: kode!,
        judul: judul!,
        telegramFileId: doc.file_id,
        isiFile,
        namaFile: doc.file_name ?? `${kode}.pdf`,
      })
    );
    await conversation.external(() =>
      catatAudit(ctx, "CREATE", "Template", template.id, { kode: kode! })
    );

    await ctx.reply(`✅ Template "${judul}" (kode: ${kode}) tersimpan.`, { reply_markup: menuUtama() });
    return;
  }
}
