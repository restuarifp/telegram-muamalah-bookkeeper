import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../bot-context.js";
import {
  ambilDokumen,
  ambilTemplate,
  daftarTemplate,
  hapusDokumen,
  lepasTemplate,
  sinkronDokumen,
  sinkronTemplate,
  tautanDokumen,
  tautanTemplate,
} from "../services/dokumenService.js";
import { detailMuamalah } from "../services/muamalahService.js";
import { NextcloudError, urlUnduh } from "../services/nextcloud.js";
import { catatAudit } from "../middlewares/audit.js";
import { OPSI_TAUTAN, escapeHtml, formatUkuran, tautanTersamar } from "../utils/tautan.js";
import { formatTanggal } from "../utils/format.js";
import { menuUtama } from "./menu.js";

export const dokumenComposer = new Composer<BotContext>();

/**
 * Membungkus aksi yang menyentuh Nextcloud supaya kegagalan jaringan/kredensial
 * muncul sebagai pesan yang bisa ditindaklanjuti operator, bukan sebagai error
 * generik dari bot.catch.
 *
 * Hasilnya sengaja dibungkus `{ ok }` dan bukan `T | null`: beberapa service
 * memang mengembalikan null untuk "tidak ditemukan", dan kalau digabung dengan
 * penanda gagal, kegagalan Nextcloud jadi tidak bisa dibedakan dari data hilang.
 */
type Hasil<T> = { ok: true; nilai: T } | { ok: false };

async function coba<T>(ctx: BotContext, aksi: () => Promise<T>): Promise<Hasil<T>> {
  try {
    return { ok: true, nilai: await aksi() };
  } catch (err) {
    const pesan =
      err instanceof NextcloudError
        ? `Nextcloud menolak permintaan: ${err.message}`
        : "Gagal menghubungi Nextcloud.";
    await ctx.reply(`⚠️ ${pesan} Coba lagi sebentar lagi, atau hubungi admin.`, {
      reply_markup: menuUtama(),
    });
    return { ok: false };
  }
}

function butuhOperator(ctx: BotContext): boolean {
  return Boolean(ctx.operator);
}

function butuhAdmin(ctx: BotContext): boolean {
  return ctx.operator?.role === "ADMIN";
}

/**
 * Dua tombol standar untuk sebuah berkas Nextcloud. URL-nya hidup di dalam
 * tombol, jadi yang terbaca di chat cuma labelnya.
 */
function tombolBerkas(kb: InlineKeyboard, shareUrl: string): InlineKeyboard {
  return kb.url("👁️ Buka", shareUrl).url("⬇️ Unduh", urlUnduh(shareUrl)).row();
}

// --- Template akad ---------------------------------------------------------

async function tampilkanDaftarTemplate(ctx: BotContext) {
  const templates = await daftarTemplate();
  const kb = new InlineKeyboard();
  for (const t of templates) kb.text(`📄 ${t.judul}`, `dokumen:tpl:detail:${t.id}`).row();
  if (butuhAdmin(ctx)) {
    kb.text("➕ Tambah", "dokumen:tpl:tambah").text("🔄 Sinkron", "dokumen:tpl:sinkron").row();
  }
  kb.text("🏠 Menu", "menu:utama");

  const teks =
    templates.length === 0
      ? "Belum ada template akad terdaftar.\n" +
        (butuhAdmin(ctx)
          ? "Tekan ➕ Tambah, lalu kirim tautan Nextcloud ke berkas templatenya."
          : "Hubungi admin untuk menambahkannya.")
      : `📎 Template akad tersedia (${templates.length}):\nKetuk salah satu untuk membuka.`;

  await ctx.reply(teks, { reply_markup: kb });
}

async function tampilkanDetailTemplate(ctx: BotContext, id: number) {
  const t = await ambilTemplate(id);
  if (!t) {
    await ctx.reply("Template tidak ditemukan (mungkin sudah dihapus).");
    return;
  }
  const hasil = await coba(ctx, () => tautanTemplate(id));
  if (!hasil.ok) return;
  const shareUrl = hasil.nilai;

  const baris = [
    `📄 <b>${escapeHtml(t.judul)}</b>`,
    `Kode: <code>${escapeHtml(t.kode)}</code>`,
    `Berkas: ${escapeHtml(t.namaFile)} (${formatUkuran(t.ukuran)})`,
    `Diperbarui: ${formatTanggal(t.updatedAt)}`,
  ];
  if (shareUrl) baris.push("", tautanTersamar(`👉 Buka template ${t.judul}`, shareUrl));

  const kb = new InlineKeyboard();
  if (shareUrl) tombolBerkas(kb, shareUrl);
  if (butuhAdmin(ctx)) {
    kb.text("✏️ Ubah Judul", `dokumen:tpl:judul:${t.id}`)
      .text("🔗 Ganti Tautan", `dokumen:tpl:ganti:${t.id}`)
      .row()
      .text("🗑️ Lepas dari daftar", `dokumen:tpl:hapus:${t.id}`)
      .row();
  }
  kb.text("⬅️ Daftar Template", "dokumen:tpl:list").text("🏠 Menu", "menu:utama");

  await ctx.reply(baris.join("\n"), { ...OPSI_TAUTAN, reply_markup: kb });
}

