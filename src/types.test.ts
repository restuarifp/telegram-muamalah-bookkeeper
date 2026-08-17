import { describe, expect, it } from "vitest";
import {
  JENIS_AKTIF,
  JENIS_MUAMALAH,
  bolehBercicilan,
  isJenisAktif,
  isJenisMuamalah,
} from "./types.js";
import { LABEL_JENIS } from "./utils/format.js";

describe("JENIS_AKTIF", () => {
  it("saat ini hanya membuka Qardh", () => {
    // Test ini bukan tautologi melainkan pagar: membuka jenis lain harus jadi
    // keputusan sadar yang ikut memperbarui baris ini, bukan efek samping.
    expect([...JENIS_AKTIF]).toEqual(["QARDH"]);
  });

  it("hanya berisi jenis yang dikenali sistem", () => {
    for (const j of JENIS_AKTIF) expect(isJenisMuamalah(j)).toBe(true);
  });

  it("tidak memangkas daftar jenis yang dikenali, supaya transaksi lama tetap terbaca", () => {
    // Kalau JENIS_MUAMALAH ikut dipangkas, transaksi Investasi/Utang yang sudah
    // tercatat akan kehilangan label dan folder Nextcloud-nya.
    expect([...JENIS_MUAMALAH]).toEqual(["UTANG", "PIUTANG", "INVESTASI", "QARDH", "LAINNYA"]);
  });

  it("punya label tampilan untuk tiap jenis yang dibuka", () => {
    for (const j of JENIS_AKTIF) expect(LABEL_JENIS[j]).toBeTruthy();
  });

  it("hanya membuka jenis yang boleh punya skema cicilan", () => {
    // Wizard menawarkan langkah cicilan berdasarkan bolehBercicilan(); jenis
    // aktif yang tidak lolos akan membuat langkah itu diam-diam terlewat.
    for (const j of JENIS_AKTIF) expect(bolehBercicilan(j)).toBe(true);
  });
});

describe("isJenisAktif", () => {
  it("menerima jenis yang dibuka", () => {
    expect(isJenisAktif("QARDH")).toBe(true);
  });

  it("menolak jenis yang dikenali tapi belum dibuka", () => {
    expect(isJenisAktif("INVESTASI")).toBe(false);
    expect(isJenisAktif("UTANG")).toBe(false);
  });

  it("menolak nilai asing", () => {
    expect(isJenisAktif("ENTAH")).toBe(false);
  });
});
