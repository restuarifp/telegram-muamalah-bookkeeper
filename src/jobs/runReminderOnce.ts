// Menjalankan pengecekan & pengiriman pengingat jatuh tempo sekali jalan,
// tanpa menunggu jadwal cron. Berguna untuk uji manual: `npm run job:reminder`.
import { Bot } from "grammy";
import type { BotContext } from "../bot-context.js";
import { config } from "../config.js";
import { kirimPengingatKeGrup } from "../services/pengingatService.js";
import { prisma } from "../db.js";

async function main() {
  const bot = new Bot<BotContext>(config.botToken);
  const jumlah = await kirimPengingatKeGrup(bot);
  console.log(`Selesai. ${jumlah} pengingat terkirim.`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
