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
  await prisma.auditLog.create({
    data: {
      operatorId: ctx.operator.id,
      aksi,
      entitas,
      entitasId,
      payloadJson: payload ? JSON.stringify(payload) : null,
    },
  });
}
