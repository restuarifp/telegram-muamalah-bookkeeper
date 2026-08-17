import cron from "node-cron";
import type { Bot } from "grammy";
import type { BotContext } from "../bot-context.js";
import { config } from "../config.js";
import { kirimPengingatKeGrup } from "../services/pengingatService.js";

/**
 * Jadwalkan pengecekan jatuh tempo setiap hari jam 08:00 waktu Asia/Jakarta.
 */
export function jadwalkanReminderHarian(bot: Bot<BotContext>) {
  cron.schedule(
    "0 8 * * *",
    async () => {
      try {
        const jumlah = await kirimPengingatKeGrup(bot);
        if (jumlah > 0) {
          console.log(`[reminder] ${jumlah} pengingat jatuh tempo terkirim.`);
        }
      } catch (err) {
        console.error("[reminder] Gagal mengirim pengingat:", err);
      }
    },
    { timezone: config.timezone }
  );
  console.log(`[reminder] Terjadwal harian 08:00 ${config.timezone}.`);
}
