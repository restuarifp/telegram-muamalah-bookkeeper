import { URL_CSS, URL_JS } from "./aset.js";
import { html, gabung, type HtmlAman, type Isi } from "./html.js";
import { isSuperadmin, type StatusMuamalah } from "../types.js";
import { LABEL_STATUS } from "../utils/format.js";
import type { SesiAktif } from "../services/webAuthService.js";
import { tokenCsrf } from "../services/webAuthService.js";

export interface Pesan {
  jenis: "ok" | "galat" | "info";
  teks: string;
}

const MENU = [
  { href: "/", label: "Dasbor", cocok: (p: string) => p === "/" },
  { href: "/muamalah", label: "Transaksi", cocok: (p: string) => p.startsWith("/muamalah") },
  { href: "/template", label: "Template", cocok: (p: string) => p.startsWith("/template") },
  { href: "/operator", label: "Operator", cocok: (p: string) => p.startsWith("/operator") },
  { href: "/kantor", label: "Kantor", cocok: (p: string) => p.startsWith("/kantor") },
];

function kerangka(judul: string, isi: Isi, kelasBody = ""): HtmlAman {
  return html`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<!-- Tanpa ini iOS Safari menyulap deretan angka panjang (Telegram User ID)
     jadi tautan telepon berwarna di tengah teks. -->
<meta name="format-detection" content="telephone=no">
<title>${judul} — Muamalah</title>
<link rel="stylesheet" href="${URL_CSS}">
</head>
<body class="${kelasBody}">
${isi}
<script src="${URL_JS}" defer></script>
</body>
</html>`;
}

function baris(pesan: Pesan | null): Isi {
  if (!pesan) return null;
  return html`<div class="pesan pesan-${pesan.jenis}">${pesan.teks}</div>`;
}

/** Halaman penuh dengan navigasi — untuk pengguna yang sudah masuk. */
export function halaman(opts: {
  judul: string;
  sesi: SesiAktif;
  jalur: string;
  lingkupLabel: string;
  pesan?: Pesan | null;
  isi: Isi;
}): HtmlAman {
  const { operator } = opts.sesi;
  const menu = MENU.map(
    (m) =>
      html`<a href="${m.href}" class="${m.cocok(opts.jalur) ? "aktif" : ""}">${m.label}</a>`
  );

  return kerangka(
    opts.judul,
    // Checkbox pengalih laci harus mendahului .topbar dan .tirai: keduanya
    // dipilih lewat selektor sibling dari sini (lihat src/web/style.ts).
    html`<input type="checkbox" id="buka-menu" class="pengalih-menu" aria-label="Buka menu">
<header class="topbar">
  <!-- Tirai harus tinggal di dalam .topbar, satu stacking context dengan laci.
       Di luar sini ia akan terlukis di atas laci — bukan di belakangnya — dan
       setiap ketukan pada menu mendarat di tirai. -->
  <label for="buka-menu" class="tirai" title="Tutup menu"></label>
  <div class="topbar-dalam">
    <a class="merek" href="/">🕌 Muamalah</a>
    <label for="buka-menu" class="tombol-menu" title="Menu">
      <span class="garis-menu"></span>
      <span class="garis-menu"></span>
      <span class="garis-menu"></span>
    </label>
    <div class="laci">
      <div class="laci-kepala">
        <span>Menu</span>
        <label for="buka-menu" class="tombol-tutup" title="Tutup menu">✕</label>
      </div>
      <div class="identitas">
        <span class="identitas-nama">${operator.nama}</span>
        <span class="identitas-detail">${isSuperadmin(operator) ? "Superadmin" : "Operator"} · ${opts.lingkupLabel}</span>
        <form method="post" action="/keluar" class="sebaris">
          ${bidangCsrf(opts.sesi)}
          <button class="tombol tombol-kecil" type="submit">Keluar</button>
        </form>
      </div>
      <nav class="nav">${gabung(menu)}</nav>
    </div>
  </div>
</header>
<main>
  ${baris(opts.pesan ?? null)}
  ${opts.isi}
</main>
<footer>Pencatatan muamalah non-tunai — data yang sama dengan bot Telegram.</footer>`
  );
}

/** Halaman tanpa navigasi, dipakai alur masuk. */
export function halamanTamu(opts: { judul: string; pesan?: Pesan | null; isi: Isi }): HtmlAman {
  return kerangka(
    opts.judul,
    html`<div class="halaman-masuk">
  ${baris(opts.pesan ?? null)}
  <div class="kartu">${opts.isi}</div>
</div>`
  );
}

/** Bidang tersembunyi anti-CSRF; wajib ada di setiap form POST. */
export function bidangCsrf(sesi: SesiAktif): HtmlAman {
  return html`<input type="hidden" name="_csrf" value="${tokenCsrf(sesi.tokenSesi)}">`;
}

export function lencanaStatus(status: string, terlambat = false): HtmlAman {
  const label = LABEL_STATUS[status as StatusMuamalah] ?? status;
  if (terlambat && status === "BERJALAN") {
    return html`<span class="lencana lencana-terlambat">Terlambat</span>`;
  }
  const kelas =
    status === "BERJALAN"
      ? "lencana-berjalan"
      : status === "DRAFT"
        ? "lencana-draft"
        : status === "BATAL"
          ? "lencana-terlambat"
          : "lencana-selesai";
  return html`<span class="lencana ${kelas}">${label}</span>`;
}

/**
 * Panel penyaring yang terlipat di layar sempit dan selalu terbuka di layar
 * lebar (lihat .penyaring di src/web/style.ts). Terlipat memakai checkbox, bukan
 * <details>: keadaan terbuka <details> tidak bisa dibedakan per lebar layar
 * lewat CSS, sedangkan penyaring ini justru hanya perlu disembunyikan di ponsel.
 *
 * `ringkasan` adalah yang terbaca saat panelnya tertutup, jadi isilah dengan
 * penyaring yang sedang aktif — kalau tidak, operator harus membuka panel hanya
 * untuk tahu kenapa daftarnya pendek.
 */
export function panelPenyaring(opts: {
  id: string;
  ringkasan: string;
  isi: Isi;
  judul?: string;
}): HtmlAman {
  const judul = opts.judul ?? "Penyaring";
  return html`<input type="checkbox" id="${opts.id}" class="pengalih-penyaring" aria-label="Tampilkan ${judul.toLowerCase()}">
<div class="kartu penyaring">
  <label for="${opts.id}" class="kepala-penyaring">
    <span>${judul} <span class="keterangan">— ${opts.ringkasan}</span></span>
    <span class="tanda-penyaring">▾</span>
  </label>
  <div class="isi-penyaring">${opts.isi}</div>
</div>`;
}

export function judulHalaman(judul: string, keterangan?: string, aksi?: Isi): HtmlAman {
  return html`<div class="judul-halaman">
  <div>
    <h1>${judul}</h1>
    ${keterangan ? html`<p>${keterangan}</p>` : null}
  </div>
  ${aksi ? html`<div class="baris-tombol">${aksi}</div>` : null}
</div>`;
}