dokumenComposer.command("template", async (ctx) => {
  await tampilkanDaftarTemplate(ctx);
});

dokumenComposer.callbackQuery("dokumen:tpl:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanDaftarTemplate(ctx);
});

dokumenComposer.callbackQuery(/^dokumen:tpl:detail:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanDetailTemplate(ctx, Number(ctx.match![1]));
});

dokumenComposer.command("template_tambah", async (ctx) => {
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await ctx.conversation.enter("tambahTemplate");
});

dokumenComposer.callbackQuery("dokumen:tpl:tambah", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await ctx.conversation.enter("tambahTemplate");
});

dokumenComposer.callbackQuery(/^dokumen:tpl:judul:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await ctx.conversation.enter("ubahJudulTemplate", Number(ctx.match![1]));
});

dokumenComposer.callbackQuery(/^dokumen:tpl:ganti:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  const t = await ambilTemplate(Number(ctx.match![1]));
  if (!t) {
    await ctx.reply("Template tidak ditemukan.");
    return;
  }
  // Wizard yang sama dipakai ulang dengan kode terisi, jadi langsung ke tautan.
  await ctx.conversation.enter("tambahTemplate", t.kode);
});

dokumenComposer.callbackQuery(/^dokumen:tpl:hapus:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  const t = await ambilTemplate(Number(ctx.match![1]));
  if (!t) {
    await ctx.reply("Template tidak ditemukan.");
    return;
  }
  const kb = new InlineKeyboard()
    .text("✅ Ya, lepas", `dokumen:tpl:hapus_ya:${t.id}`)
    .text("❌ Batal", `dokumen:tpl:detail:${t.id}`);
  await ctx.reply(
    `Lepas template <b>${escapeHtml(t.judul)}</b> dari daftar?\n` +
      `Berkas <i>${escapeHtml(t.namaFile)}</i> tetap ada di Nextcloud — bot cuma berhenti menawarkannya.`,
    { parse_mode: "HTML", reply_markup: kb }
  );
});

dokumenComposer.callbackQuery(/^dokumen:tpl:hapus_ya:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhAdmin(ctx)) return;
  const id = Number(ctx.match![1]);
  const hasil = await coba(ctx, () => lepasTemplate(id));
  if (!hasil.ok) return;
  const t = hasil.nilai;
  if (!t) {
    await ctx.reply("Template tidak ditemukan.");
    return;
  }
  await catatAudit(ctx, "DELETE", "Template", id, { kode: t.kode, remotePath: t.remotePath });
  await ctx.reply(
    `🗑️ Template "${t.judul}" dilepas dari daftar. Berkasnya masih utuh di Nextcloud.`,
    { reply_markup: new InlineKeyboard().text("⬅️ Daftar Template", "dokumen:tpl:list") }
  );
});

dokumenComposer.command("template_sinkron", async (ctx) => {
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await jalankanSinkronTemplate(ctx);
});

dokumenComposer.callbackQuery("dokumen:tpl:sinkron", async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhAdmin(ctx)) {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }
  await jalankanSinkronTemplate(ctx);
});

