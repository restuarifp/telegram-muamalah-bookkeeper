import { Hono } from "hono";
import { prisma } from "../../db.js";
import {
  DokumenGandaError,
  DokumenTautanError,
  ambilDokumen,
  daftarkanDokumenDariTautan,
  hapusDokumen,
  simpanDokumen,
  sinkronDokumen,
  ubahNamaDokumen,
  validasiDokumen,
} from "../../services/dokumenService.js";
import { detailMuamalah } from "../../services/muamalahService.js";
import { NextcloudError, TautanTidakValidError } from "../../services/nextcloud.js";
import { catatAuditOperator } from "../../middlewares/audit.js";
import { isJenisDokumen, type JenisDokumen } from "../../types.js";
import { formatTanggal } from "../../utils/format.js";
import { formatUkuran } from "../../utils/tautan.js";
import type { SesiAktif } from "../../services/webAuthService.js";
import { gabung, html, type HtmlAman } from "../html.js";
import { bidangCsrf } from "../layout.js";
import { berkas, teks, type Formulir } from "../form.js";
import { opsiPilihan, tautanBerkas } from "../tampilan.js";
import { bolehAkses, kembali, type Ctx, type Lingkungan } from "../sesi.js";

export const rutDokumen = new Hono<Lingkungan>();

type Transaksi = NonNullable<Awaited<ReturnType<typeof detailMuamalah>>>;

const OPSI_JENIS = [
  { nilai: "AKAD", label: "Akad" },
  { nilai: "BUKTI", label: "Bukti" },
  { nilai: "LAINNYA", label: "Lainnya" },
];

/**
 * Kartu dokumen di halaman detail transaksi. Dirender di sini, bukan di
 * routes/muamalah.ts, supaya tampilan dan rutenya tetap satu berkas — keduanya
 * harus sama-sama tahu aturan sumber berkas (UNGGAH vs TAUTAN).
 */
export function kartuDokumen(m: Transaksi, sesi: SesiAktif): HtmlAman {
  const baris = m.dokumen.map((d) => {
    const tautan = d.sumber === "TAUTAN";
    const label = `${tautan ? "🔗" : "📄"} ${d.namaFile}`;
    return html`<tr>
  <td>
    ${d.shareUrl ? tautanBerkas(d.shareUrl, label) : label}<br>
    <span class="keterangan">${d.jenis} · ${formatUkuran(d.ukuran)} · ${formatTanggal(d.createdAt)}${tautan ? " · ditautkan" : ""}</span>
  </td>
  <td>
    <div class="baris-tombol">
      ${
        // Berkas bertaut milik orang lain: bot tidak pernah mengganti namanya.
        tautan
          ? null
          : html`<form method="post" action="/dokumen/${d.id}/nama" class="baris-tombol">
        ${bidangCsrf(sesi)}
        <input type="text" name="nama" value="${d.namaFile}" aria-label="Nama berkas">
        <button class="tombol tombol-kecil" type="submit">Ubah nama</button>
      </form>`
      }
      <form method="post" action="/dokumen/${d.id}/hapus" class="sebaris"
            data-konfirmasi="${tautan ? `Lepas "${d.namaFile}" dari daftar? Berkasnya di Nextcloud tetap utuh.` : `Hapus "${d.namaFile}"? Berkasnya ikut dihapus dari Nextcloud.`}">
        ${bidangCsrf(sesi)}
        <button class="tombol tombol-kecil tombol-bahaya" type="submit">${tautan ? "Lepas" : "Hapus"}</button>
      </form>
    </div>
  </td>
</tr>`;
  });

  return html`<div class="kartu">
  <h2>Dokumen <span class="keterangan">— disimpan di Nextcloud; 📄 diunggah bot, 🔗 hanya ditautkan</span></h2>
  ${
    m.dokumen.length === 0
      ? html`<p class="kosong">Belum ada dokumen akad.</p>`
      : html`<div class="tabel-bungkus"><table>
    <thead><tr><th>Berkas</th><th>Aksi</th></tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>`
  }

  <div class="grid grid-2 jarak-atas">
    <form method="post" action="/muamalah/${m.id}/dokumen" enctype="multipart/form-data">
      ${bidangCsrf(sesi)}
      <div class="bidang">
        <label for="berkas">Unggah berkas <span class="petunjuk">PDF, JPG, PNG, DOC/DOCX — maks 20 MB</span></label>
        <input type="file" id="berkas" name="berkas" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" required>
      </div>
      <div class="bidang">
        <label for="jenisUnggah">Jenis dokumen</label>
        <select id="jenisUnggah" name="jenis">${opsiPilihan(OPSI_JENIS, "AKAD")}</select>
      </div>
      <button class="tombol tombol-utama" type="submit">Unggah ke Nextcloud</button>
    </form>

    <form method="post" action="/muamalah/${m.id}/dokumen/tautkan">
      ${bidangCsrf(sesi)}
      <div class="bidang">
        <label for="tautan">Daftarkan dari tautan <span class="petunjuk">berkas yang sudah ada di Nextcloud</span></label>
        <input type="text" id="tautan" name="tautan" placeholder="tempel tautan Nextcloud atau path berkas" required>
      </div>
      <div class="bidang">
        <label for="jenisTautan">Jenis dokumen</label>
        <select id="jenisTautan" name="jenis">${opsiPilihan(OPSI_JENIS, "AKAD")}</select>
      </div>
      <div class="baris-tombol">
        <button class="tombol" type="submit">Tautkan</button>
        <button class="tombol" type="submit" form="sinkron-${m.id}">🔄 Sinkron folder</button>
      </div>
    </form>
  </div>
  <form method="post" action="/muamalah/${m.id}/dokumen/sinkron" id="sinkron-${m.id}">${bidangCsrf(sesi)}</form>
</div>`;
}

