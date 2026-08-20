import { Hono } from "hono";
import { prisma } from "../../db.js";
import {
  buatMuamalah,
  buatPihak,
  catatAngsuran,
  daftarMuamalah,
  detailMuamalah,
  hapusMuamalah,
  hitungSisaSaldo,
  perbaruiMuamalah,
  ubahStatus,
} from "../../services/muamalahService.js";
import { daftarKantor } from "../../services/kantorService.js";
import { catatAuditOperator } from "../../middlewares/audit.js";
import {
  JENIS_AKTIF,
  JENIS_MUAMALAH,
  STATUS_MUAMALAH,
  bolehBercicilan,
  isJenisAktif,
  isJenisMuamalah,
  isPeriodeCicilan,
  isStatusMuamalah,
  isSuperadmin,
  JENIS_BAGI_HASIL,
  JENIS_BERCICILAN,
  JENIS_BERMARGIN,
  JENIS_BERPORSI_MODAL,
  pakaiBagiHasil,
  pakaiMargin,
  pakaiPorsiModal,
  type JenisMuamalah,
  type PeriodeCicilan,
  type StatusMuamalah,
} from "../../types.js";
import {
  LABEL_JENIS,
  LABEL_STATUS,
  formatRupiah,
  formatTanggal,
  ringkasSkemaCicilan,
} from "../../utils/format.js";
import {
  cicilanTerbayar,
  jadwalCicilan,
  punyaCicilan,
  sudahTerlambat,
  totalKewajiban,
} from "../../utils/cicilan.js";
import { parseNominal, parseTanggal, parseTenor } from "../../utils/validate.js";
import type { SesiAktif } from "../../services/webAuthService.js";
import { gabung, html, KOSONG, type HtmlAman } from "../html.js";
import { bidangCsrf, halaman, judulHalaman, lencanaStatus, panelPenyaring } from "../layout.js";
import { opsional, teks, type Formulir } from "../form.js";
import { nilaiTanggal, opsiPilihan } from "../tampilan.js";
import {
  ambilPesan,
  bolehAkses,
  kembali,
  labelLingkup,
  lingkupWeb,
  type Ctx,
  type Lingkungan,
} from "../sesi.js";
import { kartuDokumen } from "./dokumen.js";

export const rutMuamalah = new Hono<Lingkungan>();

const PER_HALAMAN = 20;

type Transaksi = NonNullable<Awaited<ReturnType<typeof detailMuamalah>>>;

/**
 * Memuat satu transaksi sekaligus memeriksa haknya. Transaksi milik kantor lain
 * dijawab sama persis dengan yang tidak ada — id transaksi berurutan dan mudah
 * ditebak, jadi membedakan keduanya sama saja memberi tahu kantor lain punya apa
 * (lihat catatan serupa di src/handlers/muamalah.ts).
 */
async function muatTransaksi(c: Ctx): Promise<Transaksi | null> {
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id) || id <= 0) return null;
  const m = await detailMuamalah(id);
  if (!m) return null;
  if (!bolehAkses(c.get("sesi"), m.kantorId)) return null;
  return m;
}

async function tidakDitemukan(c: Ctx) {
  const sesi = c.get("sesi");
  return c.html(
    halaman({
      judul: "Tidak ditemukan",
      sesi,
      jalur: "/muamalah",
      lingkupLabel: await labelLingkup(sesi),
      isi: html`${judulHalaman("Transaksi tidak ditemukan")}
<div class="kartu">
  <p class="kosong">
    Transaksi ini tidak ada, sudah dihapus, atau bukan milik kantor Anda.
  </p>
  <div class="baris-tombol"><a class="tombol" href="/muamalah">Kembali ke daftar</a></div>
</div>`,
    }).nilai,
    404
  );
}

// --- Daftar ----------------------------------------------------------------