async function jalankanSinkronTemplate(ctx: BotContext) {
  await ctx.reply("⏳ Memeriksa tiap template terdaftar di Nextcloud…");
  const dicoba = await coba(ctx, () => sinkronTemplate());
  if (!dicoba.ok) return;
  const hasil = dicoba.nilai;

  const baris: string[] = [];
  if (hasil.diperbarui.length) baris.push(`🔁 Data disegarkan: ${hasil.diperbarui.join(", ")}`);
  if (hasil.dilepas.length) baris.push(`➖ Dilepas (berkas hilang): ${hasil.dilepas.join(", ")}`);
  if (baris.length === 0) baris.push("Semua template terdaftar masih cocok dengan Nextcloud.");
  if (hasil.belumTerdaftar.length) {
    // Sengaja dilaporkan, bukan didaftarkan otomatis: daftar template adalah
    // pilihan admin lewat /template_tambah.
    baris.push(
      `\nℹ️ ${hasil.belumTerdaftar.length} berkas di folder template belum terdaftar: ` +
        `${hasil.belumTerdaftar.join(", ")}.\nDaftarkan lewat ➕ Tambah kalau memang mau dipakai.`
    );
  }

  await catatAudit(ctx, "SYNC", "Template", 0, hasil);
  await ctx.reply(`🔄 Sinkron template selesai.\n${baris.join("\n")}`, {
    reply_markup: new InlineKeyboard().text("⬅️ Daftar Template", "dokumen:tpl:list"),
  });
}

// --- Dokumen per akad ------------------------------------------------------

async function tampilkanDaftarDokumen(ctx: BotContext, muamalahId: number) {
  const m = await detailMuamalah(muamalahId);
  if (!m) {
    await ctx.reply("Transaksi tidak ditemukan (mungkin sudah dihapus).");
    return;
  }
  // detailMuamalah sudah menyertakan dokumennya (urut terbaru dulu); mengambil
  // ulang lewat query terpisah hanya menambah sumber daftar yang bisa berbeda.
  const dokumen = m.dokumen;

  const kb = new InlineKeyboard();
  // 🔗 menandai dokumen yang cuma ditunjuk, supaya jelas mana yang berkasnya
  // dipegang bot dan mana yang milik folder Nextcloud di luar sana.
  for (const d of dokumen) {
    const tanda = d.sumber === "TAUTAN" ? "🔗" : "📄";
    kb.text(`${tanda} ${d.namaFile}`, `dokumen:akad:detail:${d.id}`).row();
  }
  if (butuhOperator(ctx)) {
    kb.text("⬆️ Unggah", `muamalah:upload:${muamalahId}`)
      .text("🔗 Dari Tautan", `dokumen:akad:tautkan:${muamalahId}`)
      .row()
      .text("🔄 Sinkron", `dokumen:akad:sinkron:${muamalahId}`)
      .row();
  }
  kb.text("⬅️ Detail Transaksi", `muamalah:detail:${muamalahId}`).text("🏠 Menu", "menu:utama");

  const teks =
    dokumen.length === 0
      ? `📎 Belum ada dokumen untuk transaksi #${muamalahId} — ${m.judul}.\n` +
        `Kirim berkasnya lewat ⬆️ Unggah, atau tunjuk berkas yang sudah ada di Nextcloud lewat 🔗 Dari Tautan.`
      : `📎 Dokumen transaksi #${muamalahId} — ${m.judul} (${dokumen.length}):\n` +
        `Ketuk salah satu untuk membuka.`;
  await ctx.reply(teks, { reply_markup: kb });
}

async function tampilkanDetailDokumen(ctx: BotContext, id: number) {
  const d = await ambilDokumen(id);
  if (!d) {
    await ctx.reply("Dokumen tidak ditemukan (mungkin sudah dihapus).");
    return;
  }
  const hasil = await coba(ctx, () => tautanDokumen(id));
  if (!hasil.ok) return;
  const shareUrl = hasil.nilai;

  const bertaut = d.sumber === "TAUTAN";
  const baris = [
    `${bertaut ? "🔗" : "📄"} <b>${escapeHtml(d.namaFile)}</b>`,
    `Transaksi: #${d.muamalahId}`,
    `Jenis: ${escapeHtml(d.jenis)} · ${formatUkuran(d.ukuran)}`,
    `Dicatat: ${formatTanggal(d.createdAt)}`,
    bertaut
      ? `Asal: ditautkan dari Nextcloud (berkas dikelola di sana)`
      : `Asal: diunggah lewat bot`,
  ];
  if (shareUrl) baris.push("", tautanTersamar(`👉 Buka ${d.namaFile}`, shareUrl));

  const kb = new InlineKeyboard();
  if (shareUrl) tombolBerkas(kb, shareUrl);
  if (butuhOperator(ctx)) {
    // Ubah Nama me-rename berkas aslinya, jadi hanya ditawarkan untuk berkas
    // yang memang ditaruh bot.
    if (!bertaut) kb.text("✏️ Ubah Nama", `dokumen:akad:nama:${d.id}`);
    kb.text(bertaut ? "🗑️ Lepas" : "🗑️ Hapus", `dokumen:akad:hapus:${d.id}`).row();
  }
  kb.text("⬅️ Daftar Dokumen", `dokumen:akad:list:${d.muamalahId}`).text("🏠 Menu", "menu:utama");

  await ctx.reply(baris.join("\n"), { ...OPSI_TAUTAN, reply_markup: kb });
}

