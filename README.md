# Bot Muamalah

Sistem manajemen dan pencatatan muamalah non-tunai (utang-piutang, investasi, qardh, dsb.) via bot Telegram, dipakai bersama oleh operator di sebuah grup.

## Fitur

- **CRUD & daftar muamalah** — wizard inline keyboard (`/tambah`, `/list`, `/filter`), edit field, catat angsuran, tandai selesai, hapus (soft delete; hard delete khusus admin lewat `/hapus_permanen`).
- **Jenis yang dibuka: Qardh saja** (untuk sekarang) — diatur lewat `JENIS_AKTIF` di `src/types.ts`. Karena tinggal satu pilihan, wizard `/tambah` melewati langkah pemilihan jenis. `JENIS_MUAMALAH` sengaja tetap berisi semua jenis yang dikenali sistem, jadi transaksi lama berjenis lain tetap tampil dengan label yang benar, ikut terhitung di rekap, dan tetap punya folder Nextcloud sendiri. Membuka jenis lain cukup dengan menambahkannya di `JENIS_AKTIF`.
- **Status transaksi** — `DRAFT` → `BERJALAN` → `SELESAI`, atau `BATAL`. Transaksi bisa disimpan sebagai draft dari langkah konfirmasi wizard; draft tidak dihitung di rekap dan tidak memicu pengingat sampai diaktifkan lewat tombol "Jadikan Berjalan". **Keterlambatan bukan status**: dihitung saat ditampilkan dari `jatuhTempo` pada transaksi `BERJALAN`, sehingga mengubah jatuh tempo langsung tercermin tanpa job pembetulan.
- **Skema cicilan** — untuk utang/piutang/qardh, disimpan parametrik (jumlah cicilan, periode bulanan/mingguan, tanggal cicilan pertama). Jadwal, nominal per cicilan, dan cicilan berikutnya dihitung dari ketiga kolom itu di `src/utils/cicilan.ts` — sisa pembagian ditumpuk ke cicilan terakhir agar totalnya persis sama dengan pokok.
- **Notifikasi jatuh tempo** — pengingat otomatis harian jam 08:00 WIB (H-7, H-3, H-1, H-0, dan terlambat mingguan) dikirim ke grup (atau ke chat pribadi admin bila `GROUP_ID` kosong); `/jatuhtempo` untuk cek manual kapan saja. Transaksi bercicilan diingatkan **per cicilan**, bukan per transaksi:
  - Cicilan yang sudah tertutup pembayaran berhenti diingatkan dengan sendirinya — tidak ada penandaan manual.
  - Tunggakan digabung jadi satu pesan per transaksi ("3 cicilan tertunggak (ke-1 s/d ke-3) — total Rp …"), supaya enam cicilan telat tidak jadi enam pesan.
  - `jatuhTempo` transaksi tidak ikut memicu pengingat kalau ada skema cicilan, agar tidak dobel dengan cicilan terakhir.
  - Dedup memakai kunci `(muamalahId, urutanCicilan, offsetHari)`; tunggakan ditagih ulang tiap kelipatan 7 hari.
