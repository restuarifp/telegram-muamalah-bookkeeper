import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { config } from "../config.js";
import { validasiDokumen, simpanDokumen } from "../services/dokumenService.js";
import { catatAudit } from "../middlewares/audit.js";
import { menuUtama } from "../handlers/menu.js";

async function unduhFileTelegram(ctx: BotContext, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh file dari Telegram: ${res.status}`);
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

export async function uploadDokumenConvo(conversation: Convo, ctx: BotContext, muamalahId: number) {
  const operator = ctx.operator;
  if (!operator) {
    await ctx.reply("⛔ Sesi operator tidak ditemukan.");
    return;
  }

  await ctx.reply(
    `Kirim dokumen akad untuk transaksi #${muamalahId} (PDF, JPG, PNG, atau DOC/DOCX, maks 20 MB).`,
    { reply_markup: new InlineKeyboard().text("❌ Batal", "wizard:batal") }
  );

  while (true) {
    const next = await conversation.waitFor(["message:document", "message:photo", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }

    const doc = next.message?.document;
    const photo = next.message?.photo?.at(-1); // resolusi tertinggi

    let fileId: string;
    let namaFile: string;
    let mimeType: string;
    let fileSize: number | undefined;

    if (doc) {
      fileId = doc.file_id;
      namaFile = doc.file_name ?? `dokumen-${Date.now()}`;
      mimeType = doc.mime_type ?? "application/octet-stream";
      fileSize = doc.file_size;
    } else if (photo) {
      fileId = photo.file_id;
      namaFile = `foto-${Date.now()}.jpg`;
      mimeType = "image/jpeg";
      fileSize = photo.file_size;
    } else {
      continue;
    }

    const error = validasiDokumen(mimeType, fileSize);
    if (error) {
      await ctx.reply(`⚠️ ${error} Kirim ulang dokumen yang sesuai, atau batalkan.`);
      continue;
    }

    const isiFile = await conversation.external(() => unduhFileTelegram(ctx, fileId));
    const dokumen = await conversation.external(() =>
      simpanDokumen({
        muamalahId,
        namaFile,
        mimeType,
        telegramFileId: fileId,
        isiFile,
        jenis: "AKAD",
        diunggahOlehId: operator.id,
      })
    );
    await conversation.external(() =>
      catatAudit(ctx, "CREATE", "Dokumen", dokumen.id, { muamalahId, namaFile })
    );

    await ctx.reply(`✅ Dokumen "${namaFile}" tersimpan untuk transaksi #${muamalahId}.`, {
      reply_markup: menuUtama(),
    });
    return;
  }
}
