import { Composer } from "grammy";
import type { BotContext } from "../bot-context.js";
import { prisma } from "../db.js";
import { catatAudit } from "../middlewares/audit.js";

export const operatorComposer = new Composer<BotContext>();

operatorComposer.command("operator_list", async (ctx) => {
  const operators = await prisma.operator.findMany({ orderBy: { nama: "asc" } });
  if (operators.length === 0) {
    await ctx.reply("Belum ada operator terdaftar.");
    return;
  }
  const baris = operators.map(
    (o) => `• ${o.nama} (${o.role}${o.aktif ? "" : ", nonaktif"}) — id: ${o.telegramUserId}`
  );
  await ctx.reply("👤 Daftar operator:\n" + baris.join("\n"));
});

operatorComposer.command("operator_tambah", async (ctx) => {
  if (!ctx.operator || ctx.operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
    return;
  }

  let telegramUserId: string | undefined;
  let nama: string | undefined;

  const replyFrom = ctx.message?.reply_to_message?.from;
  if (replyFrom) {
    telegramUserId = replyFrom.id.toString();
    nama = [replyFrom.first_name, replyFrom.last_name].filter(Boolean).join(" ") || replyFrom.username;
  }

  const args = ctx.match?.toString().trim().split(/\s+/) ?? [];
  if (!telegramUserId && args[0]) {
    telegramUserId = args[0];
    nama = args.slice(1).join(" ") || undefined;
  }

  if (!telegramUserId || !nama) {
    await ctx.reply(
      "Gunakan: /operator_tambah <telegram_id> <nama>\n" +
        "Atau balas (reply) pesan dari operator yang ingin ditambahkan dengan /operator_tambah <nama>."
    );
    return;
  }

  const role = args.includes("admin") ? "ADMIN" : "OPERATOR";
  const operator = await prisma.operator.upsert({
    where: { telegramUserId },
    create: { telegramUserId, nama, role },
    update: { nama, aktif: true },
  });
  await catatAudit(ctx, "CREATE", "Operator", operator.id, { telegramUserId, nama, role });
  await ctx.reply(`✅ Operator "${nama}" ditambahkan (${role}).`);
});

operatorComposer.command("operator_hapus", async (ctx) => {
  if (!ctx.operator || ctx.operator.role !== "ADMIN") {
    await ctx.reply("⛔ Perintah ini hanya untuk admin.");
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
