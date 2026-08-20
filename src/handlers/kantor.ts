import { Composer, InlineKeyboard } from "grammy";
import type { BotContext } from "../bot-context.js";
import { prisma } from "../db.js";
import { catatAudit } from "../middlewares/audit.js";
import { isSuperadmin } from "../types.js";
import {
  buatKantor,
  cariKantor,
  daftarKantor,
  nonaktifkanKantor,
} from "../services/kantorService.js";

export const kantorComposer = new Composer<BotContext>();

kantorComposer.command("kantor_list", async (ctx) => {
  const kantor = await daftarKantor({ termasukNonaktif: isSuperadmin(ctx.operator) });
  if (kantor.length === 0) {
    await ctx.reply("Belum ada kantor terdaftar.");
    return;
  }
  const jumlah = await prisma.muamalah.groupBy({
    by: ["kantorId"],
    _count: { _all: true },
  });
  const perKantor = new Map(jumlah.map((j) => [j.kantorId, j._count._all]));
  const baris = kantor.map(
    (k) => `• #${k.id} ${k.nama}${k.aktif ? "" : " (nonaktif)"} — ${perKantor.get(k.id) ?? 0} transaksi`
  );
  await ctx.reply("🏢 Daftar kantor:\n" + baris.join("\n"));
});

kantorComposer.command("kantor_tambah", async (ctx) => {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
    return;
  }
  const nama = ctx.match?.toString().trim();
  if (!nama) {
    await ctx.reply("Gunakan: /kantor_tambah <nama kantor>\nContoh: /kantor_tambah Kanwil Surabaya");
    return;
  }
  const sudahAda = await prisma.kantor.findUnique({ where: { nama } });
  if (sudahAda) {
    await ctx.reply(`Kantor "${nama}" sudah terdaftar (#${sudahAda.id}).`);
    return;
  }
  const kantor = await buatKantor(nama);
  await catatAudit(ctx, "CREATE", "Kantor", kantor.id, { nama });
  await ctx.reply(`✅ Kantor "${kantor.nama}" ditambahkan dengan id #${kantor.id}.`);
});

kantorComposer.command("kantor_hapus", async (ctx) => {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
    return;
  }
  const kunci = ctx.match?.toString().trim();
  if (!kunci) {
    await ctx.reply("Gunakan: /kantor_hapus <id atau nama kantor>");
    return;
  }
  const kantor = await cariKantor(kunci);
  if (!kantor) {
    await ctx.reply("Kantor tidak ditemukan. Lihat /kantor_list.");
    return;
  }
  // Nonaktif, bukan hapus: transaksi & operator lama tetap menunjuk ke kantor ini,
  // dan riwayatnya harus tetap terbaca.
  await nonaktifkanKantor(kantor.id);
  await catatAudit(ctx, "UPDATE", "Kantor", kantor.id, { aktif: false });
  await ctx.reply(
    `✅ Kantor "${kantor.nama}" dinonaktifkan. Transaksi lamanya tetap tersimpan dan operatornya masih terikat ke sana.`
  );
});

/**
 * Filter kantor untuk superadmin. Operator biasa tidak diberi tombol ini:
 * lingkupnya sudah ditentukan data operator, bukan pilihan tampilan.
 */
kantorComposer.command("kantor_filter", async (ctx) => tampilkanPilihanFilter(ctx));
kantorComposer.callbackQuery("menu:kantor_filter", async (ctx) => {
  await ctx.answerCallbackQuery();
  await tampilkanPilihanFilter(ctx);
});

async function tampilkanPilihanFilter(ctx: BotContext) {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Filter kantor hanya untuk superadmin — daftar Anda sudah terbatas pada kantor sendiri.");
    return;
  }
  const kantor = await daftarKantor({ termasukNonaktif: true });
  const kb = new InlineKeyboard();
  for (const k of kantor) kb.text(`${k.nama}${k.aktif ? "" : " (nonaktif)"}`, `kantor:filter:${k.id}`).row();
  kb.text("🌐 Semua kantor", "kantor:filter:semua");
  await ctx.reply("Tampilkan transaksi dari kantor mana?", { reply_markup: kb });
}

kantorComposer.callbackQuery(/^kantor:filter:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  if (!isSuperadmin(ctx.operator)) return;
  const nilai = ctx.match![1];
  if (nilai === "semua") {
    ctx.session.kantorFilter = undefined;
    await ctx.reply("🌐 Filter kantor dilepas — menampilkan transaksi semua kantor.");
    return;
  }
  const kantor = await prisma.kantor.findUnique({ where: { id: Number(nilai) } });
  if (!kantor) {
    await ctx.reply("Kantor tidak ditemukan.");
    return;
  }
  ctx.session.kantorFilter = kantor.id;
  await ctx.reply(`🏢 Filter kantor: ${kantor.nama}. Gunakan /kantor_filter untuk mengubah.`);
});