/** Kegagalan Nextcloud jadi pesan yang bisa ditindaklanjuti, bukan galat 500. */
async function coba<T>(c: Ctx, tujuan: string, aksi: () => Promise<T>): Promise<T | Response> {
  try {
    return await aksi();
  } catch (err) {
    if (err instanceof DokumenGandaError || err instanceof DokumenTautanError) {
      return kembali(c, tujuan, { jenis: "galat", teks: err.message });
    }
    if (err instanceof TautanTidakValidError) {
      return kembali(c, tujuan, { jenis: "galat", teks: `Tautan tidak dikenali: ${err.message}` });
    }
    if (err instanceof NextcloudError) {
      return kembali(c, tujuan, {
        jenis: "galat",
        teks: `Nextcloud menolak permintaan: ${err.message}`,
      });
    }
    console.error("[web] Gagal memproses dokumen:", err);
    return kembali(c, tujuan, {
      jenis: "galat",
      teks: "Gagal menghubungi Nextcloud. Coba lagi sebentar lagi.",
    });
  }
}

async function muatTransaksi(c: Ctx): Promise<Transaksi | null> {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const m = await detailMuamalah(id);
  if (!m || !bolehAkses(c.get("sesi"), m.kantorId)) return null;
  return m;
}

function jenisDokumen(body: Formulir): JenisDokumen {
  const nilai = teks(body, "jenis");
  return isJenisDokumen(nilai) ? nilai : "AKAD";
}

/**
 * Beberapa browser mengirim berkas tanpa tipe (mis. .docx dari Windows tertentu),
 * dan validasiDokumen menolak tipe kosong. Ekstensinya cukup untuk memutuskan,
 * dan Nextcloud toh menyimpan apa adanya.
 */
const MIME_EKSTENSI: Record<string, string> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

function tebakMime(namaFile: string, tipe: string): string {
  if (tipe) return tipe;
  const ext = namaFile.split(".").pop()?.toLowerCase() ?? "";
  return MIME_EKSTENSI[ext] ?? "";
}

rutDokumen.post("/muamalah/:id/dokumen", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return c.redirect("/muamalah", 303);
  const sesi = c.get("sesi");
  const tujuan = `/muamalah/${m.id}`;
  const body = (await c.req.parseBody()) as Formulir;

  const file = berkas(body, "berkas");
  if (!file) return kembali(c, tujuan, { jenis: "galat", teks: "Tidak ada berkas yang dipilih." });

  const mimeType = tebakMime(file.name, file.type);
  const galat = validasiDokumen(mimeType, file.size);
  if (galat) return kembali(c, tujuan, { jenis: "galat", teks: galat });

  const isiFile = Buffer.from(await file.arrayBuffer());
  const hasil = await coba(c, tujuan, () =>
    simpanDokumen({
      muamalah: m,
      namaFile: file.name,
      mimeType,
      isiFile,
      jenis: jenisDokumen(body),
      diunggahOlehId: sesi.operator.id,
    })
  );
  if (hasil instanceof Response) return hasil;

  await catatAuditOperator(sesi.operator.id, "CREATE", "Dokumen", hasil.id, {
    muamalahId: m.id,
    namaFile: hasil.namaFile,
    via: "web",
  });
  return kembali(c, tujuan, { jenis: "ok", teks: `"${hasil.namaFile}" terunggah ke Nextcloud.` });
});

