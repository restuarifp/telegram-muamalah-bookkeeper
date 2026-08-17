import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { formatRupiah, LABEL_STATUS } from "../utils/format.js";
import type { StatusMuamalah } from "../types.js";
import { parseNominal, parseTanggal } from "../utils/validate.js";
import { catatAngsuran, detailMuamalah } from "../services/muamalahService.js";
import { catatAudit } from "../middlewares/audit.js";
import { menuUtama } from "../handlers/menu.js";

export async function catatAngsuranConvo(conversation: Convo, ctx: BotContext, muamalahId: number) {
  const operator = ctx.operator;
  if (!operator) {
    await ctx.reply("⛔ Sesi operator tidak ditemukan.");
    return;
  }

  const muamalah = await conversation.external(() => detailMuamalah(muamalahId));
  if (!muamalah) {
    await ctx.reply("Transaksi tidak ditemukan.");
    return;
  }
  if (muamalah.status !== "BERJALAN") {
    const alasan =
      muamalah.status === "DRAFT"
        ? "Transaksi masih draft — aktifkan dulu lewat tombol \"Jadikan Berjalan\" di detailnya."
        : `Transaksi berstatus ${LABEL_STATUS[muamalah.status as StatusMuamalah] ?? muamalah.status}, tidak bisa dicatat angsuran baru.`;
    await ctx.reply(alasan);
    return;
  }

  await ctx.reply(
    `Sisa saldo #${muamalah.id} saat ini: ${formatRupiah(muamalah.sisaSaldo)}\n\n` +
      `Masukkan jumlah angsuran/pembayaran (contoh: 500rb, 1jt):`,
    { reply_markup: new InlineKeyboard().text("❌ Batal", "wizard:batal") }
  );

  let jumlah: bigint | null = null;
  while (jumlah === null) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }
    const teks = next.message?.text?.trim();
    if (!teks) continue;
    jumlah = parseNominal(teks);
    if (jumlah === null) {
      await ctx.reply("Format nominal tidak dikenali, coba lagi (contoh: 500rb, 1jt).");
    }
  }

  await ctx.reply("Tanggal pembayaran? (contoh: hari ini, 2026-08-16)", {
    reply_markup: new InlineKeyboard().text("❌ Batal", "wizard:batal"),
  });
  let tanggal: Date | null = null;
  while (tanggal === null) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
      return;
    }
    const teks = next.message?.text?.trim();
    if (!teks) continue;
    tanggal = parseTanggal(teks);
    if (tanggal === null) {
      await ctx.reply("Format tanggal tidak dikenali, coba lagi (contoh: hari ini, 2026-08-16).");
    }
  }

  const angsuran = await conversation.external(() =>
    catatAngsuran({
      muamalahId,
      jumlah: jumlah!,
      tanggal: tanggal!,
      dicatatOlehId: operator.id,
    })
  );
  await conversation.external(() =>
    catatAudit(ctx, "CREATE", "Angsuran", angsuran.id, { muamalahId, jumlah: jumlah!.toString() })
  );

  const updated = await conversation.external(() => detailMuamalah(muamalahId));
  const sisaBaru = updated?.sisaSaldo ?? 0n;
  const pesanLunas = sisaBaru === 0n ? "\n\n🎉 Transaksi ini kini SELESAI." : "";
  await ctx.reply(
    `✅ Angsuran ${formatRupiah(jumlah)} tercatat untuk #${muamalahId}.\nSisa saldo: ${formatRupiah(sisaBaru)}${pesanLunas}`,
    { reply_markup: menuUtama() }
  );
}
