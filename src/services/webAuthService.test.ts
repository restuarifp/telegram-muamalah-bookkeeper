import { beforeEach, describe, expect, it, vi } from "vitest";

const prisma = {
  operator: { findUnique: vi.fn() },
  kodeLogin: {
    count: vi.fn(),
    create: vi.fn(),
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  },
  sesiWeb: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
};

vi.mock("../db.js", () => ({ prisma }));
vi.mock("../config.js", () => ({
  config: { botToken: "token-uji:rahasia", web: { sesiJam: 12 } },
}));

const {
  MAX_PERCOBAAN,
  ambilSesi,
  buatKode,
  csrfSah,
  hashRahasia,
  mintaKodeLogin,
  tokenCsrf,
  verifikasiKode,
} = await import("./webAuthService.js");

const OPERATOR = { id: 7, telegramUserId: "123456789", nama: "Budi", role: "OPERATOR", aktif: true };

beforeEach(() => {
  vi.clearAllMocks();
  prisma.kodeLogin.count.mockResolvedValue(0);
  prisma.kodeLogin.create.mockImplementation(({ data }: any) => Promise.resolve(data));
  prisma.kodeLogin.updateMany.mockResolvedValue({ count: 0 });
  prisma.kodeLogin.update.mockImplementation(({ data }: any) =>
    Promise.resolve({ percobaan: data.percobaan?.increment ?? 0 })
  );
  prisma.sesiWeb.create.mockImplementation(({ data }: any) => Promise.resolve(data));
});

describe("buatKode", () => {
  it("selalu enam angka, termasuk yang berawalan nol", () => {
    for (let i = 0; i < 200; i++) expect(buatKode()).toMatch(/^\d{6}$/);
  });
});

describe("hashRahasia", () => {
  it("tetap sama untuk masukan sama dan berbeda untuk masukan lain", () => {
    expect(hashRahasia("123456")).toBe(hashRahasia("123456"));
    expect(hashRahasia("123456")).not.toBe(hashRahasia("123457"));
  });

  it("tidak menyimpan nilai aslinya", () => {
    expect(hashRahasia("123456")).not.toContain("123456");
  });
});

describe("token CSRF", () => {
  it("cocok hanya untuk token sesi yang sama", () => {
    const sesi = "abc";
    expect(csrfSah(sesi, tokenCsrf(sesi))).toBe(true);
    expect(csrfSah(sesi, tokenCsrf("lain"))).toBe(false);
    expect(csrfSah(sesi, undefined)).toBe(false);
    expect(csrfSah(sesi, "")).toBe(false);
  });

  it("bukan token sesinya sendiri, supaya bocornya satu tidak membocorkan yang lain", () => {
    expect(tokenCsrf("abc")).not.toBe("abc");
  });
});

describe("mintaKodeLogin", () => {
  it("menolak ID yang tidak terdaftar", async () => {
    prisma.operator.findUnique.mockResolvedValue(null);
    expect(await mintaKodeLogin("999")).toEqual({ status: "tidak_terdaftar" });
    expect(prisma.kodeLogin.create).not.toHaveBeenCalled();
  });

  it("menolak operator yang sudah dinonaktifkan", async () => {
    prisma.operator.findUnique.mockResolvedValue({ ...OPERATOR, aktif: false });
    expect(await mintaKodeLogin(OPERATOR.telegramUserId)).toEqual({ status: "tidak_terdaftar" });
  });

  it("menolak permintaan yang terlalu sering", async () => {
    prisma.operator.findUnique.mockResolvedValue(OPERATOR);
    prisma.kodeLogin.count.mockResolvedValue(5);
    expect(await mintaKodeLogin(OPERATOR.telegramUserId)).toEqual({ status: "terlalu_sering" });
    expect(prisma.kodeLogin.create).not.toHaveBeenCalled();
  });

  it("menyimpan kode dalam bentuk hash, bukan teks polos", async () => {
    prisma.operator.findUnique.mockResolvedValue(OPERATOR);
    const hasil = await mintaKodeLogin(OPERATOR.telegramUserId);
    if (hasil.status !== "terkirim") throw new Error("harusnya terkirim");

    const data = prisma.kodeLogin.create.mock.calls[0][0].data;
    expect(data.kodeHash).toBe(hashRahasia(hasil.kode));
    expect(data.kodeHash).not.toBe(hasil.kode);
    expect(data.kedaluwarsa.getTime()).toBeGreaterThan(Date.now());
  });

  it("membatalkan kode lama supaya hanya satu yang hidup per operator", async () => {
    prisma.operator.findUnique.mockResolvedValue(OPERATOR);
    await mintaKodeLogin(OPERATOR.telegramUserId);
    expect(prisma.kodeLogin.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { operatorId: OPERATOR.id, dipakaiPada: null } })
    );
  });
});

