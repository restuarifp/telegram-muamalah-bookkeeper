import { Hono } from "hono";
import { prisma } from "../../db.js";
import {
  TemplateGandaError,
  daftarTemplate,
  daftarkanTemplateDariTautan,
  lepasTemplate,
  sinkronTemplate,
  ubahJudulTemplate,
} from "../../services/dokumenService.js";
import { NextcloudError, TautanTidakValidError } from "../../services/nextcloud.js";
import {
  buatKantor,
  daftarKantor,
  nonaktifkanKantor,
} from "../../services/kantorService.js";
import { simpanKantorFilter } from "../../services/webAuthService.js";
import { catatAuditOperator } from "../../middlewares/audit.js";
import { isSuperadmin } from "../../types.js";
import { formatUkuran } from "../../utils/tautan.js";
import { gabung, html } from "../html.js";
import { bidangCsrf, halaman, judulHalaman, panelPenyaring } from "../layout.js";
import { teks, type Formulir } from "../form.js";
import { opsiPilihan, tautanBerkas } from "../tampilan.js";
import { ambilPesan, kembali, labelLingkup, type Ctx, type Lingkungan } from "../sesi.js";

export const rutAdmin = new Hono<Lingkungan>();

/**
 * Gerbang superadmin untuk handler POST. Halaman-halamannya sendiri tetap boleh
 * dilihat operator biasa (daftar kantor & rekan sekantor memang bukan rahasia),
 * yang dijaga adalah mutasinya.
 */
function tolakBukanSuperadmin(c: Ctx, tujuan: string) {
  if (isSuperadmin(c.get("sesi").operator)) return null;
  return kembali(c, tujuan, { jenis: "galat", teks: "Aksi ini hanya untuk superadmin." });
}

function galatNextcloud(err: unknown): string {
  if (err instanceof TemplateGandaError) return err.message;
  if (err instanceof TautanTidakValidError) return `Tautan tidak dikenali: ${err.message}`;
  if (err instanceof NextcloudError) return `Nextcloud menolak permintaan: ${err.message}`;
  console.error("[web] Gagal memproses template:", err);
  return "Gagal menghubungi Nextcloud. Coba lagi sebentar lagi.";
}

// --- Template akad ---------------------------------------------------------

