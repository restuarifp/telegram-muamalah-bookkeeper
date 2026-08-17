import type { Context, SessionFlavor } from "grammy";
import type { Conversation, ConversationFlavor } from "@grammyjs/conversations";
import type { Operator } from "@prisma/client";

export interface SessionData {
  // Filter aktif untuk /list (jenis & status), disimpan per-user agar paginasi konsisten.
  listFilter?: { jenis?: string; status?: string };
}

type BaseContext = Context & SessionFlavor<SessionData> & { operator?: Operator };

export type BotContext = ConversationFlavor<BaseContext>;

// Kedua type argument harus BotContext (bukan default plain Context) agar
// `conversation.waitFor(...)` mengembalikan ctx dengan session/operator ter-typing.
export type Convo = Conversation<BotContext, BotContext>;
