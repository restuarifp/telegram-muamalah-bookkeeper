import { describe, expect, it, vi } from "vitest";

const config = { groupId: undefined as string | undefined, adminIds: [] as string[] };

vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../config.js", () => ({ config }));

const { chatDiizinkan, lingkupKantor, bolehAksesKantor } = await import("./auth.js");

function setConfig(groupId: string | undefined, adminIds: string[]) {
  config.groupId = groupId;
  config.adminIds = adminIds;
}

describe("chatDiizinkan", () => {
  it("mode langsung: hanya admin env yang direspons", () => {
    setConfig(undefined, ["111"]);
    expect(chatDiizinkan(111, 111)).toBe(true);
    expect(chatDiizinkan(222, 222)).toBe(false);
    expect(chatDiizinkan(-100123, 222)).toBe(false);
  });

  it("mode grup: chat grup lolos, siapa pun pengirimnya", () => {
    setConfig("-100123", ["111"]);
    expect(chatDiizinkan(-100123, 999)).toBe(true);
  });

  it("mode grup: di luar grup hanya admin env yang lolos", () => {
    setConfig("-100123", ["111"]);
    expect(chatDiizinkan(111, 111)).toBe(true);
    expect(chatDiizinkan(-100999, 999)).toBe(false);
  });

  it("update tanpa pengirim di luar grup ditolak", () => {
    setConfig("-100123", ["111"]);
    expect(chatDiizinkan(-100999, undefined)).toBe(false);
    expect(chatDiizinkan(undefined, undefined)).toBe(false);
  });
});

type Operator = { role: string; kantorId: number | null };

function ctxDengan(operator: Operator | undefined, kantorFilter?: number) {
  return { operator, session: { kantorFilter } } as any;
}

describe("lingkupKantor", () => {
  it("operator dibatasi pada kantornya sendiri", () => {
    expect(lingkupKantor(ctxDengan({ role: "OPERATOR", kantorId: 3 }))).toBe(3);
  });

  it("superadmin tanpa filter melihat semua kantor", () => {
    expect(lingkupKantor(ctxDengan({ role: "SUPERADMIN", kantorId: null }))).toBeUndefined();
  });

  it("superadmin dengan filter dipersempit ke kantor itu", () => {
    expect(lingkupKantor(ctxDengan({ role: "SUPERADMIN", kantorId: null }, 2))).toBe(2);
  });

  it("bukan operator, atau operator tanpa kantor, tidak melihat apa pun", () => {
    expect(lingkupKantor(ctxDengan(undefined))).toBeNull();
    expect(lingkupKantor(ctxDengan({ role: "OPERATOR", kantorId: null }))).toBeNull();
  });

  it("kantorFilter milik operator biasa diabaikan", () => {
    // Session bisa terisi dari sesi lama/percobaan; batas kantor operator harus
    // tetap datang dari data operator, bukan dari session.
    expect(lingkupKantor(ctxDengan({ role: "OPERATOR", kantorId: 3 }, 9))).toBe(3);
  });
});

describe("bolehAksesKantor", () => {
  it("operator hanya boleh membuka transaksi kantornya", () => {
    const ctx = ctxDengan({ role: "OPERATOR", kantorId: 3 });
    expect(bolehAksesKantor(ctx, 3)).toBe(true);
    expect(bolehAksesKantor(ctx, 4)).toBe(false);
  });

  it("superadmin boleh membuka transaksi kantor mana pun, termasuk di luar filternya", () => {
    const ctx = ctxDengan({ role: "SUPERADMIN", kantorId: null }, 2);
    expect(bolehAksesKantor(ctx, 2)).toBe(true);
    expect(bolehAksesKantor(ctx, 7)).toBe(true);
  });

  it("non-operator ditolak", () => {
    expect(bolehAksesKantor(ctxDengan(undefined), 1)).toBe(false);
  });
});
