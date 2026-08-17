import { describe, expect, it, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import type { BotContext } from "../bot-context.js";

const config = { groupId: undefined as string | undefined, adminIds: [] as string[] };
vi.mock("../config.js", () => ({ config }));
vi.mock("../db.js", () => ({ prisma: {} }));

const { teksInit, initComposer } = await import("./groupInfo.js");
const { batasiAkses } = await import("../middlewares/auth.js");

beforeEach(() => {
  config.groupId = undefined;
  config.adminIds = [];
});

const GRUP = { id: -1009999999, type: "supergroup" as const, title: "Grup Muamalah" };
const PRIBADI = { id: 825193285, type: "private" as const };
const PEMANGGIL = { id: 825193285, username: "fulan" };

describe("teksInit", () => {
  it("menyebut Chat ID dan User ID — dua nilai yang dibutuhkan .env", () => {
    const teks = teksInit(GRUP, PEMANGGIL);
    expect(teks).toContain("`-1009999999`");
    expect(teks).toContain("`825193285`");
    expect(teks).toContain("GROUP_ID=-1009999999");
    expect(teks).toContain("ADMIN_IDS=825193285");
  });

  it("tidak menyodorkan GROUP_ID untuk chat pribadi", () => {
    // GROUP_ID chat pribadi tidak masuk akal; yang berguna cuma ADMIN_IDS.
    const teks = teksInit(PRIBADI, PEMANGGIL);
    expect(teks).not.toContain("GROUP_ID=");
    expect(teks).toContain("ADMIN_IDS=825193285");
  });

  it("menaruh baris .env di dalam blok kode", () => {
    // "GROUP_ID" mengandung garis bawah — di luar blok kode, parse_mode
    // "Markdown" membacanya sebagai pembuka italic dan menolak seluruh pesan.
    const teks = teksInit(GRUP, PEMANGGIL);
    const blok = teks.match(/```[\s\S]*?```/g) ?? [];
    expect(blok.some((b) => b.includes("GROUP_ID=-1009999999"))).toBe(true);
  });

  it("tidak meninggalkan penanda entity liar di luar blok kode", () => {
    // Telegram menolak *seluruh* pesan ("can't parse entities") kalau ada satu
    // saja penanda tak berpasangan di parse_mode "Markdown" — kegagalan yang
    // sudah pernah kena di repo ini gara-gara garis bawah pada GROUP_ID.
    const teks = teksInit({ ...GRUP, title: "Grup_A *B*" }, { id: 1, username: "a_b" });
    const diluarKode = teks.replace(/```[\s\S]*?```/g, "").replace(/`[^`]*`/g, "");

    expect(diluarKode.match(/(?<!\\)_/g)).toBeNull();
    expect((diluarKode.match(/(?<!\\)\*/g) ?? []).length % 2).toBe(0);
  });

  it("meloloskan penanda Markdown pada nama grup dan username", () => {
    const teks = teksInit({ ...GRUP, title: "Grup_Muamalah *EKL*" }, { id: 1, username: "a_b" });
    expect(teks).toContain("Grup\\_Muamalah \\*EKL\\*");
    expect(teks).toContain("@a\\_b");
  });

  it("tetap utuh tanpa data pemanggil", () => {
    const teks = teksInit(GRUP, undefined);
    expect(teks).toContain("`-1009999999`");
    expect(teks).toContain("ADMIN_IDS=<user id>");
  });

  it("memberi tahu kalau chat ini sudah jadi tujuan pengingat", () => {
    config.groupId = "-1009999999";
    expect(teksInit(GRUP, PEMANGGIL)).toContain("sudah cocok");
  });
});

/**
 * Inti dari /init: ia harus tetap menjawab di chat yang belum terdaftar, karena
 * di situlah Chat ID-nya belum diketahui. Urutan middleware inilah yang
 * menentukan, jadi diuji lewat Bot sungguhan, bukan dengan memanggil handler.
 */
describe("urutan /init terhadap gerbang akses", () => {
  function buatBot() {
    const terkirim: { method: string; payload: any }[] = [];
    // Diketik BotContext seperti di src/index.ts. Session sengaja tidak dipasang:
    // baik initComposer maupun batasiAkses tidak menyentuhnya, dan justru itu
    // yang membuat keduanya aman dipakai di depan session.
    const bot = new Bot<BotContext>("1:uji", {
      botInfo: { id: 1, is_bot: true, first_name: "Uji", username: "uji_bot" } as any,
    });
    bot.api.config.use(async (_prev, method, payload) => {
      terkirim.push({ method, payload });
      return { ok: true, result: true } as any;
    });

    // Urutan yang sama persis dengan src/index.ts.
    bot.use(initComposer);
    bot.use(batasiAkses);
    bot.command("menu", (ctx) => ctx.reply("MENU LOLOS GERBANG"));

    return { bot, terkirim };
  }

  const update = (teks: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 0,
      chat: GRUP,
      from: { id: 777, is_bot: false, first_name: "Orang Asing" },
      text: teks,
      entities: [{ type: "bot_command" as const, offset: 0, length: teks.length }],
    },
  });

  it("menjawab /init dari chat yang tidak diizinkan", async () => {
    const { bot, terkirim } = buatBot();
    await bot.handleUpdate(update("/init") as any);

    expect(terkirim).toHaveLength(1);
    expect(terkirim[0].method).toBe("sendMessage");
    expect(terkirim[0].payload.text).toContain("-1009999999");
  });

  it("tetap mendiamkan perintah lain dari chat yang sama", async () => {
    // Kalau ini gagal, bukan cuma /init yang lolos gerbang — seluruh bot bocor.
    const { bot, terkirim } = buatBot();
    await bot.handleUpdate(update("/menu") as any);

    expect(terkirim).toHaveLength(0);
  });

  it("tidak mengubah perilaku untuk chat yang memang diizinkan", async () => {
    config.groupId = String(GRUP.id);
    const { bot, terkirim } = buatBot();
    await bot.handleUpdate(update("/menu") as any);

    expect(terkirim).toHaveLength(1);
    expect(terkirim[0].payload.text).toBe("MENU LOLOS GERBANG");
  });
});