rutAdmin.get("/template", async (c) => {
  const sesi = c.get("sesi");
  const superadmin = isSuperadmin(sesi.operator);
  const templates = await daftarTemplate();

  const baris = templates.map(
    (t) => html`<tr>
  <td><code>${t.kode}</code></td>
  <td>
    ${t.shareUrl ? tautanBerkas(t.shareUrl, t.judul) : t.judul}<br>
    <span class="keterangan">${t.namaFile} · ${formatUkuran(t.ukuran)}</span>
  </td>
  ${
    superadmin
      ? html`<td>
    <div class="baris-tombol">
      <form method="post" action="/template/${t.id}/judul" class="baris-tombol">
        ${bidangCsrf(sesi)}
        <input type="text" name="judul" value="${t.judul}" aria-label="Judul template">
        <button class="tombol tombol-kecil" type="submit">Ubah judul</button>
      </form>
      <form method="post" action="/template/${t.id}/lepas" class="sebaris"
            data-konfirmasi="Lepas template &quot;${t.judul}&quot; dari daftar? Berkasnya di Nextcloud tetap utuh.">
        ${bidangCsrf(sesi)}
        <button class="tombol tombol-kecil tombol-bahaya" type="submit">Lepas</button>
      </form>
    </div>
  </td>`
      : null
  }
</tr>`
  );

  const formTambah = superadmin
    ? html`<div class="kartu">
  <h2>Daftarkan template <span class="keterangan">— dari tautan berkas yang sudah ada di Nextcloud</span></h2>
  <form method="post" action="/template">
    ${bidangCsrf(sesi)}
    <div class="bidang-baris">
      <div class="bidang">
        <label for="kode">Kode <span class="petunjuk">unik, mis. qardh</span></label>
        <input type="text" id="kode" name="kode" required>
      </div>
      <div class="bidang">
        <label for="judul">Judul</label>
        <input type="text" id="judul" name="judul" required>
      </div>
    </div>
    <div class="bidang">
      <label for="tautan">Tautan Nextcloud</label>
      <input type="text" id="tautan" name="tautan" placeholder="tautan berbagi, permalink /f/123, URL WebDAV, atau path" required>
    </div>
    <div class="baris-tombol">
      <button class="tombol tombol-utama" type="submit">Daftarkan</button>
      <button class="tombol" type="submit" form="sinkron-template">🔄 Sinkron template</button>
    </div>
  </form>
  <form method="post" action="/template/sinkron" id="sinkron-template">${bidangCsrf(sesi)}</form>
</div>`
    : null;

  return c.html(
    halaman({
      judul: "Template akad",
      sesi,
      jalur: "/template",
      lingkupLabel: await labelLingkup(sesi),
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        "Template akad",
        "Berkas template tinggal di Nextcloud; di sini hanya penunjuk ke sana."
      )}
<div class="kartu">
  ${
    templates.length === 0
      ? html`<p class="kosong">Belum ada template terdaftar.</p>`
      : html`<div class="tabel-bungkus"><table>
    <thead><tr><th>Kode</th><th>Template</th>${superadmin ? html`<th>Aksi</th>` : null}</tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>`
  }
</div>
${formTambah}`,
    }).nilai
  );
});

rutAdmin.post("/template", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/template");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const body = (await c.req.parseBody()) as Formulir;

  const kode = teks(body, "kode").toLowerCase();
  const judul = teks(body, "judul");
  const tautan = teks(body, "tautan");
  if (!kode || !judul || !tautan) {
    return kembali(c, "/template", { jenis: "galat", teks: "Kode, judul, dan tautan wajib diisi." });
  }

  try {
    const t = await daftarkanTemplateDariTautan({ kode, judul, tautan });
    await catatAuditOperator(sesi.operator.id, "CREATE", "Template", t.id, {
      kode,
      judul,
      via: "web",
    });
    return kembali(c, "/template", { jenis: "ok", teks: `Template "${t.judul}" terdaftar.` });
  } catch (err) {
    return kembali(c, "/template", { jenis: "galat", teks: galatNextcloud(err) });
  }
});

rutAdmin.post("/template/:id/judul", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/template");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const id = Number(c.req.param("id"));
  const judul = teks((await c.req.parseBody()) as Formulir, "judul");
  if (!judul) return kembali(c, "/template", { jenis: "galat", teks: "Judul tidak boleh kosong." });

  const t = await ubahJudulTemplate(id, judul).catch(() => null);
  if (!t) return kembali(c, "/template", { jenis: "galat", teks: "Template tidak ditemukan." });
  await catatAuditOperator(sesi.operator.id, "UPDATE", "Template", id, { judul, via: "web" });
  return kembali(c, "/template", { jenis: "ok", teks: "Judul template diperbarui." });
});

rutAdmin.post("/template/:id/lepas", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/template");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const id = Number(c.req.param("id"));

  const t = await lepasTemplate(id).catch(() => null);
  if (!t) return kembali(c, "/template", { jenis: "galat", teks: "Template tidak ditemukan." });
  await catatAuditOperator(sesi.operator.id, "DELETE", "Template", id, {
    judul: t.judul,
    via: "web",
  });
  return kembali(c, "/template", {
    jenis: "ok",
    teks: `Template "${t.judul}" dilepas; berkasnya di Nextcloud tetap utuh.`,
  });
});

rutAdmin.post("/template/sinkron", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/template");
  if (ditolak) return ditolak;
  try {
    const hasil = await sinkronTemplate();
    const catatan = hasil.belumTerdaftar.length
      ? ` ${hasil.belumTerdaftar.length} berkas di folder template belum terdaftar.`
      : "";
    return kembali(c, "/template", {
      jenis: "ok",
      teks: `Sinkron selesai: ${hasil.diperbarui.length} disegarkan, ${hasil.dilepas.length} dilepas.${catatan}`,
    });
  } catch (err) {
    return kembali(c, "/template", { jenis: "galat", teks: galatNextcloud(err) });
  }
});

// --- Kantor ----------------------------------------------------------------

rutAdmin.get("/kantor", async (c) => {
  const sesi = c.get("sesi");
  const superadmin = isSuperadmin(sesi.operator);
  const kantor = await daftarKantor({ termasukNonaktif: superadmin });
  const jumlah = await prisma.muamalah.groupBy({ by: ["kantorId"], _count: { _all: true } });
  const perKantor = new Map(jumlah.map((j) => [j.kantorId, j._count._all]));

  const baris = kantor.map(
    (k) => html`<tr>
  <td>#${k.id}</td>
  <td>${k.nama} ${k.aktif ? null : html`<span class="lencana">nonaktif</span>`}</td>
  <td class="angka-kolom">${perKantor.get(k.id) ?? 0}</td>
  ${
    superadmin
      ? html`<td>${
          k.aktif
            ? html`<form method="post" action="/kantor/${k.id}/nonaktif" class="sebaris"
                  data-konfirmasi="Nonaktifkan kantor &quot;${k.nama}&quot;? Transaksi &amp; operatornya tetap utuh.">
        ${bidangCsrf(sesi)}
        <button class="tombol tombol-kecil tombol-bahaya" type="submit">Nonaktifkan</button>
      </form>`
            : null
        }</td>`
      : null
  }
</tr>`
  );

  const penyaringKantor = superadmin
    ? panelPenyaring({
        id: "buka-penyaring-kantor",
        judul: "Kantor yang ditampilkan",
        ringkasan: sesi.kantorFilter
          ? (kantor.find((k) => k.id === sesi.kantorFilter)?.nama ?? "satu kantor")
          : "semua kantor",
        isi: html`<p class="keterangan">Alat bantu lihat; tidak membatasi wewenang Anda.</p>
  <form method="post" action="/kantor/filter" class="filter-baris jarak-atas">
    ${bidangCsrf(sesi)}
    <div class="bidang">
      <label for="kantorId">Lingkup tampilan</label>
      <select id="kantorId" name="kantorId">
        ${opsiPilihan(
          [
            { nilai: "", label: "Semua kantor" },
            ...kantor.map((k) => ({ nilai: String(k.id), label: k.nama })),
          ],
          sesi.kantorFilter ? String(sesi.kantorFilter) : ""
        )}
      </select>
    </div>
    <button class="tombol tombol-utama" type="submit">Terapkan</button>
  </form>`,
      })
    : null;

  const formTambah = superadmin
    ? html`<div class="kartu">
  <h2>Tambah kantor perwakilan</h2>
  <form method="post" action="/kantor" class="filter-baris">
    ${bidangCsrf(sesi)}
    <div class="bidang">
      <label for="nama">Nama kantor</label>
      <input type="text" id="nama" name="nama" placeholder="mis. Kanwil Surabaya" required>
    </div>
    <button class="tombol" type="submit">Tambah</button>
  </form>
</div>`
    : null;

  return c.html(
    halaman({
      judul: "Kantor",
      sesi,
      jalur: "/kantor",
      lingkupLabel: await labelLingkup(sesi),
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        "Kantor perwakilan",
        "Setiap transaksi tercatat di satu kantor; operator hanya melihat kantornya."
      )}
${penyaringKantor}
<div class="kartu">
  <div class="tabel-bungkus"><table>
    <thead><tr><th>ID</th><th>Nama</th><th class="angka-kolom">Transaksi</th>${superadmin ? html`<th>Aksi</th>` : null}</tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>
</div>
${formTambah}`,
    }).nilai
  );
});

