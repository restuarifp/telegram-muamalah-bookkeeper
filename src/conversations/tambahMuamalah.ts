import { InlineKeyboard } from "grammy";
import type { BotContext, Convo } from "../bot-context.js";
import {
  JENIS_AKTIF,
  bolehBercicilan,
  isPeriodeCicilan,
  type JenisMuamalah,
  type PeriodeCicilan,
  type StatusMuamalah,
} from "../types.js";
import { LABEL_JENIS, formatRupiah, formatTanggal, ringkasSkemaCicilan } from "../utils/format.js";
import { parseNominal, parseTanggal, parseTenor } from "../utils/validate.js";
import { cariPihak, buatPihak, buatMuamalah } from "../services/muamalahService.js";
import { catatAudit } from "../middlewares/audit.js";
import { menuUtama } from "../handlers/menu.js";

const BATAL = "❌ Batal";
const LEWATI = "⏭️ Lewati";

async function tanyaTeks(
  conversation: Convo,
  ctx: BotContext,
  pertanyaan: string,
  opts: { bolehLewati?: boolean } = {}
): Promise<string | null> {
  const kb = new InlineKeyboard();
  if (opts.bolehLewati) kb.text(LEWATI, "wizard:lewati");
  kb.text(BATAL, "wizard:batal");
  await ctx.reply(pertanyaan, { reply_markup: kb });

  while (true) {
    const next = await conversation.waitFor(["message:text", "callback_query:data"]);
    if (next.callbackQuery) {
      await next.answerCallbackQuery();
      if (next.callbackQuery.data === "wizard:batal") return null;
      if (next.callbackQuery.data === "wizard:lewati" && opts.bolehLewati) return "";
      continue;
    }
    const text = next.message?.text?.trim();
    if (text) return text;
  }
}

async function tanyaPilihan(
  conversation: Convo,
  ctx: BotContext,
  pertanyaan: string,
  pilihan: { label: string; data: string }[]
): Promise<string | null> {
  const kb = new InlineKeyboard();
  for (const p of pilihan) kb.text(p.label, `wizard:pilih:${p.data}`).row();
  kb.text(BATAL, "wizard:batal");
  await ctx.reply(pertanyaan, { reply_markup: kb });

  const next = await conversation.waitFor("callback_query:data");
  await next.answerCallbackQuery();
  const data = next.callbackQuery.data;
  if (data === "wizard:batal") return null;
  if (data.startsWith("wizard:pilih:")) return data.slice("wizard:pilih:".length);
  return null;
}

