import { describe, expect, it, vi, beforeEach } from "vitest";

const prisma = {
  dokumen: {
    findUnique: vi.fn(),
    update: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    deleteMany: vi.fn(),
    findMany: vi.fn(),
  },
  template: { findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn() },
};

const nextcloud = {
  daftarBerkas: vi.fn(),
  hapusBerkas: vi.fn(),
  hapusTautan: vi.fn(),
  pindahBerkas: vi.fn(),
  tautanPublik: vi.fn(),
  unggahBerkas: vi.fn(),
  // Fungsi murni ini tidak perlu diganti palsu — perilaku aslinya yang diuji.
  amankanNamaBerkas: (n: string) => n,
  normalisasiPath: (p: string) => `/${p.split("/").filter(Boolean).join("/")}`,
};

/**
 * Path contoh, bukan folder milik siapa pun: config di-mock, jadi lokasi
 * penyimpanan yang sebenarnya (NEXTCLOUD_BASE_DIR di .env) tidak ikut ke sini.
 * vi.hoisted dipakai supaya satu nilai ini juga terlihat dari dalam factory
 * vi.mock yang di-hoist ke atas berkas.
 */
const BASE = vi.hoisted(() => "/Documents/Akad Muamalah");

vi.mock("../db.js", () => ({ prisma }));
vi.mock("./nextcloud.js", () => nextcloud);
vi.mock("../config.js", () => ({
  config: {
    nextcloud: {
      baseDir: BASE,
      templateDir: `${BASE}/Template Akad`,
      folderJenis: {
        UTANG: "Utang",
        PIUTANG: "Piutang",
        INVESTASI: "Investasi",
        QARDH: "Qardh",
        LAINNYA: "Lainnya",
      },
    },
  },
}));

const {
  folderMuamalah,
  simpanDokumen,
  ubahNamaDokumen,
  sinkronDokumen,
  sinkronTemplate,
  validasiDokumen,
} = await import("./dokumenService.js");

beforeEach(() => {
  vi.clearAllMocks();
  nextcloud.daftarBerkas.mockResolvedValue([]);
  nextcloud.tautanPublik.mockResolvedValue({
    shareId: "9",
    token: "tok123",
    url: "https://nc.example.com/s/tok123",
  });
});

describe("folderMuamalah", () => {
  it("menaruh transaksi di subfolder jenisnya, dinamai <id>-<slug judul>", () => {
    expect(folderMuamalah({ id: 12, jenis: "QARDH", judul: "Pinjaman Fulan" })).toBe(
      `${BASE}/Qardh/12-pinjaman-fulan`
    );
  });

  it("memakai folder Lainnya untuk jenis yang tidak dipetakan", () => {
    expect(folderMuamalah({ id: 3, jenis: "ENTAH", judul: "X" })).toBe(
      `${BASE}/Lainnya/3-x`
    );
  });

  it("tetap menghasilkan folder valid untuk judul tanpa karakter latin", () => {
    expect(folderMuamalah({ id: 7, jenis: "QARDH", judul: "قرض" })).toBe(
      `${BASE}/Qardh/7-tanpa-judul`
    );
  });
});

describe("simpanDokumen", () => {
  const muamalah = { id: 12, jenis: "QARDH", judul: "Pinjaman Fulan" };

  it("mengunggah ke folder transaksi lalu menyimpan path + link berbagi", async () => {
    prisma.dokumen.create.mockImplementation(async ({ data }: any) => ({ id: 1, ...data }));

    const hasil = await simpanDokumen({
      muamalah,
      namaFile: "akad.pdf",
      mimeType: "application/pdf",
      isiFile: Buffer.from("isi"),
      jenis: "AKAD",
      diunggahOlehId: 1,
    });

    expect(nextcloud.unggahBerkas).toHaveBeenCalledWith(
      `${BASE}/Qardh/12-pinjaman-fulan/akad.pdf`,
      expect.any(Buffer),
      "application/pdf"
    );
    expect(hasil.remotePath).toBe(
      `${BASE}/Qardh/12-pinjaman-fulan/akad.pdf`
    );
    expect(hasil.shareUrl).toBe("https://nc.example.com/s/tok123");
    expect(hasil.ukuran).toBe(3);
  });

  it("tidak menimpa berkas bernama sama, melainkan memberi akhiran urut", async () => {
    nextcloud.daftarBerkas.mockResolvedValue([
      { nama: "akad.pdf", path: "/x/akad.pdf" },
      { nama: "akad (2).pdf", path: "/x/akad (2).pdf" },
    ]);
    prisma.dokumen.create.mockImplementation(async ({ data }: any) => ({ id: 2, ...data }));

    const hasil = await simpanDokumen({
      muamalah,
      namaFile: "akad.pdf",
      mimeType: "application/pdf",
      isiFile: Buffer.from("isi"),
      jenis: "AKAD",
      diunggahOlehId: 1,
    });

    expect(hasil.namaFile).toBe("akad (3).pdf");
  });
});