rutAdmin.post("/kantor/filter", async (c) => {
  const sesi = c.get("sesi");
  // Operator biasa tidak punya filter: lingkupnya datang dari data operator,
  // bukan dari pilihan tampilan yang bisa dikirim dari browser.
  const ditolak = tolakBukanSuperadmin(c, "/kantor");
  if (ditolak) return ditolak;

  const nilai = teks((await c.req.parseBody()) as Formulir, "kantorId");
  if (!nilai) {
    await simpanKantorFilter(sesi.tokenSesi, null);
    return kembali(c, "/kantor", { jenis: "ok", teks: "Menampilkan transaksi semua kantor." });
  }

  const kantor = await prisma.kantor.findUnique({ where: { id: Number(nilai) } });
  if (!kantor) return kembali(c, "/kantor", { jenis: "galat", teks: "Kantor tidak ditemukan." });
  await simpanKantorFilter(sesi.tokenSesi, kantor.id);
  return kembali(c, "/kantor", { jenis: "ok", teks: `Menampilkan transaksi ${kantor.nama}.` });
});

rutAdmin.post("/kantor", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/kantor");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const nama = teks((await c.req.parseBody()) as Formulir, "nama");
  if (!nama) return kembali(c, "/kantor", { jenis: "galat", teks: "Nama kantor wajib diisi." });

  const sudahAda = await prisma.kantor.findUnique({ where: { nama } });
  if (sudahAda) {
    return kembali(c, "/kantor", {
      jenis: "galat",
      teks: `Kantor "${nama}" sudah terdaftar (#${sudahAda.id}).`,
    });
  }
  const kantor = await buatKantor(nama);
  await catatAuditOperator(sesi.operator.id, "CREATE", "Kantor", kantor.id, { nama, via: "web" });
  return kembali(c, "/kantor", { jenis: "ok", teks: `Kantor "${kantor.nama}" ditambahkan.` });
});

