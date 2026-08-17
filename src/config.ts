import "dotenv/config";
import path from "node:path";

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Environment variable ${name} wajib diisi (lihat .env.example)`);
  }
  return value;
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

export const config = {
  botToken: required("BOT_TOKEN"),
  groupId,
  adminIds,
  timezone: process.env.TZ ?? "Asia/Jakarta",
  dataDir,
  documentsDir: path.join(dataDir, "documents"),
  templatesDir: path.join(dataDir, "templates"),
};
