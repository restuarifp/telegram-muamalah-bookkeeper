import { describe, expect, it, vi } from "vitest";

vi.mock("../db.js", () => ({ prisma: {} }));
vi.mock("../config.js", () => ({ config: { groupId: undefined, adminIds: [] } }));

const { pilihPengingat } = await import("./pengingatService.js");
const { formatRupiah } = await import("../utils/format.js");

const tgl = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
// 15 Sep 2026, waktu lokal — pilihPengingat menormalkan ke tanggal kalender.
const hariIni = new Date(Date.UTC(2026, 8, 15));

const cicilanBulanan = {
  pokok: 3_000_000n,
  jatuhTempo: tgl("2026-12-01"),
  tenorCicilan: 3,
  periodeCicilan: "BULANAN",
  mulaiCicilan: tgl("2026-09-01"),
};

describe("pilihPengingat — transaksi bercicilan", () => {
  it("mengingatkan cicilan yang jatuh tepat pada offset H-7", () => {
    // Cicilan ke-2 jatuh 01 Okt; dari 24 Sep itu H-7.
    const hasil = pilihPengingat(
      { ...cicilanBulanan, angsuran: [{ jumlah: 1_000_000n }] },
      new Date(Date.UTC(2026, 8, 24))
    );
    const upcoming = hasil.filter((h) => h.offsetHari >= 0);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].urutanCicilan).toBe(2);
    expect(upcoming[0].urgensi).toBe("H-7");
    expect(upcoming[0].rincian).toContain("Cicilan ke-2/3");
  });

  it("tidak mengingatkan cicilan yang sudah tertutup pembayaran", () => {
    // Cicilan ke-1 (01 Sep) sudah lewat, tapi sudah dibayar penuh.
    const hasil = pilihPengingat(
      { ...cicilanBulanan, angsuran: [{ jumlah: 1_000_000n }] },
      hariIni
    );
    expect(hasil.every((h) => h.urutanCicilan !== 1)).toBe(true);
  });

  it("mengingatkan cicilan terlambat yang belum dibayar", () => {
    const hasil = pilihPengingat({ ...cicilanBulanan, angsuran: [] }, hariIni);
    const telat = hasil.filter((h) => h.offsetHari < -100);
    expect(telat).toHaveLength(1);
    expect(telat[0].urutanCicilan).toBe(1);
    expect(telat[0].urgensi).toBe("Terlambat 14 hari");
  });

  it("menggabungkan banyak tunggakan jadi satu entri, bukan satu pesan per cicilan", () => {
    // Dari 15 Des, cicilan ke-1/2/3 (Sep, Okt, Nov) semuanya lewat dan belum dibayar.
    const hasil = pilihPengingat(
      { ...cicilanBulanan, angsuran: [] },
      new Date(Date.UTC(2026, 11, 15))
    );
    expect(hasil).toHaveLength(1);
    expect(hasil[0].urutanCicilan).toBe(1);
    expect(hasil[0].rincian).toContain("3 cicilan tertunggak");
    expect(hasil[0].rincian).toContain("ke-1 s/d ke-3");
    // formatRupiah memakai non-breaking space, jadi bandingkan lewat formatter
    // yang sama alih-alih menulis literal "Rp 3.000.000".
    expect(hasil[0].rincian).toContain(formatRupiah(3_000_000n));
  });

  it("key tunggakan berubah tiap minggu supaya ditagih ulang", () => {
    const mingguIni = pilihPengingat({ ...cicilanBulanan, angsuran: [] }, new Date(Date.UTC(2026, 8, 8)));
    const mingguDepan = pilihPengingat({ ...cicilanBulanan, angsuran: [] }, new Date(Date.UTC(2026, 8, 15)));
    expect(mingguIni[0].offsetHari).not.toBe(mingguDepan[0].offsetHari);
  });

  it("jatuhTempo transaksi tidak ikut memicu pengingat saat ada cicilan", () => {
    // 24 Nov = H-7 dari jatuhTempo transaksi (01 Des), tapi tidak ada cicilan
    // yang jatuh pada offset itu, dan semua cicilan sudah dibayar lunas.
    const hasil = pilihPengingat(
      { ...cicilanBulanan, angsuran: [{ jumlah: 3_000_000n }] },
      new Date(Date.UTC(2026, 10, 24))
    );
    expect(hasil).toEqual([]);
  });
});

describe("pilihPengingat — transaksi tanpa cicilan", () => {
  const tanpaCicilan = {
    pokok: 1_000_000n,
    tenorCicilan: null,
    periodeCicilan: null,
    mulaiCicilan: null,
    angsuran: [],
  };

  it("memakai jatuhTempo transaksi dengan urutan 0", () => {
    const hasil = pilihPengingat(
      { ...tanpaCicilan, jatuhTempo: tgl("2026-09-16") },
      hariIni
    );
    expect(hasil).toHaveLength(1);
    expect(hasil[0].urutanCicilan).toBe(0);
    expect(hasil[0].urgensi).toBe("H-1");
  });

  it("menandai terlambat saat jatuh tempo sudah lewat", () => {
    const hasil = pilihPengingat({ ...tanpaCicilan, jatuhTempo: tgl("2026-09-01") }, hariIni);
    expect(hasil[0].urgensi).toBe("Terlambat 14 hari");
    expect(hasil[0].offsetHari).toBeLessThan(-100);
  });

  it("diam saja di luar offset pengingat", () => {
    expect(pilihPengingat({ ...tanpaCicilan, jatuhTempo: tgl("2026-09-20") }, hariIni)).toEqual([]);
  });

  it("diam saja bila tidak punya jatuh tempo", () => {
    expect(pilihPengingat({ ...tanpaCicilan, jatuhTempo: null }, hariIni)).toEqual([]);
  });
});
