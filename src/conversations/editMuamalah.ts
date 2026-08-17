import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import { parseNominal, parseTanggal, parseTenor } from "../utils/validate.js";
import { isPeriodeCicilan } from "../types.js";
import {
  editMuamalahField,
  detailMuamalah,
  type FieldMuamalahDapatDiedit,
} from "../services/muamalahService.js";
import { catatAudit } from "../middlewares/audit.js";
import { menuUtama } from "../handlers/menu.js";

type FieldKey = Exclude<FieldMuamalahDapatDiedit, "tanggalAkad">;

const FIELDS: { key: FieldKey; label: string; petunjuk: string }[] = [
  { key: "judul", label: "Judul", petunjuk: "teks bebas" },
  { key: "pokok", label: "Nominal pokok", petunjuk: "contoh: 5jt" },
  { key: "jatuhTempo", label: "Jatuh tempo", petunjuk: "contoh: 2026-09-16" },
  { key: "bagiHasilNisbah", label: "Nisbah bagi hasil", petunjuk: "contoh: 60:40" },
  { key: "deskripsi", label: "Deskripsi", petunjuk: "teks bebas" },
  { key: "tenorCicilan", label: "Jumlah cicilan", petunjuk: "angka 1–600, contoh: 12" },
  { key: "periodeCicilan", label: "Periode cicilan", petunjuk: "bulanan atau mingguan" },
  { key: "mulaiCicilan", label: "Mulai cicilan", petunjuk: "contoh: 2026-09-01" },
];

export async function editMuamalahConvo(conversation: Convo, ctx: BotContext, muamalahId: number) {
  const operator = ctx.operator;
  if (!operator) {
    await ctx.reply("⛔ Sesi operator tidak ditemukan.");
    return;
  }

  const kb = new InlineKeyboard();
  for (const f of FIELDS) kb.text(f.label, `wizard:field:${f.key}`).row();
  kb.text("❌ Batal", "wizard:batal");
  await ctx.reply("Field mana yang ingin diubah?", { reply_markup: kb });

  const pilih = await conversation.waitFor("callback_query:data");
  await pilih.answerCallbackQuery();
  const data = pilih.callbackQuery.data;
  if (data === "wizard:batal") return batal(ctx);
  const field = FIELDS.find((f) => `wizard:field:${f.key}` === data);
  if (!field) return batal(ctx);

  await ctx.reply(`Masukkan nilai baru untuk "${field.label}" (${field.petunjuk}):`, {
    reply_markup: new InlineKeyboard().text("❌ Batal", "wizard:batal"),
  });

  let nilaiBaru: string | bigint | Date | number | null = null;
  while (nilaiBaru === null) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      return batal(ctx);
    }
    const teks = next.message?.text?.trim();
    if (!teks) continue;

    if (field.key === "pokok") {
      nilaiBaru = parseNominal(teks);
      if (nilaiBaru === null) {
        await ctx.reply("Format nominal tidak dikenali, coba lagi (contoh: 5jt).");
        continue;
      }
    } else if (field.key === "jatuhTempo" || field.key === "mulaiCicilan") {
      nilaiBaru = parseTanggal(teks);
      if (nilaiBaru === null) {
        await ctx.reply("Format tanggal tidak dikenali, coba lagi (contoh: 2026-09-16).");
        continue;
      }
    } else if (field.key === "tenorCicilan") {
      nilaiBaru = parseTenor(teks);
      if (nilaiBaru === null) {
        await ctx.reply("Masukkan angka bulat 1–600, contoh: 12.");
        continue;
      }
    } else if (field.key === "periodeCicilan") {
      const normal = teks.toUpperCase();
      if (!isPeriodeCicilan(normal)) {
        await ctx.reply("Isi dengan \"bulanan\" atau \"mingguan\".");
        continue;
      }
      nilaiBaru = normal;
    } else {
      nilaiBaru = teks;
    }
  }

  await conversation.external(() => editMuamalahField(muamalahId, field.key, nilaiBaru));
  await conversation.external(() =>
    catatAudit(ctx, "UPDATE", "Muamalah", muamalahId, { field: field.key })
  );

  const updated = await conversation.external(() => detailMuamalah(muamalahId));
  await ctx.reply(`✅ ${field.label} untuk #${muamalahId} berhasil diubah.`, {
    reply_markup: menuUtama(),
  });
  void updated;
}

async function batal(ctx: BotContext) {
  await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
}
