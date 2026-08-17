import { prisma } from "../db.js";
import { config } from "../config.js";
import type { JenisDokumen } from "../types.js";
import {
  amankanNamaBerkas,
  daftarBerkas,
  hapusBerkas,
  hapusTautan,
  infoBerkas,
  normalisasiPath,
  pindahBerkas,
  resolveTautanNextcloud,
  tautanPublik,
  unggahBerkas,
} from "./nextcloud.js";

const MIME_DIIZINKAN = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

// Batas Bot API saat mengunduh berkas dari Telegram; Nextcloud sendiri sanggup
// lebih besar, tapi berkasnya tetap harus lewat bot dulu.
const MAX_BYTES = 20 * 1024 * 1024;

export function validasiDokumen(mimeType: string | undefined, fileSize: number | undefined) {
  if (!mimeType || !MIME_DIIZINKAN.has(mimeType)) {
    return "Jenis file tidak didukung. Gunakan PDF, JPG, PNG, atau DOC/DOCX.";
  }
  if (fileSize && fileSize > MAX_BYTES) {
    return "Ukuran file melebihi 20 MB.";
  }
  return null;
}

/** Potongan judul yang aman dipakai sebagai nama folder. */
function slug(teks: string): string {
  return (
    teks
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "tanpa-judul"
  );
}

/**
 * Folder Nextcloud untuk satu transaksi: satu subfolder per muamalah di bawah
 * folder jenisnya, dinamai "<id>-<slug judul>". ID di depan membuat folder tetap
 * bisa dicocokkan ke transaksi walau judulnya kemudian diedit.
 */
export function folderMuamalah(muamalah: { id: number; jenis: string; judul: string }): string {
  const namaJenis = config.nextcloud.folderJenis[muamalah.jenis] ?? "Lainnya";
  return normalisasiPath(
    `${config.nextcloud.baseDir}/${namaJenis}/${muamalah.id}-${slug(muamalah.judul)}`
  );
}

export function folderTemplate(): string {
  return normalisasiPath(config.nextcloud.templateDir);
}

/**
 * Mencari nama berkas yang belum terpakai di sebuah folder dengan menyisipkan
 * " (2)", " (3)", dst sebelum ekstensi — supaya unggahan bernama sama tidak
 * diam-diam menimpa dokumen yang sudah ada di Nextcloud.
 */
async function namaBelumTerpakai(folder: string, namaFile: string): Promise<string> {
  const isi = await daftarBerkas(folder);
  const terpakai = new Set(isi.map((b) => b.nama.toLowerCase()));
  if (!terpakai.has(namaFile.toLowerCase())) return namaFile;

  const titik = namaFile.lastIndexOf(".");
  const dasar = titik > 0 ? namaFile.slice(0, titik) : namaFile;
  const ext = titik > 0 ? namaFile.slice(titik) : "";
  for (let i = 2; i < 100; i++) {
    const kandidat = `${dasar} (${i})${ext}`;
    if (!terpakai.has(kandidat.toLowerCase())) return kandidat;
  }
  return `${dasar} (${Date.now()})${ext}`;
}

// --- Dokumen per akad ------------------------------------------------------

export async function simpanDokumen(opts: {
  muamalah: { id: number; jenis: string; judul: string };
  namaFile: string;
  mimeType: string;
  isiFile: Buffer;
  jenis: JenisDokumen;
  diunggahOlehId: number;
}) {
  const folder = folderMuamalah(opts.muamalah);
  const nama = await namaBelumTerpakai(folder, amankanNamaBerkas(opts.namaFile));
  const remotePath = `${folder}/${nama}`;

  await unggahBerkas(remotePath, opts.isiFile, opts.mimeType);
  const tautan = await tautanPublik(remotePath);

  return prisma.dokumen.create({
    data: {
      muamalahId: opts.muamalah.id,
      namaFile: nama,
      mimeType: opts.mimeType,
      ukuran: opts.isiFile.byteLength,
      remotePath,
      shareToken: tautan.token,
      shareUrl: tautan.url,
      jenis: opts.jenis,
      diunggahOlehId: opts.diunggahOlehId,
    },
  });
}

export async function ambilDokumen(id: number) {
  return prisma.dokumen.findUnique({ where: { id } });
}

/**
 * Mengembalikan link publik dokumen, membuatnya lebih dulu bila cache di DB
 * kosong atau share-nya sudah dicabut manual dari sisi Nextcloud.
 */
export async function tautanDokumen(id: number): Promise<string | null> {
  const dok = await prisma.dokumen.findUnique({ where: { id } });
  if (!dok) return null;
  if (dok.shareUrl) return dok.shareUrl;

  const tautan = await tautanPublik(dok.remotePath);
  await prisma.dokumen.update({
    where: { id },
    data: { shareToken: tautan.token, shareUrl: tautan.url },
  });
  return tautan.url;
}

