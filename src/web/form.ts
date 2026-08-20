/**
 * Pembacaan nilai formulir. Hono mengembalikan `string | File` (atau larik
 * keduanya) untuk tiap field, sementara hampir semua handler di sini cuma mau
 * teks — helper ini yang menyaringnya di satu tempat, supaya rute tidak penuh
 * pemeriksaan `typeof ... === "string"`.
 */
export type Formulir = Record<string, string | File | (string | File)[]>;

export function teks(body: Formulir, nama: string): string {
  const nilai = body[nama];
  return typeof nilai === "string" ? nilai.trim() : "";
}

/** Sama seperti teks(), tapi string kosong dianggap "tidak diisi". */
export function opsional(body: Formulir, nama: string): string | null {
  const nilai = teks(body, nama);
  return nilai === "" ? null : nilai;
}

export function berkas(body: Formulir, nama: string): File | null {
  const nilai = body[nama];
  // Unggahan kosong tetap terkirim sebagai File berukuran 0 dengan nama kosong.
  if (nilai instanceof File && nilai.size > 0 && nilai.name) return nilai;
  return null;
}
