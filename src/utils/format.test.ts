import { describe, expect, it } from "vitest";
import { escapeMarkdown } from "./format.js";

// Telegram menolak seluruh pesan ("can't parse entities") kalau ada penanda
// entity yang tak berpasangan, jadi yang diuji adalah jumlah penanda yang
// tersisa tanpa backslash — bukan sekadar hasil string-nya.
function penandaTakLolos(teks: string): number {
  return (teks.match(/(?<!\\)[_*`\[]/g) ?? []).length;
}

describe("escapeMarkdown", () => {
  it("meloloskan garis bawah tunggal seperti pada nama grup", () => {
    expect(escapeMarkdown("Grup_Muamalah")).toBe("Grup\\_Muamalah");
    expect(penandaTakLolos(escapeMarkdown("Grup_Muamalah"))).toBe(0);
  });

  it("meloloskan semua penanda entity legacy Markdown", () => {
    expect(penandaTakLolos(escapeMarkdown("a_b *c* `d` [e](f)"))).toBe(0);
  });

  it("membiarkan teks tanpa penanda apa adanya", () => {
    expect(escapeMarkdown("Utang Ahmad 2026")).toBe("Utang Ahmad 2026");
  });
});