rutMuamalah.get("/muamalah", async (c) => {
  const sesi = c.get("sesi");
  const lingkup = lingkupWeb(sesi);
  const label = await labelLingkup(sesi);

  const jenis = c.req.query("jenis") ?? "";
  const status = c.req.query("status") ?? "";
  const cari = (c.req.query("cari") ?? "").trim();
  const halamanKe = Math.max(1, Number(c.req.query("halaman") ?? 1) || 1);

  const hasil =
    lingkup === null
      ? { items: [], total: 0 }
      : await daftarMuamalah({
          jenis: isJenisMuamalah(jenis) ? jenis : undefined,
          status: isStatusMuamalah(status) ? status : undefined,
          kantorId: lingkup,
          cari: cari || undefined,
          skip: (halamanKe - 1) * PER_HALAMAN,
          take: PER_HALAMAN,
        });

  // Sisa saldo tidak ikut di query daftar; dihitung sekali untuk semua baris
  // halaman ini, bukan satu query per transaksi.
  const ids = hasil.items.map((m) => m.id);
  const angsuran = ids.length
    ? await prisma.angsuran.findMany({
        where: { muamalahId: { in: ids } },
        select: { muamalahId: true, jumlah: true },
      })
    : [];
  const dibayar = new Map<number, bigint>();
  for (const a of angsuran) {
    dibayar.set(a.muamalahId, (dibayar.get(a.muamalahId) ?? 0n) + a.jumlah);
  }

  const totalHalaman = Math.max(1, Math.ceil(hasil.total / PER_HALAMAN));
  const kueri = (halamanBaru: number) => {
    const p = new URLSearchParams();
    if (jenis) p.set("jenis", jenis);
    if (status) p.set("status", status);
    if (cari) p.set("cari", cari);
    if (halamanBaru > 1) p.set("halaman", String(halamanBaru));
    const s = p.toString();
    return s ? `/muamalah?${s}` : "/muamalah";
  };

  const baris = hasil.items.map((m) => {
    const sisa = hitungSisaSaldo(m, [{ jumlah: dibayar.get(m.id) ?? 0n }]);
    return html`<tr>
  <td><a href="/muamalah/${m.id}">#${m.id}</a></td>
  <td>
    <a href="/muamalah/${m.id}"><strong>${m.judul}</strong></a><br>
    <span class="keterangan">${m.pihak.nama}${isSuperadmin(sesi.operator) ? ` · ${m.kantor.nama}` : ""}</span>
  </td>
  <td>${LABEL_JENIS[m.jenis as JenisMuamalah] ?? m.jenis}</td>
  <td class="angka-kolom">${formatRupiah(totalKewajiban(m))}</td>
  <td class="angka-kolom">${formatRupiah(sisa)}</td>
  <td>${formatTanggal(m.jatuhTempo)}</td>
  <td>${lencanaStatus(m.status, sudahTerlambat(m))}</td>
</tr>`;
  });

  // Yang terbaca saat panelnya tertutup di ponsel. Disusun dari penyaring yang
  // benar-benar aktif, supaya daftar yang pendek tidak terasa seperti data hilang.
  const aktif = [
    cari ? `"${cari}"` : null,
    isJenisMuamalah(jenis) ? LABEL_JENIS[jenis] : null,
    isStatusMuamalah(status) ? LABEL_STATUS[status] : null,
  ].filter(Boolean) as string[];

  const penyaring = panelPenyaring({
    id: "buka-penyaring",
    ringkasan: aktif.length ? aktif.join(" · ") : "semua transaksi",
    isi: html`<form method="get" action="/muamalah" class="filter-baris">
    <div class="bidang">
      <label for="cari">Cari</label>
      <input type="text" id="cari" name="cari" value="${cari}" placeholder="judul atau nama pihak">
    </div>
    <div class="bidang">
      <label for="jenis">Jenis</label>
      <select id="jenis" name="jenis">
        ${opsiPilihan(
          [
            { nilai: "", label: "Semua jenis" },
            ...JENIS_MUAMALAH.map((j) => ({ nilai: j, label: LABEL_JENIS[j] })),
          ],
          jenis
        )}
      </select>
    </div>
    <div class="bidang">
      <label for="status">Status</label>
      <select id="status" name="status">
        ${opsiPilihan(
          [
            { nilai: "", label: "Semua kecuali batal" },
            ...STATUS_MUAMALAH.map((s) => ({ nilai: s, label: LABEL_STATUS[s] })),
          ],
          status
        )}
      </select>
    </div>
    <div class="baris-tombol">
      <button class="tombol tombol-utama" type="submit">Terapkan</button>
      <a class="tombol" href="/muamalah">Atur ulang</a>
    </div>
  </form>`,
  });

  const paginasi =
    totalHalaman > 1
      ? html`<div class="paginasi">
  ${halamanKe > 1 ? html`<a class="tombol tombol-kecil" href="${kueri(halamanKe - 1)}">← Sebelumnya</a>` : null}
  <span>Halaman ${halamanKe} dari ${totalHalaman}</span>
  ${halamanKe < totalHalaman ? html`<a class="tombol tombol-kecil" href="${kueri(halamanKe + 1)}">Berikutnya →</a>` : null}
</div>`
      : null;

  return c.html(
    halaman({
      judul: "Transaksi",
      sesi,
      jalur: "/muamalah",
      lingkupLabel: label,
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        "Transaksi",
        `${hasil.total} transaksi — ${label}.`,
        html`<a class="tombol tombol-utama" href="/muamalah/baru">+ Transaksi baru</a>`
      )}
${penyaring}
<div class="kartu">
  ${
    hasil.items.length === 0
      ? html`<p class="kosong">Tidak ada transaksi yang cocok dengan penyaring ini.</p>`
      : html`<div class="tabel-bungkus"><table>
    <thead><tr>
      <th>ID</th><th>Transaksi</th><th>Jenis</th>
      <th class="angka-kolom">Nilai</th><th class="angka-kolom">Sisa</th>
      <th>Jatuh tempo</th><th>Status</th>
    </tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>`
  }
</div>
${paginasi}`,
    }).nilai
  );
});

// --- Tambah ----------------------------------------------------------------

function formulirTransaksi(opts: {
  aksi: string;
  sesi: SesiAktif;
  nilai: {
    jenis?: string;
    pihak?: string;
    judul?: string;
    pokok?: string;
    tanggalAkad?: string;
    jatuhTempo?: string;
    bagiHasilNisbah?: string;
    deskripsi?: string;
    margin?: string;
    porsiModal?: string;
    tenorCicilan?: string;
    periodeCicilan?: string;
    mulaiCicilan?: string;
    kantorId?: number;
  };
  /**
   * Jenis yang sudah pasti (formulir ubah). Bila diisi, bagian yang tidak
   * relevan tidak ikut dirender sama sekali; bila kosong (formulir tambah),
   * semuanya dirender dan penyesuaiannya diserahkan ke skrip lewat data-jenis —
   * tanpa JavaScript pun formulirnya tetap utuh dan bisa dikirim.
   */
  jenisTerkunci?: string;
  kantor?: { id: number; nama: string }[];
  /** Pihak & jenis hanya bisa ditentukan saat pembuatan, sama seperti di bot. */
  baru: boolean;
  labelTombol: string;
}): HtmlAman {
  const n = opts.nilai;
  const kunci = opts.jenisTerkunci;
  const untuk = (jenis: readonly string[]) => ({
    tampil: kunci ? jenis.includes(kunci) : true,
    attr: kunci ? KOSONG : html` data-jenis="${jenis.join(" ")}"`,
  });
  const bidangMargin = untuk(JENIS_BERMARGIN);
  const bidangNisbah = untuk(JENIS_BAGI_HASIL);
  const bidangPorsi = untuk(JENIS_BERPORSI_MODAL);
  const bagianCicilan = untuk(JENIS_BERCICILAN);

  return html`<form method="post" action="${opts.aksi}">
  ${bidangCsrf(opts.sesi)}
  <fieldset>
    <legend>Pokok transaksi</legend>
    ${
      opts.baru && opts.kantor
        ? html`<div class="bidang">
      <label for="kantorId">Kantor</label>
      <select id="kantorId" name="kantorId" required>
        ${opsiPilihan(
          opts.kantor.map((k) => ({ nilai: String(k.id), label: k.nama })),
          n.kantorId ? String(n.kantorId) : null
        )}
      </select>
    </div>`
        : null
    }
    ${
      opts.baru
        ? html`<div class="bidang-baris">
      <div class="bidang">
        <label for="jenis">Jenis</label>
        <select id="jenis" name="jenis" required>
          ${opsiPilihan(
            JENIS_AKTIF.map((j) => ({ nilai: j, label: LABEL_JENIS[j] })),
            n.jenis ?? JENIS_AKTIF[0]
          )}
        </select>
      </div>
      <div class="bidang">
        <label for="pihak">Pihak <span class="petunjuk">nama mitra transaksi</span></label>
        <input type="text" id="pihak" name="pihak" value="${n.pihak ?? ""}" required>
      </div>
    </div>`
        : null
    }
    <div class="bidang">
      <label for="judul">Judul</label>
      <input type="text" id="judul" name="judul" value="${n.judul ?? ""}" required>
    </div>
    <div class="bidang-baris">
      <div class="bidang">
        <label for="pokok">Pokok <span class="petunjuk">mis. 5jt, 5.000.000</span></label>
        <input type="text" id="pokok" name="pokok" value="${n.pokok ?? ""}" inputmode="numeric" required>
      </div>
      ${
        bidangMargin.tampil
          ? html`<div class="bidang"${bidangMargin.attr}>
        <label for="margin">Margin <span class="petunjuk">keuntungan di atas pokok</span></label>
        <input type="text" id="margin" name="margin" value="${n.margin ?? ""}" inputmode="numeric" placeholder="mis. 1jt">
      </div>`
          : null
      }
      <div class="bidang">
        <label for="tanggalAkad">Tanggal akad</label>
        <input type="date" id="tanggalAkad" name="tanggalAkad" value="${n.tanggalAkad ?? ""}" required>
      </div>
      <div class="bidang">
        <label for="jatuhTempo">Jatuh tempo <span class="petunjuk">opsional</span></label>
        <input type="date" id="jatuhTempo" name="jatuhTempo" value="${n.jatuhTempo ?? ""}">
      </div>
    </div>
  </fieldset>

  ${
    bagianCicilan.tampil
      ? html`<fieldset${bagianCicilan.attr}>
    <legend>Skema cicilan <span class="petunjuk">kosongkan bila dibayar sekaligus</span></legend>
    <div class="bidang-baris">
      <div class="bidang">
        <label for="tenorCicilan">Jumlah cicilan</label>
        <input type="text" id="tenorCicilan" name="tenorCicilan" value="${n.tenorCicilan ?? ""}" inputmode="numeric" placeholder="mis. 12">
      </div>
      <div class="bidang">
        <label for="periodeCicilan">Periode</label>
        <select id="periodeCicilan" name="periodeCicilan">
          ${opsiPilihan(
            [
              { nilai: "BULANAN", label: "Bulanan" },
              { nilai: "MINGGUAN", label: "Mingguan" },
            ],
            n.periodeCicilan ?? "BULANAN"
          )}
        </select>
      </div>
      <div class="bidang">
        <label for="mulaiCicilan">Cicilan pertama</label>
        <input type="date" id="mulaiCicilan" name="mulaiCicilan" value="${n.mulaiCicilan ?? ""}">
      </div>
    </div>
  </fieldset>`
      : null
  }

  <fieldset>
    <legend>Tambahan</legend>
    ${
      bidangNisbah.tampil
        ? html`<div class="bidang"${bidangNisbah.attr}>
      <label for="bagiHasilNisbah">Nisbah bagi hasil <span class="petunjuk">bagian kita : mitra, mis. 60:40</span></label>
      <input type="text" id="bagiHasilNisbah" name="bagiHasilNisbah" value="${n.bagiHasilNisbah ?? ""}">
    </div>`
        : null
    }
    ${
      bidangPorsi.tampil
        ? html`<div class="bidang"${bidangPorsi.attr}>
      <label for="porsiModal">Porsi modal <span class="petunjuk">setoran kita : mitra, mis. 70:30</span></label>
      <input type="text" id="porsiModal" name="porsiModal" value="${n.porsiModal ?? ""}">
    </div>`
        : null
    }
    <div class="bidang">
      <label for="deskripsi">Deskripsi <span class="petunjuk">opsional</span></label>
      <textarea id="deskripsi" name="deskripsi">${n.deskripsi ?? ""}</textarea>
    </div>
  </fieldset>

  <div class="baris-tombol">
    <button class="tombol tombol-utama" type="submit" name="simpan" value="berjalan">${opts.labelTombol}</button>
    ${opts.baru ? html`<button class="tombol" type="submit" name="simpan" value="draft">Simpan sebagai draft</button>` : null}
    <a class="tombol" href="/muamalah">Batal</a>
  </div>
</form>`;
}

rutMuamalah.get("/muamalah/baru", async (c) => {
  const sesi = c.get("sesi");
  const superadmin = isSuperadmin(sesi.operator);
  const kantor = superadmin ? await daftarKantor() : [];

  if (!superadmin && !sesi.operator.kantorId) {
    return kembali(c, "/muamalah", {
      jenis: "galat",
      teks: "Akun Anda belum ditempatkan di kantor mana pun. Hubungi superadmin.",
    });
  }
  if (superadmin && kantor.length === 0) {
    return kembali(c, "/kantor", {
      jenis: "galat",
      teks: "Belum ada kantor terdaftar. Tambahkan kantor lebih dulu.",
    });
  }

  return c.html(
    halaman({
      judul: "Transaksi baru",
      sesi,
      jalur: "/muamalah",
      lingkupLabel: await labelLingkup(sesi),
      pesan: ambilPesan(c),
      isi: html`${judulHalaman("Transaksi baru", "Draft tidak dihitung di rekap dan tidak memicu pengingat.")}
<div class="kartu">
  ${formulirTransaksi({
    aksi: "/muamalah/baru",
    sesi,
    baru: true,
    kantor,
    labelTombol: "Simpan (berjalan)",
    nilai: { tanggalAkad: nilaiTanggal(new Date()), kantorId: sesi.kantorFilter ?? undefined },
  })}
</div>`,
    }).nilai
  );
});

rutMuamalah.post("/muamalah/baru", async (c) => {
  const sesi = c.get("sesi");
  const body = (await c.req.parseBody()) as Formulir;
  const superadmin = isSuperadmin(sesi.operator);

  // Kantor transaksi: operator biasa tidak boleh memilih — kantornya melekat
  // pada dirinya, dan menerima kantorId dari formulir berarti membuka jalan
  // mencatat transaksi ke kantor lain.
  let kantorId: number;
  if (superadmin) {
    kantorId = Number(teks(body, "kantorId"));
    const ada = await prisma.kantor.findUnique({ where: { id: kantorId } });
    if (!ada) return kembali(c, "/muamalah/baru", { jenis: "galat", teks: "Kantor tidak dikenali." });
  } else if (sesi.operator.kantorId) {
    kantorId = sesi.operator.kantorId;
  } else {
    return kembali(c, "/muamalah", {
      jenis: "galat",
      teks: "Akun Anda belum ditempatkan di kantor mana pun.",
    });
  }

  const jenis = teks(body, "jenis");
  if (!isJenisAktif(jenis)) {
    return kembali(c, "/muamalah/baru", { jenis: "galat", teks: "Jenis muamalah tidak dibuka." });
  }

  const namaPihak = teks(body, "pihak");
  const judul = teks(body, "judul");
  const pokok = parseNominal(teks(body, "pokok"));
  const tanggalAkad = parseTanggal(teks(body, "tanggalAkad"));

  if (!namaPihak || !judul) {
    return kembali(c, "/muamalah/baru", { jenis: "galat", teks: "Pihak dan judul wajib diisi." });
  }
  if (pokok === null) {
    return kembali(c, "/muamalah/baru", {
      jenis: "galat",
      teks: "Nominal pokok tidak dikenali. Contoh: 5jt atau 5.000.000.",
    });
  }
  if (tanggalAkad === null) {
    return kembali(c, "/muamalah/baru", { jenis: "galat", teks: "Tanggal akad tidak sah." });
  }

  const cicilan = bacaCicilan(body, jenis);
  if ("galat" in cicilan) {
    return kembali(c, "/muamalah/baru", { jenis: "galat", teks: cicilan.galat });
  }

  const ketentuan = bacaKetentuanJenis(body, jenis);
  if ("galat" in ketentuan) {
    return kembali(c, "/muamalah/baru", { jenis: "galat", teks: ketentuan.galat });
  }

  // Nama pihak dicocokkan persis lebih dulu supaya mencatat transaksi kedua
  // untuk orang yang sama tidak melahirkan pihak kembar.
  const pihakAda = await prisma.pihak.findFirst({ where: { nama: namaPihak } });
  const pihak = pihakAda ?? (await buatPihak(namaPihak));

  const status: StatusMuamalah = teks(body, "simpan") === "draft" ? "DRAFT" : "BERJALAN";
  const hasil = await buatMuamalah({
    jenis,
    pihakId: pihak.id,
    judul,
    pokok,
    tanggalAkad,
    jatuhTempo: parseTanggal(teks(body, "jatuhTempo")),
    ...ketentuan,
    deskripsi: opsional(body, "deskripsi"),
    status,
    ...cicilan.nilai,
    kantorId,
    dibuatOlehId: sesi.operator.id,
  });
  await catatAuditOperator(sesi.operator.id, "CREATE", "Muamalah", hasil.id, {
    jenis,
    judul,
    pokok: pokok.toString(),
    status,
    via: "web",
  });

  return kembali(c, `/muamalah/${hasil.id}`, {
    jenis: "ok",
    teks:
      status === "DRAFT"
        ? `Tersimpan sebagai draft #${hasil.id}. Aktifkan lewat "Jadikan berjalan" agar dihitung di rekap.`
        : `Transaksi #${hasil.id} tersimpan.`,
  });
});

