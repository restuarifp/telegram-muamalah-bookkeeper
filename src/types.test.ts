import { describe, expect, it } from "vitest";
import {
  JENIS_AKTIF,
  JENIS_MUAMALAH,
  bolehBercicilan,
  isJenisAktif,
  isJenisMuamalah,
  pakaiBagiHasil,
  pakaiMargin,
  pakaiPorsiModal,
} from "./types.js";
import { LABEL_JENIS, PERAN_PIHAK, peranPihak } from "./utils/format.js";

describe("JENIS_AKTIF", () => {
  it("membuka qardh dan tiga akad syariah", () => {
    // Test ini bukan tautologi melainkan pagar: membuka jenis lain harus jadi
    // keputusan sadar yang ikut memperbarui baris ini, bukan efek samping.
    expect([...JENIS_AKTIF]).toEqual(["QARDH", "MURABAHAH", "MUDHARABAH", "MUSYARAKAH"]);
  });

  it("hanya berisi jenis yang dikenali sistem", () => {
    for (const j of JENIS_AKTIF) expect(isJenisMuamalah(j)).toBe(true);
  });

  it("tidak memangkas daftar jenis yang dikenali, supaya transaksi lama tetap terbaca", () => {
    // Kalau JENIS_MUAMALAH ikut dipangkas, transaksi Investasi/Utang yang sudah
    // tercatat akan kehilangan label dan folder Nextcloud-nya.
    expect([...JENIS_MUAMALAH]).toEqual([
      "UTANG",
      "PIUTANG",
      "INVESTASI",
      "QARDH",
      "MURABAHAH",
      "MUDHARABAH",
      "MUSYARAKAH",
      "LAINNYA",
    ]);
  });

  it("punya label tampilan untuk tiap jenis yang dibuka", () => {
    for (const j of JENIS_AKTIF) expect(LABEL_JENIS[j]).toBeTruthy();
  });

  it("tiap jenis yang dibuka punya bentuk yang dikenali wizard", () => {
    // Wizard & formulir web menyusun langkahnya dari predikat-predikat ini.
    // Jenis aktif yang tidak masuk satu pun bentuk akan tampil sebagai formulir
    // tanpa field khasnya — tersimpan, tapi kehilangan data yang menentukan.
    for (const j of JENIS_AKTIF) {
      const dikenali = bolehBercicilan(j) || pakaiBagiHasil(j) || pakaiMargin(j);
      expect(dikenali, `jenis ${j} belum punya bentuk akad`).toBe(true);
    }
  });

  it("memisahkan akad bermargin dari akad bagi hasil", () => {
    // Keduanya tidak boleh berpotongan: satu akad tidak mungkin sekaligus
    // menjual dengan margin pasti dan membagi hasil yang belum tentu.
    for (const j of JENIS_AKTIF) {
      expect(pakaiMargin(j) && pakaiBagiHasil(j)).toBe(false);
    }
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

  it("menerima akad syariah yang baru dibuka", () => {
    expect(isJenisAktif("MURABAHAH")).toBe(true);
    expect(isJenisAktif("MUDHARABAH")).toBe(true);
    expect(isJenisAktif("MUSYARAKAH")).toBe(true);
  });

  it("menolak nilai asing", () => {
    expect(isJenisAktif("ENTAH")).toBe(false);
  });
});

describe("bentuk akad", () => {
  it("hanya murabahah yang memakai margin", () => {
    expect(pakaiMargin("MURABAHAH")).toBe(true);
    expect(pakaiMargin("QARDH")).toBe(false);
    expect(pakaiMargin("MUDHARABAH")).toBe(false);
  });

  it("investasi, mudharabah, dan musyarakah memakai nisbah", () => {
    expect(pakaiBagiHasil("INVESTASI")).toBe(true);
    expect(pakaiBagiHasil("MUDHARABAH")).toBe(true);
    expect(pakaiBagiHasil("MUSYARAKAH")).toBe(true);
    expect(pakaiBagiHasil("QARDH")).toBe(false);
  });

  it("hanya musyarakah yang mencatat porsi modal", () => {
    // Mudharabah tidak: modalnya seluruhnya dari satu pihak, jadi porsi modal
    // di sana tidak punya arti.
    expect(pakaiPorsiModal("MUSYARAKAH")).toBe(true);
    expect(pakaiPorsiModal("MUDHARABAH")).toBe(false);
  });

  it("murabahah boleh dicicil, akad bagi hasil tidak", () => {
    expect(bolehBercicilan("MURABAHAH")).toBe(true);
    expect(bolehBercicilan("MUDHARABAH")).toBe(false);
    expect(bolehBercicilan("MUSYARAKAH")).toBe(false);
  });
});

describe("PERAN_PIHAK", () => {
  it("punya sebutan untuk kedua pihak di tiap jenis yang dikenali", () => {
    // Formulir merender labelnya dari sini; jenis yang terlewat akan muncul
    // sebagai kolom pihak tanpa nama peran.
    for (const j of JENIS_MUAMALAH) {
      expect(PERAN_PIHAK[j].pertama, `jenis ${j}`).toBeTruthy();
      expect(PERAN_PIHAK[j].kedua, `jenis ${j}`).toBeTruthy();
    }
  });

  it("membedakan peran kedua pihak, bukan menomorinya saja", () => {
    expect(peranPihak("QARDH")).toEqual({
      pertama: "Pemberi pinjaman",
      kedua: "Penerima pinjaman",
    });
    expect(peranPihak("MURABAHAH")).toEqual({ pertama: "Penjual", kedua: "Pembeli" });
    expect(peranPihak("MUDHARABAH")).toEqual({ pertama: "Pemilik modal", kedua: "Pengelola" });
  });

  it("tidak pernah memakai sebutan yang sama untuk kedua sisi", () => {
    for (const j of JENIS_MUAMALAH) {
      expect(PERAN_PIHAK[j].pertama).not.toBe(PERAN_PIHAK[j].kedua);
    }
  });

  it("jatuh ke sebutan netral untuk jenis yang tak dikenali", () => {
    expect(peranPihak("ENTAH")).toEqual({ pertama: "Pihak pertama", kedua: "Pihak kedua" });
  });
});
