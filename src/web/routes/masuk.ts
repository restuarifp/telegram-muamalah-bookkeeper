import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import { prisma } from "../../db.js";
import {
  KODE_BERLAKU_MENIT,
  MAX_PERCOBAAN,
  ambilSesi,
  mintaKodeLogin,
  verifikasiKode,
} from "../../services/webAuthService.js";
import { html } from "../html.js";
import { halamanTamu, type Pesan } from "../layout.js";
import {
  COOKIE_PERMINTAAN,
  COOKIE_SESI,
  ambilPesan,
  buangCookiePermintaan,
  kembali,
  pasangCookiePermintaan,
  pasangCookieSesi,
  simpanPesan,
  type Lingkungan,
} from "../sesi.js";
import { kirimKodeLogin, TidakBisaKirimError } from "../telegram.js";

export const rutMasuk = new Hono<Lingkungan>();

/**
 * Tujuan setelah masuk hanya boleh jalur internal. Tanpa saringan ini,
 * ?tujuan=https://situs-lain bikin halaman login jadi alat pengalihan terbuka.
 */
function tujuanAman(nilai: string | undefined): string {
  if (!nilai || !nilai.startsWith("/") || nilai.startsWith("//")) return "/";
  return nilai;
}

function bidangTujuan(tujuan: string) {
  return tujuan === "/" ? null : html`<input type="hidden" name="tujuan" value="${tujuan}">`;
}

rutMasuk.get("/masuk", async (c) => {
  // Sudah punya sesi hidup? Tidak perlu login ulang.
  const token = getCookie(c, COOKIE_SESI);
  if (token && (await ambilSesi(token))) return c.redirect(tujuanAman(c.req.query("tujuan")), 303);

  const tujuan = tujuanAman(c.req.query("tujuan"));
  return c.html(
    halamanTamu({
      judul: "Masuk",
      pesan: ambilPesan(c),
      isi: html`<h1>Masuk ke Muamalah</h1>
<p class="keterangan">
  Kode masuk dikirim lewat chat Telegram Anda. Belum tahu Telegram User ID Anda?
  Kirim <strong>/init</strong> ke bot, ID-nya ada di balasannya.
</p>
<form method="post" action="/masuk">
  ${bidangTujuan(tujuan)}
  <div class="bidang">
    <label for="telegramUserId">Telegram User ID</label>
    <input type="text" id="telegramUserId" name="telegramUserId" inputmode="numeric"
           autocomplete="off" placeholder="mis. 123456789" required autofocus>
  </div>
  <button class="tombol tombol-utama" type="submit">Kirim kode ke Telegram</button>
</form>`,
    }).nilai
  );
});

rutMasuk.post("/masuk", async (c) => {
  const body = await c.req.parseBody();
  const tujuan = tujuanAman(typeof body.tujuan === "string" ? body.tujuan : undefined);
  const telegramUserId = (typeof body.telegramUserId === "string" ? body.telegramUserId : "")
    .trim()
    .replace(/^@/, "");

  const galat = (teks: string) =>
    kembali(c, `/masuk${tujuan === "/" ? "" : `?tujuan=${encodeURIComponent(tujuan)}`}`, {
      jenis: "galat",
      teks,
    });

  if (!/^\d{5,20}$/.test(telegramUserId)) {
    return galat("Telegram User ID berupa angka, mis. 123456789. Kirim /init ke bot untuk melihatnya.");
  }

  const hasil = await mintaKodeLogin(telegramUserId);
  // Disebutkan apa adanya, bukan disamarkan jadi "kode sudah dikirim kalau
  // terdaftar": ini alat internal dengan daftar operator yang dikelola manual,
  // dan operator yang salah ketik ID-nya akan menunggu kode yang tidak pernah
  // datang tanpa tahu sebabnya.
  if (hasil.status === "tidak_terdaftar") {
    return galat(
      "ID itu belum terdaftar sebagai operator aktif. Minta superadmin mendaftarkan lewat /operator_tambah."
    );
  }
  if (hasil.status === "terlalu_sering") {
    return galat("Terlalu banyak permintaan kode. Tunggu beberapa menit, lalu coba lagi.");
  }

  try {
    await kirimKodeLogin(telegramUserId, hasil.kode);
  } catch (err) {
    // Kode yang tidak sampai ke tujuan tidak boleh tetap hidup di database.
    await prisma.kodeLogin.update({
      where: { id: hasil.idPermintaan },
      data: { dipakaiPada: new Date() },
    });
    return galat(
      err instanceof TidakBisaKirimError ? err.message : "Kode gagal dikirim lewat Telegram."
    );
  }

  pasangCookiePermintaan(c, hasil.idPermintaan, KODE_BERLAKU_MENIT * 60);
  simpanPesan(c, {
    jenis: "ok",
    teks: `Kode dikirim ke Telegram Anda dan berlaku ${KODE_BERLAKU_MENIT} menit.`,
  });
  return c.redirect(
    `/masuk/kode${tujuan === "/" ? "" : `?tujuan=${encodeURIComponent(tujuan)}`}`,
    303
  );
});

