/**
 * Penyamaran tautan untuk pesan Telegram.
 *
 * Dokumen tidak lagi dikirim sebagai berkas melainkan sebagai link Nextcloud.
 * Link mentahnya sengaja tidak pernah muncul sebagai teks di chat: yang terlihat
 * hanya label ("📄 Akad Qardh.pdf"), sementara URL-nya tersembunyi di dalam
 * entity `<a href>` atau di balik tombol inline keyboard.
 */

/** Meloloskan karakter yang punya arti khusus di parse_mode "HTML" Telegram. */
export function escapeHtml(teks: string): string {
  return teks.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/**
 * Satu baris tautan tersamar. Label di-escape, URL tidak — URL hanya boleh
 * berasal dari Nextcloud (hasil OCS Share API), bukan input operator.
 */
export function tautanTersamar(label: string, url: string): string {
  return `<a href="${url}">${escapeHtml(label)}</a>`;
}

/**
 * Opsi kirim standar untuk pesan berisi tautan tersamar: HTML aktif dan preview
 * dimatikan, karena kartu preview Telegram menampilkan domain + URL dan akan
 * membocorkan apa yang baru saja kita sembunyikan.
 */
export const OPSI_TAUTAN = {
  parse_mode: "HTML",
  link_preview_options: { is_disabled: true },
} as const;

/** Ukuran berkas dalam satuan yang enak dibaca, mis. "1,4 MB". */
export function formatUkuran(bytes: number | null | undefined): string {
  if (!bytes || bytes < 0) return "-";
  const satuan = ["B", "KB", "MB", "GB"];
  let nilai = bytes;
  let i = 0;
  while (nilai >= 1024 && i < satuan.length - 1) {
    nilai /= 1024;
    i++;
  }
  const angka = i === 0 ? String(nilai) : nilai.toFixed(nilai < 10 ? 1 : 0);
  return `${angka.replace(".", ",")} ${satuan[i]}`;
}