rutAdmin.post("/kantor/:id/nonaktif", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/kantor");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const id = Number(c.req.param("id"));

  // Nonaktif, bukan hapus: transaksi & operator lama tetap menunjuk ke sini.
  const kantor = await nonaktifkanKantor(id).catch(() => null);
  if (!kantor) return kembali(c, "/kantor", { jenis: "galat", teks: "Kantor tidak ditemukan." });
  await catatAuditOperator(sesi.operator.id, "UPDATE", "Kantor", id, { aktif: false, via: "web" });
  return kembali(c, "/kantor", {
    jenis: "ok",
    teks: `Kantor "${kantor.nama}" dinonaktifkan; data lamanya tetap tersimpan.`,
  });
});

// --- Operator --------------------------------------------------------------

rutAdmin.get("/operator", async (c) => {
  const sesi = c.get("sesi");
  const superadmin = isSuperadmin(sesi.operator);
  // Operator biasa hanya melihat rekan sekantornya — daftar operator kantor lain
  // bukan urusannya (sama seperti /operator_list di bot).
  const operators = await prisma.operator.findMany({
    where: superadmin ? {} : { kantorId: sesi.operator.kantorId ?? -1 },
    include: { kantor: true },
    orderBy: { nama: "asc" },
  });
  const kantor = superadmin ? await daftarKantor() : [];

  const baris = operators.map(
    (o) => html`<tr>
  <td>
    <strong>${o.nama}</strong><br>
    <span class="keterangan">ID Telegram: ${o.telegramUserId}</span>
  </td>
  <td>${o.kantor?.nama ?? (isSuperadmin(o) ? "semua kantor" : "tanpa kantor")}</td>
  <td>
    <span class="lencana ${isSuperadmin(o) ? "lencana-berjalan" : ""}">${isSuperadmin(o) ? "Superadmin" : "Operator"}</span>
    ${o.aktif ? null : html` <span class="lencana lencana-terlambat">nonaktif</span>`}
  </td>
  ${
    superadmin
      ? html`<td>${
          o.aktif && o.id !== sesi.operator.id
            ? html`<form method="post" action="/operator/${o.id}/nonaktif" class="sebaris"
                  data-konfirmasi="Nonaktifkan ${o.nama}? Ia langsung kehilangan akses bot dan web.">
        ${bidangCsrf(sesi)}
        <button class="tombol tombol-kecil tombol-bahaya" type="submit">Nonaktifkan</button>
      </form>`
            : null
        }</td>`
      : null
  }
</tr>`
  );

  const formTambah = superadmin
    ? html`<div class="kartu">
  <h2>Tambah / pindahkan operator <span class="keterangan">— mendaftarkan ulang orang yang sama berarti memindahkan kantornya</span></h2>
  <form method="post" action="/operator">
    ${bidangCsrf(sesi)}
    <div class="bidang-baris">
      <div class="bidang">
        <label for="telegramUserId">Telegram User ID <span class="petunjuk">dari /init</span></label>
        <input type="text" id="telegramUserId" name="telegramUserId" inputmode="numeric" required>
      </div>
      <div class="bidang">
        <label for="namaOperator">Nama</label>
        <input type="text" id="namaOperator" name="nama" required>
      </div>
      <div class="bidang">
        <label for="penempatan">Penempatan</label>
        <select id="penempatan" name="penempatan" required>
          ${opsiPilihan([
            ...kantor.map((k) => ({ nilai: String(k.id), label: k.nama })),
            { nilai: "superadmin", label: "Superadmin (lintas kantor)" },
          ])}
        </select>
      </div>
    </div>
    <button class="tombol tombol-utama" type="submit">Simpan operator</button>
  </form>
</div>`
    : null;

  return c.html(
    halaman({
      judul: "Operator",
      sesi,
      jalur: "/operator",
      lingkupLabel: await labelLingkup(sesi),
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        "Operator",
        superadmin ? "Semua operator terdaftar." : "Operator sekantor dengan Anda."
      )}
<div class="kartu">
  ${
    operators.length === 0
      ? html`<p class="kosong">Belum ada operator terdaftar.</p>`
      : html`<div class="tabel-bungkus"><table>
    <thead><tr><th>Nama</th><th>Kantor</th><th>Peran</th>${superadmin ? html`<th>Aksi</th>` : null}</tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>`
  }
</div>
${formTambah}`,
    }).nilai
  );
});

rutAdmin.post("/operator", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/operator");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const body = (await c.req.parseBody()) as Formulir;

  const telegramUserId = teks(body, "telegramUserId").replace(/^@/, "");
  const nama = teks(body, "nama");
  const penempatan = teks(body, "penempatan");

  if (!/^\d{5,20}$/.test(telegramUserId)) {
    return kembali(c, "/operator", {
      jenis: "galat",
      teks: "Telegram User ID berupa angka. Minta orangnya mengirim /init ke bot.",
    });
  }
  if (!nama) return kembali(c, "/operator", { jenis: "galat", teks: "Nama wajib diisi." });

  let role = "OPERATOR";
  let kantorId: number | null = null;
  if (penempatan === "superadmin") {
    role = "SUPERADMIN";
  } else {
    const kantor = await prisma.kantor.findUnique({ where: { id: Number(penempatan) } });
    if (!kantor) return kembali(c, "/operator", { jenis: "galat", teks: "Kantor tidak dikenali." });
    kantorId = kantor.id;
  }

  const operator = await prisma.operator.upsert({
    where: { telegramUserId },
    create: { telegramUserId, nama, role, kantorId },
    update: { nama, role, kantorId, aktif: true },
    include: { kantor: true },
  });
  await catatAuditOperator(sesi.operator.id, "CREATE", "Operator", operator.id, {
    telegramUserId,
    nama,
    role,
    kantorId,
    via: "web",
  });
  return kembali(c, "/operator", {
    jenis: "ok",
    teks: `Operator "${operator.nama}" tersimpan untuk ${operator.kantor?.nama ?? "semua kantor"}.`,
  });
});

rutAdmin.post("/operator/:id/nonaktif", async (c) => {
  const ditolak = tolakBukanSuperadmin(c, "/operator");
  if (ditolak) return ditolak;
  const sesi = c.get("sesi");
  const id = Number(c.req.param("id"));

  // Menonaktifkan diri sendiri akan mengunci superadmin keluar dari sistemnya
  // sendiri — termasuk dari halaman ini.
  if (id === sesi.operator.id) {
    return kembali(c, "/operator", {
      jenis: "galat",
      teks: "Anda tidak bisa menonaktifkan akun sendiri.",
    });
  }

  const operator = await prisma.operator
    .update({ where: { id }, data: { aktif: false } })
    .catch(() => null);
  if (!operator) return kembali(c, "/operator", { jenis: "galat", teks: "Operator tidak ditemukan." });

  // Sesi web yang sedang berjalan ikut dicabut; tanpa ini operator yang baru
  // dinonaktifkan masih bisa memakai tab yang sudah terbuka sampai sesinya habis.
  await prisma.sesiWeb.deleteMany({ where: { operatorId: id } });
  await catatAuditOperator(sesi.operator.id, "UPDATE", "Operator", id, {
    aktif: false,
    via: "web",
  });
  return kembali(c, "/operator", {
    jenis: "ok",
    teks: `Operator "${operator.nama}" dinonaktifkan.`,
  });
});