dokumenComposer.callbackQuery(/^dokumen:akad:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanDaftarDokumen(ctx, Number(ctx.match![1]));
});

dokumenComposer.callbackQuery(/^dokumen:akad:detail:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanDetailDokumen(ctx, Number(ctx.match![1]));
});

dokumenComposer.callbackQuery(/^dokumen:akad:tautkan:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhOperator(ctx)) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  await ctx.conversation.enter("tautkanDokumen", Number(ctx.match![1]));
});

dokumenComposer.callbackQuery(/^dokumen:akad:nama:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhOperator(ctx)) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  await ctx.conversation.enter("ubahNamaDokumen", Number(ctx.match![1]));
});

dokumenComposer.callbackQuery(/^dokumen:akad:hapus:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhOperator(ctx)) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  const d = await ambilDokumen(Number(ctx.match![1]));
  if (!d) {
    await ctx.reply("Dokumen tidak ditemukan.");
    return;
  }
  const bertaut = d.sumber === "TAUTAN";
  const kb = new InlineKeyboard()
    .text(bertaut ? "✅ Ya, lepas" : "✅ Ya, hapus", `dokumen:akad:hapus_ya:${d.id}`)
    .text("❌ Batal", `dokumen:akad:detail:${d.id}`);
  await ctx.reply(
    `${bertaut ? "Lepas" : "Hapus"} dokumen <b>${escapeHtml(d.namaFile)}</b> dari transaksi #${d.muamalahId}?\n` +
      (bertaut
        ? `Berkasnya tetap ada di Nextcloud — bot cuma berhenti menautkannya.`
        : `Berkasnya ikut dihapus dari Nextcloud dan link yang sudah dibagikan akan mati.`),
    { parse_mode: "HTML", reply_markup: kb }
  );
});

dokumenComposer.callbackQuery(/^dokumen:akad:hapus_ya:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!butuhOperator(ctx)) return;
  const id = Number(ctx.match![1]);
  const hasil = await coba(ctx, () => hapusDokumen(id));
  if (!hasil.ok) return;
  const d = hasil.nilai;
  if (!d) {
    await ctx.reply("Dokumen tidak ditemukan.");
    return;
  }
  await catatAudit(ctx, "DELETE", "Dokumen", id, {
    muamalahId: d.muamalahId,
    remotePath: d.remotePath,
  });
  await ctx.reply(
    d.sumber === "TAUTAN"
      ? `🗑️ Dokumen "${d.namaFile}" dilepas dari transaksi. Berkasnya masih utuh di Nextcloud.`
      : `🗑️ Dokumen "${d.namaFile}" dihapus beserta berkasnya di Nextcloud.`,
    {
      reply_markup: new InlineKeyboard().text(
        "⬅️ Daftar Dokumen",
        `dokumen:akad:list:${d.muamalahId}`
      ),
    }
  );
});

dokumenComposer.callbackQuery(/^dokumen:akad:sinkron:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  const muamalahId = Number(ctx.match![1]);
  const m = await detailMuamalah(muamalahId);
  if (!m) {
    await ctx.reply("Transaksi tidak ditemukan.");
    return;
  }

  await ctx.reply("⏳ Membaca folder transaksi di Nextcloud…");
  const dicoba = await coba(ctx, () => sinkronDokumen(m, ctx.operator!.id));
  if (!dicoba.ok) return;
  const hasil = dicoba.nilai;

  await catatAudit(ctx, "SYNC", "Dokumen", muamalahId, hasil);
  const ringkas =
    hasil.ditambah === 0 && hasil.dihapus === 0 && hasil.disegarkan === 0
      ? "Tidak ada perubahan — daftar dokumen sudah sesuai Nextcloud."
      : `➕ ${hasil.ditambah} didaftarkan, ➖ ${hasil.dihapus} dilepas (berkas hilang), ` +
        `🔁 ${hasil.disegarkan} disegarkan.`;
  await ctx.reply(`🔄 Sinkron dokumen #${muamalahId} selesai.\n${ringkas}`, {
    reply_markup: new InlineKeyboard().text(
      "⬅️ Daftar Dokumen",
      `dokumen:akad:list:${muamalahId}`
    ),
  });
});
