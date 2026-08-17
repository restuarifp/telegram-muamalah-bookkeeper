import { XMLParser } from "fast-xml-parser";
import { config } from "../config.js";

/**
 * Klien tipis untuk Nextcloud: WebDAV (unggah/unduh/pindah/hapus berkas) plus
 * OCS Share API (membuat link publik). Sengaja tanpa SDK pihak ketiga — yang
 * dipakai cuma segelintir verb HTTP, dan SDK WebDAV yang ada rata-rata
 * membawa polyfill besar untuk fitur yang tidak kita sentuh.
 */

export class NextcloudError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail?: string
  ) {
    super(message);
    this.name = "NextcloudError";
  }
}

export interface BerkasNextcloud {
  /** Path relatif terhadap folder milik user, mis. "/Documents/base_dir/akad.pdf". */
  path: string;
  nama: string;
  ukuran: number;
  mimeType: string;
  diubahPada: Date | null;
}

const parser = new XMLParser({
  // Nextcloud memakai prefix d:/oc:/nc:; membuangnya bikin akses properti seragam.
  removeNSPrefix: true,
  // Satu <response> tetap harus terbaca sebagai array agar tidak perlu cabang khusus.
  isArray: (name) => name === "response",
});

function auth(): string {
  const { username, password } = config.nextcloud;
  return `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
}

function davRoot(): string {
  return `${config.nextcloud.baseUrl}/remote.php/dav/files/${encodeURIComponent(
    config.nextcloud.username
  )}`;
}

/**
 * Meng-encode tiap segmen path secara terpisah — `encodeURIComponent` pada path
 * utuh akan ikut mengubah "/" jadi "%2F" dan membuat WebDAV salah alamat.
 */
export function encodePath(path: string): string {
  return path
    .split("/")
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function davUrl(path: string): string {
  return `${davRoot()}/${encodePath(path)}`;
}

/** Menormalkan path: selalu diawali "/", tanpa segmen kosong atau ".." */
export function normalisasiPath(path: string): string {
  const segmen = path
    .split("/")
    .map((s) => s.trim())
    .filter((s) => s && s !== "." && s !== "..");
  return `/${segmen.join("/")}`;
}

/**
 * Membersihkan nama berkas dari karakter yang bermasalah di WebDAV/Windows,
 * sambil mempertahankan huruf, angka, spasi, titik, strip, dan kurung.
 */
export function amankanNamaBerkas(nama: string): string {
  const bersih = nama
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  // Nama yang isinya cuma pemisah ("///" jadi "---", atau "..") tidak punya
  // bagian yang bisa dikenali dan berisiko diartikan sebagai navigasi path,
  // jadi diganti nama netral alih-alih diloloskan.
  const punyaIsi = /[\p{L}\p{N}]/u.test(bersih);
  return punyaIsi ? bersih : `dokumen-${Date.now()}`;
}

async function davFetch(
  method: string,
  path: string,
  // `BodyInit` tidak tersedia tanpa lib DOM; dua bentuk ini yang sebenarnya
  // dipakai — XML untuk PROPFIND dan byte mentah untuk PUT.
  init: { body?: string | Uint8Array; headers?: Record<string, string> } = {}
): Promise<Response> {
  const res = await fetch(davUrl(path), {
    method,
    headers: { Authorization: auth(), ...init.headers },
    body: init.body,
  });
  return res;
}

async function pastikanSukses(res: Response, aksi: string): Promise<Response> {
  if (res.ok) return res;
  const detail = await res.text().catch(() => "");
  throw new NextcloudError(`${aksi} gagal (HTTP ${res.status})`, res.status, detail.slice(0, 500));
}

/**
 * Membuat folder beserta seluruh induknya. MKCOL tidak rekursif, jadi tiap
 * level dibuat berurutan; 405 (Method Not Allowed) berarti folder sudah ada dan
 * bukan kegagalan.
 */
export async function pastikanFolder(path: string): Promise<void> {
  const segmen = normalisasiPath(path).split("/").filter(Boolean);
  let berjalan = "";
  for (const s of segmen) {
    berjalan += `/${s}`;
    const res = await davFetch("MKCOL", berjalan);
    if (res.ok || res.status === 405) continue;
    const detail = await res.text().catch(() => "");
    throw new NextcloudError(
      `Gagal membuat folder "${berjalan}" di Nextcloud (HTTP ${res.status})`,
      res.status,
      detail.slice(0, 500)
    );
  }
}

export async function unggahBerkas(
  path: string,
  isi: Buffer,
  mimeType: string
): Promise<void> {
  const tujuan = normalisasiPath(path);
  const indukAkhir = tujuan.lastIndexOf("/");
  if (indukAkhir > 0) await pastikanFolder(tujuan.slice(0, indukAkhir));

  const res = await davFetch("PUT", tujuan, {
    body: new Uint8Array(isi),
    headers: { "Content-Type": mimeType, "Content-Length": String(isi.byteLength) },
  });
  await pastikanSukses(res, `Mengunggah "${tujuan}"`);
}

export async function unduhBerkas(path: string): Promise<Buffer> {
  const res = await davFetch("GET", normalisasiPath(path));
  await pastikanSukses(res, `Mengunduh "${path}"`);
  return Buffer.from(await res.arrayBuffer());
}

/** Menghapus berkas/folder. 404 dianggap sukses agar hapus bersifat idempoten. */
export async function hapusBerkas(path: string): Promise<void> {
  const res = await davFetch("DELETE", normalisasiPath(path));
  if (res.status === 404) return;
  await pastikanSukses(res, `Menghapus "${path}"`);
}

export async function pindahBerkas(dari: string, ke: string): Promise<void> {
  const tujuan = normalisasiPath(ke);
  const indukAkhir = tujuan.lastIndexOf("/");
  if (indukAkhir > 0) await pastikanFolder(tujuan.slice(0, indukAkhir));

  const res = await davFetch("MOVE", normalisasiPath(dari), {
    headers: { Destination: davUrl(tujuan), Overwrite: "F" },
  });
  await pastikanSukses(res, `Memindahkan "${dari}"`);
}

const PROPFIND_BODY = `<?xml version="1.0"?>
<d:propfind xmlns:d="DAV:" xmlns:oc="http://owncloud.org/ns">
  <d:prop>
    <d:getcontenttype/>
    <d:getcontentlength/>
    <d:getlastmodified/>
    <d:resourcetype/>
  </d:prop>
</d:propfind>`;

interface ResponsePropfind {
  href?: string;
  propstat?: unknown;
}

function propsDari(response: ResponsePropfind): Record<string, unknown> {
  // Nextcloud membalas beberapa <propstat>: satu berisi properti yang ada (200)
  // dan satu lagi berisi properti yang tidak berlaku (404). Hanya yang 200 dipakai.
  const daftar = Array.isArray(response.propstat) ? response.propstat : [response.propstat];
  for (const ps of daftar) {
    const entry = ps as { status?: string; prop?: Record<string, unknown> } | undefined;
    if (entry?.status?.includes(" 200 ")) return entry.prop ?? {};
  }
  return {};
}

/** Mengubah href WebDAV (ter-encode, berprefix root DAV) jadi path relatif user. */
function pathDariHref(href: string): string {
  const prefix = `/remote.php/dav/files/${encodeURIComponent(config.nextcloud.username)}`;
  const tanpaPrefix = href.startsWith(prefix) ? href.slice(prefix.length) : href;
  return normalisasiPath(decodeURIComponent(tanpaPrefix));
}

/**
 * Mendaftar isi folder (non-rekursif). Folder itu sendiri dan subfolder
 * disaring keluar — pemanggil hanya butuh berkas.
 */
export async function daftarBerkas(folder: string): Promise<BerkasNextcloud[]> {
  const path = normalisasiPath(folder);
  const res = await davFetch("PROPFIND", path, {
    body: PROPFIND_BODY,
    headers: { Depth: "1", "Content-Type": "application/xml" },
  });
  if (res.status === 404) return [];
  await pastikanSukses(res, `Membaca folder "${path}"`);

  const parsed = parser.parse(await res.text()) as {
    multistatus?: { response?: ResponsePropfind[] };
  };
  const responses = parsed.multistatus?.response ?? [];

  const hasil: BerkasNextcloud[] = [];
  for (const r of responses) {
    if (!r.href) continue;
    const itemPath = pathDariHref(String(r.href));
    if (itemPath === path) continue; // folder itu sendiri

    const prop = propsDari(r);
    // <resourcetype><collection/></resourcetype> menandai folder; berkas biasa
    // punya resourcetype kosong (string kosong setelah di-parse).
    const isFolder =
      prop.resourcetype != null &&
      typeof prop.resourcetype === "object" &&
      "collection" in (prop.resourcetype as object);
    if (isFolder) continue;

    const modified = prop.getlastmodified ? new Date(String(prop.getlastmodified)) : null;
    hasil.push({
      path: itemPath,
      nama: itemPath.slice(itemPath.lastIndexOf("/") + 1),
      ukuran: Number(prop.getcontentlength ?? 0),
      mimeType: String(prop.getcontenttype ?? "application/octet-stream"),
      diubahPada: modified && !Number.isNaN(modified.getTime()) ? modified : null,
    });
  }
  return hasil.sort((a, b) => a.nama.localeCompare(b.nama, "id"));
}

export async function berkasAda(path: string): Promise<boolean> {
  const res = await davFetch("PROPFIND", normalisasiPath(path), { headers: { Depth: "0" } });
  return res.ok;
}

// --- OCS Share API ---------------------------------------------------------

interface ShareOcs {
  id: string;
  share_type: number;
  token: string;
  url: string;
  path: string;
}

async function ocsFetch(
  method: string,
  endpoint: string,
  body?: unknown
): Promise<{ meta: { statuscode: number; message: string }; data: unknown }> {
  const res = await fetch(`${config.nextcloud.baseUrl}/ocs/v2.php${endpoint}`, {
    method,
    headers: {
      Authorization: auth(),
      "OCS-APIRequest": "true",
      Accept: "application/json",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const teks = await res.text();
  let parsed: { ocs?: { meta: { statuscode: number; message: string }; data: unknown } };
  try {
    parsed = JSON.parse(teks);
  } catch {
    throw new NextcloudError(
      `Balasan Nextcloud tidak dikenali (HTTP ${res.status})`,
      res.status,
      teks.slice(0, 500)
    );
  }
  if (!parsed.ocs) {
    throw new NextcloudError(`Balasan OCS kosong (HTTP ${res.status})`, res.status);
  }
  return parsed.ocs;
}

export interface TautanBerbagi {
  shareId: string;
  token: string;
  /** Link tampilan, mis. https://nc.example.com/s/abc123 */
  url: string;
}

const SHARE_ENDPOINT = "/apps/files_sharing/api/v1/shares";
const SHARE_TYPE_PUBLIC = 3;
const PERMISSION_READ = 1;

async function cariTautanPublik(path: string): Promise<TautanBerbagi | null> {
  const ocs = await ocsFetch(
    "GET",
    `${SHARE_ENDPOINT}?path=${encodeURIComponent(normalisasiPath(path))}&reshares=false`
  );
  if (ocs.meta.statuscode !== 200) return null;
  const shares = (Array.isArray(ocs.data) ? ocs.data : []) as ShareOcs[];
  const publik = shares.find((s) => s.share_type === SHARE_TYPE_PUBLIC);
  return publik ? { shareId: String(publik.id), token: publik.token, url: publik.url } : null;
}

/**
 * Mengembalikan link publik read-only untuk sebuah berkas, membuat share baru
 * bila belum ada. Idempoten: memanggil ulang untuk path yang sama akan memakai
 * share lama, bukan menumpuk link baru tiap kali dokumen dibuka.
 */
export async function tautanPublik(path: string): Promise<TautanBerbagi> {
  const adaSebelumnya = await cariTautanPublik(path);
  if (adaSebelumnya) return adaSebelumnya;

  const ocs = await ocsFetch("POST", SHARE_ENDPOINT, {
    path: normalisasiPath(path),
    shareType: SHARE_TYPE_PUBLIC,
    permissions: PERMISSION_READ,
  });
  if (ocs.meta.statuscode !== 200 && ocs.meta.statuscode !== 100) {
    // 403 di sini biasanya berarti admin Nextcloud mematikan "Allow public link
    // sharing" — pesan mentahnya lebih berguna daripada teks generik kita.
    throw new NextcloudError(
      `Gagal membuat link berbagi: ${ocs.meta.message}`,
      ocs.meta.statuscode
    );
  }
  const share = ocs.data as ShareOcs;
  return { shareId: String(share.id), token: share.token, url: share.url };
}

/** Mencabut link publik. Share yang sudah hilang tidak dianggap error. */
export async function hapusTautan(shareId: string): Promise<void> {
  const ocs = await ocsFetch("DELETE", `${SHARE_ENDPOINT}/${encodeURIComponent(shareId)}`);
  if (ocs.meta.statuscode === 404 || ocs.meta.statuscode === 200 || ocs.meta.statuscode === 100) {
    return;
  }
  throw new NextcloudError(`Gagal mencabut link berbagi: ${ocs.meta.message}`, ocs.meta.statuscode);
}

/** Link unduh langsung dari sebuah link berbagi publik. */
export function urlUnduh(shareUrl: string): string {
  return `${shareUrl.replace(/\/+$/, "")}/download`;
}
