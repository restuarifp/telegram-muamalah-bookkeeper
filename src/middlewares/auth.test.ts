import { describe, expect, it, vi } from "vitest";

const config = { groupId: undefined as string | undefined, adminIds: [] as string[] };

vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../config.js", () => ({ config }));

const { chatDiizinkan } = await import("./auth.js");

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
