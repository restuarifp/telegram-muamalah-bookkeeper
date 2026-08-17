import { Composer } from "grammy";
import type { BotContext } from "../bot-context.js";
import { config } from "../config.js";
import { escapeMarkdown } from "../utils/format.js";

export const groupInfoComposer = new Composer<BotContext>();

const STATUS_AKTIF = new Set(["member", "administrator", "creator"]);
const STATUS_TIDAK_AKTIF = new Set(["left", "kicked"]);

// Selalu dalam backtick: `GROUP_ID` mengandung garis bawah, yang di parse_mode
// "Markdown" dibaca sebagai pembuka italic dan menggagalkan seluruh pesan.
const KEY_GROUP_ID = "`GROUP_ID`";

function statusPengingat(chat: { id: number; type: string }): string {
  if (config.groupId) {
    return chat.id.toString() === config.groupId
      ? `✅ Chat ID ini sudah cocok dengan ${KEY_GROUP_ID} di konfigurasi — notifikasi jatuh tempo akan dikirim ke sini.`
      : `⚠️ Chat ID ini *belum* diset sebagai ${KEY_GROUP_ID} di konfigurasi bot, sehingga notifikasi jatuh tempo tidak akan terkirim ke sini. Set \`GROUP_ID=${chat.id}\` lalu restart bot.`;
  }
  // GROUP_ID kosong: bot dipakai langsung, pengingat dikirim ke chat pribadi tiap admin env.
  return chat.type === "private"
    ? `ℹ️ ${KEY_GROUP_ID} belum diset, jadi bot dipakai langsung di chat pribadi dan notifikasi jatuh tempo dikirim ke sini.`
    : `ℹ️ ${KEY_GROUP_ID} belum diset, jadi notifikasi jatuh tempo dikirim lewat chat pribadi admin. Agar dikirim ke grup ini, set \`GROUP_ID=${chat.id}\` lalu restart bot.`;
}

function teksInfoChat(chat: { id: number; title?: string; type: string }) {
  const pribadi = chat.type === "private";
  return (
    (pribadi
      ? `👋 Bot Muamalah siap dipakai.\n\n*Info Chat*\n`
      : `👋 Terima kasih sudah menambahkan Bot Muamalah!\n\n*Info Grup*\nNama: ${escapeMarkdown(chat.title ?? "-")}\n`) +
    `Chat ID: \`${chat.id}\`\n` +
    `Tipe: ${chat.type}\n\n` +
    statusPengingat(chat) +
    `\n\nKetik /menu untuk memulai.`
  );
}

// Dipicu saat status keanggotaan bot di suatu chat berubah — termasuk saat bot
// baru ditambahkan ke grup (old status left/kicked -> new status member/administrator).
groupInfoComposer.on("my_chat_member", async (ctx) => {
  const { old_chat_member, new_chat_member, chat } = ctx.myChatMember;
  const baruBergabung =
    STATUS_TIDAK_AKTIF.has(old_chat_member.status) && STATUS_AKTIF.has(new_chat_member.status);
  if (!baruBergabung) return;

  await ctx.api.sendMessage(chat.id, teksInfoChat(chat), { parse_mode: "Markdown" });
});

// Perintah manual untuk melihat info chat saat ini kapan pun dibutuhkan.
groupInfoComposer.command("info", async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(teksInfoChat(ctx.chat), { parse_mode: "Markdown" });
});

/**
 * Teks balasan /init: identitas chat + identitas pemanggil, cukup untuk mengisi
 * GROUP_ID dan ADMIN_IDS. Dipisah dari handler-nya supaya bisa diuji langsung.
 */
export function teksInit(
  chat: { id: number; title?: string; type: string },
  from?: { id: number; username?: string }
): string {
  const baris = [
    `🔧 *Init Bot Muamalah*`,
    ``,
    `*Chat ini*`,
    `Chat ID: \`${chat.id}\``,
    `Tipe: ${chat.type}`,
  ];
  if (chat.type !== "private") baris.push(`Nama: ${escapeMarkdown(chat.title ?? "-")}`);

  if (from) {
    baris.push(``, `*Pemanggil*`, `User ID: \`${from.id}\``);
    if (from.username) baris.push(`Username: @${escapeMarkdown(from.username)}`);
  }

  baris.push(``, statusPengingat(chat));

  // Baris siap salin: yang dibutuhkan .env justru dua nilai di atas.
  baris.push(
    ``,
    `*Untuk .env*`,
    chat.type === "private"
      ? "```\nADMIN_IDS=" + (from?.id ?? "<user id>") + "\n```"
      : "```\nGROUP_ID=" + chat.id + "\nADMIN_IDS=" + (from?.id ?? "<user id>") + "\n```",
    `Setelah diubah, restart bot agar terbaca.`
  );

  return baris.join("\n");
}

/**
 * Composer terpisah untuk /init, sengaja dipasang **sebelum** batasiAkses di
 * src/index.ts.
 *
 * Alasannya: gunanya /init justru untuk chat yang *belum* terdaftar — begitu bot
 * ditambahkan ke grup baru, ID grupnya belum ada di GROUP_ID, sehingga gerbang
 * akses akan mendiamkan perintah apa pun dari sana, termasuk /info. Kalau /init
 * ikut digerbangi, ia cuma jadi duplikat /info dan tidak pernah bisa dipakai
 * untuk hal yang membuatnya dibuat.
 *
 * Yang dibocorkan hanya identitas chat itu sendiri dan identitas pemanggilnya —
 * keduanya sudah diketahui siapa pun yang ada di chat tersebut. Tidak ada data
 * muamalah, operator, atau tautan dokumen yang bisa diambil lewat sini, dan
 * perintah lain tetap berada di balik gerbang.
 */
export const initComposer = new Composer<BotContext>();

initComposer.command("init", async (ctx) => {
  if (!ctx.chat) return;
  await ctx.reply(teksInit(ctx.chat, ctx.from), { parse_mode: "Markdown" });
});
