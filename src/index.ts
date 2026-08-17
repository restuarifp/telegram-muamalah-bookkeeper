import fs from "node:fs/promises";
import path from "node:path";
import { Bot, session } from "grammy";
import { conversations, createConversation } from "@grammyjs/conversations";
import { config } from "./config.js";
import { prisma } from "./db.js";
import type { BotContext, SessionData } from "./bot-context.js";
import { attachOperator, batasiAkses } from "./middlewares/auth.js";
import { handleBotError } from "./middlewares/errorHandler.js";
import { menuComposer } from "./handlers/menu.js";
import { muamalahComposer } from "./handlers/muamalah.js";
import { dokumenComposer } from "./handlers/dokumen.js";
import { operatorComposer } from "./handlers/operator.js";
import { laporanComposer } from "./handlers/laporan.js";
import { groupInfoComposer } from "./handlers/groupInfo.js";
import { tambahMuamalah } from "./conversations/tambahMuamalah.js";
import { editMuamalahConvo } from "./conversations/editMuamalah.js";
import { catatAngsuranConvo } from "./conversations/catatAngsuran.js";
import { uploadDokumenConvo } from "./conversations/uploadDokumen.js";
import { tambahTemplateConvo } from "./conversations/tambahTemplate.js";
import {
  ubahJudulTemplateConvo,
  ubahNamaDokumenConvo,
} from "./conversations/ubahNamaDokumen.js";
import { jadwalkanReminderHarian } from "./jobs/reminderJob.js";
import { pastikanFolder } from "./services/nextcloud.js";

async function seedAdminAwal() {
  for (const telegramUserId of config.adminIds) {
    await prisma.operator.upsert({
      where: { telegramUserId },
      create: { telegramUserId, nama: `Admin ${telegramUserId}`, role: "ADMIN" },
      update: { role: "ADMIN", aktif: true },
    });
  }
  if (config.adminIds.length > 0) {
    console.log(`[seed] ${config.adminIds.length} admin awal dipastikan terdaftar.`);
  }
}

/**
 * Memastikan folder penyimpanan di Nextcloud ada sejak awal, sekaligus jadi
 * pemeriksaan kredensial saat start — lebih baik ketahuan di log waktu boot
 * daripada baru muncul sebagai kegagalan saat operator mengunggah dokumen.
 * Bot tetap jalan kalau Nextcloud sedang tak bisa dihubungi; fitur dokumennya
 * yang akan mengeluh, bukan seluruh bot.
 */
async function siapkanFolderNextcloud() {
  const { folderJenis, baseDir, templateDir } = config.nextcloud;
  try {
    await pastikanFolder(templateDir);
    for (const nama of new Set(Object.values(folderJenis))) {
      await pastikanFolder(`${baseDir}/${nama}`);
    }
    console.log(`[nextcloud] Folder penyimpanan siap di "${baseDir}".`);
  } catch (err) {
    console.error(
      `[nextcloud] Gagal menyiapkan folder di ${config.nextcloud.baseUrl}:`,
      err instanceof Error ? err.message : err
    );
    console.error("[nextcloud] Fitur dokumen & template akan gagal sampai ini beres.");
  }
}

// Menulis penanda waktu berkala agar HEALTHCHECK docker-compose (find -mmin -5) bisa
// mendeteksi proses masih hidup, tanpa perlu membuka port HTTP tambahan.
function jadwalkanHealthcheck() {
  const berkas = path.join(config.dataDir, "health");
  const tulis = () => fs.writeFile(berkas, new Date().toISOString()).catch(() => {});
  tulis();
  setInterval(tulis, 60_000);
}

async function main() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await siapkanFolderNextcloud();
  await seedAdminAwal();

  const bot = new Bot<BotContext>(config.botToken);

  // Paling awal, sebelum session/conversation dibuat, agar update dari chat
  // yang tidak diizinkan tidak menyentuh state apa pun.
  bot.use(batasiAkses);

  bot.use(
    session({
      initial: (): SessionData => ({}),
    })
  );
  // `plugins` wajib: di dalam conversation, grammY membangun ulang context object
  // dari update tersimpan setiap kali replay, sehingga properti yang dipasang
  // middleware luar (ctx.operator) hilang. Tanpa ini semua wizard langsung
  // berhenti dengan "Sesi operator tidak ditemukan".
  bot.use(conversations({ plugins: [attachOperator] }));
  bot.use(attachOperator);

  bot.use(createConversation(tambahMuamalah, "tambahMuamalah"));
  bot.use(createConversation(editMuamalahConvo, "editMuamalah"));
  bot.use(createConversation(catatAngsuranConvo, "catatAngsuran"));
  bot.use(createConversation(uploadDokumenConvo, "uploadDokumen"));
  bot.use(createConversation(tambahTemplateConvo, "tambahTemplate"));
  bot.use(createConversation(ubahNamaDokumenConvo, "ubahNamaDokumen"));
  bot.use(createConversation(ubahJudulTemplateConvo, "ubahJudulTemplate"));

  bot.use(groupInfoComposer);
  bot.use(menuComposer);
  bot.use(muamalahComposer);
  bot.use(dokumenComposer);
  bot.use(operatorComposer);
  bot.use(laporanComposer);

  bot.catch(handleBotError);

  await bot.api.setMyCommands([
    { command: "menu", description: "Tampilkan menu utama" },
    { command: "info", description: "Info grup ini & status koneksi bot" },
    { command: "tambah", description: "Tambah muamalah baru (lewat menu)" },
    { command: "list", description: "Daftar muamalah" },
    { command: "filter", description: "Filter daftar berdasarkan jenis" },
    { command: "rekap", description: "Rekap ringkasan muamalah aktif" },
    { command: "jatuhtempo", description: "Lihat transaksi yang jatuh tempo" },
    { command: "template", description: "Daftar & kelola template akad" },
    { command: "template_tambah", description: "Tambah template akad (admin)" },
    { command: "template_sinkron", description: "Selaraskan template dari Nextcloud (admin)" },
    { command: "operator_list", description: "Lihat daftar operator" },
    { command: "operator_tambah", description: "Tambah operator (admin)" },
    { command: "operator_hapus", description: "Nonaktifkan operator (admin)" },
  ]);

  jadwalkanReminderHarian(bot);
  jadwalkanHealthcheck();

  console.log(
    config.groupId
      ? `[akses] Mode grup: melayani chat ${config.groupId} + ${config.adminIds.length} admin env.`
      : `[akses] Mode langsung (GROUP_ID kosong): hanya melayani ${config.adminIds.length} admin env.`
  );
  console.log("Bot muamalah berjalan...");
  await bot.start({
    // my_chat_member harus disebut eksplisit -- tidak termasuk di daftar default Telegram,
    // dan dibutuhkan agar bot bisa mendeteksi saat baru ditambahkan ke grup.
    allowed_updates: ["message", "callback_query", "my_chat_member"],
    onStart: (info) => console.log(`Terhubung sebagai @${info.username}`),
  });
}

main().catch((err) => {
  console.error("Gagal menjalankan bot:", err);
  process.exit(1);
});

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  process.exit(0);
});
