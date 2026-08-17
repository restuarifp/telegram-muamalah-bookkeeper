import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { validasiDokumen, simpanDokumen } from "../services/dokumenService.js";
import { detailMuamalah } from "../services/muamalahService.js";
import { NextcloudError } from "../services/nextcloud.js";
import { catatAudit } from "../middlewares/audit.js";
import { berkasDariPesan, unduhFileTelegram } from "../utils/telegramFile.js";
import { OPSI_TAUTAN, escapeHtml, tautanTersamar } from "../utils/tautan.js";
import { menuUtama } from "../handlers/menu.js";

export async function uploadDokumenConvo(conversation: Convo, ctx: BotContext, muamalahId: number) {
  const operator = ctx.operator;
  if (!operator) {
    await ctx.reply("⛔ Sesi operator tidak ditemukan.");
    return;
  }

  const muamalah = await conversation.external(() => detailMuamalah(muamalahId));
  if (!muamalah) {
    await ctx.reply("Transaksi tidak ditemukan (mungkin sudah dihapus).");
    return;
  }

  await ctx.reply(
    `Kirim dokumen akad untuk transaksi #${muamalahId} (PDF, JPG, PNG, atau DOC/DOCX, maks 20 MB).\n` +
      `Berkas akan disimpan di Nextcloud, dan yang dibagikan di chat cuma tautannya.`,
    { reply_markup: new InlineKeyboard().text("❌ Batal", "wizard:batal") }
  );

  while (true) {
    const next = await conversation.waitFor([
      "message:document",
      "message:photo",
      "callback_query:data",
    ]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }

    const berkas = berkasDariPesan(next);
    if (!berkas) continue;

    const error = validasiDokumen(berkas.mimeType, berkas.ukuran);
    if (error) {
      await ctx.reply(`⚠️ ${error} Kirim ulang dokumen yang sesuai, atau batalkan.`);
      continue;
    }

    await ctx.reply("⏳ Mengunggah ke Nextcloud…");

    let dokumen;
    try {
      const isiFile = await conversation.external(() => unduhFileTelegram(ctx, berkas.fileId));
      dokumen = await conversation.external(() =>
        simpanDokumen({
          muamalah,
          namaFile: berkas.namaFile,
          mimeType: berkas.mimeType,
          isiFile,
          jenis: "AKAD",
          diunggahOlehId: operator.id,
        })
      );
    } catch (err) {
      const pesan =
        err instanceof NextcloudError
          ? `Nextcloud menolak unggahan: ${err.message}`
          : "Gagal mengunggah dokumen.";
      await ctx.reply(`⚠️ ${pesan} Coba lagi, atau hubungi admin.`, { reply_markup: menuUtama() });
      return;
    }

    await conversation.external(() =>
      catatAudit(ctx, "CREATE", "Dokumen", dokumen!.id, {
        muamalahId,
        namaFile: dokumen!.namaFile,
        remotePath: dokumen!.remotePath,
      })
    );

    const tautan = dokumen.shareUrl
      ? `\n${tautanTersamar(`📄 Buka ${dokumen.namaFile}`, dokumen.shareUrl)}`
      : "";
    await ctx.reply(
      `✅ Dokumen <b>${escapeHtml(dokumen.namaFile)}</b> tersimpan di Nextcloud untuk transaksi #${muamalahId}.${tautan}`,
      { ...OPSI_TAUTAN, reply_markup: menuUtama() }
    );
    return;
  }
}
