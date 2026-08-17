import { GrammyError, HttpError } from "grammy";
import type { BotError } from "grammy";
import type { BotContext } from "../bot-context.js";

export async function handleBotError(err: BotError<BotContext>) {
  const ctx = err.ctx;
  const e = err.error;

  if (e instanceof GrammyError) {
    console.error(`[grammy] Gagal memproses update ${ctx.update.update_id}:`, e.description);
  } else if (e instanceof HttpError) {
    console.error(`[http] Tidak bisa menghubungi Telegram:`, e);
  } else {
    console.error(`[unknown] Error tak terduga:`, e);
  }

  try {
    await ctx.reply("⚠️ Terjadi kesalahan saat memproses permintaan. Silakan coba lagi.");
  } catch {
    // abaikan jika reply pun gagal (mis. bot dikeluarkan dari grup)
  }
}
