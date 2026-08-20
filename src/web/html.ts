/**
 * Templating HTML seadanya: cukup untuk halaman yang dirender di server, tanpa
 * menambah mesin template atau build step di sisi klien.
 *
 * Aturannya satu — **semua nilai yang disisipkan lewat `html` di-escape**, dan
 * satu-satunya cara menyisipkan markup adalah membungkusnya jadi HtmlAman lewat
 * fungsi lain di modul ini. Dengan begitu judul transaksi atau nama pihak yang
 * mengandung `<script>` tidak pernah bisa jadi markup tanpa ada yang sengaja
 * menuliskannya.
 */
export class HtmlAman {
  constructor(readonly nilai: string) {}
  toString(): string {
    return this.nilai;
  }
}

/** Escape lengkap termasuk kutip, karena nilai juga dipakai di dalam atribut. */
export function escapeHtml(teks: string): string {
  return teks
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Menandai string sebagai markup yang sudah aman. Dipakai hanya untuk HTML yang
 * kita susun sendiri — jangan pernah untuk input pengguna.
 */
export function mentah(markup: string): HtmlAman {
  return new HtmlAman(markup);
}

export const KOSONG = new HtmlAman("");

export type Isi = HtmlAman | string | number | bigint | null | undefined | false | Isi[];

function render(nilai: Isi): string {
  if (nilai === null || nilai === undefined || nilai === false) return "";
  if (nilai instanceof HtmlAman) return nilai.nilai;
  if (Array.isArray(nilai)) return nilai.map(render).join("");
  return escapeHtml(String(nilai));
}

export function html(bagian: TemplateStringsArray, ...nilai: Isi[]): HtmlAman {
  let hasil = bagian[0];
  for (let i = 0; i < nilai.length; i++) {
    hasil += render(nilai[i]) + bagian[i + 1];
  }
  return new HtmlAman(hasil);
}

/** Gabungan potongan HTML, mis. hasil `.map()` atas daftar baris tabel. */
export function gabung(bagian: Isi[], pemisah = ""): HtmlAman {
  return new HtmlAman(bagian.map(render).join(pemisah));
}
