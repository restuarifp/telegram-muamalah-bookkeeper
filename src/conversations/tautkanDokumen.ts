import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { DokumenGandaError, daftarkanDokumenDariTautan } from "../services/dokumenService.js";
import { detailMuamalah } from "../services/muamalahService.js";
import { NextcloudError, TautanTidakValidError } from "../services/nextcloud.js";
import { catatAudit } from "../middlewares/audit.js";
import { OPSI_TAUTAN, escapeHtml, formatUkuran, tautanTersamar } from "../utils/tautan.js";
import { menuUtama } from "../handlers/menu.js";

const CONTOH_TAUTAN =
  "Bentuk yang diterima:\n" +
  "• tautan berkas dari web Nextcloud (…/apps/files/files/123?dir=…)\n" +
  "• permalink “Copy direct link” (…/f/123)\n" +
  "• link berbagi (…/s/xxxxxxxx)\n" +
  "• path langsung, mis. /Documents/Akad Muamalah/Qardh/akad.pdf";

/**
 * Mendaftarkan dokumen akad dari tautan Nextcloud, untuk berkas yang memang
 * sudah dikelola di Nextcloud dan tidak perlu bolak-balik lewat Telegram.
 * Bot hanya mencatat penunjuknya — berkasnya tidak disalin maupun dipindah.
 */
export async function tautkanDokumenConvo(
  conversation: Convo,
  ctx: BotContext,
  muamalahId: number
) {
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

  const batalKb = new InlineKeyboard().text("❌ Batal", "wizard:batal");
  await ctx.reply(
    `Kirim tautan Nextcloud ke dokumen akad untuk transaksi #${muamalahId}.\n` +
      `Berkasnya dibiarkan di tempatnya; bot cuma mencatat tautannya.\n\n${CONTOH_TAUTAN}`,
    { reply_markup: batalKb }
  );

  while (true) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }

    const tautanTeks = next.message?.text?.trim();
    if (!tautanTeks) continue;

    await ctx.reply("⏳ Memeriksa tautan di Nextcloud…");

    let dokumen;
    try {
      dokumen = await conversation.external(() =>
        daftarkanDokumenDariTautan({
          muamalah,
          tautan: tautanTeks,
          jenis: "AKAD",
          diunggahOlehId: operator.id,
        })
      );
    } catch (err) {
      // Salah tempel itu hal biasa, jadi wizard tidak keluar — operator bisa
      // langsung mengirim tautan lain.
      if (err instanceof TautanTidakValidError || err instanceof DokumenGandaError) {
        await ctx.reply(`⚠️ ${err.message}\n\nKirim tautan lain, atau batalkan.`, {
          reply_markup: batalKb,
        });
        continue;
      }
      const pesan =
        err instanceof NextcloudError
          ? `Nextcloud menolak permintaan: ${err.message}`
          : "Gagal mendaftarkan dokumen.";
      await ctx.reply(`⚠️ ${pesan} Coba lagi, atau hubungi admin.`, { reply_markup: menuUtama() });
      return;
    }

    await conversation.external(() =>
      catatAudit(ctx, "CREATE", "Dokumen", dokumen!.id, {
        muamalahId,
        remotePath: dokumen!.remotePath,
        sumber: "TAUTAN",
      })
    );

    const tautan = dokumen.shareUrl
      ? `\n${tautanTersamar(`📄 Buka ${dokumen.namaFile}`, dokumen.shareUrl)}`
      : "";
    await ctx.reply(
      `✅ Dokumen <b>${escapeHtml(dokumen.namaFile)}</b> (${formatUkuran(dokumen.ukuran)}) ` +
        `ditautkan ke transaksi #${muamalahId}.${tautan}`,
      { ...OPSI_TAUTAN, reply_markup: menuUtama() }
    );
    return;
  }
}