rutMasuk.get("/masuk/kode", (c) => {
  if (!getCookie(c, COOKIE_PERMINTAAN)) return c.redirect("/masuk", 303);
  const tujuan = tujuanAman(c.req.query("tujuan"));

  return c.html(
    halamanTamu({
      judul: "Kode masuk",
      pesan: ambilPesan(c),
      isi: html`<h1>Masukkan kode</h1>
<p class="keterangan">
  Enam angka yang baru dikirim bot ke chat Telegram Anda. Kode hanya berlaku di
  browser ini.
</p>
<form method="post" action="/masuk/kode">
  ${bidangTujuan(tujuan)}
  <div class="bidang">
    <label for="kode">Kode</label>
    <input type="text" id="kode" name="kode" class="kode-otp" inputmode="numeric"
           pattern="[0-9]*" maxlength="6" autocomplete="one-time-code" required autofocus>
  </div>
  <div class="baris-tombol">
    <button class="tombol tombol-utama" type="submit">Masuk</button>
    <a class="tombol" href="/masuk">Kirim ulang</a>
  </div>
</form>`,
    }).nilai
  );
});

rutMasuk.post("/masuk/kode", async (c) => {
  const idPermintaan = getCookie(c, COOKIE_PERMINTAAN);
  if (!idPermintaan) return c.redirect("/masuk", 303);

  const body = await c.req.parseBody();
  const tujuan = tujuanAman(typeof body.tujuan === "string" ? body.tujuan : undefined);
  const kode = (typeof body.kode === "string" ? body.kode : "").trim();
  const jalurKode = `/masuk/kode${tujuan === "/" ? "" : `?tujuan=${encodeURIComponent(tujuan)}`}`;

  const hasil = await verifikasiKode(idPermintaan, kode, c.req.header("user-agent"));

  if (hasil.status === "kode_salah") {
    const pesan: Pesan =
      hasil.sisaPercobaan > 0
        ? {
            jenis: "galat",
            teks: `Kode salah. Sisa ${hasil.sisaPercobaan} percobaan dari ${MAX_PERCOBAAN}.`,
          }
        : { jenis: "galat", teks: "Percobaan habis. Minta kode baru." };
    if (hasil.sisaPercobaan === 0) buangCookiePermintaan(c);
    return kembali(c, hasil.sisaPercobaan > 0 ? jalurKode : "/masuk", pesan);
  }

  if (hasil.status !== "ok") {
    buangCookiePermintaan(c);
    return kembali(c, "/masuk", {
      jenis: "galat",
      teks:
        hasil.status === "kedaluwarsa"
          ? "Kode sudah kedaluwarsa. Minta kode baru."
          : hasil.status === "percobaan_habis"
            ? "Percobaan untuk kode itu sudah habis. Minta kode baru."
            : "Permintaan kode tidak berlaku lagi. Mulai dari awal.",
    });
  }

  buangCookiePermintaan(c);
  pasangCookieSesi(c, hasil.tokenSesi);
  return kembali(c, tujuan, {
    jenis: "ok",
    teks: `Selamat datang, ${hasil.operator.nama}.`,
  });
});