/**
 * Membaca field yang hanya berlaku untuk sebagian jenis. Nilai yang dikirim
 * untuk jenis yang tidak mengenalnya sengaja **dibuang**, bukan ditolak: tanpa
 * JavaScript seluruh bidang ikut terkirim, dan menolaknya berarti formulir yang
 * sah jadi gagal hanya karena ada kolom yang tak relevan.
 */
function bacaKetentuanJenis(
  body: Formulir,
  jenis: string
): { margin: bigint | null; bagiHasilNisbah: string | null; porsiModal: string | null } | { galat: string } {
  let margin: bigint | null = null;
  if (pakaiMargin(jenis)) {
    const teksMargin = teks(body, "margin");
    if (teksMargin) {
      margin = parseNominal(teksMargin);
      if (margin === null) {
        return { galat: "Margin tidak dikenali. Contoh: 1jt atau 1.500.000." };
      }
    }
  }
  return {
    margin,
    bagiHasilNisbah: pakaiBagiHasil(jenis) ? opsional(body, "bagiHasilNisbah") : null,
    porsiModal: pakaiPorsiModal(jenis) ? opsional(body, "porsiModal") : null,
  };
}

/**
 * Membaca skema cicilan dari formulir. Kosong = tidak dicicil; terisi sebagian
 * ditolak, karena jadwal cicilan dihitung dari ketiga nilai itu sekaligus.
 */
