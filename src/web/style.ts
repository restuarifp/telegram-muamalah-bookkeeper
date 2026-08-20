/**
 * Stylesheet web UI, disimpan sebagai modul TypeScript dan bukan berkas .css.
 *
 * Alasannya praktis: build-nya cuma `tsc`, yang hanya memindahkan .ts ke dist/.
 * Berkas .css terpisah berarti harus ada langkah penyalinan aset tersendiri —
 * yang gampang terlupa di Dockerfile dan baru ketahuan sebagai halaman tanpa
 * gaya di produksi. Disajikan di /aset/app.css lengkap dengan cache header.
 *
 * Ditulis **mobile first**: aturan dasar adalah tampilan layar sempit, dan
 * penyesuaian layar lebar dikumpulkan di satu blok @media (min-width: 768px)
 * di bagian bawah. Operator lapangan membuka ini dari ponsel, jadi tampilan
 * sempit yang jadi patokan, bukan sisa ruang setelah desktop.
 */
export const CSS = `
:root {
  color-scheme: light dark;
  --bg: #f6f7f5;
  --bg-kartu: #ffffff;
  --bg-lembut: #eef0ec;
  --garis: #dcdfd8;
  --teks: #1d211c;
  --teks-lembut: #5f665c;
  --utama: #2f6f4f;
  --utama-teks: #ffffff;
  --utama-lembut: #e4efe8;
  --bahaya: #a4342c;
  --bahaya-lembut: #f7e5e3;
  --peringatan: #8a5b12;
  --peringatan-lembut: #fbf0dd;
  --radius: 10px;
  --bayang: 0 1px 2px rgba(16, 24, 16, .06), 0 1px 8px rgba(16, 24, 16, .04);
  --tirai: rgba(12, 18, 12, .45);
}

@media (prefers-color-scheme: dark) {
  :root {
    --bg: #14171a;
    --bg-kartu: #1c2024;
    --bg-lembut: #23282d;
    --garis: #313840;
    --teks: #e8ebe8;
    --teks-lembut: #9aa4a0;
    --utama: #4c9d75;
    --utama-teks: #0d1210;
    --utama-lembut: #1f2f27;
    --bahaya: #e07b72;
    --bahaya-lembut: #33211f;
    --peringatan: #d9a95c;
    --peringatan-lembut: #2e2718;
    --bayang: none;
    --tirai: rgba(0, 0, 0, .6);
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--teks);
  font: 15px/1.55 system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", sans-serif;
  -webkit-text-size-adjust: 100%;
}

/* Halaman di belakang laci tidak ikut menggulir saat laci terbuka. Memakai
   :has() supaya tetap tanpa JavaScript; browser lama sekadar kehilangan
   penyempurnaan ini, bukan menunya. */
body:has(.pengalih-menu:checked) { overflow: hidden; }

a { color: var(--utama); text-decoration: none; }
a:hover { text-decoration: underline; }

/* --- Bilah atas & laci navigasi -------------------------------------------
   Di layar sempit bilah atas hanya memuat merek + tombol menu; navigasi,
   identitas, dan tombol keluar tinggal di laci yang meluncur dari kanan.
   Pengalihnya checkbox tersembunyi, bukan JavaScript: CSP halaman ini melarang
   skrip sebaris, dan menu yang bergantung pada JS akan mati total kalau
   skripnya gagal dimuat. */

/* Tersembunyi dari mata tapi tetap bisa difokus keyboard — inilah yang membuat
   menu bisa dibuka tanpa tetikus. */
.pengalih-menu, .pengalih-penyaring {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}

.topbar {
  background: var(--bg-kartu);
  border-bottom: 1px solid var(--garis);
  position: sticky;
  top: 0;
  /* Di atas isi halaman, dan jadi stacking context bersama untuk tirai & laci
     di dalamnya — z-index keduanya di bawah ini hanya berlaku relatif ke sini. */
  z-index: 30;
}
.topbar-dalam {
  max-width: 1080px;
  margin: 0 auto;
  padding: 0 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
}
.merek {
  font-weight: 650;
  font-size: 16px;
  letter-spacing: -.01em;
  color: var(--teks);
  white-space: nowrap;
}
.merek:hover { text-decoration: none; }

.tombol-menu {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  width: 44px;
  height: 44px;
  margin-right: -8px;
  padding: 0 10px;
  border-radius: 8px;
  cursor: pointer;
}
.tombol-menu:hover { background: var(--bg-lembut); }
.garis-menu {
  display: block;
  height: 2px;
  border-radius: 2px;
  background: var(--teks);
}
.pengalih-menu:focus-visible + .topbar .tombol-menu {
  outline: 2px solid var(--utama);
  outline-offset: 2px;
}

.laci {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  width: min(300px, 84vw);
  /* Relatif terhadap .topbar: yang penting hanya lebih tinggi dari .tirai. */
  z-index: 2;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 14px 16px 24px;
  overflow-y: auto;
  background: var(--bg-kartu);
  border-left: 1px solid var(--garis);
  box-shadow: -8px 0 24px rgba(12, 18, 12, .12);
  transform: translateX(100%);
  transition: transform .22s ease;
}
.pengalih-menu:checked ~ .topbar .laci { transform: translateX(0); }
@media (prefers-reduced-motion: reduce) {
  .laci { transition: none; }
}

.laci-kepala {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .06em;
  color: var(--teks-lembut);
  font-weight: 600;
}
.tombol-tutup {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  margin-right: -8px;
  border-radius: 8px;
  font-size: 18px;
  line-height: 1;
  color: var(--teks-lembut);
  cursor: pointer;
}
.tombol-tutup:hover { background: var(--bg-lembut); color: var(--teks); }

.tirai {
  display: none;
  position: fixed;
  inset: 0;
  z-index: 1;
  background: var(--tirai);
}
.pengalih-menu:checked ~ .topbar .tirai { display: block; }

.nav { display: flex; flex-direction: column; gap: 2px; }
.nav a {
  display: flex;
  align-items: center;
  min-height: 44px;
  padding: 8px 12px;
  border-radius: 8px;
  color: var(--teks);
  font-weight: 500;
}
.nav a:hover { background: var(--bg-lembut); text-decoration: none; }
.nav a.aktif { background: var(--utama-lembut); color: var(--utama); font-weight: 600; }

.identitas {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 8px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--garis);
  font-size: 13.5px;
  color: var(--teks-lembut);
}
.identitas-nama { color: var(--teks); font-weight: 600; }
.identitas-detail { font-size: 12.5px; }

main { max-width: 1080px; margin: 0 auto; padding: 16px 12px 48px; }

.judul-halaman {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
  margin-bottom: 16px;
}
.judul-halaman h1 { font-size: 20px; margin: 0; letter-spacing: -.015em; }
.judul-halaman p { margin: 4px 0 0; color: var(--teks-lembut); font-size: 13.5px; }

/* --- Kartu & grid --- */
.kartu {
  background: var(--bg-kartu);
  border: 1px solid var(--garis);
  border-radius: var(--radius);
  box-shadow: var(--bayang);
  padding: 14px;
  margin-bottom: 14px;
}
.kartu > h2 {
  font-size: 15px;
  margin: 0 0 12px;
  letter-spacing: -.01em;
}
.keterangan { color: var(--teks-lembut); font-size: 12.5px; font-weight: 400; }
.kartu > h2 .keterangan { font-size: 13px; }

.grid { display: grid; gap: 12px; }
.grid-3 { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
.grid-2 { grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); }

.statistik { padding: 14px; }
.statistik .label { color: var(--teks-lembut); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
.statistik .angka { font-size: 21px; font-weight: 650; margin-top: 4px; letter-spacing: -.02em; }
.statistik .catatan { color: var(--teks-lembut); font-size: 12.5px; margin-top: 2px; }

/* --- Tabel ---
   Tabel dibiarkan menggulir mendatar, bukan dipecah jadi kartu: nilai-nilainya
   (pokok, sisa, tanggal) memang dibaca berdampingan sebagai kolom. */
.tabel-bungkus { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -14px; padding: 0 14px; }
table { width: 100%; border-collapse: collapse; font-size: 14px; }
th {
  text-align: left;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: .04em;
  color: var(--teks-lembut);
  font-weight: 600;
  padding: 8px 10px;
  border-bottom: 1px solid var(--garis);
  white-space: nowrap;
}
td { padding: 10px; border-bottom: 1px solid var(--garis); vertical-align: top; }
tr:last-child td { border-bottom: none; }
tbody tr:hover { background: var(--bg-lembut); }
.angka-kolom { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.lunas td { color: var(--teks-lembut); }

/* --- Lencana status --- */
.lencana {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;
  background: var(--bg-lembut);
  color: var(--teks-lembut);
  white-space: nowrap;
}
.lencana-berjalan { background: var(--utama-lembut); color: var(--utama); }
.lencana-draft { background: var(--peringatan-lembut); color: var(--peringatan); }
.lencana-terlambat { background: var(--bahaya-lembut); color: var(--bahaya); }
.lencana-selesai { background: var(--bg-lembut); color: var(--teks-lembut); }

/* --- Tombol --- */
.tombol, button.tombol, input[type=submit].tombol {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-height: 42px;
  padding: 9px 14px;
  border-radius: 8px;
  border: 1px solid var(--garis);
  background: var(--bg-kartu);
  color: var(--teks);
  font: inherit;
  font-weight: 550;
  font-size: 14px;
  cursor: pointer;
  white-space: nowrap;
}
.tombol:hover { background: var(--bg-lembut); text-decoration: none; }
.tombol-utama { background: var(--utama); border-color: var(--utama); color: var(--utama-teks); }
.tombol-utama:hover { filter: brightness(1.08); background: var(--utama); }
.tombol-bahaya { color: var(--bahaya); border-color: var(--garis); }
.tombol-bahaya:hover { background: var(--bahaya-lembut); }
.tombol-kecil { min-height: 34px; padding: 5px 10px; font-size: 13px; }
.tombol[disabled] { opacity: .5; cursor: not-allowed; }
.baris-tombol { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.baris-antara { display: flex; gap: 12px; justify-content: space-between; align-items: baseline; }
.jarak-atas { margin-top: 14px; }

/* --- Formulir --- */
form.sebaris { display: inline; }
.bidang { margin-bottom: 14px; }
.bidang label { display: block; font-size: 13px; font-weight: 600; margin-bottom: 5px; }
.bidang .petunjuk { font-weight: 400; color: var(--teks-lembut); font-size: 12.5px; margin-left: 4px; }
input[type=text], input[type=date], input[type=number], input[type=file], select, textarea {
  width: 100%;
  padding: 10px 11px;
  border: 1px solid var(--garis);
  border-radius: 8px;
  background: var(--bg);
  color: var(--teks);
  font: inherit;
  /* 16px menahan iOS Safari memperbesar halaman begitu kolom disentuh. */
  font-size: 16px;
}
input:focus, select:focus, textarea:focus {
  outline: 2px solid var(--utama);
  outline-offset: -1px;
  border-color: var(--utama);
}
textarea { min-height: 76px; resize: vertical; }
.bidang-baris { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); }
fieldset { border: 1px solid var(--garis); border-radius: var(--radius); padding: 14px; margin: 0 0 14px; }
legend { font-size: 13px; font-weight: 650; padding: 0 6px; }

/* Baris kendali (penyaring, catat angsuran): menumpuk di layar sempit,
   berjajar begitu ruangnya ada. */
.filter-baris { display: grid; gap: 12px; }
.filter-baris .bidang { margin-bottom: 0; }

/* --- Panel penyaring yang bisa dilipat ---
   Di layar sempit penyaring berisi tiga kolom bisa memakan satu layar penuh
   sebelum sebaris data pun terlihat, jadi ia terlipat dan menyisakan satu baris
   ringkasan. Di layar lebar tidak ada yang perlu dihemat: panelnya selalu
   terbuka dan kepalanya disembunyikan. */
.penyaring { padding: 0; }
.kepala-penyaring {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-height: 48px;
  padding: 10px 14px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
}
.kepala-penyaring:hover { background: var(--bg-lembut); border-radius: var(--radius); }
.tanda-penyaring { color: var(--teks-lembut); transition: transform .18s ease; }
.pengalih-penyaring:checked + .penyaring .tanda-penyaring { transform: rotate(180deg); }
.pengalih-penyaring:focus-visible + .penyaring .kepala-penyaring {
  outline: 2px solid var(--utama);
  outline-offset: -2px;
  border-radius: var(--radius);
}
.isi-penyaring { display: none; padding: 0 14px 14px; }
.pengalih-penyaring:checked + .penyaring .isi-penyaring { display: block; }
@media (prefers-reduced-motion: reduce) {
  .tanda-penyaring { transition: none; }
}

/* --- Pesan --- */
.pesan {
  padding: 11px 14px;
  border-radius: var(--radius);
  margin-bottom: 14px;
  font-size: 14px;
  border: 1px solid transparent;
}
.pesan-ok { background: var(--utama-lembut); color: var(--utama); }
.pesan-galat { background: var(--bahaya-lembut); color: var(--bahaya); }
.pesan-info { background: var(--bg-lembut); color: var(--teks-lembut); }

.kosong { color: var(--teks-lembut); padding: 18px 2px; text-align: center; font-size: 14px; }

/* --- Halaman masuk --- */
.halaman-masuk { max-width: 420px; margin: 6vh auto; padding: 0 14px; }
.halaman-masuk .kartu { padding: 22px 18px; }
.halaman-masuk h1 { font-size: 20px; margin: 0 0 6px; }
.halaman-masuk .keterangan { color: var(--teks-lembut); font-size: 13.5px; margin: 0 0 20px; }
.kode-otp {
  font-size: 26px !important;
  letter-spacing: .4em;
  text-align: center;
  font-variant-numeric: tabular-nums;
  padding: 12px !important;
}

/* --- Rincian transaksi --- */
.rincian { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px 18px; margin: 0; }
.rincian div { min-width: 0; }
.rincian dt { font-size: 12px; color: var(--teks-lembut); text-transform: uppercase; letter-spacing: .04em; }
.rincian dd { margin: 2px 0 0; font-weight: 550; overflow-wrap: anywhere; }

.daftar-bersih { list-style: none; margin: 0; padding: 0; }
.daftar-bersih li { padding: 9px 0; border-bottom: 1px solid var(--garis); }
.daftar-bersih li:last-child { border-bottom: none; }

.paginasi { display: flex; gap: 8px; align-items: center; justify-content: center; margin-top: 14px; color: var(--teks-lembut); font-size: 13.5px; flex-wrap: wrap; }

footer { text-align: center; color: var(--teks-lembut); font-size: 12.5px; padding: 20px 14px 32px; }

/* --- Layar lebar ----------------------------------------------------------
   Laci dibongkar kembali jadi bagian dari bilah atas: display:contents membuat
   navigasi dan identitas jadi anak langsung .topbar-dalam, sehingga keduanya
   berjajar tanpa perlu markup kedua. */
@media (min-width: 768px) {
  .tombol-menu, .laci-kepala { display: none; }
  .tirai, .pengalih-menu:checked ~ .topbar .tirai { display: none; }
  body:has(.pengalih-menu:checked) { overflow: auto; }

  .laci, .pengalih-menu:checked ~ .topbar .laci {
    display: contents;
    transform: none;
  }

  .topbar-dalam { padding: 0 16px; gap: 18px; min-height: 56px; justify-content: flex-start; }
  .merek { font-size: 15px; }

  .nav { order: 1; flex: 1; flex-direction: row; flex-wrap: wrap; gap: 2px; }
  .nav a { min-height: 0; padding: 7px 11px; color: var(--teks-lembut); font-weight: 500; }
  .nav a.aktif { font-weight: 600; }

  .identitas {
    order: 2;
    flex-direction: row;
    align-items: center;
    gap: 10px;
    padding-bottom: 0;
    border-bottom: none;
    font-size: 13.5px;
  }
  .identitas-nama, .identitas-detail { font-size: 13px; }

  main { padding: 22px 16px 64px; }

  .judul-halaman {
    flex-direction: row;
    align-items: flex-end;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 14px;
    margin-bottom: 18px;
  }
  .judul-halaman h1 { font-size: 22px; }

  .kartu { padding: 16px 18px; margin-bottom: 16px; }
  .tabel-bungkus { margin: 0 -18px; padding: 0 18px; }
  .grid { gap: 14px; }
  .grid-3 { grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  .grid-2 { grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); }

  fieldset { padding: 14px 16px; margin-bottom: 16px; }
  .bidang-baris { gap: 14px; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); }
  input[type=text], input[type=date], input[type=number], input[type=file], select, textarea {
    font-size: 14px;
    padding: 9px 11px;
  }

  .filter-baris { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
  .filter-baris .bidang { min-width: 150px; }

  .penyaring { padding: 16px 18px; }
  .kepala-penyaring { display: none; }
  .isi-penyaring, .pengalih-penyaring:checked + .penyaring .isi-penyaring {
    display: block;
    padding: 0;
  }

  .rincian { grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 12px 20px; }
  .halaman-masuk { margin: 8vh auto; padding: 0 16px; }
  .halaman-masuk .kartu { padding: 26px 24px; }
}
`;
