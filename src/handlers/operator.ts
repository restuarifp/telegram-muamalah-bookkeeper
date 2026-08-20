import { Composer } from "grammy";
import type { BotContext } from "../bot-context.js";
import { prisma } from "../db.js";
import { catatAudit } from "../middlewares/audit.js";
import { isSuperadmin } from "../types.js";
import { cariKantor, daftarKantor } from "../services/kantorService.js";

export const operatorComposer = new Composer<BotContext>();

const PETUNJUK_TAMBAH =
  "Gunakan: /operator_tambah <telegram_id> <kantor> <nama>\n" +
  "Atau balas (reply) pesan orangnya dengan: /operator_tambah <kantor> <nama>\n\n" +
  "<kantor> = id atau nama kantor dari /kantor_list.\n" +
  "Untuk superadmin (lintas kantor): /operator_tambah <telegram_id> superadmin <nama>";

operatorComposer.command("operator_list", async (ctx) => {
  // Superadmin melihat semua operator; operator biasa hanya rekan sekantornya —
  // daftar operator kantor lain bukan urusannya.
  const lingkup = isSuperadmin(ctx.operator)
    ? {}
    : { kantorId: ctx.operator?.kantorId ?? -1 };
  const operators = await prisma.operator.findMany({
    where: lingkup,
    include: { kantor: true },
    orderBy: { nama: "asc" },
  });
  if (operators.length === 0) {
    await ctx.reply("Belum ada operator terdaftar.");
    return;
  }
  const baris = operators.map((o) => {
    const kantor = o.kantor?.nama ?? (isSuperadmin(o) ? "semua kantor" : "tanpa kantor");
    return `• ${o.nama} — ${kantor} (${o.role}${o.aktif ? "" : ", nonaktif"}) — id: ${o.telegramUserId}`;
  });
  await ctx.reply("👤 Daftar operator:\n" + baris.join("\n"));
});

operatorComposer.command("operator_tambah", async (ctx) => {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
    return;
  }

  const args = ctx.match?.toString().trim().split(/\s+/).filter(Boolean) ?? [];

  let telegramUserId: string | undefined;
  let sisa = args;

  const replyFrom = ctx.message?.reply_to_message?.from;
  if (replyFrom) {
    telegramUserId = replyFrom.id.toString();
  } else if (/^\d+$/.test(args[0] ?? "")) {
    telegramUserId = args[0];
    sisa = args.slice(1);
  }

  // Argumen pertama setelah id adalah kantor; sisanya nama. Nama kantor yang
  // mengandung spasi tetap bisa dipakai lewat id-nya (/kantor_list menampilkan id).
  const kunciKantor = sisa[0];
  const nama = sisa.slice(1).join(" ").trim();

  if (!telegramUserId || !kunciKantor || !nama) {
    await ctx.reply(PETUNJUK_TAMBAH);
    return;
  }

  let role = "OPERATOR";
  let kantorId: number | null = null;

  if (kunciKantor.toLowerCase() === "superadmin") {
    role = "SUPERADMIN";
  } else {
    const kantor = await cariKantor(kunciKantor);
    if (!kantor) {
      const tersedia = await daftarKantor();
      await ctx.reply(
        `Kantor "${kunciKantor}" tidak ditemukan.\n\nKantor tersedia:\n` +
          tersedia.map((k) => `• #${k.id} ${k.nama}`).join("\n") +
          "\n\nTambah kantor baru dengan /kantor_tambah <nama>."
      );
      return;
    }
    kantorId = kantor.id;
  }

  const operator = await prisma.operator.upsert({
    where: { telegramUserId },
    create: { telegramUserId, nama, role, kantorId },
    // Pemindahan kantor memakai perintah yang sama: mendaftarkan ulang orang yang
    // sudah ada berarti memperbarui penempatannya.
    update: { nama, role, kantorId, aktif: true },
    include: { kantor: true },
  });
  await catatAudit(ctx, "CREATE", "Operator", operator.id, { telegramUserId, nama, role, kantorId });
  await ctx.reply(
    `✅ Operator "${nama}" ditambahkan (${role}) untuk ${operator.kantor?.nama ?? "semua kantor"}.`
  );
});

operatorComposer.command("operator_hapus", async (ctx) => {
  if (!isSuperadmin(ctx.operator)) {
    await ctx.reply("⛔ Perintah ini hanya untuk superadmin.");
    return;
  }
  const telegramUserId = ctx.match?.toString().trim();
  if (!telegramUserId) {
    await ctx.reply("Gunakan: /operator_hapus <telegram_id>");
    return;
  }
  const operator = await prisma.operator.update({
    where: { telegramUserId },
    data: { aktif: false },
  }).catch(() => null);
  if (!operator) {
    await ctx.reply("Operator tidak ditemukan.");
    return;
  }
  await catatAudit(ctx, "UPDATE", "Operator", operator.id, { aktif: false });
  await ctx.reply(`✅ Operator "${operator.nama}" dinonaktifkan.`);
});