function bacaCicilan(
  body: Formulir,
  jenis: string
):
  | { nilai: { tenorCicilan: number | null; periodeCicilan: PeriodeCicilan | null; mulaiCicilan: Date | null } }
  | { galat: string } {
  const tenorTeks = teks(body, "tenorCicilan");
  const mulaiTeks = teks(body, "mulaiCicilan");

  if (!tenorTeks && !mulaiTeks) {
    return { nilai: { tenorCicilan: null, periodeCicilan: null, mulaiCicilan: null } };
  }
  if (!bolehBercicilan(jenis)) {
    return { galat: `Jenis ${LABEL_JENIS[jenis as JenisMuamalah] ?? jenis} tidak memakai skema cicilan.` };
  }

  const tenor = parseTenor(tenorTeks);
  if (tenor === null) return { galat: "Jumlah cicilan harus angka bulat 1–600." };
  const mulai = parseTanggal(mulaiTeks);
  if (mulai === null) return { galat: "Tanggal cicilan pertama wajib diisi bila transaksi dicicil." };

  const periode = teks(body, "periodeCicilan");
  return {
    nilai: {
      tenorCicilan: tenor,
      periodeCicilan: isPeriodeCicilan(periode) ? periode : "BULANAN",
      mulaiCicilan: mulai,
    },
  };
}

