import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import {
  ambilDokumen,
  ambilTemplate,
  ubahJudulTemplate,
  ubahNamaDokumen,
} from "../services/dokumenService.js";
import { NextcloudError } from "../services/nextcloud.js";
import { catatAudit } from "../middlewares/audit.js";
import { escapeHtml } from "../utils/tautan.js";
import { menuUtama } from "../handlers/menu.js";

const batalKb = () => new InlineKeyboard().text("❌ Batal", "wizard:batal");

/** Menunggu satu baris teks; mengembalikan null bila operator membatalkan. */
async function tanyaTeks(
  conversation: Convo,
  ctx: BotContext,
  pertanyaan: string
): Promise<string | null> {
  await ctx.reply(pertanyaan, { parse_mode: "HTML", reply_markup: batalKb() });
  while (true) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return null;
    }
    const teks = next.message?.text?.trim();
    if (teks) return teks;
  }
}

/**
 * Mengubah nama berkas dokumen akad. Rename dilakukan di Nextcloud (WebDAV MOVE)
 * lebih dulu, baru dicatat di database — kalau MOVE gagal, DB tetap konsisten
 * dengan isi Nextcloud.
 */
export async function ubahNamaDokumenConvo(
  conversation: Convo,
  ctx: BotContext,
  dokumenId: number
) {
  if (!ctx.operator) {
    await ctx.reply("⛔ Sesi operator tidak ditemukan.");
    return;
  }

  const dok = await conversation.external(() => ambilDokumen(dokumenId));
  if (!dok) {
    await ctx.reply("Dokumen tidak ditemukan (mungkin sudah dihapus).");
    return;
  }

  const namaBaru = await tanyaTeks(
    conversation,
    ctx,
    `Nama baru untuk <b>${escapeHtml(dok.namaFile)}</b>?\n` +
      `Ekstensi ditambahkan otomatis kalau tidak diketik.`
  );
  if (!namaBaru) return;

  try {
    const hasil = await conversation.external(() => ubahNamaDokumen(dokumenId, namaBaru));
    if (!hasil) {
      await ctx.reply("Dokumen tidak ditemukan.", { reply_markup: menuUtama() });
      return;
    }
    await conversation.external(() =>
      catatAudit(ctx, "UPDATE", "Dokumen", dokumenId, {
        dari: dok.namaFile,
        ke: hasil.namaFile,
      })
    );
    await ctx.reply(`✅ Dokumen kini bernama <b>${escapeHtml(hasil.namaFile)}</b>.`, {
      parse_mode: "HTML",
      reply_markup: menuUtama(),
    });
  } catch (err) {
    const pesan =
      err instanceof NextcloudError
        ? `Nextcloud menolak perubahan: ${err.message}`
        : "Gagal mengubah nama dokumen.";
    await ctx.reply(`⚠️ ${pesan}`, { reply_markup: menuUtama() });
  }
}

/**
 * Mengubah judul tampilan template. Hanya menyentuh database — nama berkasnya di
 * Nextcloud dibiarkan, karena judul di bot adalah label untuk operator sedangkan
 * nama berkas dipegang oleh yang mengelola folder Nextcloud.
 */
export async function ubahJudulTemplateConvo(
  conversation: Convo,
  ctx: BotContext,
  templateId: number
) {
  if (!ctx.operator || ctx.operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }

  const template = await conversation.external(() => ambilTemplate(templateId));
  if (!template) {
    await ctx.reply("Template tidak ditemukan (mungkin sudah dihapus).");
    return;
  }

  const judulBaru = await tanyaTeks(
    conversation,
    ctx,
    `Judul baru untuk template <b>${escapeHtml(template.judul)}</b>?`
  );
  if (!judulBaru) return;

  const hasil = await conversation.external(() => ubahJudulTemplate(templateId, judulBaru));
  await conversation.external(() =>
    catatAudit(ctx, "UPDATE", "Template", templateId, { dari: template.judul, ke: hasil.judul })
  );
  await ctx.reply(`✅ Template kini berjudul <b>${escapeHtml(hasil.judul)}</b>.`, {
    parse_mode: "HTML",
    reply_markup: menuUtama(),
  });
}
