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

// Web UI dimatikan secara default: instalasi lama yang cuma memakai bot tidak
// perlu tiba-tiba membuka port. Isi WEB_ENABLED=true untuk menyalakannya.
const webEnabled = /^(1|true|ya|yes)$/i.test(process.env.WEB_ENABLED?.trim() ?? "");

export const config = {
  botToken: required("BOT_TOKEN"),
  web: {
    enabled: webEnabled,
    port: Number(process.env.WEB_PORT ?? 3000),
    host: process.env.WEB_HOST ?? "0.0.0.0",
    // Cookie sesi diberi flag Secure kecuali dimatikan eksplisit — di balik
    // reverse proxy HTTPS itu yang benar, dan untuk uji coba di http://localhost
    // tinggal set WEB_SECURE_COOKIE=false.
    secureCookie: !/^(0|false|tidak|no)$/i.test(
      process.env.WEB_SECURE_COOKIE?.trim() ?? "true"
    ),
    // Umur sesi login web, dihitung sejak login (bukan sejak aktivitas terakhir).
    sesiJam: Number(process.env.WEB_SESSION_HOURS ?? 12),
  },
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
      MURABAHAH: "Murabahah",
      MUDHARABAH: "Mudharabah",
      MUSYARAKAH: "Musyarakah",
      LAINNYA: "Lainnya",
    } as Record<string, string>,
  },
};
