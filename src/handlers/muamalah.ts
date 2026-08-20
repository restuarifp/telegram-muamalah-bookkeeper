import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../bot-context.js";
import {
  daftarMuamalah,
  detailMuamalah,
  ubahStatus,
  hapusMuamalah,
} from "../services/muamalahService.js";
import { ringkasanMuamalah, formatRupiah, LABEL_JENIS } from "../utils/format.js";
import { OPSI_TAUTAN, escapeHtml, tautanTersamar } from "../utils/tautan.js";
import { sudahTerlambat } from "../utils/cicilan.js";
import { JENIS_AKTIF, isJenisMuamalah, isSuperadmin } from "../types.js";
import { catatAudit } from "../middlewares/audit.js";
import { bolehAksesKantor, lingkupKantor } from "../middlewares/auth.js";
import { prisma } from "../db.js";
import { menuUtama } from "./menu.js";

export const muamalahComposer = new Composer<BotContext>();
const HALAMAN_UKURAN = 5;

function kartuList(items: Awaited<ReturnType<typeof daftarMuamalah>>["items"], halaman: number, total: number) {
  const kb = new InlineKeyboard();
  for (const m of items) {
    // Draft dan tunggakan perlu terlihat tanpa harus membuka detail satu per satu.
    const tanda = m.status === "DRAFT" ? "📝 " : sudahTerlambat(m) ? "⚠️ " : "";
    kb.text(`${tanda}#${m.id} ${LABEL_JENIS[m.jenis as keyof typeof LABEL_JENIS] ?? m.jenis} ${m.judul} — ${formatRupiah(m.pokok)}`, `muamalah:detail:${m.id}`).row();
  }
  const totalHalaman = Math.max(1, Math.ceil(total / HALAMAN_UKURAN));
  if (totalHalaman > 1) {
    if (halaman > 0) kb.text("⬅️", `muamalah:list:${halaman - 1}`);
    kb.text(`${halaman + 1}/${totalHalaman}`, "noop");
    if (halaman < totalHalaman - 1) kb.text("➡️", `muamalah:list:${halaman + 1}`);
    kb.row();
  }
  kb.text("🏠 Menu", "menu:utama");
  return kb;
}

/** Label lingkup yang sedang ditampilkan, supaya jelas daftar ini kantor mana. */
async function labelKantor(ctx: BotContext, kantorId: number | undefined): Promise<string> {
  if (kantorId === undefined) return "semua kantor";
  const kantor = await prisma.kantor.findUnique({ where: { id: kantorId } });
  return kantor?.nama ?? `kantor #${kantorId}`;
}

async function tampilkanList(ctx: BotContext, halaman: number, edit: boolean) {
  const lingkup = lingkupKantor(ctx);
  if (lingkup === null) {
    await ctx.reply(
      "⛔ Anda belum terdaftar sebagai operator kantor mana pun. Hubungi superadmin untuk didaftarkan."
    );
    return;
  }

  const filter = ctx.session.listFilter ?? {};
  const { items, total } = await daftarMuamalah({
    jenis: filter.jenis,
    status: filter.status,
    kantorId: lingkup,
    skip: halaman * HALAMAN_UKURAN,
    take: HALAMAN_UKURAN,
  });

  const namaKantor = await labelKantor(ctx, lingkup);

  if (total === 0) {
    const teks = `Belum ada data muamalah yang tercatat untuk ${namaKantor}.`;
    if (edit) await ctx.editMessageText(teks, { reply_markup: menuUtama(ctx) });
    else await ctx.reply(teks, { reply_markup: menuUtama(ctx) });
    return;
  }

  const teks = `📋 Daftar Muamalah — ${namaKantor} (${total} total)\nKetuk item untuk detail:`;
  const kb = kartuList(items, halaman, total);
  if (edit) await ctx.editMessageText(teks, { reply_markup: kb });
  else await ctx.reply(teks, { reply_markup: kb });
}

muamalahComposer.command("list", async (ctx) => {
  await tampilkanList(ctx, 0, false);
});

muamalahComposer.callbackQuery("menu:list", async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanList(ctx, 0, false);
});

muamalahComposer.callbackQuery(/^muamalah:list:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const halaman = Number(ctx.match![1]);
  await tampilkanList(ctx, halaman, true);
});