// --- Detail ----------------------------------------------------------------

function kartuRincian(m: Transaksi): HtmlAman {
  const skema = ringkasSkemaCicilan(m);
  const rincian: { label: string; nilai: HtmlAman | string }[] = [
    { label: "Jenis", nilai: LABEL_JENIS[m.jenis as JenisMuamalah] ?? m.jenis },
    { label: "Pihak", nilai: m.pihak.nama },
    { label: "Kantor", nilai: m.kantor.nama },
    { label: "Pokok", nilai: formatRupiah(m.pokok) },
    { label: "Sisa", nilai: formatRupiah(m.sisaSaldo) },
    { label: "Tanggal akad", nilai: formatTanggal(m.tanggalAkad) },
    { label: "Jatuh tempo", nilai: formatTanggal(m.jatuhTempo) },
    { label: "Status", nilai: lencanaStatus(m.status, sudahTerlambat(m)) },
  ];
  if (skema) rincian.push({ label: "Cicilan", nilai: skema });
  if (m.bagiHasilNisbah) rincian.push({ label: "Nisbah", nilai: m.bagiHasilNisbah });
  rincian.push({ label: "Dicatat oleh", nilai: m.dibuatOleh.nama });

  return html`<div class="kartu">
  <dl class="rincian">
    ${gabung(
      rincian.map((r) => html`<div><dt>${r.label}</dt><dd>${r.nilai}</dd></div>`)
    )}
  </dl>
  ${m.deskripsi ? html`<p class="keterangan jarak-atas">${m.deskripsi}</p>` : null}
</div>`;
}

