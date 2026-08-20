import { prisma } from "../db.js";
import { mulaiWebServer } from "./server.js";

/**
 * Titik masuk untuk menjalankan **hanya** web UI (`npm run web`), tanpa bot yang
 * polling. Berguna saat web dan bot dijalankan sebagai proses/kontainer
 * terpisah, atau saat mengembangkan tampilan tanpa mengganggu bot yang sedang
 * hidup — dua proses grammY yang polling dengan token sama akan saling rebut
 * update.
 *
 * Kode login tetap terkirim: pengirimannya lewat Api grammY, bukan lewat bot
 * yang menerima update (lihat src/web/telegram.ts).
 */
mulaiWebServer();

async function berhenti() {
  await prisma.$disconnect();
  process.exit(0);
}

process.on("SIGINT", berhenti);
process.on("SIGTERM", berhenti);