describe("ubahNamaDokumen", () => {
  const dok = {
    id: 5,
    namaFile: "akad.pdf",
    remotePath: `${BASE}/Qardh/12-x/akad.pdf`,
  };

  it("memindahkan berkas di Nextcloud sebelum mencatat nama barunya", async () => {
    prisma.dokumen.findUnique.mockResolvedValue(dok);
    prisma.dokumen.update.mockImplementation(async ({ data }: any) => ({ ...dok, ...data }));

    const hasil = await ubahNamaDokumen(5, "Akad Qardh Final");

    expect(nextcloud.pindahBerkas).toHaveBeenCalledWith(
      dok.remotePath,
      `${BASE}/Qardh/12-x/Akad Qardh Final.pdf`
    );
    // Ekstensi lama ditempelkan karena operator tidak mengetiknya.
    expect(hasil?.namaFile).toBe("Akad Qardh Final.pdf");
  });

  it("tidak menggandakan ekstensi bila operator sudah mengetiknya", async () => {
    prisma.dokumen.findUnique.mockResolvedValue(dok);
    prisma.dokumen.update.mockImplementation(async ({ data }: any) => ({ ...dok, ...data }));

    const hasil = await ubahNamaDokumen(5, "Akad Final.pdf");
    expect(hasil?.namaFile).toBe("Akad Final.pdf");
  });

  it("tidak menyentuh Nextcloud kalau namanya tidak berubah", async () => {
    prisma.dokumen.findUnique.mockResolvedValue(dok);
    const hasil = await ubahNamaDokumen(5, "akad.pdf");

    expect(nextcloud.pindahBerkas).not.toHaveBeenCalled();
    expect(hasil).toBe(dok);
  });
});

describe("sinkronDokumen", () => {
  const muamalah = { id: 12, jenis: "QARDH", judul: "Pinjaman Fulan" };
  const folder = `${BASE}/Qardh/12-pinjaman-fulan`;

  it("mendaftarkan berkas baru dan melepas baris yang berkasnya sudah hilang", async () => {
    nextcloud.daftarBerkas.mockResolvedValue([
      { path: `${folder}/lama.pdf`, nama: "lama.pdf", ukuran: 10, mimeType: "application/pdf" },
      { path: `${folder}/baru.pdf`, nama: "baru.pdf", ukuran: 20, mimeType: "application/pdf" },
    ]);
    prisma.dokumen.findMany.mockResolvedValue([
      { id: 1, remotePath: `${folder}/lama.pdf` },
      { id: 2, remotePath: `${folder}/sudah-dihapus.pdf` },
    ]);

    const hasil = await sinkronDokumen(muamalah, 1);

    expect(hasil).toEqual({ ditambah: 1, dihapus: 1 });
    expect(prisma.dokumen.create).toHaveBeenCalledTimes(1);
    expect(prisma.dokumen.create.mock.calls[0][0].data).toMatchObject({
      namaFile: "baru.pdf",
      remotePath: `${folder}/baru.pdf`,
      shareUrl: "https://nc.example.com/s/tok123",
    });
    expect(prisma.dokumen.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [2] } } });
  });

  it("tidak mengubah apa pun kalau isi folder sudah sama dengan database", async () => {
    nextcloud.daftarBerkas.mockResolvedValue([
      { path: `${folder}/a.pdf`, nama: "a.pdf", ukuran: 1, mimeType: "application/pdf" },
    ]);
    prisma.dokumen.findMany.mockResolvedValue([{ id: 1, remotePath: `${folder}/a.pdf` }]);

    expect(await sinkronDokumen(muamalah, 1)).toEqual({ ditambah: 0, dihapus: 0 });
    expect(prisma.dokumen.create).not.toHaveBeenCalled();
    expect(prisma.dokumen.deleteMany).not.toHaveBeenCalled();
  });
});

describe("sinkronTemplate", () => {
  it("menurunkan kode dari nama berkas dan menghindari tabrakan kode", async () => {
    const dir = `${BASE}/Template Akad`;
    nextcloud.daftarBerkas.mockResolvedValue([
      { path: `${dir}/Template Akad Qardh.docx`, nama: "Template Akad Qardh.docx", ukuran: 1, mimeType: "application/msword" },
      { path: `${dir}/Akad Qardh.pdf`, nama: "Akad Qardh.pdf", ukuran: 2, mimeType: "application/pdf" },
    ]);
    prisma.template.findMany.mockResolvedValue([]);

    const hasil = await sinkronTemplate();

    const kode = prisma.template.create.mock.calls.map((c: any) => c[0].data.kode);
    expect(kode).toEqual(["akad-qardh", "akad-qardh-2"]);
    expect(hasil.ditambah).toEqual(["Template Akad Qardh", "Akad Qardh"]);
    expect(hasil.dihapus).toEqual([]);
  });

  it("melepas template yang berkasnya sudah tidak ada di Nextcloud", async () => {
    nextcloud.daftarBerkas.mockResolvedValue([]);
    prisma.template.findMany.mockResolvedValue([
      { id: 4, kode: "qardh", judul: "Akad Qardh", remotePath: "/hilang.docx" },
    ]);

    const hasil = await sinkronTemplate();

    expect(hasil.dihapus).toEqual(["Akad Qardh"]);
    expect(prisma.template.deleteMany).toHaveBeenCalledWith({ where: { id: { in: [4] } } });
  });
});

describe("validasiDokumen", () => {
  it("menolak jenis berkas di luar daftar", () => {
    expect(validasiDokumen("application/zip", 100)).toMatch(/tidak didukung/);
  });

  it("menolak berkas di atas 20 MB", () => {
    expect(validasiDokumen("application/pdf", 21 * 1024 * 1024)).toMatch(/20 MB/);
  });

  it("meloloskan PDF berukuran wajar", () => {
    expect(validasiDokumen("application/pdf", 1024)).toBeNull();
  });
});