function kartuJadwal(m: Transaksi): HtmlAman | null {
  if (!punyaCicilan(m)) return null;
  const jadwal = jadwalCicilan(m);
  const dibayar = m.pokok - m.sisaSaldo;
  const lunas = cicilanTerbayar(jadwal, dibayar);

  const baris = jadwal.map(
    (b) => html`<tr class="${b.urutan <= lunas ? "lunas" : ""}">
  <td>ke-${b.urutan}</td>
  <td>${formatTanggal(b.jatuhTempo)}</td>
  <td class="angka-kolom">${formatRupiah(b.jumlah)}</td>
  <td>${
    b.urutan <= lunas
      ? html`<span class="lencana lencana-selesai">Tertutup</span>`
      : b.jatuhTempo.getTime() < Date.now()
        ? html`<span class="lencana lencana-terlambat">Tertunggak</span>`
        : html`<span class="lencana">Belum jatuh tempo</span>`
  }</td>
</tr>`
  );

  return html`<div class="kartu">
  <h2>Jadwal cicilan <span class="keterangan">— ${lunas} dari ${jadwal.length} sudah tertutup pembayaran</span></h2>
  <div class="tabel-bungkus"><table>
    <thead><tr><th>Cicilan</th><th>Jatuh tempo</th><th class="angka-kolom">Nominal</th><th>Keadaan</th></tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>
</div>`;
}

function kartuAngsuran(m: Transaksi, sesi: SesiAktif): HtmlAman {
  const baris = m.angsuran.map(
    (a, i) => html`<tr>
  <td>${i + 1}</td>
  <td>${formatTanggal(a.tanggal)}</td>
  <td class="angka-kolom">${formatRupiah(a.jumlah)}</td>
  <td class="keterangan">${a.dicatatOleh.nama}</td>
</tr>`
  );

  return html`<div class="kartu">
  <h2>Angsuran <span class="keterangan">— total dibayar ${formatRupiah(m.pokok - m.sisaSaldo)}</span></h2>
  ${
    m.angsuran.length === 0
      ? html`<p class="kosong">Belum ada angsuran tercatat.</p>`
      : html`<div class="tabel-bungkus"><table>
    <thead><tr><th>#</th><th>Tanggal</th><th class="angka-kolom">Jumlah</th><th>Dicatat oleh</th></tr></thead>
    <tbody>${gabung(baris)}</tbody>
  </table></div>`
  }
  ${
    m.status === "BERJALAN"
      ? html`<form method="post" action="/muamalah/${m.id}/angsuran" class="filter-baris jarak-atas">
    ${bidangCsrf(sesi)}
    <div class="bidang">
      <label for="jumlah">Jumlah</label>
      <input type="text" id="jumlah" name="jumlah" placeholder="mis. 500rb" inputmode="numeric" required>
    </div>
    <div class="bidang">
      <label for="tanggal">Tanggal</label>
      <input type="date" id="tanggal" name="tanggal" value="${nilaiTanggal(new Date())}" required>
    </div>
    <button class="tombol tombol-utama" type="submit">Catat angsuran</button>
  </form>`
      : null
  }
</div>`;
}

