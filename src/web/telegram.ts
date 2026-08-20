import { Api, GrammyError } from "grammy";
import { config } from "../config.js";
import { KODE_BERLAKU_MENIT } from "../services/webAuthService.js";

/**
 * Pengiriman kode login memakai Api grammY langsung, bukan instance Bot yang
 * sedang polling. Web tidak perlu ikut menerima update apa pun — ia cuma perlu
 * mengirim satu pesan — dan dengan begitu web bisa hidup walau bot sedang mati.
 */
const api = new Api(config.botToken);

export class TidakBisaKirimError extends Error {
  constructor(pesan: string) {
    super(pesan);
    this.name = "TidakBisaKirimError";
  }
}

export async function kirimKodeLogin(telegramUserId: string, kode: string): Promise<void> {
  const teks =
    "🔐 *Kode masuk web Muamalah*\n\n" +
    `\`${kode}\`\n\n` +
    `Berlaku ${KODE_BERLAKU_MENIT} menit dan hanya bisa dipakai di browser yang memintanya.\n` +
    "Jangan berikan kode ini ke siapa pun. Abaikan pesan ini kalau bukan Anda yang mencoba masuk.";

  try {
    await api.sendMessage(telegramUserId, teks, { parse_mode: "Markdown" });
  } catch (err) {
    // 403 ("bot can't initiate conversation") dan 400 ("chat not found")
    // sama-sama berarti satu hal yang bisa diperbaiki sendiri oleh operator:
    // bot belum pernah diajak bicara di chat pribadi. Pesan generik "gagal
    // kirim" akan membuat orang menunggu kode yang tidak akan pernah datang.
    if (
      err instanceof GrammyError &&
      (err.error_code === 403 || /chat not found/i.test(err.description))
    ) {
      throw new TidakBisaKirimError(
        "Bot belum bisa mengirim pesan ke Anda. Buka chat pribadi dengan bot, tekan Start, lalu coba lagi."
      );
    }
    console.error("[web] Gagal mengirim kode login:", err);
    throw new TidakBisaKirimError(
      "Kode gagal dikirim lewat Telegram. Coba lagi sebentar lagi atau hubungi superadmin."
    );
  }
}
