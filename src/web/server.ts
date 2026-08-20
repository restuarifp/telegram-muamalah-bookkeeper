import { serve } from "@hono/node-server";
import { config } from "../config.js";
import { bersihkanKedaluwarsa } from "../services/webAuthService.js";
import { buatAplikasiWeb } from "./app.js";

const JEDA_BERSIH_BERSIH_JAM = 6;

/**
 * Menyalakan web UI di proses yang sama dengan bot. Keduanya berbagi database
 * dan service yang sama, jadi transaksi yang dicatat lewat web langsung terlihat
 * di bot (dan sebaliknya) tanpa sinkronisasi apa pun.
 *
 * Pengiriman kode login memakai Api grammY sendiri (lihat src/web/telegram.ts),
 * sehingga web tidak bergantung pada bot yang sedang polling.
 */
export function mulaiWebServer() {
  const app = buatAplikasiWeb();

  const server = serve({
    fetch: app.fetch,
    port: config.web.port,
    hostname: config.web.host,
  });

  bersihkanKedaluwarsa().catch((err) =>
    console.error("[web] Gagal membersihkan sesi kedaluwarsa:", err)
  );
  const penjadwal = setInterval(
    () =>
      bersihkanKedaluwarsa().catch((err) =>
        console.error("[web] Gagal membersihkan sesi kedaluwarsa:", err)
      ),
    JEDA_BERSIH_BERSIH_JAM * 3_600_000
  );
  // Jangan menahan proses tetap hidup hanya demi pembersihan berkala.
  penjadwal.unref();

  console.log(
    `[web] Web UI berjalan di http://${config.web.host}:${config.web.port} ` +
      `(login lewat OTP Telegram, sesi ${config.web.sesiJam} jam).`
  );
  if (!config.web.secureCookie) {
    console.warn(
      "[web] WEB_SECURE_COOKIE=false — cookie sesi ikut terkirim lewat HTTP polos. Hanya untuk uji coba lokal."
    );
  }

  return server;
}