function tombolAksi(m: Transaksi, sesi: SesiAktif): HtmlAman {
  const aksi = (nilai: string, label: string, kelas = "tombol", konfirmasi?: string) =>
    html`<form method="post" action="/muamalah/${m.id}/status" class="sebaris" ${konfirmasi ? html`data-konfirmasi="${konfirmasi}"` : null}>
  ${bidangCsrf(sesi)}
  <input type="hidden" name="aksi" value="${nilai}">
  <button class="tombol ${kelas}" type="submit">${label}</button>
</form>`;

  return html`${m.status === "DRAFT" ? aksi("jalankan", "▶ Jadikan berjalan", "tombol-utama") : null}
${m.status === "BERJALAN" ? aksi("selesai", "✓ Tandai selesai") : null}
<a class="tombol" href="/muamalah/${m.id}/ubah">Ubah</a>
${
  m.status !== "BATAL"
    ? aksi(
        "batal",
        "Batalkan",
        "tombol-bahaya",
        `Batalkan transaksi #${m.id}? Datanya tetap tersimpan dan masih bisa dilihat.`
      )
    : null
}`;
}

rutMuamalah.get("/muamalah/:id", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return tidakDitemukan(c);
  const sesi = c.get("sesi");

  return c.html(
    halaman({
      judul: `#${m.id} ${m.judul}`,
      sesi,
      jalur: "/muamalah",
      lingkupLabel: await labelLingkup(sesi),
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        `#${m.id} ${m.judul}`,
        `${LABEL_JENIS[m.jenis as JenisMuamalah] ?? m.jenis} · ${m.pihak.nama} · ${m.kantor.nama}`,
        tombolAksi(m, sesi)
      )}
${kartuRincian(m)}
${kartuJadwal(m)}
${kartuAngsuran(m, sesi)}
${kartuDokumen(m, sesi)}
<div class="baris-tombol"><a class="tombol" href="/muamalah">← Kembali ke daftar</a></div>`,
    }).nilai
  );
});

// --- Ubah ------------------------------------------------------------------

rutMuamalah.get("/muamalah/:id/ubah", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return tidakDitemukan(c);
  const sesi = c.get("sesi");

  return c.html(
    halaman({
      judul: `Ubah #${m.id}`,
      sesi,
      jalur: "/muamalah",
      lingkupLabel: await labelLingkup(sesi),
      pesan: ambilPesan(c),
      isi: html`${judulHalaman(
        `Ubah transaksi #${m.id}`,
        "Jenis dan pihak tidak bisa diubah — buat transaksi baru bila keliru."
      )}
<div class="kartu">
  ${formulirTransaksi({
    aksi: `/muamalah/${m.id}/ubah`,
    sesi,
    baru: false,
    jenisTerkunci: m.jenis,
    labelTombol: "Simpan perubahan",
    nilai: {
      judul: m.judul,
      pokok: m.pokok.toString(),
      margin: m.margin ? m.margin.toString() : "",
      porsiModal: m.porsiModal ?? "",
      tanggalAkad: nilaiTanggal(m.tanggalAkad),
      jatuhTempo: nilaiTanggal(m.jatuhTempo),
      bagiHasilNisbah: m.bagiHasilNisbah ?? "",
      deskripsi: m.deskripsi ?? "",
      tenorCicilan: m.tenorCicilan ? String(m.tenorCicilan) : "",
      periodeCicilan: m.periodeCicilan ?? "BULANAN",
      mulaiCicilan: nilaiTanggal(m.mulaiCicilan),
    },
  })}
