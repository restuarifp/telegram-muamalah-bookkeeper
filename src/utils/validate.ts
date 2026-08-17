/**
 * Parser nominal rupiah dari input teks bebas operator.
 * Mendukung: "5jt", "5 juta", "5rb", "500 ribu", "5.000.000", "5000000", "5,5jt"
 */
export function parseNominal(input: string): bigint | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!raw) return null;

  const match = raw.match(/^rp\.?/)?.[0];
  const withoutPrefix = match ? raw.slice(match.length) : raw;

  const multiplierMatch = withoutPrefix.match(
    /^([\d.,]+)(jt|juta|rb|ribu|m|miliar)?$/
  );
  if (!multiplierMatch) return null;

  const [, numberPart, unit] = multiplierMatch;

  // Normalisasi angka: gunakan koma sebagai desimal jika ada, titik sebagai pemisah ribuan.
  let normalized: string;
  if (numberPart.includes(",") && unit) {
    // "5,5jt" -> desimal
    normalized = numberPart.replace(/\./g, "").replace(",", ".");
  } else {
    // "5.000.000" -> pemisah ribuan, buang semua titik/koma
    normalized = numberPart.replace(/[.,]/g, "");
  }

  const base = Number(normalized);
  if (Number.isNaN(base) || base < 0) return null;

  let multiplier = 1;
  if (unit === "jt" || unit === "juta") multiplier = 1_000_000;
  else if (unit === "rb" || unit === "ribu") multiplier = 1_000;
  else if (unit === "m" || unit === "miliar") multiplier = 1_000_000_000;

  const result = base * multiplier;
  if (!Number.isFinite(result)) return null;

  return BigInt(Math.round(result));
}

/**
 * Parser jumlah cicilan. Batas atas 600 (50 tahun bulanan) untuk menahan
 * salah ketik yang bikin jadwal meledak; "12x" dan "12 kali" ikut diterima.
 */
export function parseTenor(input: string): number | null {
  const raw = input.trim().toLowerCase().replace(/\s+/g, "");
  const m = raw.match(/^(\d+)(x|kali)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isInteger(n) || n < 1 || n > 600) return null;
  return n;
}

/**
 * Parser tanggal dari input teks bebas: "2026-09-01", "01-09-2026", "01/09/2026", "besok", "hari ini".
 */
export function parseTanggal(input: string, now: Date = new Date()): Date | null {
  const raw = input.trim().toLowerCase();
  if (!raw) return null;

  if (raw === "hari ini" || raw === "sekarang") {
    return startOfDay(now);
  }
  if (raw === "besok") {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return startOfDay(d);
  }

  // ISO: YYYY-MM-DD
  let m = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
  }

  // DD-MM-YYYY atau DD/MM/YYYY
  m = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    return buildDate(Number(m[3]), Number(m[2]), Number(m[1]));
  }

  return null;
}

function buildDate(year: number, month: number, day: number): Date | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return d;
}

function startOfDay(d: Date): Date {
  return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
}
