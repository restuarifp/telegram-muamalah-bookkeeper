import { InlineKeyboard } from "grammy";
import { isSuperadmin } from "../types.js";
import type { BotContext, Convo } from "../bot-context.js";
import {
  TemplateGandaError,
  ambilTemplateByKode,
  daftarkanTemplateDariTautan,
} from "../services/dokumenService.js";
import { NextcloudError, TautanTidakValidError } from "../services/nextcloud.js";
import { catatAudit } from "../middlewares/audit.js";
import { OPSI_TAUTAN, escapeHtml, formatUkuran, tautanTersamar } from "../utils/tautan.js";
import { menuUtama } from "../handlers/menu.js";

const CONTOH_TAUTAN =
  "Contoh bentuk yang diterima:\n" +
  "• tautan berkas dari web Nextcloud (…/apps/files/files/123?dir=…)\n" +
  "• permalink “Copy direct link” (…/f/123)\n" +
  "• link berbagi (…/s/xxxxxxxx)\n" +
  "• path langsung, mis. /Documents/Akad Muamalah/Template Akad/Qardh.docx";

/**
 * Wizard pendaftaran template akad. Template **tidak diunggah** lewat Telegram:
 * berkasnya sudah ada di Nextcloud, dan yang dicatat bot hanya penunjuk ke sana.
 *
 * Dipakai dua arah:
 * - tanpa `kodeAwal`: mendaftarkan template baru (menanyakan kode & judul);
 * - dengan `kodeAwal`: mengarahkan kode yang sudah ada ke berkas lain, langsung
 *   ke langkah tautan supaya admin tidak mengetik ulang kode & judulnya.
 */
export async function tambahTemplateConvo(
  conversation: Convo,
  ctx: BotContext,
  kodeAwal?: string
) {
  const operator = ctx.operator;
  if (!isSuperadmin(operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
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
      `Mengarahkan template <b>${escapeHtml(lama.judul)}</b> (kode: ${escapeHtml(lama.kode)}) ke berkas lain.\n` +
        `Berkas lamanya dibiarkan apa adanya di Nextcloud.\n\n` +
        `Kirim tautan Nextcloud berkas penggantinya.\n\n${CONTOH_TAUTAN}`,
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

    await ctx.reply(
      `Kirim tautan Nextcloud ke berkas templatenya.\n\n${CONTOH_TAUTAN}`,
      { reply_markup: batalKb }
    );
  }

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

    let template;
    try {
      template = await conversation.external(() =>
        daftarkanTemplateDariTautan({ kode: kode!, judul: judul!, tautan: tautanTeks })
      );
    } catch (err) {
      // Tautan salah ketik itu hal biasa, jadi wizard tidak keluar — admin bisa
      // langsung menempel ulang tanpa mengisi kode & judul dari awal.
      if (err instanceof TautanTidakValidError || err instanceof TemplateGandaError) {
        await ctx.reply(`⚠️ ${err.message}\n\nKirim tautan lain, atau batalkan.`, {
          reply_markup: batalKb,
        });
        continue;
      }
      const pesan =
        err instanceof NextcloudError
          ? `Nextcloud menolak permintaan: ${err.message}`
          : "Gagal mendaftarkan template.";
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
      `✅ Template <b>${escapeHtml(template.judul)}</b> (kode: ${escapeHtml(template.kode)}) terdaftar.\n` +
        `Berkas: ${escapeHtml(template.namaFile)} (${formatUkuran(template.ukuran)})${tautan}`,
      { ...OPSI_TAUTAN, reply_markup: menuUtama() }
    );
    return;
  }
}