- **Manajemen dokumen akad di Nextcloud** — berkas tidak lagi disimpan di disk bot maupun dikirim ulang lewat Telegram: setiap unggahan diteruskan ke Nextcloud, dan yang beredar di chat hanya **tautan berbagi publiknya**. Template akad tidak diunggah sama sekali — admin mendaftarkannya dengan **mengirim tautan Nextcloud** ke berkas yang sudah ada (lihat [Dokumen & template](#dokumen--template-nextcloud)).
- **Rekap** (`/rekap`) dan **manajemen operator** (`/operator_list`, `/operator_tambah`, `/operator_hapus`, admin-only) dengan audit log di setiap mutasi.

## Dokumen & template (Nextcloud)

Seluruh berkas — dokumen akad per transaksi maupun template akad — disimpan di Nextcloud. Database bot hanya menyimpan **penunjuk**: `remotePath` (path WebDAV, sumber kebenaran untuk rename/hapus/ganti) plus cache link berbagi (`shareUrl`, `shareToken`).

**Yang dikirim ke chat adalah tautan, bukan berkas, dan tautannya disamarkan.** URL mentah tidak pernah muncul sebagai teks: yang terbaca operator hanya label seperti `📄 Buka Akad Qardh.pdf`, dengan URL tersembunyi di dalam entity `<a href>` HTML atau di balik tombol inline keyboard (👁️ Buka / ⬇️ Unduh). Preview tautan dimatikan di semua pesan tersebut, karena kartu preview Telegram akan menampilkan domain dan URL yang baru saja disembunyikan.

### Tata letak folder

```
NEXTCLOUD_BASE_DIR/                       (default: /Documents/Akad Muamalah)
├── Template Akad/                        NEXTCLOUD_TEMPLATE_FOLDER
│   └── Template Akad Qardh.docx
├── Qardh/
│   └── 12-pinjaman-fulan/                <id transaksi>-<slug judul>
│       └── Akad Qardh.pdf
├── Investasi/ · Utang/ · Piutang/ · Lainnya/
```

Folder per transaksi diawali ID-nya, sehingga tetap bisa dicocokkan ke transaksi walau judulnya kemudian diedit. Folder yang belum ada dibuat otomatis saat bot start dan saat unggahan pertama.

### Operasi yang tersedia

Dokumen akad dan template akad sengaja punya model kepemilikan yang berbeda:

- **Dokumen akad — bot yang menaruh.** Operator mengirim berkasnya lewat Telegram, bot mengunggahnya ke folder transaksi. Karena bot yang membuat berkas itu, bot juga boleh mengganti nama dan menghapusnya.
- **Template akad — bot cuma menunjuk.** Berkasnya sudah ada di Nextcloud; admin mendaftarkannya dengan **mengirim tautan**. Bot tidak pernah menyalin, memindah, atau menghapus berkas template.

| Aksi | Dokumen per akad | Template akad |
| --- | --- | --- |
| Tambah | detail transaksi → **⬆️ Unggah** (kirim berkas) | `/template_tambah` → **kirim tautan Nextcloud** (admin) |
| Lihat | detail transaksi → **📎 Dokumen** | `/template` |
| Ubah | **✏️ Ubah Nama** (WebDAV `MOVE`) | **✏️ Ubah Judul**, **🔗 Ganti Tautan** (admin) |
| Hapus | **🗑️ Hapus** — berkas ikut dibuang | **🗑️ Lepas dari daftar** — berkas tetap utuh (admin) |
| Selaraskan | **🔄 Sinkron** per transaksi | `/template_sinkron` (admin) |

### Mendaftarkan template lewat tautan

`/template_tambah` menanyakan kode, judul, lalu tautannya. Yang diterima — semuanya bisa disalin langsung dari web Nextcloud:

| Bentuk | Contoh |
| --- | --- |
| Tautan berkas di web Files | `…/apps/files/files/483?dir=/Documents/…` |
| Permalink "Copy direct link" | `…/f/483` |
| Link berbagi publik | `…/s/D4M5TY72wk42sjf` |
| URL WebDAV | `…/remote.php/dav/files/admin/Documents/…` |
| Path mentah | `/Documents/Akad Muamalah/Template Akad/Qardh.docx` |

Bentuk ber-`fileid` diterjemahkan lewat **DAV SEARCH** (endpoint `/remote.php/dav/meta/<id>` tidak tersedia di Nextcloud ini), jadi tautan tetap valid walau berkasnya nanti dipindah folder. Tautan dari host lain ditolak sebelum menyentuh jaringan, dan tautan salah ketik tidak mengeluarkan admin dari wizard — tinggal tempel ulang.

Karena yang dicatat adalah penunjuk, **template boleh tinggal di folder mana pun**, tidak harus di folder template. Satu berkas hanya boleh dipakai satu kode template; percobaan mendaftarkannya lagi ditolak dengan menyebut template yang sudah memakainya.

**Sinkron template** bersifat *perbaikan*, bukan penemuan: tiap template terdaftar diperiksa ke Nextcloud, metadatanya (nama berkas, ukuran, tipe) disegarkan kalau berubah, dan baris yang berkasnya sudah tidak ada dilepas. Berkas folder template yang belum terdaftar hanya **dilaporkan**, tidak didaftarkan otomatis — kalau sinkron ikut memungut isi folder, template yang baru saja dilepas admin akan muncul lagi dan pelepasan jadi terasa tidak berefek.

**Sinkron dokumen** (per transaksi) tetap dua arah: berkas yang ditaruh langsung lewat web Nextcloud didaftarkan, dan baris yang berkasnya hilang dilepas — di sana folder transaksi memang milik bot.

### Kredensial

`NEXTCLOUD_URL`, `NEXTCLOUD_USER`, dan `NEXTCLOUD_PASSWORD` wajib diisi — bot menolak start tanpa ketiganya. Gunakan **App Password** (Settings → Security → Devices & sessions), bukan password login utama. Sharing publik harus diaktifkan di Nextcloud (Settings → Sharing → *Allow apps and users to share files*), karena link dibuat lewat OCS Share API sebagai share read-only.

Saat start bot memastikan folder penyimpanan ada, sekaligus jadi pemeriksaan kredensial: kalau gagal, log memberi tahu dan bot tetap jalan — fitur dokumennya yang mengeluh, bukan seluruh bot.

## Mode akses

`GROUP_ID` bersifat opsional dan menentukan cara bot dipakai:

- **Mode grup** — `GROUP_ID` diisi: bot melayani chat grup tersebut (operator terdaftar bekerja seperti biasa), dan pengingat jatuh tempo dikirim ke grup itu. Di luar grup tersebut, hanya user yang ID-nya ada di `ADMIN_IDS` yang direspons.
- **Mode langsung** — `GROUP_ID` dikosongkan: bot dipakai lewat chat pribadi dan **hanya merespons user yang ID-nya terdaftar di `ADMIN_IDS`**; pengingat jatuh tempo dikirim ke chat pribadi tiap admin tersebut. Karena itu `ADMIN_IDS` wajib diisi bila `GROUP_ID` kosong — bot menolak start kalau keduanya kosong.

Update dari chat/user di luar aturan di atas diabaikan tanpa balasan.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env   # isi BOT_TOKEN, ADMIN_IDS, NEXTCLOUD_* (GROUP_ID opsional)
npx prisma migrate dev
npm run dev
```

## Menjalankan dengan Docker

```bash
cp .env.example .env   # isi BOT_TOKEN, ADMIN_IDS, NEXTCLOUD_* (GROUP_ID opsional)
docker compose up -d --build
docker compose logs -f bot
```

Volume `muamalah-data` kini hanya menyimpan database SQLite (dan penanda healthcheck) — berkas dokumen ada di Nextcloud, jadi backup volume ini tidak lagi mencakup dokumen akad.

Backup:

```bash
docker run --rm -v muamalah-data:/data -v $PWD:/backup alpine tar czf /backup/backup.tar.gz /data
```

## Uji coba tanpa menunggu cron

```bash
npm run job:reminder
```

## Test

```bash
npm test
```
