import "dotenv/config";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  }
  return value;
}

/** Membuang garis miring di ujung agar penggabungan URL/path tidak dobel. */
function rapikanPath(p: string): string {
  const bersih = p.trim().replace(/\/+$/, "");
  return bersih.startsWith("/") ? bersih : `/${bersih}`;
}

const dataDir = process.env.DATA_DIR ?? "./data";

// GROUP_ID opsional: kalau kosong, bot dipakai langsung lewat chat pribadi dan
// hanya merespons user yang ID-nya terdaftar di ADMIN_IDS.
const groupId = process.env.GROUP_ID?.trim() || undefined;
const adminIds = (process.env.ADMIN_IDS ?? "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

if (!groupId && adminIds.length === 0) {
  throw new Error(
    "GROUP_ID kosong, jadi ADMIN_IDS wajib diisi — jika tidak, bot tidak akan merespons siapa pun (lihat .env.example)"
  );
}

// Akar penyimpanan dokumen di Nextcloud, relatif terhadap folder milik
// NEXTCLOUD_USER. Subfolder per jenis muamalah (Qardh, Investasi, dst) ada di
// bawahnya, dan template akad punya folder sendiri.
const nextcloudBaseDir = rapikanPath(
  process.env.NEXTCLOUD_BASE_DIR ?? "/Documents/Akad Muamalah"
);

export const config = {
  botToken: required("BOT_TOKEN"),
  groupId,
  adminIds,
  timezone: process.env.TZ ?? "Asia/Jakarta",
  dataDir,
  nextcloud: {
    baseUrl: required("NEXTCLOUD_URL").replace(/\/+$/, ""),
    username: required("NEXTCLOUD_USER"),
    password: required("NEXTCLOUD_PASSWORD"),
    baseDir: nextcloudBaseDir,
    templateDir: `${nextcloudBaseDir}/${process.env.NEXTCLOUD_TEMPLATE_FOLDER ?? "Template Akad"}`,
    // Nama folder per jenis muamalah. Qardh & Investasi mengikuti folder yang
    // sudah ada di server; sisanya dibuat otomatis saat unggahan pertama.
    folderJenis: {
      UTANG: "Utang",
      PIUTANG: "Piutang",
      INVESTASI: "Investasi",
      QARDH: "Qardh",
      LAINNYA: "Lainnya",
    } as Record<string, string>,
  },
};
