import { DatabaseSync } from "node:sqlite";
import { PrismaClient } from "@prisma/client";

/**
 * Memindahkan isi database SQLite lama ke PostgreSQL.
 *
 * Dijalankan sekali saat pindah mesin penyimpanan, bukan bagian dari migrasi
 * Prisma: `prisma migrate` mengurus bentuk tabel, sedangkan isinya tinggal di
 * berkas .db yang sudah tidak dibaca siapa pun setelah provider diganti.
 *
 *   npx tsx scripts/migrasi-sqlite-ke-postgres.ts backup/muamalah.db
 *
 * Sifatnya: **id dipertahankan** (dokumen, audit log, dan pengingat menunjuk
 * satu sama lain lewat id, dan folder Nextcloud dinamai memakai id transaksi),
 * dan tabel tujuan harus kosong — skrip menolak jalan kalau sudah ada isinya,
 * supaya tidak ada yang tanpa sengaja menggandakan data dengan menjalankannya
 * dua kali.
 */

const berkas = process.argv[2];
if (!berkas) {
  console.error("Gunakan: npx tsx scripts/migrasi-sqlite-ke-postgres.ts <berkas.db>");
  process.exit(1);
}

const prisma = new PrismaClient();
const sqlite = new DatabaseSync(berkas, { readOnly: true });

/** Urutan tabel = urutan ketergantungan foreign key; induk lebih dulu. */
const URUTAN = [
  "Kantor",
  "Operator",
  "Pihak",
  "Muamalah",
  "Angsuran",
  "Dokumen",
  "Template",
  "AuditLog",
  "Pengingat",
  "KodeLogin",
  "SesiWeb",
] as const;

type NamaTabel = (typeof URUTAN)[number];

/** Nama model Prisma (camelCase) untuk tiap tabel. */
const MODEL: Record<NamaTabel, string> = {
  Kantor: "kantor",
  Operator: "operator",
  Pihak: "pihak",
  Muamalah: "muamalah",
  Angsuran: "angsuran",
  Dokumen: "dokumen",
  Template: "template",
  AuditLog: "auditLog",
  Pengingat: "pengingat",
  KodeLogin: "kodeLogin",
  SesiWeb: "sesiWeb",
};

/**
 * Kolom yang harus dipulihkan tipenya. SQLite menyimpan apa adanya: boolean jadi
 * 0/1, tanggal jadi angka milidetik, dan BigInt bisa terbaca sebagai number —
 * ketiganya ditolak PostgreSQL kalau diteruskan mentah-mentah.
 */
const KOLOM_WAKTU = new Set([
  "createdAt",
  "updatedAt",
  "tanggalAkad",
  "jatuhTempo",
  "mulaiCicilan",
  "tanggal",
  "terkirimPada",
  "kedaluwarsa",
  "dipakaiPada",
  "terakhirAktif",
]);
const KOLOM_BOOLEAN = new Set(["aktif"]);
const KOLOM_BIGINT = new Set(["pokok", "jumlah", "margin"]);

/**
 * Tanggal di database lama tersimpan dalam **dua** bentuk, dan keduanya nyata
 * ada di satu tabel yang sama:
 *
 * - angka milidetik sejak epoch — baris yang ditulis Prisma;
 * - teks "YYYY-MM-DD HH:MM:SS" (UTC) — baris yang lahir dari
 *   `DEFAULT CURRENT_TIMESTAMP`, mis. kantor yang dibuat oleh migrasi SQL.
 *
 * Menganggap semuanya angka menghasilkan Invalid Date, dan kalau tidak dicegat
 * di sini ia akan lolos jadi tanggal ngawur di database baru.
 */
function keTanggal(nilai: unknown, kolom: string): Date {
  const tanggal =
    typeof nilai === "string"
      ? new Date(nilai.includes("T") ? nilai : `${nilai.replace(" ", "T")}Z`)
      : new Date(Number(nilai));
  if (Number.isNaN(tanggal.getTime())) {
    throw new Error(`Nilai tanggal tidak dikenali di kolom ${kolom}: ${JSON.stringify(nilai)}`);
  }
  return tanggal;
}

function rapikan(baris: Record<string, unknown>): Record<string, unknown> {
  const hasil: Record<string, unknown> = {};
  for (const [kolom, nilai] of Object.entries(baris)) {
    if (nilai === null || nilai === undefined) {
      hasil[kolom] = null;
    } else if (KOLOM_WAKTU.has(kolom)) {
      hasil[kolom] = keTanggal(nilai, kolom);
    } else if (KOLOM_BOOLEAN.has(kolom)) {
      hasil[kolom] = Boolean(nilai);
    } else if (KOLOM_BIGINT.has(kolom)) {
      hasil[kolom] = BigInt(nilai as string | number | bigint);
    } else {
      hasil[kolom] = nilai;
    }
  }
  return hasil;
}

async function main() {
  const klien = prisma as unknown as Record<string, { count(): Promise<number>; createMany(a: unknown): Promise<{ count: number }> }>;

  // Tabel tujuan wajib kosong: menjalankan skrip ini dua kali seharusnya tidak
  // mungkin menggandakan apa pun.
  const terisi: string[] = [];
  for (const tabel of URUTAN) {
    if ((await klien[MODEL[tabel]].count()) > 0) terisi.push(tabel);
  }
  if (terisi.length > 0) {
    console.error(
      `Tabel PostgreSQL berikut sudah berisi data: ${terisi.join(", ")}.\n` +
        "Kosongkan lebih dulu (mis. `prisma migrate reset`) sebelum memindahkan data."
    );
    process.exit(1);
  }

  const ringkasan: { tabel: string; jumlah: number }[] = [];
  for (const tabel of URUTAN) {
    const baris = sqlite.prepare(`SELECT * FROM "${tabel}"`).all() as Record<string, unknown>[];
    if (baris.length === 0) {
      ringkasan.push({ tabel, jumlah: 0 });
      continue;
    }
    await klien[MODEL[tabel]].createMany({ data: baris.map(rapikan) });
    ringkasan.push({ tabel, jumlah: baris.length });
  }

  // Menyalin baris berikut id-nya tidak ikut menggeser sequence milik kolom
  // SERIAL, jadi INSERT berikutnya akan memakai id 1 dan langsung bentrok.
  // Inilah langkah yang paling mudah terlupa saat pindah dari SQLite.
  for (const tabel of URUTAN) {
    if (tabel === "KodeLogin" || tabel === "SesiWeb") continue; // id-nya teks, bukan sequence
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('"${tabel}"', 'id'),
         COALESCE((SELECT MAX(id) FROM "${tabel}"), 0) + 1, false)`
    );
  }

  console.log("Pemindahan selesai:");
  for (const r of ringkasan) console.log(`  ${r.tabel.padEnd(12)} ${r.jumlah}`);
  console.log("Sequence id disetel ulang mengikuti id tertinggi tiap tabel.");
}

main()
  .catch((err) => {
    console.error("Pemindahan gagal:", err);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
