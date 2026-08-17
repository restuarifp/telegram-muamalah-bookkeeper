import { describe, it, expect } from "vitest";
import { parseNominal, parseTanggal, parseTenor } from "./validate.js";

describe("parseNominal", () => {
  it("mem-parse singkatan juta", () => {
    expect(parseNominal("5jt")).toBe(5_000_000n);
    expect(parseNominal("5 juta")).toBe(5_000_000n);
  });

  it("mem-parse singkatan ribu", () => {
    expect(parseNominal("500rb")).toBe(500_000n);
    expect(parseNominal("500 ribu")).toBe(500_000n);
  });

  it("mem-parse singkatan miliar", () => {
    expect(parseNominal("1,5m")).toBe(1_500_000_000n);
  });

  it("mem-parse angka dengan pemisah ribuan", () => {
    expect(parseNominal("5.000.000")).toBe(5_000_000n);
    expect(parseNominal("5000000")).toBe(5_000_000n);
  });

  it("mem-parse desimal dengan koma sebelum satuan", () => {
    expect(parseNominal("5,5jt")).toBe(5_500_000n);
  });

  it("mengembalikan null untuk input tidak valid", () => {
    expect(parseNominal("")).toBeNull();
    expect(parseNominal("abc")).toBeNull();
    expect(parseNominal("-5jt")).toBeNull();
  });
});

describe("parseTanggal", () => {
  const now = new Date(2026, 7, 16); // 16 Agustus 2026 (bulan 0-indexed)

  it("mem-parse kata kunci hari ini/besok", () => {
    expect(parseTanggal("hari ini", now)?.getUTCDate()).toBe(16);
    expect(parseTanggal("besok", now)?.getUTCDate()).toBe(17);
  });

  it("mem-parse format ISO", () => {
    const d = parseTanggal("2026-09-01", now)!;
    expect(d.getUTCFullYear()).toBe(2026);
    expect(d.getUTCMonth()).toBe(8);
    expect(d.getUTCDate()).toBe(1);
  });

  it("mem-parse format DD-MM-YYYY dan DD/MM/YYYY", () => {
    const d1 = parseTanggal("01-09-2026", now)!;
    expect(d1.getUTCMonth()).toBe(8);
    expect(d1.getUTCDate()).toBe(1);

    const d2 = parseTanggal("01/09/2026", now)!;
    expect(d2.getUTCMonth()).toBe(8);
    expect(d2.getUTCDate()).toBe(1);
  });

  it("menolak tanggal tidak valid", () => {
    expect(parseTanggal("2026-13-40", now)).toBeNull();
    expect(parseTanggal("bukan tanggal", now)).toBeNull();
  });
});

describe("parseTenor", () => {
  it("menerima angka polos maupun berakhiran x/kali", () => {
    expect(parseTenor("12")).toBe(12);
    expect(parseTenor("12x")).toBe(12);
    expect(parseTenor("12 kali")).toBe(12);
    expect(parseTenor(" 6 ")).toBe(6);
  });

  it("menolak nol, negatif, pecahan, dan di luar batas atas", () => {
    expect(parseTenor("0")).toBeNull();
    expect(parseTenor("-3")).toBeNull();
    expect(parseTenor("2,5")).toBeNull();
    expect(parseTenor("601")).toBeNull();
  });

  it("menolak teks yang bukan angka", () => {
    expect(parseTenor("dua belas")).toBeNull();
    expect(parseTenor("")).toBeNull();
  });
});