export async function tambahMuamalah(conversation: Convo, ctx: BotContext) {
  const operator = ctx.operator;
  if (!operator) {
    await ctx.reply("⛔ Sesi operator tidak ditemukan, ulangi dari /menu.");
    return;
  }

  // 1. Jenis. Kalau cuma satu jenis yang dibuka, langkah ini dilewati — menyodorkan
  // pertanyaan yang jawabannya cuma satu hanya menambah satu ketukan tanpa pilihan.
  let jenis: JenisMuamalah;
  if (JENIS_AKTIF.length === 1) {
    jenis = JENIS_AKTIF[0];
    await ctx.reply(`Mencatat muamalah jenis *${LABEL_JENIS[jenis]}*.`, {
      parse_mode: "Markdown",
    });
  } else {
    const jenisPilihan = await tanyaPilihan(
      conversation,
      ctx,
      "Jenis muamalah apa yang ingin dicatat?",
      JENIS_AKTIF.map((j) => ({ label: LABEL_JENIS[j], data: j }))
    );
    if (!jenisPilihan) return batal(ctx);
    jenis = jenisPilihan as JenisMuamalah;
  }

  // 2. Pihak
  const namaPihak = await tanyaTeks(conversation, ctx, "Siapa nama pihak (mitra) transaksi ini?");
  if (namaPihak === null) return batal(ctx);
  if (!namaPihak) return batal(ctx);

  const kandidat = await conversation.external(() => cariPihak(namaPihak));
  let pihakId: number;
  if (kandidat.length > 0) {
    const kb = new InlineKeyboard();
    for (const p of kandidat) kb.text(p.nama, `wizard:pihak:${p.id}`).row();
    kb.text(`➕ Buat baru: "${namaPihak}"`, "wizard:pihak:baru").row();
    kb.text(BATAL, "wizard:batal");
    await ctx.reply("Pilih pihak yang sudah ada, atau buat baru:", { reply_markup: kb });
    const next = await conversation.waitFor("callback_query:data");
    await next.answerCallbackQuery();
    const data = next.callbackQuery.data;
    if (data === "wizard:batal") return batal(ctx);
    if (data === "wizard:pihak:baru") {
      const pihakBaru = await conversation.external(() => buatPihak(namaPihak));
      pihakId = pihakBaru.id;
    } else {
      pihakId = Number(data.replace("wizard:pihak:", ""));
    }
  } else {
    const pihakBaru = await conversation.external(() => buatPihak(namaPihak));
    pihakId = pihakBaru.id;
  }

  // 3. Judul
  const judul = await tanyaTeks(conversation, ctx, "Judul/deskripsi singkat transaksi ini?");
  if (judul === null || !judul) return batal(ctx);

  // 4. Nominal
  let pokok: bigint | null = null;
  while (pokok === null) {
    const teksNominal = await tanyaTeks(
      conversation,
      ctx,
      "Berapa nominal pokoknya? (contoh: 5jt, 5.000.000, 500rb)"
    );
    if (teksNominal === null) return batal(ctx);
    pokok = parseNominal(teksNominal);
    if (pokok === null) {
      await ctx.reply("Format nominal tidak dikenali, coba lagi (contoh: 5jt, 5.000.000).");
    }
  }

  // 5. Tanggal akad
  let tanggalAkad: Date | null = null;
  while (tanggalAkad === null) {
    const teksTanggal = await tanyaTeks(
      conversation,
      ctx,
      "Tanggal akad? (contoh: 2026-08-16, hari ini)"
    );
    if (teksTanggal === null) return batal(ctx);
    tanggalAkad = parseTanggal(teksTanggal);
    if (tanggalAkad === null) {
      await ctx.reply("Format tanggal tidak dikenali. Contoh: 2026-08-16, 16-08-2026, hari ini.");
    }
  }

  // 6. Jatuh tempo (opsional)
  let jatuhTempo: Date | null = null;
  const teksJT = await tanyaTeks(
    conversation,
    ctx,
    "Tanggal jatuh tempo? (contoh: 2026-09-16, atau lewati jika tidak ada)",
    { bolehLewati: true }
  );
  if (teksJT === null) return batal(ctx);
  if (teksJT !== "") {
    jatuhTempo = parseTanggal(teksJT);
    if (jatuhTempo === null) {
      await ctx.reply("Format tanggal tidak dikenali, jatuh tempo dikosongkan.");
    }
  }

  // 7. Nisbah (hanya investasi)
  let nisbah: string | null = null;
  if (jenis === "INVESTASI") {
    const teksNisbah = await tanyaTeks(
      conversation,
      ctx,
      "Nisbah bagi hasil? (contoh: 60:40, atau lewati)",
      { bolehLewati: true }
    );
    if (teksNisbah === null) return batal(ctx);
    nisbah = teksNisbah || null;
  }

  // 8. Skema cicilan — hanya ditanyakan untuk utang/piutang/qardh, dan hanya
  // kalau operator memang memilih transaksi ini dicicil.
  let tenorCicilan: number | null = null;
  let periodeCicilan: PeriodeCicilan | null = null;
  let mulaiCicilan: Date | null = null;
  if (bolehBercicilan(jenis)) {
    const pakaiCicilan = await tanyaPilihan(conversation, ctx, "Transaksi ini dicicil?", [
      { label: "Ya, ada skema cicilan", data: "ya" },
      { label: "Tidak, bayar sekaligus", data: "tidak" },
    ]);
    if (pakaiCicilan === null) return batal(ctx);

    if (pakaiCicilan === "ya") {
      while (tenorCicilan === null) {
        const teksTenor = await tanyaTeks(
          conversation,
          ctx,
          "Berapa kali cicilan? (contoh: 12)"
        );
        if (teksTenor === null) return batal(ctx);
        tenorCicilan = parseTenor(teksTenor);
        if (tenorCicilan === null) {
          await ctx.reply("Masukkan angka bulat 1–600, contoh: 12.");
        }
      }

      const pilihPeriode = await tanyaPilihan(conversation, ctx, "Setiap berapa lama?", [
        { label: "Bulanan", data: "BULANAN" },
        { label: "Mingguan", data: "MINGGUAN" },
      ]);
      if (pilihPeriode === null) return batal(ctx);
      periodeCicilan = isPeriodeCicilan(pilihPeriode) ? pilihPeriode : "BULANAN";

      while (mulaiCicilan === null) {
        const teksMulai = await tanyaTeks(
          conversation,
          ctx,
          "Cicilan pertama jatuh tempo tanggal berapa? (contoh: 2026-09-01)"
        );
        if (teksMulai === null) return batal(ctx);
        mulaiCicilan = parseTanggal(teksMulai);
        if (mulaiCicilan === null) {
          await ctx.reply("Format tanggal tidak dikenali. Contoh: 2026-09-01, 01-09-2026.");
        }
      }
    }
  }

  // 9. Deskripsi
  const teksDeskripsi = await tanyaTeks(
    conversation,
    ctx,
    "Deskripsi transaksi? (opsional, atau lewati)",
    { bolehLewati: true }
  );
  if (teksDeskripsi === null) return batal(ctx);
  const deskripsi = teksDeskripsi || null;

  // 10. Konfirmasi
  const skemaCicilan = ringkasSkemaCicilan({
    pokok: pokok!,
    tenorCicilan,
    periodeCicilan,
    mulaiCicilan,
  });
  const ringkasan =
    `Konfirmasi data berikut:\n\n` +
    `Jenis: ${LABEL_JENIS[jenis]}\n` +
    `Pihak: ${namaPihak}\n` +
    `Judul: ${judul}\n` +
    `Pokok: ${formatRupiah(pokok)}\n` +
    `Tanggal akad: ${formatTanggal(tanggalAkad)}\n` +
    `Jatuh tempo: ${formatTanggal(jatuhTempo)}\n` +
    (skemaCicilan ? `Cicilan: ${skemaCicilan}, mulai ${formatTanggal(mulaiCicilan)}\n` : "") +
    (nisbah ? `Nisbah: ${nisbah}\n` : "") +
    (deskripsi ? `Deskripsi: ${deskripsi}\n` : "");

  const kbKonfirmasi = new InlineKeyboard()
    .text("✅ Simpan (berjalan)", "wizard:simpan")
    .row()
    .text("📝 Simpan sebagai draft", "wizard:draft")
    .row()
    .text(BATAL, "wizard:batal");
  await ctx.reply(ringkasan, { reply_markup: kbKonfirmasi });
  const konfirmasi = await conversation.waitFor("callback_query:data");
  await konfirmasi.answerCallbackQuery();
  const aksi = konfirmasi.callbackQuery.data;
  if (aksi !== "wizard:simpan" && aksi !== "wizard:draft") return batal(ctx);
  const status: StatusMuamalah = aksi === "wizard:draft" ? "DRAFT" : "BERJALAN";

  const hasil = await conversation.external(() =>
    buatMuamalah({
      jenis,
      pihakId,
      judul,
      pokok: pokok!,
      tanggalAkad: tanggalAkad!,
      jatuhTempo,
      bagiHasilNisbah: nisbah,
      deskripsi,
      status,
      tenorCicilan,
      periodeCicilan,
      mulaiCicilan,
      dibuatOlehId: operator.id,
    })
  );
  await conversation.external(() => catatAudit(ctx, "CREATE", "Muamalah", hasil.id, { jenis, judul, pokok: pokok!.toString(), status }));

  await ctx.reply(
    status === "DRAFT"
      ? `📝 Tersimpan sebagai draft #${hasil.id}. Belum dihitung di rekap dan belum diingatkan — aktifkan lewat tombol "Jadikan Berjalan" di detailnya.`
      : `✅ Tersimpan sebagai #${hasil.id}.`,
    { reply_markup: menuUtama() }
  );
}

async function batal(ctx: BotContext) {
  await ctx.reply("Dibatalkan.", { reply_markup: menuUtama() });
}