function kartuDetail(m: NonNullable<Awaited<ReturnType<typeof detailMuamalah>>>) {
  const kb = new InlineKeyboard();
  if (m.status === "DRAFT") {
    // Satu-satunya jalan keluar dari DRAFT: diaktifkan manual.
    kb.text("▶️ Jadikan Berjalan", `muamalah:jalankan:${m.id}`).row();
  }
  if (m.status === "BERJALAN") {
    kb.text("💰 Catat Angsuran", `muamalah:angsuran:${m.id}`).row();
    kb.text("✅ Tandai Selesai", `muamalah:selesai:${m.id}`).row();
  }
  kb.text(`📎 Dokumen (${m.dokumen.length})`, `dokumen:akad:list:${m.id}`)
    .text("⬆️ Unggah", `muamalah:upload:${m.id}`)
    .text("🔗 Dari Tautan", `dokumen:akad:tautkan:${m.id}`)
    .row();
  kb.text("✏️ Edit", `muamalah:edit:${m.id}`).text("🗑️ Hapus", `muamalah:hapus:${m.id}`).row();
  kb.text("🏠 Menu", "menu:utama");
  return kb;
}

async function tampilkanDetail(ctx: BotContext, id: number) {
  const m = await detailMuamalah(id);
  if (!m) {
    await ctx.reply("Transaksi tidak ditemukan (mungkin sudah dihapus).");
    return;
  }
  if (!bolehAksesKantor(ctx, m.kantorId)) {
    // Pesannya sengaja sama dengan "tidak ditemukan": id transaksi berurutan,
    // jadi membedakan keduanya sama saja memberi tahu kantor lain punya apa.
    await ctx.reply("Transaksi tidak ditemukan (mungkin sudah dihapus).");
    return;
  }
  const teks = ringkasanMuamalah(m as any) + `\nKantor: ${m.kantor.nama}`;
  const daftarAngsuran = m.angsuran.length
    ? "\n\nRiwayat angsuran:\n" +
      // Bernomor, bukan bertitik: angsuran sudah urut tanggal, dan nomornya yang
      // dipakai operator untuk menyebut satu pembayaran ("angsuran ke-3").
      m.angsuran
        .map((a, i) => `${i + 1}. ${formatRupiah(a.jumlah)} (${a.tanggal.toISOString().slice(0, 10)})`)
        .join("\n")
    : "";

  // Bagian di atas ini teks biasa, jadi di-escape sekali di sini; baris dokumen
  // di bawah sudah berupa HTML (link tersamar) dan tidak boleh ikut di-escape.
  const kepala = escapeHtml(teks + daftarAngsuran);
  const daftarDok = m.dokumen.length
    ? "\n\nDokumen (di Nextcloud):\n" +
      m.dokumen
        .map((d) => {
          // 🔗 = ditautkan ke berkas yang dikelola di Nextcloud, 📄 = diunggah lewat bot.
          const tanda = d.sumber === "TAUTAN" ? "🔗" : "📄";
          const label = `${tanda} ${d.namaFile}`;
          return d.shareUrl
            ? `• ${tautanTersamar(label, d.shareUrl)}`
            : `• ${escapeHtml(label)}`;
        })
        .join("\n")
    : "\n\nBelum ada dokumen akad.";

  await ctx.reply(kepala + daftarDok, { ...OPSI_TAUTAN, reply_markup: kartuDetail(m) });
}

muamalahComposer.callbackQuery(/^muamalah:detail:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanDetail(ctx, Number(ctx.match![1]));
});

/**
 * Gerbang untuk setiap aksi yang menyebut id transaksi: operator harus terdaftar
 * DAN transaksinya harus milik kantornya. Dipakai semua callback di bawah supaya
 * tidak ada satu pun jalur aksi yang lolos tanpa cek kantor — id transaksi mudah
 * ditebak, jadi tombol bukan satu-satunya cara sebuah id sampai ke sini.
 */
async function bolehMengelola(ctx: BotContext, id: number): Promise<boolean> {
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return false;
  }
  const m = await prisma.muamalah.findUnique({ where: { id }, select: { kantorId: true } });
  if (!m || !bolehAksesKantor(ctx, m.kantorId)) {
    await ctx.reply("⛔ Transaksi ini bukan milik kantor Anda.");
    return false;
  }
  return true;
}

