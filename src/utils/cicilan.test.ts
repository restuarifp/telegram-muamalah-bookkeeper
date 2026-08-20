import { describe, expect, it } from "vitest";
import {
  cicilanBerikutnya,
  cicilanTerbayar,
  jadwalCicilan,
  nominalCicilan,
  punyaCicilan,
  sudahTerlambat,
  totalKewajiban,
} from "./cicilan.js";

const tgl = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("nominalCicilan", () => {
  it("membagi rata saat pokok habis dibagi tenor", () => {
    expect(nominalCicilan(6_000_000n, 12, 1)).toBe(500_000n);
    expect(nominalCicilan(6_000_000n, 12, 12)).toBe(500_000n);
  });

  it("menumpuk sisa pembagian ke cicilan terakhir", () => {
    // 1.000.000 / 3 = 333.333 sisa 1
    expect(nominalCicilan(1_000_000n, 3, 1)).toBe(333_333n);
    expect(nominalCicilan(1_000_000n, 3, 3)).toBe(333_334n);
  });

  it("total seluruh cicilan persis sama dengan pokok", () => {
    const pokok = 10_000_007n;
    const tenor = 6;
    let total = 0n;
    for (let i = 1; i <= tenor; i++) total += nominalCicilan(pokok, tenor, i);
    expect(total).toBe(pokok);
  });
});

describe("jadwalCicilan", () => {
  it("kosong bila skema tidak lengkap", () => {
    expect(punyaCicilan({ tenorCicilan: null, periodeCicilan: "BULANAN", mulaiCicilan: tgl("2026-09-01") })).toBe(false);
    expect(jadwalCicilan({ pokok: 100n, tenorCicilan: 3, periodeCicilan: "BULANAN", mulaiCicilan: null })).toEqual([]);
  });

  it("menjadwalkan bulanan mulai dari tanggal pertama", () => {
    const jadwal = jadwalCicilan({
      pokok: 3_000_000n,
      tenorCicilan: 3,
      periodeCicilan: "BULANAN",
      mulaiCicilan: tgl("2026-09-01"),
    });
    expect(jadwal.map((b) => b.jatuhTempo.toISOString().slice(0, 10))).toEqual([
      "2026-09-01",
      "2026-10-01",
      "2026-11-01",
    ]);
    expect(jadwal[0].jumlah).toBe(1_000_000n);
  });

  it("menjadwalkan mingguan per 7 hari", () => {
    const jadwal = jadwalCicilan({
      pokok: 400_000n,
      tenorCicilan: 4,
      periodeCicilan: "MINGGUAN",
      mulaiCicilan: tgl("2026-09-03"),
    });
    expect(jadwal.map((b) => b.jatuhTempo.toISOString().slice(0, 10))).toEqual([
      "2026-09-03",
      "2026-09-10",
      "2026-09-17",
      "2026-09-24",
    ]);
  });

  it("menjepit tanggal 31 ke akhir bulan yang lebih pendek, tanpa melompat bulan", () => {
    const jadwal = jadwalCicilan({
      pokok: 300n,
      tenorCicilan: 3,
      periodeCicilan: "BULANAN",
      mulaiCicilan: tgl("2026-01-31"),
    });
    expect(jadwal.map((b) => b.jatuhTempo.toISOString().slice(0, 10))).toEqual([
      "2026-01-31",
      "2026-02-28",
      "2026-03-31", // kembali ke 31, bukan terkunci di 28
    ]);
  });
});

describe("cicilanTerbayar & cicilanBerikutnya", () => {
  const skema = {
    pokok: 3_000_000n,
    tenorCicilan: 3,
    periodeCicilan: "BULANAN",
    mulaiCicilan: tgl("2026-09-01"),
  };

  it("menghitung dari akumulasi nominal, bukan jumlah baris angsuran", () => {
    const jadwal = jadwalCicilan(skema);
    // Satu pembayaran besar menutup dua cicilan sekaligus.
    expect(cicilanTerbayar(jadwal, 2_000_000n)).toBe(2);
    // Pembayaran sebagian belum menutup cicilan mana pun.
    expect(cicilanTerbayar(jadwal, 999_999n)).toBe(0);
  });

  it("menunjuk cicilan pertama yang belum tertutup", () => {
    const berikut = cicilanBerikutnya(skema, 1_000_000n);
    expect(berikut?.urutan).toBe(2);
    expect(berikut?.jatuhTempo.toISOString().slice(0, 10)).toBe("2026-10-01");
  });

  it("null saat semua cicilan sudah tertutup", () => {
    expect(cicilanBerikutnya(skema, 3_000_000n)).toBeNull();
  });
});

describe("sudahTerlambat", () => {
  const hariIni = new Date(2026, 8, 15, 10, 0, 0); // 15 Sep 2026, waktu lokal

  it("true untuk transaksi berjalan yang jatuh temponya lewat", () => {
    expect(sudahTerlambat({ status: "BERJALAN", jatuhTempo: tgl("2026-09-14") }, hariIni)).toBe(true);
  });

  it("false pada hari-H itu sendiri", () => {
    expect(sudahTerlambat({ status: "BERJALAN", jatuhTempo: tgl("2026-09-15") }, hariIni)).toBe(false);
  });

  it("false untuk status selain BERJALAN, meski jatuh temponya lewat", () => {
    for (const status of ["DRAFT", "SELESAI", "BATAL"]) {
      expect(sudahTerlambat({ status, jatuhTempo: tgl("2026-01-01") }, hariIni)).toBe(false);
    }
  });

  it("false bila tidak punya jatuh tempo", () => {
    expect(sudahTerlambat({ status: "BERJALAN", jatuhTempo: null }, hariIni)).toBe(false);
  });
});

describe("totalKewajiban", () => {
  it("sama dengan pokok bila tidak ada margin", () => {
    expect(totalKewajiban({ pokok: 5_000_000n })).toBe(5_000_000n);
    expect(totalKewajiban({ pokok: 5_000_000n, margin: null })).toBe(5_000_000n);
  });

  it("menambahkan margin pada akad murabahah", () => {
    expect(totalKewajiban({ pokok: 10_000_000n, margin: 2_000_000n })).toBe(12_000_000n);
  });
});

describe("jadwal cicilan murabahah", () => {
  const akad = {
    pokok: 10_000_000n,
    margin: 2_000_000n,
    tenorCicilan: 12,
    periodeCicilan: "BULANAN",
    mulaiCicilan: tgl("2026-09-01"),
  };

  it("membagi harga jual, bukan harga pokok", () => {
    const jadwal = jadwalCicilan(akad);
    // 12jt / 12 = 1jt sebulan; kalau yang dibagi pokoknya, angkanya jadi 833.333
    // dan operator menagih kurang tiap bulan selama setahun.
    expect(jadwal[0].jumlah).toBe(1_000_000n);
    expect(jadwal.reduce((t, b) => t + b.jumlah, 0n)).toBe(12_000_000n);
  });

  it("belum menutup cicilan terakhir saat baru sebesar pokok yang dibayar", () => {
    expect(cicilanTerbayar(jadwalCicilan(akad), 10_000_000n)).toBe(10);
    expect(cicilanBerikutnya(akad, 10_000_000n)?.urutan).toBe(11);
  });
});