export async function ubahNamaDokumen(id: number, namaBaru: string) {
  const dok = await prisma.dokumen.findUnique({ where: { id } });
  if (!dok) return null;

  const folder = dok.remotePath.slice(0, dok.remotePath.lastIndexOf("/"));
  // Ekstensi lama dipertahankan kalau operator lupa mengetiknya, supaya berkas
  // tidak kehilangan asosiasi aplikasinya di Nextcloud.
  const titikLama = dok.namaFile.lastIndexOf(".");
  const extLama = titikLama > 0 ? dok.namaFile.slice(titikLama) : "";
  let nama = amankanNamaBerkas(namaBaru);
  if (extLama && !nama.toLowerCase().endsWith(extLama.toLowerCase())) nama += extLama;
  if (nama === dok.namaFile) return dok;

  nama = await namaBelumTerpakai(folder, nama);
  const remotePath = `${folder}/${nama}`;
  await pindahBerkas(dok.remotePath, remotePath);

  // MOVE mempertahankan share yang menempel pada berkas, tapi tokennya bisa saja
  // sudah tidak valid kalau berkas sempat dipindah manual — ambil ulang.
  const tautan = await tautanPublik(remotePath).catch(() => null);
  return prisma.dokumen.update({
    where: { id },
    data: {
      namaFile: nama,
      remotePath,
      shareToken: tautan?.token ?? null,
      shareUrl: tautan?.url ?? null,
    },
  });
}

export async function hapusDokumen(id: number) {
  const dok = await prisma.dokumen.findUnique({ where: { id } });
  if (!dok) return null;

  // Share dicabut lebih dulu supaya link yang sudah beredar di chat langsung
  // mati, lalu berkasnya dihapus. Kegagalan mencabut share tidak boleh
  // menggagalkan penghapusan berkas — menghapus berkas juga mematikan share-nya.
  if (dok.shareToken) {
    await cabutShare(dok.remotePath).catch(() => {});
  }
  await hapusBerkas(dok.remotePath);
  return prisma.dokumen.delete({ where: { id } });
}

/**
 * Mencabut seluruh link publik pada sebuah path. Dicari ulang lewat OCS
 * (bukan pakai shareId tersimpan) karena share bisa dibuat ulang dari UI
 * Nextcloud tanpa sepengetahuan bot.
 */
async function cabutShare(remotePath: string): Promise<void> {
  const tautan = await tautanPublik(remotePath);
  await hapusTautan(tautan.shareId);
}

/**
 * Menyelaraskan daftar dokumen sebuah transaksi dengan isi foldernya di
 * Nextcloud: berkas yang ditaruh langsung lewat web Nextcloud didaftarkan, dan
 * baris DB yang berkasnya sudah tidak ada dibuang. Ini yang membuat operator
 * bisa bekerja dari sisi Nextcloud tanpa membuat data bot jadi bohong.
 */
export async function sinkronDokumen(
  muamalah: { id: number; jenis: string; judul: string },
  diunggahOlehId: number
): Promise<{ ditambah: number; dihapus: number }> {
  const folder = folderMuamalah(muamalah);
  const [berkas, tercatat] = await Promise.all([
    daftarBerkas(folder),
    prisma.dokumen.findMany({ where: { muamalahId: muamalah.id } }),
  ]);

  const pathRemote = new Set(berkas.map((b) => b.path));
  const pathTercatat = new Set(tercatat.map((d) => d.remotePath));

  const baru = berkas.filter((b) => !pathTercatat.has(b.path));
  for (const b of baru) {
    const tautan = await tautanPublik(b.path).catch(() => null);
    await prisma.dokumen.create({
      data: {
        muamalahId: muamalah.id,
        namaFile: b.nama,
        mimeType: b.mimeType,
        ukuran: b.ukuran,
        remotePath: b.path,
        shareToken: tautan?.token ?? null,
        shareUrl: tautan?.url ?? null,
        jenis: "AKAD",
        diunggahOlehId,
      },
    });
  }

  const hilang = tercatat.filter((d) => !pathRemote.has(d.remotePath));
  if (hilang.length > 0) {
    await prisma.dokumen.deleteMany({ where: { id: { in: hilang.map((d) => d.id) } } });
  }

  return { ditambah: baru.length, dihapus: hilang.length };
}

// --- Template akad ---------------------------------------------------------

export async function daftarTemplate() {
  return prisma.template.findMany({ orderBy: { judul: "asc" } });
}

export async function ambilTemplate(id: number) {
  return prisma.template.findUnique({ where: { id } });
}

export async function ambilTemplateByKode(kode: string) {
  return prisma.template.findUnique({ where: { kode } });
}

export class TemplateGandaError extends Error {
  constructor(readonly judulLain: string) {
    super(`Berkas itu sudah terdaftar sebagai template "${judulLain}".`);
    this.name = "TemplateGandaError";
  }
}

/**
 * Mendaftarkan berkas Nextcloud yang **sudah ada** sebagai template, dari
 * tautannya. Berkasnya tidak disalin maupun dipindah: bot hanya mencatat
 * penunjuk ke sana dan menyiapkan link berbaginya.
 *
 * Karena itu template boleh tinggal di folder mana pun, tidak harus di folder
 * template — yang menentukan bukan lokasinya, melainkan pendaftarannya di sini.
 */
