import type { BotContext } from "../bot-context.js";
import { config } from "../config.js";

/**
 * Menarik isi berkas dari server Telegram. Dibutuhkan karena Bot API hanya
 * memberi `file_id`; isinya harus diunduh sendiri sebelum bisa diteruskan ke
 * Nextcloud.
 */
export async function unduhFileTelegram(ctx: BotContext, fileId: string): Promise<Buffer> {
  const file = await ctx.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config.botToken}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal mengunduh file dari Telegram: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface BerkasMasuk {
  fileId: string;
  namaFile: string;
  mimeType: string;
  ukuran?: number;
}

/**
 * Menyeragamkan `message:document` dan `message:photo` jadi satu bentuk.
 * Foto tidak punya nama berkas, jadi dibuatkan satu berbasis waktu.
 */
export function berkasDariPesan(ctx: BotContext): BerkasMasuk | null {
  const doc = ctx.message?.document;
  if (doc) {
    return {
      fileId: doc.file_id,
      namaFile: doc.file_name ?? `dokumen-${Date.now()}`,
      mimeType: doc.mime_type ?? "application/octet-stream",
      ukuran: doc.file_size,
    };
  }
  const photo = ctx.message?.photo?.at(-1); // resolusi tertinggi
  if (photo) {
    return {
      fileId: photo.file_id,
      namaFile: `foto-${Date.now()}.jpg`,
      mimeType: "image/jpeg",
      ukuran: photo.file_size,
    };
  }
  return null;
}
