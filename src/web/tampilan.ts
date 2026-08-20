import { gabung, html, mentah, type HtmlAman } from "./html.js";

/**
 * Nilai untuk `<input type="date">`. Tanggal disimpan sebagai tengah malam UTC
 * (lihat parseTanggal & catatan di src/utils/cicilan.ts), jadi dibaca kembali
 * dengan getUTC* — memakai waktu lokal akan menggeser tanggalnya satu hari.
 */
export function nilaiTanggal(d: Date | null | undefined): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export interface Opsi {
  nilai: string;
  label: string;
  /**
   * Atribut data- tambahan pada <option>. Dipakai untuk menitipkan keterangan
   * yang hanya diketahui server (mis. sebutan peran pihak per jenis akad) ke
   * skrip klien — supaya daftarnya tidak perlu ditulis ulang di JavaScript dan
   * jadi sumber kebenaran kedua yang bisa berbeda.
   */
  data?: Record<string, string>;
}

export function opsiPilihan(opsi: Opsi[], terpilih?: string | null): HtmlAman {
  return gabung(
    opsi.map((o) => {
      const data = gabung(
        Object.entries(o.data ?? {}).map(([k, v]) => html` data-${mentah(k)}="${v}"`)
      );
      return html`<option value="${o.nilai}"${data} ${o.nilai === (terpilih ?? "") ? html`selected` : null}>${o.label}</option>`;
    })
  );
}

/**
 * Tautan ke berkas Nextcloud. Berbeda dengan di Telegram, di web tidak ada
 * gunanya menyamarkan URL — begitu ditekan, alamatnya toh muncul di bilah
 * alamat browser. Yang tetap dijaga: `rel=noopener` supaya halaman Nextcloud
 * tidak bisa menyentuh tab ini.
 */
export function tautanBerkas(url: string, label: string): HtmlAman {
  return html`<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}