export async function daftarkanTemplateDariTautan(opts: {
  kode: string;
  judul: string;
  tautan: string;
}) {
  const berkas = await resolveTautanNextcloud(opts.tautan);

  // remotePath unik di skema; tanpa cek ini, mendaftarkan berkas yang sama untuk
  // kode kedua akan gagal sebagai error constraint yang tidak bisa dibaca operator.
  const sudahAda = await prisma.template.findUnique({ where: { remotePath: berkas.path } });
  if (sudahAda && sudahAda.kode !== opts.kode) throw new TemplateGandaError(sudahAda.judul);

  const tautan = await tautanPublik(berkas.path);
  const data = {
    judul: opts.judul,
    namaFile: berkas.nama,
    mimeType: berkas.mimeType,
    ukuran: berkas.ukuran,
    remotePath: berkas.path,
    shareToken: tautan.token,
    shareUrl: tautan.url,
  };

  return prisma.template.upsert({
    where: { kode: opts.kode },
    create: { kode: opts.kode, ...data },
    update: data,
  });
}

export async function ubahJudulTemplate(id: number, judul: string) {
  return prisma.template.update({ where: { id }, data: { judul } });
}

export async function tautanTemplate(id: number): Promise<string | null> {
  const t = await prisma.template.findUnique({ where: { id } });
  if (!t) return null;
  if (t.shareUrl) return t.shareUrl;

  const tautan = await tautanPublik(t.remotePath);
  await prisma.template.update({
    where: { id },
    data: { shareToken: tautan.token, shareUrl: tautan.url },
  });
  return tautan.url;
}

/**
 * Melepas template dari daftar bot. **Berkasnya di Nextcloud tidak disentuh.**
 *
 * Template didaftarkan dari tautan ke berkas yang sudah ada — bot tidak pernah
 * jadi pemiliknya, dan berkas yang sama bisa saja dipakai di luar bot. Ikut
 * menghapusnya berarti mengambil keputusan atas milik orang lain. Link berbagi
 * juga dibiarkan hidup, karena share-nya bisa dibuat manusia lebih dulu dan
 * tautanPublik() memang memakai ulang share yang sudah ada.
 */
export async function lepasTemplate(id: number) {
  const t = await prisma.template.findUnique({ where: { id } });
  if (!t) return null;
  return prisma.template.delete({ where: { id } });
}

/**
 * Menyegarkan tiap template terdaftar terhadap keadaan Nextcloud: metadata
 * (nama berkas, ukuran, tipe) diperbarui kalau berkasnya diubah dari sisi
 * Nextcloud, dan baris yang berkasnya sudah tidak ada dilepas.
 *
 * Sinkron sengaja **tidak** mendaftarkan berkas baru sendiri. Sejak pendaftaran
 * dilakukan lewat tautan, daftar template adalah pilihan sadar admin — kalau
 * sinkron ikut memungut semua isi folder, template yang baru saja dilepas akan
 * muncul lagi dan pelepasan jadi terasa tidak berefek. Berkas folder template
 * yang belum terdaftar hanya dilaporkan, biar admin yang memutuskan.
 */
export async function sinkronTemplate(): Promise<{
  diperbarui: string[];
  dilepas: string[];
  belumTerdaftar: string[];
}> {
  const tercatat = await prisma.template.findMany();
  const diperbarui: string[] = [];
  const dilepas: { id: number; judul: string }[] = [];

  for (const t of tercatat) {
    const berkas = await infoBerkas(t.remotePath);
    if (!berkas) {
      dilepas.push({ id: t.id, judul: t.judul });
      continue;
    }
    if (
      berkas.nama !== t.namaFile ||
      berkas.ukuran !== t.ukuran ||
      berkas.mimeType !== t.mimeType ||
      !t.shareUrl
    ) {
      const tautan = t.shareUrl ? null : await tautanPublik(berkas.path).catch(() => null);
      await prisma.template.update({
        where: { id: t.id },
        data: {
          namaFile: berkas.nama,
          ukuran: berkas.ukuran,
          mimeType: berkas.mimeType,
          ...(tautan ? { shareToken: tautan.token, shareUrl: tautan.url } : {}),
        },
      });
      diperbarui.push(t.judul);
    }
  }

  if (dilepas.length > 0) {
    await prisma.template.deleteMany({ where: { id: { in: dilepas.map((t) => t.id) } } });
  }

  // Sekadar laporan: isi folder template yang belum jadi template terdaftar.
  const pathTercatat = new Set(tercatat.map((t) => t.remotePath));
  const isiFolder = await daftarBerkas(folderTemplate()).catch(() => []);
  const belumTerdaftar = isiFolder.filter((b) => !pathTercatat.has(b.path)).map((b) => b.nama);

  return { diperbarui, dilepas: dilepas.map((t) => t.judul), belumTerdaftar };
}
