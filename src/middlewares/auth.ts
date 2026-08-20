import type { NextFunction } from "grammy";
import { prisma } from "../db.js";
import type { BotContext } from "../bot-context.js";
import { config } from "../config.js";
import { isRole, isSuperadmin } from "../types.js";
import { bolehAksesKantorUntuk, lingkupKantorUntuk } from "../services/akses.js";

export function chatDiizinkan(chatId?: number | string, userId?: number | string): boolean {
  if (config.groupId && chatId?.toString() === config.groupId) return true;
  return userId !== undefined && config.adminIds.includes(userId.toString());
}

/**
 * Gerbang paling luar: update dari luar GROUP_ID (bila diset) hanya diteruskan
 * jika pengirimnya admin yang terdaftar di ADMIN_IDS. Bila GROUP_ID kosong, bot
 * dipakai langsung lewat chat pribadi dan hanya admin env yang direspons.
 * Update lain didiamkan tanpa balasan, supaya bot tidak bocor ke chat asing.
 */
export async function batasiAkses(ctx: BotContext, next: NextFunction) {
  if (!chatDiizinkan(ctx.chat?.id, ctx.from?.id)) return;
  await next();
}

/**
 * Melekatkan ctx.operator jika pengirim pesan terdaftar sebagai operator aktif.
 * Tidak memblokir apa pun di sini — pemblokiran dilakukan oleh requireOperator/requireAdmin
 * pada handler yang butuh otorisasi, sehingga perintah publik (mis. /template) tetap bisa
 * diakses siapa pun di grup.
 */
export async function attachOperator(ctx: BotContext, next: NextFunction) {
  const telegramUserId = ctx.from?.id?.toString();
  if (telegramUserId) {
    const operator = await prisma.operator.findUnique({ where: { telegramUserId } });
    if (operator && operator.aktif && isRole(operator.role)) {
      ctx.operator = operator as BotContext["operator"];
    }
  }
  await next();
}

export async function requireOperator(ctx: BotContext, next: NextFunction) {
  if (!ctx.operator) {
    await ctx.reply(
      "⛔ Anda belum terdaftar sebagai operator. Hubungi admin grup untuk didaftarkan."
    );
    return;
  }
  await next();
}

export async function requireSuperadmin(ctx: BotContext, next: NextFunction) {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
    return;
  }
  await next();
}

/**
 * Kantor mana saja yang boleh dibaca pemanggil, dalam bentuk yang langsung bisa
 * dipakai sebagai filter query:
 *   number    → dibatasi ke satu kantor (operator, atau superadmin yang memfilter)
 *   undefined → semua kantor (superadmin tanpa filter)
 *   null      → tidak berhak melihat apa pun (bukan operator, atau operator
 *               tanpa kantor — data yang tidak sah, jangan diam-diam dibuka)
 *
 * Semua daftar/rekap harus lewat sini, bukan membaca ctx.operator.kantorId
 * sendiri, supaya filter superadmin dan pembatasan operator punya satu sumber.
 */
export function lingkupKantor(ctx: BotContext): number | undefined | null {
  return lingkupKantorUntuk(ctx.operator, ctx.session.kantorFilter);
}

/** Apakah pemanggil boleh membuka satu transaksi milik kantor tertentu. */
export function bolehAksesKantor(ctx: BotContext, kantorId: number): boolean {
  return bolehAksesKantorUntuk(ctx.operator, kantorId, ctx.session.kantorFilter);
}