</div>`,
    }).nilai
  );
});

rutMuamalah.post("/muamalah/:id/ubah", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return tidakDitemukan(c);
  const sesi = c.get("sesi");
  const body = (await c.req.parseBody()) as Formulir;

  const judul = teks(body, "judul");
  const pokok = parseNominal(teks(body, "pokok"));
  const tanggalAkad = parseTanggal(teks(body, "tanggalAkad"));
  const jalurUbah = `/muamalah/${m.id}/ubah`;

  if (!judul) return kembali(c, jalurUbah, { jenis: "galat", teks: "Judul wajib diisi." });
  if (pokok === null) {
    return kembali(c, jalurUbah, { jenis: "galat", teks: "Nominal pokok tidak dikenali." });
  }
  if (tanggalAkad === null) {
    return kembali(c, jalurUbah, { jenis: "galat", teks: "Tanggal akad tidak sah." });
  }

  const cicilan = bacaCicilan(body, m.jenis);
  if ("galat" in cicilan) return kembali(c, jalurUbah, { jenis: "galat", teks: cicilan.galat });

  const ketentuan = bacaKetentuanJenis(body, m.jenis);
  if ("galat" in ketentuan) return kembali(c, jalurUbah, { jenis: "galat", teks: ketentuan.galat });

  await perbaruiMuamalah(m.id, {
    judul,
    pokok,
    tanggalAkad,
    jatuhTempo: parseTanggal(teks(body, "jatuhTempo")),
    ...ketentuan,
    deskripsi: opsional(body, "deskripsi"),
    ...cicilan.nilai,
  });
  await catatAuditOperator(sesi.operator.id, "UPDATE", "Muamalah", m.id, {
    judul,
    pokok: pokok.toString(),
    via: "web",
  });

  return kembali(c, `/muamalah/${m.id}`, { jenis: "ok", teks: "Perubahan tersimpan." });
});

// --- Angsuran & status -----------------------------------------------------

rutMuamalah.post("/muamalah/:id/angsuran", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return tidakDitemukan(c);
  const sesi = c.get("sesi");
  const body = (await c.req.parseBody()) as Formulir;
  const tujuan = `/muamalah/${m.id}`;

  if (m.status !== "BERJALAN") {
    return kembali(c, tujuan, {
      jenis: "galat",
      teks: "Angsuran hanya bisa dicatat pada transaksi yang berjalan.",
    });
  }

  const jumlah = parseNominal(teks(body, "jumlah"));
  const tanggal = parseTanggal(teks(body, "tanggal"));
  if (jumlah === null || jumlah <= 0n) {
    return kembali(c, tujuan, {
      jenis: "galat",
      teks: "Jumlah angsuran tidak dikenali. Contoh: 500rb atau 500.000.",
    });
  }
  if (tanggal === null) {
    return kembali(c, tujuan, { jenis: "galat", teks: "Tanggal angsuran tidak sah." });
  }

  const angsuran = await catatAngsuran({
    muamalahId: m.id,
    jumlah,
    tanggal,
    dicatatOlehId: sesi.operator.id,
  });
  await catatAuditOperator(sesi.operator.id, "CREATE", "Angsuran", angsuran.id, {
    muamalahId: m.id,
    jumlah: jumlah.toString(),
    via: "web",
  });

  // catatAngsuran() menandai transaksi SELESAI sendiri begitu sisanya nol.
  const sesudah = await detailMuamalah(m.id);
  return kembali(c, tujuan, {
    jenis: "ok",
    teks:
      sesudah?.status === "SELESAI"
        ? `Angsuran ${formatRupiah(jumlah)} tercatat. Sisa nol — transaksi ditandai selesai.`
        : `Angsuran ${formatRupiah(jumlah)} tercatat. Sisa ${formatRupiah(sesudah?.sisaSaldo ?? 0n)}.`,
  });
});

rutMuamalah.post("/muamalah/:id/status", async (c) => {
  const m = await muatTransaksi(c);
  if (!m) return tidakDitemukan(c);
  const sesi = c.get("sesi");
  const body = (await c.req.parseBody()) as Formulir;
  const aksi = teks(body, "aksi");
  const tujuan = `/muamalah/${m.id}`;

  if (aksi === "batal") {
    await hapusMuamalah(m.id, false); // soft delete; hard delete tetap khusus superadmin
    await catatAuditOperator(sesi.operator.id, "DELETE", "Muamalah", m.id, {
      hardDelete: false,
      via: "web",
    });
    return kembali(c, tujuan, { jenis: "ok", teks: `Transaksi #${m.id} dibatalkan.` });
  }

  const status: StatusMuamalah | null =
    aksi === "jalankan" ? "BERJALAN" : aksi === "selesai" ? "SELESAI" : null;
  if (!status) return kembali(c, tujuan, { jenis: "galat", teks: "Aksi tidak dikenali." });

  await ubahStatus(m.id, status);
  await catatAuditOperator(sesi.operator.id, "UPDATE", "Muamalah", m.id, { status, via: "web" });
  return kembali(c, tujuan, {
    jenis: "ok",
    teks:
      status === "BERJALAN"
        ? `#${m.id} kini berjalan — ikut dihitung di rekap dan pengingat jatuh tempo.`
        : `#${m.id} ditandai selesai.`,
  });
});