muamalahComposer.callbackQuery(/^muamalah:angsuran:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  await ctx.conversation.enter("catatAngsuran", id);
});

muamalahComposer.callbackQuery(/^muamalah:upload:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  await ctx.conversation.enter("uploadDokumen", id);
});

muamalahComposer.callbackQuery(/^muamalah:edit:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  await ctx.conversation.enter("editMuamalah", id);
});

muamalahComposer.callbackQuery(/^muamalah:selesai:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  await ubahStatus(id, "SELESAI");
  await catatAudit(ctx, "UPDATE", "Muamalah", id, { status: "SELESAI" });
  await ctx.reply(`✅ #${id} ditandai SELESAI.`, { reply_markup: menuUtama(ctx) });
});

muamalahComposer.callbackQuery(/^muamalah:jalankan:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  await ubahStatus(id, "BERJALAN");
  await catatAudit(ctx, "UPDATE", "Muamalah", id, { status: "BERJALAN" });
  await ctx.reply(
    `▶️ #${id} kini BERJALAN — sudah dihitung di rekap dan ikut pengingat jatuh tempo.`,
    { reply_markup: menuUtama() }
  );
});

muamalahComposer.callbackQuery(/^muamalah:hapus:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  const kb = new InlineKeyboard()
    .text("✅ Ya, batalkan transaksi", `muamalah:hapus_konfirmasi:${id}`)
    .text("❌ Tidak", "menu:utama");
  await ctx.reply(
    `Yakin ingin membatalkan transaksi #${id}? Data tetap tersimpan (soft delete) dan bisa dilihat admin.`,
    { reply_markup: kb }
  );
});

muamalahComposer.callbackQuery(/^muamalah:hapus_konfirmasi:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const id = Number(ctx.match![1]);
  if (!(await bolehMengelola(ctx, id))) return;
  await hapusMuamalah(id, false); // soft delete selalu; hard delete disediakan lewat /hapus_permanen superadmin-only
  await catatAudit(ctx, "DELETE", "Muamalah", id, { hardDelete: false });
  await ctx.reply(`🗑️ Transaksi #${id} dibatalkan.`, { reply_markup: menuUtama(ctx) });
});

muamalahComposer.command("hapus_permanen", async (ctx) => {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
    return;
  }
  const id = Number(ctx.match?.trim());
  if (!id) {
    await ctx.reply("Gunakan: /hapus_permanen <id>");
    return;
  }
  await hapusMuamalah(id, true);
  await catatAudit(ctx, "DELETE", "Muamalah", id, { hardDelete: true });
  await ctx.reply(`🗑️ Transaksi #${id} dihapus permanen.`);
});

muamalahComposer.callbackQuery("noop", async (ctx) => ctx.answerCallbackQuery());

muamalahComposer.command("filter", async (ctx) => {
  const kb = new InlineKeyboard();
  // Hanya jenis yang dibuka yang ditawarkan; "Reset filter" tetap menampilkan
  // semuanya, termasuk transaksi lama berjenis lain yang sudah tidak dibuat baru.
  for (const j of JENIS_AKTIF) kb.text(LABEL_JENIS[j], `filter:jenis:${j}`).row();
  kb.text("🔄 Reset filter (semua jenis)", "filter:reset");
  await ctx.reply("Filter berdasarkan jenis:", { reply_markup: kb });
});

muamalahComposer.callbackQuery(/^filter:jenis:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const jenis = ctx.match![1];
  // Divalidasi terhadap daftar lengkap, bukan JENIS_AKTIF: tombol filter dari
  // pesan lama harus tetap bekerja walau jenisnya sudah tidak ditawarkan lagi.
  if (isJenisMuamalah(jenis)) {
    ctx.session.listFilter = { ...ctx.session.listFilter, jenis };
  }
  await tampilkanList(ctx, 0, false);
});

muamalahComposer.callbackQuery("filter:reset", async (ctx) => {
  await ctx.answerCallbackQuery();
  ctx.session.listFilter = {};
  await tampilkanList(ctx, 0, false);
});
