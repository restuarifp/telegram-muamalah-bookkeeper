import type { Context, SessionFlavor } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { Operator } from "@prisma/client";

export interface SessionData {
  // Filter aktif untuk /list (jenis & status), disimpan per-user agar paginasi konsisten.
  listFilter?: { jenis?: string; status?: string };
  // Hanya berlaku bagi superadmin: mempersempit tampilan ke satu kantor.
  // Operator biasa tidak memakainya — batas kantornya datang dari data operator,
  // bukan dari session yang bisa diubah lewat tombol.
  kantorFilter?: number;
}

type BaseContext = Context & SessionFlavor<SessionData> & { operator?: Operator };

export type BotContext = ConversationFlavor<BaseContext>;

// Kedua type argument harus BotContext (bukan default plain Context) agar
// `conversation.waitFor(...)` mengembalikan ctx dengan session/operator ter-typing.
export type Convo = Conversation<BotContext, BotContext>;