function permintaan(ubah: Record<string, unknown> = {}) {
  return {
    id: "permintaan-1",
    operatorId: OPERATOR.id,
    operator: OPERATOR,
    kodeHash: hashRahasia("123456"),
    percobaan: 0,
    kedaluwarsa: new Date(Date.now() + 60_000),
    dipakaiPada: null,
    ...ubah,
  };
}

describe("verifikasiKode", () => {
  it("menukar kode benar dengan sesi, dan menandai kodenya terpakai", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(permintaan());
    const hasil = await verifikasiKode("permintaan-1", "123456");

    expect(hasil.status).toBe("ok");
    if (hasil.status !== "ok") return;
    expect(prisma.kodeLogin.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dipakaiPada: expect.any(Date) }) })
    );
    // Token sesi pun disimpan ter-hash: baris ini setara sesi yang bisa dipakai.
    const data = prisma.sesiWeb.create.mock.calls[0][0].data;
    expect(data.tokenHash).toBe(hashRahasia(hasil.tokenSesi));
    expect(data.operatorId).toBe(OPERATOR.id);
  });

  it("menghitung percobaan gagal dan menyisakan jatah", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(permintaan({ percobaan: 1 }));
    prisma.kodeLogin.update.mockResolvedValue({ percobaan: 2 });

    const hasil = await verifikasiKode("permintaan-1", "000000");
    expect(hasil).toEqual({ status: "kode_salah", sisaPercobaan: MAX_PERCOBAAN - 2 });
    expect(prisma.sesiWeb.create).not.toHaveBeenCalled();
  });

  it("berhenti melayani setelah percobaan habis, walau kodenya kemudian benar", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(permintaan({ percobaan: MAX_PERCOBAAN }));
    expect(await verifikasiKode("permintaan-1", "123456")).toEqual({ status: "percobaan_habis" });
    expect(prisma.sesiWeb.create).not.toHaveBeenCalled();
  });

  it("menolak kode kedaluwarsa", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(
      permintaan({ kedaluwarsa: new Date(Date.now() - 1000) })
    );
    expect(await verifikasiKode("permintaan-1", "123456")).toEqual({ status: "kedaluwarsa" });
  });

  it("menolak kode yang sudah ditukar", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(permintaan({ dipakaiPada: new Date() }));
    expect(await verifikasiKode("permintaan-1", "123456")).toEqual({ status: "tidak_ada" });
  });

  it("menolak permintaan yang tidak dikenal", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(null);
    expect(await verifikasiKode("entah", "123456")).toEqual({ status: "tidak_ada" });
  });

  it("menolak operator yang dinonaktifkan di sela pengiriman dan penukaran", async () => {
    prisma.kodeLogin.findUnique.mockResolvedValue(
      permintaan({ operator: { ...OPERATOR, aktif: false } })
    );
    expect(await verifikasiKode("permintaan-1", "123456")).toEqual({ status: "tidak_ada" });
    expect(prisma.sesiWeb.create).not.toHaveBeenCalled();
  });
});

describe("ambilSesi", () => {
  const sesi = {
    tokenHash: hashRahasia("token-sesi"),
    operatorId: OPERATOR.id,
    operator: OPERATOR,
    kantorFilter: null,
    kedaluwarsa: new Date(Date.now() + 60_000),
    terakhirAktif: new Date(),
  };

  it("mengembalikan operator untuk sesi yang masih berlaku", async () => {
    prisma.sesiWeb.findUnique.mockResolvedValue(sesi);
    const hasil = await ambilSesi("token-sesi");
    expect(hasil?.operator.id).toBe(OPERATOR.id);
    // Tidak menulis ulang terakhirAktif untuk sesi yang baru saja dipakai.
    expect(prisma.sesiWeb.update).not.toHaveBeenCalled();
  });

  it("menolak sesi kedaluwarsa", async () => {
    prisma.sesiWeb.findUnique.mockResolvedValue({
      ...sesi,
      kedaluwarsa: new Date(Date.now() - 1000),
    });
    expect(await ambilSesi("token-sesi")).toBeNull();
  });

  it("menolak sesi milik operator yang sudah dinonaktifkan", async () => {
    prisma.sesiWeb.findUnique.mockResolvedValue({
      ...sesi,
      operator: { ...OPERATOR, aktif: false },
    });
    expect(await ambilSesi("token-sesi")).toBeNull();
  });

  it("menyegarkan terakhirAktif hanya setelah lewat beberapa menit", async () => {
    prisma.sesiWeb.findUnique.mockResolvedValue({
      ...sesi,
      terakhirAktif: new Date(Date.now() - 10 * 60_000),
    });
    await ambilSesi("token-sesi");
    expect(prisma.sesiWeb.update).toHaveBeenCalledOnce();
  });
});
