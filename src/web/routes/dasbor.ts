import { Hono } from "hono";
import { rekapRingkasan } from "../../services/muamalahService.js";
import { daftarJatuhTempo } from "../../services/pengingatService.js";
import { formatRupiah, formatTanggal, LABEL_JENIS } from "../../utils/format.js";
import type { JenisMuamalah } from "../../types.js";
import { gabung, html } from "../html.js";
import { halaman, judulHalaman } from "../layout.js";
import { ambilPesan, labelLingkup, lingkupWeb, type Lingkungan } from "../sesi.js";

export const rutDasbor = new Hono<Lingkungan>();

rutDasbor.get("/", async (c) => {
  const sesi = c.get("sesi");
  const lingkup = lingkupWeb(sesi);
  const label = await labelLingkup(sesi);

  // Operator tanpa kantor tidak diberi data apa pun — sama seperti di bot.
  if (lingkup === null) {
    return c.html(
      halaman({
        judul: "Dasbor",
        sesi,
        jalur: "/",
        lingkupLabel: label,
        pesan: {
          jenis: "galat",
          teks: "Akun Anda belum ditempatkan di kantor mana pun. Hubungi superadmin.",
        },
        isi: html`<div class="kartu"><p class="kosong">Tidak ada data untuk ditampilkan.</p></div>`,
      }).nilai
    );
  }

  const [rekap, jatuhTempo] = await Promise.all([
    rekapRingkasan(lingkup),
    daftarJatuhTempo(lingkup),
  ]);

  const jenisTerisi = (Object.keys(rekap.totals) as JenisMuamalah[]).filter(
    (j) => rekap.totals[j] > 0n
  );
  const totalSemua = jenisTerisi.reduce((s, j) => s + rekap.totals[j], 0n);
  const terlambat = jatuhTempo.filter((i) => i.selisih < 0).length;

  const kartuStatistik = html`<div class="grid grid-3">
  <div class="kartu statistik">
    <div class="label">Saldo berjalan</div>
    <div class="angka">${formatRupiah(totalSemua)}</div>
    <div class="catatan">${rekap.jumlahAktif} transaksi berjalan</div>
  </div>
  <div class="kartu statistik">
    <div class="label">Jatuh tempo bulan ini</div>
    <div class="angka">${rekap.jatuhTempoBulanIni}</div>
    <div class="catatan">berdasarkan jatuh tempo transaksi</div>
  </div>
  <div class="kartu statistik">
    <div class="label">Perlu ditagih</div>
    <div class="angka">${jatuhTempo.length}</div>
    <div class="catatan">${terlambat} di antaranya sudah terlambat</div>
  </div>
</div>`;

  const rincianJenis = jenisTerisi.length
    ? html`<div class="kartu">
  <h2>Sisa per jenis <span class="keterangan">— transaksi berjalan, draft tidak dihitung</span></h2>
  <ul class="daftar-bersih">
    ${gabung(
      jenisTerisi.map(
        (j) => html`<li>
      <div class="baris-antara">
        <span>${LABEL_JENIS[j]}</span>
        <strong>${formatRupiah(rekap.totals[j])}</strong>
      </div>
    </li>`
      )
    )}
  </ul>
</div>`
    : null;

  const barisJatuhTempo = jatuhTempo.map(
    (i) => html`<tr>
  <td><a href="/muamalah/${i.id}">#${i.id}</a></td>
  <td>
    <strong>${i.judul}</strong><br>
    <span class="lencana">${LABEL_JENIS[i.jenis as JenisMuamalah] ?? i.jenis}</span> ${i.pihak}
  </td>
  <td>
    ${i.cicilan
      ? html`Cicilan ke-${i.cicilan.urutan}/${i.cicilan.tenor} — ${formatRupiah(i.cicilan.jumlah)}`
      : html`Pelunasan`}<br>
    <span class="keterangan">${formatTanggal(i.tanggalAcuan)}</span>
  </td>
  <td class="angka-kolom">${formatRupiah(i.sisa)}</td>
  <td>
    <span class="lencana ${i.selisih < 0 ? "lencana-terlambat" : i.selisih === 0 ? "lencana-draft" : "lencana-berjalan"}">${i.status}</span>
  </td>
</tr>`
  );

  const tabelJatuhTempo = html`<div class="kartu">
  <h2>Jatuh tempo <span class="keterangan">— 7 hari ke depan &amp; yang sudah terlambat</span></h2>
  ${
    jatuhTempo.length === 0
      ? html`<p class="kosong">Tidak ada yang jatuh tempo dalam 7 hari ke depan.</p>`
      : html`<div class="tabel-bungkus"><table>
    <thead><tr><th>ID</th><th>Transaksi</th><th>Yang jatuh tempo</th><th class="angka-kolom">Sisa</th><th>Status</th></tr></thead>
    <tbody>${gabung(barisJatuhTempo)}</tbody>
  </table></div>`
  }
</div>`;

  return c.html(
    halaman({
      judul: "Dasbor",
      sesi,
      jalur: "/",
      lingkupLabel: label,
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        "Dasbor",
        `Ringkasan muamalah aktif — ${label}.`,
        html`<a class="tombol tombol-utama" href="/muamalah/baru">+ Transaksi baru</a>`
      )}
${kartuStatistik}
${tabelJatuhTempo}
${rincianJenis}`,
    }).nilai
  );
});
