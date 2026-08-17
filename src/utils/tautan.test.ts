import { describe, expect, it } from "vitest";
import { OPSI_TAUTAN, escapeHtml, formatUkuran, tautanTersamar } from "./tautan.js";

describe("escapeHtml", () => {
  it("meloloskan karakter yang jadi penanda tag di parse_mode HTML", () => {
    expect(escapeHtml('<b>Akad</b> & "Qardh"')).toBe("&lt;b&gt;Akad&lt;/b&gt; &amp; \"Qardh\"");
  });

  it("meng-escape & lebih dulu agar tidak jadi dobel-escape", () => {
    expect(escapeHtml("<")).toBe("&lt;");
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("tautanTersamar", () => {
  const url = "https://nc.agak.online/s/D4M5TY72wk42sjf";

  it("menyembunyikan URL di dalam entity, tidak sebagai teks", () => {
    const hasil = tautanTersamar("Akad Qardh.pdf", url);
    expect(hasil).toBe(`<a href="${url}">Akad Qardh.pdf</a>`);
    // Yang dibaca operator hanya labelnya; token share tidak pernah jadi teks.
    expect(hasil.replace(/<a href="[^"]*">|<\/a>/g, "")).toBe("Akad Qardh.pdf");
  });

  it("meloloskan label yang mengandung karakter HTML supaya tidak merusak entity", () => {
    expect(tautanTersamar("Akad <draft>.pdf", url)).toBe(
      `<a href="${url}">Akad &lt;draft&gt;.pdf</a>`
    );
  });
});

describe("OPSI_TAUTAN", () => {
  it("mematikan preview, karena kartu preview akan membocorkan URL-nya", () => {
    expect(OPSI_TAUTAN.parse_mode).toBe("HTML");
    expect(OPSI_TAUTAN.link_preview_options.is_disabled).toBe(true);
  });
});

describe("formatUkuran", () => {
  it("menaikkan satuan sesuai besarnya", () => {
    expect(formatUkuran(512)).toBe("512 B");
    expect(formatUkuran(18149)).toBe("18 KB");
    expect(formatUkuran(45 * 1024 * 1024)).toBe("45 MB");
    // Satu desimal hanya untuk nilai kecil, di mana pembulatan bulat kehilangan terlalu banyak.
    expect(formatUkuran(1536)).toBe("1,5 KB");
  });

  it("memberi tanda strip untuk ukuran yang tidak diketahui", () => {
    expect(formatUkuran(null)).toBe("-");
    expect(formatUkuran(0)).toBe("-");
  });
});
