import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../bot-context.js";
import {
  daftarMuamalah,
  detailMuamalah,
  ubahStatus,
  hapusMuamalah,
} from "../services/muamalahService.js";
import { ringkasanMuamalah, formatRupiah, LABEL_JENIS } from "../utils/format.js";
import { sudahTerlambat } from "../utils/cicilan.js";
import { JENIS_MUAMALAH, isJenisMuamalah } from "../types.js";
import { catatAudit } from "../middlewares/audit.js";
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

async function tampilkanList(ctx: BotContext, halaman: number, edit: boolean) {
  const filter = ctx.session.listFilter ?? {};
  const { items, total } = await daftarMuamalah({
    jenis: filter.jenis,
    status: filter.status,
    skip: halaman * HALAMAN_UKURAN,
    take: HALAMAN_UKURAN,
  });

  if (total === 0) {
    const teks = "Belum ada data muamalah yang tercatat.";
    if (edit) await ctx.editMessageText(teks, { reply_markup: menuUtama() });
    else await ctx.reply(teks, { reply_markup: menuUtama() });
    return;
  }

  const teks = `📋 Daftar Muamalah (${total} total)\nKetuk item untuk detail:`;
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
  kb.text("📎 Upload Dokumen", `muamalah:upload:${m.id}`).row();
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
  const teks = ringkasanMuamalah(m as any);
  const daftarAngsuran = m.angsuran.length
    ? "\n\nRiwayat angsuran:\n" +
      m.angsuran.map((a) => `• ${formatRupiah(a.jumlah)} (${a.tanggal.toISOString().slice(0, 10)})`).join("\n")
    : "";
  const daftarDok = m.dokumen.length
    ? "\n\nDokumen:\n" + m.dokumen.map((d) => `• ${d.namaFile}`).join("\n")
    : "\n\nBelum ada dokumen akad.";
  await ctx.reply(teks + daftarAngsuran + daftarDok, { reply_markup: kartuDetail(m) });
}

muamalahComposer.callbackQuery(/^muamalah:detail:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanDetail(ctx, Number(ctx.match![1]));
});

muamalahComposer.callbackQuery(/^muamalah:angsuran:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  await ctx.conversation.enter("catatAngsuran", Number(ctx.match![1]));
});

muamalahComposer.callbackQuery(/^muamalah:upload:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  await ctx.conversation.enter("uploadDokumen", Number(ctx.match![1]));
});

muamalahComposer.callbackQuery(/^muamalah:edit:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  await ctx.conversation.enter("editMuamalah", Number(ctx.match![1]));
});

muamalahComposer.callbackQuery(/^muamalah:selesai:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  const id = Number(ctx.match![1]);
  await ubahStatus(id, "SELESAI");
  await catatAudit(ctx, "UPDATE", "Muamalah", id, { status: "SELESAI" });
  await ctx.reply(`✅ #${id} ditandai SELESAI.`, { reply_markup: menuUtama() });
});

muamalahComposer.callbackQuery(/^muamalah:jalankan:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  const id = Number(ctx.match![1]);
  await ubahStatus(id, "BERJALAN");
  await catatAudit(ctx, "UPDATE", "Muamalah", id, { status: "BERJALAN" });
  await ctx.reply(
    `▶️ #${id} kini BERJALAN — sudah dihitung di rekap dan ikut pengingat jatuh tempo.`,
    { reply_markup: menuUtama() }
  );
});

muamalahComposer.callbackQuery(/^muamalah:hapus:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!ctx.operator) {
    await ctx.reply("⛔ Anda belum terdaftar sebagai operator.");
    return;
  }
  const id = Number(ctx.match![1]);
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
  if (!ctx.operator) return;
  const id = Number(ctx.match![1]);
  const hardDelete = ctx.operator.role === "ADMIN";
  await hapusMuamalah(id, false); // soft delete selalu; hard delete disediakan lewat /hapus_permanen admin-only
  await catatAudit(ctx, "DELETE", "Muamalah", id, { hardDelete: false });
  await ctx.reply(`🗑️ Transaksi #${id} dibatalkan.`, { reply_markup: menuUtama() });
});

muamalahComposer.command("hapus_permanen", async (ctx) => {
  if (!ctx.operator || ctx.operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
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
  for (const j of JENIS_MUAMALAH) kb.text(LABEL_JENIS[j], `filter:jenis:${j}`).row();
  kb.text("🔄 Reset filter", "filter:reset");
  await ctx.reply("Filter berdasarkan jenis:", { reply_markup: kb });
});

muamalahComposer.callbackQuery(/^filter:jenis:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const jenis = ctx.match![1];
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
