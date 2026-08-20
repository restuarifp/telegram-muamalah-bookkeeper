import { prisma } from "../db.js";
import type { BotContext } from "../bot-context.js";

/**
 * Menulis satu baris AuditLog. Dipanggil eksplisit dari service/handler setelah
 * mutasi berhasil (create/update/delete), bukan sebagai middleware global, karena
 * hanya operator yang sudah lolos requireOperator yang melakukan mutasi.
 */
export async function catatAudit(
  ctx: BotContext,
  aksi: string,
  entitas: string,
  entitasId: number,
  payload?: unknown
) {
  if (!ctx.operator) return;
  await catatAuditOperator(ctx.operator.id, aksi, entitas, entitasId, payload);
}

/**
 * Versi tanpa context Telegram, dipakai web UI: mutasi lewat halaman web harus
 * meninggalkan jejak yang sama seperti mutasi lewat bot, jadi keduanya menulis
 * ke tabel yang sama lewat fungsi yang sama.
 */
export async function catatAuditOperator(
  operatorId: number,
  aksi: string,
  entitas: string,
  entitasId: number,
  payload?: unknown
) {
  await prisma.auditLog.create({
    data: {
      operatorId,
      aksi,
      entitas,
      entitasId,
      payloadJson: payload ? JSON.stringify(payload) : null,
    },
  });
}