rutDokumen.post("/muamalah/:id/dokumen/tautkan", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return c.redirect("/muamalah", 303);
  const sesi = c.get("sesi");
  const tujuan = `/muamalah/${m.id}`;
  const body = (await c.req.parseBody()) as Formulir;

  const tautan = teks(body, "tautan");
  if (!tautan) return kembali(c, tujuan, { jenis: "galat", teks: "Tautan belum diisi." });

  const hasil = await coba(c, tujuan, () =>
    daftarkanDokumenDariTautan({
      muamalah: m,
      tautan,
      jenis: jenisDokumen(body),
      diunggahOlehId: sesi.operator.id,
    })
  );
  if (hasil instanceof Response) return hasil;

  await catatAuditOperator(sesi.operator.id, "CREATE", "Dokumen", hasil.id, {
    muamalahId: m.id,
    namaFile: hasil.namaFile,
    sumber: "TAUTAN",
    via: "web",
  });
  return kembali(c, tujuan, {
    jenis: "ok",
    teks: `"${hasil.namaFile}" ditautkan. Berkasnya tetap dikelola di Nextcloud.`,
  });
});

rutDokumen.post("/muamalah/:id/dokumen/sinkron", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return c.redirect("/muamalah", 303);
  const sesi = c.get("sesi");
  const tujuan = `/muamalah/${m.id}`;

  const hasil = await coba(c, tujuan, () => sinkronDokumen(m, sesi.operator.id));
  if (hasil instanceof Response) return hasil;

  return kembali(c, tujuan, {
    jenis: "ok",
    teks: `Sinkron selesai: ${hasil.ditambah} ditambahkan, ${hasil.disegarkan} disegarkan, ${hasil.dihapus} dilepas.`,
  });
});

/** Dokumen ikut aturan kantor transaksinya, bukan aturan sendiri. */
async function muatDokumen(c: Ctx) {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const dok = await ambilDokumen(id);
  if (!dok) return null;
  const m = await prisma.muamalah.findUnique({
    where: { id: dok.muamalahId },
    select: { kantorId: true },
  });
  if (!m || !bolehAkses(c.get("sesi"), m.kantorId)) return null;
  return dok;
}

rutDokumen.post("/dokumen/:id/nama", async (c) => {
  const dok = await muatDokumen(c);
  if (!dok) return c.redirect("/muamalah", 303);
  const sesi = c.get("sesi");
  const tujuan = `/muamalah/${dok.muamalahId}`;
  const body = (await c.req.parseBody()) as Formulir;

  const nama = teks(body, "nama");
  if (!nama) return kembali(c, tujuan, { jenis: "galat", teks: "Nama berkas tidak boleh kosong." });
  if (nama === dok.namaFile) return c.redirect(tujuan, 303);

  const hasil = await coba(c, tujuan, () => ubahNamaDokumen(dok.id, nama));
  if (hasil instanceof Response) return hasil;

  await catatAuditOperator(sesi.operator.id, "UPDATE", "Dokumen", dok.id, {
    namaFile: hasil?.namaFile,
    via: "web",
  });
  return kembali(c, tujuan, { jenis: "ok", teks: `Nama berkas diubah jadi "${hasil?.namaFile}".` });
});

rutDokumen.post("/dokumen/:id/hapus", async (c) => {
  const dok = await muatDokumen(c);
  if (!dok) return c.redirect("/muamalah", 303);
  const sesi = c.get("sesi");
  const tujuan = `/muamalah/${dok.muamalahId}`;

  const hasil = await coba(c, tujuan, () => hapusDokumen(dok.id));
  if (hasil instanceof Response) return hasil;

  await catatAuditOperator(sesi.operator.id, "DELETE", "Dokumen", dok.id, {
    namaFile: dok.namaFile,
    sumber: dok.sumber,
    via: "web",
  });
  return kembali(c, tujuan, {
    jenis: "ok",
    teks:
      dok.sumber === "TAUTAN"
        ? `"${dok.namaFile}" dilepas dari daftar; berkasnya tetap utuh di Nextcloud.`
        : `"${dok.namaFile}" dihapus dari Nextcloud.`,
  });
});
