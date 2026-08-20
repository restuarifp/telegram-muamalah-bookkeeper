import { Hono } from "hono";
import { hapusSesi } from "../services/webAuthService.js";
import { html } from "./html.js";
import { halamanTamu } from "./layout.js";
import { rutAdmin } from "./routes/admin.js";
import { rutDasbor } from "./routes/dasbor.js";
import { rutDokumen } from "./routes/dokumen.js";
import { rutMasuk } from "./routes/masuk.js";
import { rutMuamalah } from "./routes/muamalah.js";
import { JS } from "./script.js";
import {
  buangCookieSesi,
  kembali,
  periksaCsrf,
  wajibMasuk,
  type Lingkungan,
} from "./sesi.js";
import { CSS } from "./style.js";

/** Sedikit di atas batas 20 MB milik dokumen, cukup untuk menampung overhead multipart. */
const BATAS_BADAN = 24 * 1024 * 1024;

function aset(isi: string, tipe: string): Response {
  return new Response(isi, {
    headers: {
      "content-type": tipe,
      // Aman disimpan selamanya karena URL-nya memuat sidik jari isinya (lihat
      // src/web/aset.ts): begitu isinya berubah, yang diminta browser pun URL
      // yang berbeda.
      "cache-control": "public, max-age=31536000, immutable",
    },
  });
}

export function buatAplikasiWeb() {
  const app = new Hono<Lingkungan>();

  app.use("*", async (c, next) => {
    await next();
    // CSP ketat: seluruh halaman dirender server, tidak ada skrip/gaya sebaris
    // dan tidak ada aset dari luar (lihat src/web/script.ts).
    c.res.headers.set(
      "Content-Security-Policy",
      "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'; img-src 'self' data:"
    );
    c.res.headers.set("X-Content-Type-Options", "nosniff");
    c.res.headers.set("Referrer-Policy", "same-origin");
    c.res.headers.set("X-Frame-Options", "DENY");

    // Halaman HTML tidak boleh disimpan browser: isinya data transaksi milik
    // sesi tertentu lengkap dengan token CSRF, dan tanpa ini tombol Back
    // sesudah keluar masih memperlihatkan halaman yang sudah tidak boleh
    // dilihat. Aset ber-sidik-jari punya aturannya sendiri di aset().
    if (c.res.headers.get("content-type")?.includes("text/html")) {
      c.res.headers.set("cache-control", "no-store");
    }
  });

  // Unggahan raksasa ditolak sebelum badan permintaannya dibaca ke memori.
  app.use("*", async (c, next) => {
    const panjang = Number(c.req.header("content-length") ?? 0);
    if (panjang > BATAS_BADAN) {
      return c.text("Berkas terlalu besar. Batasnya 20 MB.", 413);
    }
    await next();
  });

  app.get("/aset/app.css", () => aset(CSS, "text/css; charset=utf-8"));
  app.get("/aset/app.js", () => aset(JS, "text/javascript; charset=utf-8"));

  // Alur masuk didaftarkan sebelum gerbang sesi, jadi ia tidak ikut dijaga.
  app.route("/", rutMasuk);

  app.use("*", wajibMasuk);
  app.use("*", periksaCsrf);

  app.post("/keluar", async (c) => {
    await hapusSesi(c.get("sesi").tokenSesi);
    buangCookieSesi(c);
    return kembali(c, "/masuk", { jenis: "ok", teks: "Anda sudah keluar." });
  });

  app.route("/", rutDasbor);
  app.route("/", rutMuamalah);
  app.route("/", rutDokumen);
  app.route("/", rutAdmin);

  app.notFound((c) =>
    c.html(
      halamanTamu({
        judul: "Tidak ditemukan",
        isi: html`<h1>Halaman tidak ditemukan</h1>
<p class="keterangan">Alamat yang Anda buka tidak ada di aplikasi ini.</p>
<div class="baris-tombol"><a class="tombol tombol-utama" href="/">Ke dasbor</a></div>`,
      }).nilai,
      404
    )
  );

  app.onError((err, c) => {
    console.error("[web] Galat tak tertangani:", err);
    return c.html(
      halamanTamu({
        judul: "Galat",
        pesan: { jenis: "galat", teks: "Terjadi galat di server." },
        isi: html`<h1>Ada yang salah</h1>
<p class="keterangan">
  Permintaan Anda gagal diproses. Coba lagi; kalau tetap gagal, hubungi
  superadmin — rinciannya tercatat di log server.
</p>
<div class="baris-tombol"><a class="tombol tombol-utama" href="/">Ke dasbor</a></div>`,
      }).nilai,
      500
    );
  });

  return app;
}
