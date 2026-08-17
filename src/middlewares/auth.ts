import type { NextFunction } from "grammy";
import { prisma } from "../db.js";
import type { BotContext } from "../bot-context.js";
import { config } from "../config.js";
import { isRole } from "../types.js";

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

export async function requireAdmin(ctx: BotContext, next: NextFunction) {
  if (!ctx.operator || ctx.operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await next();
}
