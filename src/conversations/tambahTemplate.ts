import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { validasiDokumen, tambahTemplate, ambilTemplateByKode } from "../services/dokumenService.js";
import { NextcloudError } from "../services/nextcloud.js";
import { catatAudit } from "../middlewares/audit.js";
import { berkasDariPesan, unduhFileTelegram } from "../utils/telegramFile.js";
import { OPSI_TAUTAN, escapeHtml, tautanTersamar } from "../utils/tautan.js";
import { menuUtama } from "../handlers/menu.js";

/**
 * Wizard tambah/ganti template akad. Dipakai dua arah:
 * - tanpa `kodeAwal`: membuat template baru (menanyakan kode & judul);
 * - dengan `kodeAwal`: mengganti berkas template yang sudah ada, langsung ke
 *   langkah unggah supaya admin tidak perlu mengetik ulang kode & judulnya.
 */
export async function tambahTemplateConvo(
  conversation: Convo,
  ctx: BotContext,
  kodeAwal?: string
) {
  const operator = ctx.operator;
  if (!operator || operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }

  const batalKb = new InlineKeyboard().text("❌ Batal", "wizard:batal");
  let kode = kodeAwal ?? null;
  let judul: string | null = null;

  if (kode) {
    const lama = await conversation.external(() => ambilTemplateByKode(kode!));
    if (!lama) {
      await ctx.reply("Template tidak ditemukan (mungkin sudah dihapus).");
      return;
    }
    judul = lama.judul;
    await ctx.reply(
      `Mengganti berkas template <b>${escapeHtml(lama.judul)}</b> (kode: ${escapeHtml(lama.kode)}).\n` +
        `Kirim berkas penggantinya (PDF/DOC/DOCX). Berkas lama akan dihapus dari Nextcloud.`,
      { parse_mode: "HTML", reply_markup: batalKb }
    );
  } else {
    await ctx.reply("Kode singkat template ini? (contoh: qardh, mudharabah)", {
      reply_markup: batalKb,
    });
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
  }

  while (true) {
    const next = await conversation.waitFor(["message:document", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }

    const berkas = berkasDariPesan(next);
    if (!berkas) continue;

    const error = validasiDokumen(berkas.mimeType, berkas.ukuran);
    if (error) {
      await ctx.reply(`⚠️ ${error} Kirim ulang file yang sesuai.`);
      continue;
    }

    await ctx.reply("⏳ Mengunggah ke Nextcloud…");

    let template;
    try {
      const isiFile = await conversation.external(() => unduhFileTelegram(ctx, berkas.fileId));
      template = await conversation.external(() =>
        tambahTemplate({
          kode: kode!,
          judul: judul!,
          namaFile: berkas.namaFile,
          mimeType: berkas.mimeType,
          isiFile,
        })
      );
    } catch (err) {
      const pesan =
        err instanceof NextcloudError
          ? `Nextcloud menolak unggahan: ${err.message}`
          : "Gagal mengunggah template.";
      await ctx.reply(`⚠️ ${pesan} Coba lagi, atau hubungi admin.`, { reply_markup: menuUtama() });
      return;
    }

    await conversation.external(() =>
      catatAudit(ctx, kodeAwal ? "UPDATE" : "CREATE", "Template", template!.id, {
        kode: kode!,
        remotePath: template!.remotePath,
      })
    );

    const tautan = template.shareUrl
      ? `\n${tautanTersamar(`📄 Buka ${template.namaFile}`, template.shareUrl)}`
      : "";
    await ctx.reply(
      `✅ Template <b>${escapeHtml(template.judul)}</b> (kode: ${escapeHtml(template.kode)}) tersimpan di Nextcloud.${tautan}`,
      { ...OPSI_TAUTAN, reply_markup: menuUtama() }
    );
    return;
  }
}
