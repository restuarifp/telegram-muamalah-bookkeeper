# Bot Muamalah

Sistem manajemen dan pencatatan muamalah non-tunai (utang-piutang, investasi, qardh, dsb.) via bot Telegram, dipakai bersama oleh operator di sebuah grup.

## Fitur

- **CRUD & daftar muamalah** — wizard inline keyboard (`/tambah`, `/list`, `/filter`), edit field, catat angsuran, tandai selesai, hapus (soft delete; hard delete khusus superadmin lewat `/hapus_permanen`).
- **Jenis yang dibuka: Qardh saja** (untuk sekarang) — diatur lewat `JENIS_AKTIF` di `src/types.ts`. Karena tinggal satu pilihan, wizard `/tambah` melewati langkah pemilihan jenis. `JENIS_MUAMALAH` sengaja tetap berisi semua jenis yang dikenali sistem, jadi transaksi lama berjenis lain tetap tampil dengan label yang benar, ikut terhitung di rekap, dan tetap punya folder Nextcloud sendiri. Membuka jenis lain cukup dengan menambahkannya di `JENIS_AKTIF`.
- **Status transaksi** — `DRAFT` → `BERJALAN` → `SELESAI`, atau `BATAL`. Transaksi bisa disimpan sebagai draft dari langkah konfirmasi wizard; draft tidak dihitung di rekap dan tidak memicu pengingat sampai diaktifkan lewat tombol "Jadikan Berjalan". **Keterlambatan bukan status**: dihitung saat ditampilkan dari `jatuhTempo` pada transaksi `BERJALAN`, sehingga mengubah jatuh tempo langsung tercermin tanpa job pembetulan.
- **Skema cicilan** — untuk utang/piutang/qardh, disimpan parametrik (jumlah cicilan, periode bulanan/mingguan, tanggal cicilan pertama). Jadwal, nominal per cicilan, dan cicilan berikutnya dihitung dari ketiga kolom itu di `src/utils/cicilan.ts` — sisa pembagian ditumpuk ke cicilan terakhir agar totalnya persis sama dengan pokok.
- **Notifikasi jatuh tempo** — pengingat otomatis harian jam 08:00 WIB (H-7, H-3, H-1, H-0, dan terlambat mingguan) dikirim ke grup (atau ke chat pribadi admin bila `GROUP_ID` kosong); `/jatuhtempo` untuk cek manual kapan saja. Transaksi bercicilan diingatkan **per cicilan**, bukan per transaksi:
  - Cicilan yang sudah tertutup pembayaran berhenti diingatkan dengan sendirinya — tidak ada penandaan manual.
  - Tunggakan digabung jadi satu pesan per transaksi ("3 cicilan tertunggak (ke-1 s/d ke-3) — total Rp …"), supaya enam cicilan telat tidak jadi enam pesan.
  - `jatuhTempo` transaksi tidak ikut memicu pengingat kalau ada skema cicilan, agar tidak dobel dengan cicilan terakhir.
  - Dedup memakai kunci `(muamalahId, urutanCicilan, offsetHari)`; tunggakan ditagih ulang tiap kelipatan 7 hari.
- **Manajemen dokumen akad di Nextcloud** — berkas tidak lagi disimpan di disk bot maupun dikirim ulang lewat Telegram: setiap unggahan diteruskan ke Nextcloud, dan yang beredar di chat hanya **tautan berbagi publiknya**. Template akad tidak diunggah sama sekali — admin mendaftarkannya dengan **mengirim tautan Nextcloud** ke berkas yang sudah ada (lihat [Dokumen & template](#dokumen--template-nextcloud)).
- **Rekap** (`/rekap`) dan **manajemen operator & kantor** (`/operator_*`, `/kantor_*`) dengan audit log di setiap mutasi.
- **ACL per kantor perwakilan** — tiap operator melekat pada satu kantor dan hanya melihat transaksi kantornya; superadmin melihat semuanya (lihat [Kantor & hak akses](#kantor--hak-akses)).
- **Web UI** — dasbor, tabel transaksi yang bisa disaring, formulir penuh untuk mencatat & mengubah, plus pengelolaan dokumen, template, kantor, dan operator. **Login lewat OTP Telegram**, tanpa password (lihat [Web UI](#web-ui)).

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

Yang menentukan sejauh mana bot boleh menyentuh sebuah berkas bukan jenisnya, melainkan **asalnya** — direkam di kolom `Dokumen.sumber`:

- **`UNGGAH` — bot yang menaruh.** Operator mengirim berkasnya lewat Telegram, bot mengunggahnya ke folder transaksi. Karena bot yang membuat berkas itu, bot juga boleh mengganti namanya dan menghapusnya.
- **`TAUTAN` — bot cuma menunjuk.** Berkasnya sudah ada di Nextcloud dan didaftarkan lewat **tautan**. Bot tidak pernah menyalin, memindah, mengganti nama, atau menghapusnya; yang bisa dilakukan hanya melepasnya dari daftar.

Template akad selalu bersifat menunjuk — tidak ada jalur unggah untuk template.

Di chat, dokumen bertaut ditandai 🔗 dan dokumen unggahan ditandai 📄, jadi terlihat mana yang berkasnya dipegang bot.

| Aksi | Dokumen per akad | Template akad |
| --- | --- | --- |
| Tambah | **⬆️ Unggah** (kirim berkas) atau **🔗 Dari Tautan** | `/template_tambah` → **kirim tautan** (admin) |
| Lihat | detail transaksi → **📎 Dokumen** | `/template` |
| Ubah | **✏️ Ubah Nama** (WebDAV `MOVE`) — hanya untuk `UNGGAH` | **✏️ Ubah Judul**, **🔗 Ganti Tautan** (admin) |
| Hapus | **🗑️ Hapus** (`UNGGAH`, berkas ikut dibuang) / **🗑️ Lepas** (`TAUTAN`, berkas utuh) | **🗑️ Lepas dari daftar** — berkas tetap utuh (admin) |
| Selaraskan | **🔄 Sinkron** per transaksi | `/template_sinkron` (admin) |

Satu berkas hanya boleh ditautkan ke satu transaksi; percobaan menautkannya lagi ditolak dengan menyebut transaksi yang sudah memakainya.

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

**Sinkron dokumen** (per transaksi) tetap dua arah untuk isi folder transaksi: berkas yang ditaruh langsung lewat web Nextcloud didaftarkan (sebagai `UNGGAH`, karena folder itu memang milik bot), dan baris yang berkasnya hilang dilepas.

Dokumen bertaut diperlakukan berbeda di sinkron: berkasnya tinggal **di luar** folder transaksi, jadi ketidakhadirannya dalam daftar folder bukan bukti ia hilang. Masing-masing diperiksa satu per satu — metadatanya disegarkan kalau berubah, dan baru dilepas kalau berkasnya benar-benar sudah tidak ada. Tanpa pemisahan ini, satu tekan 🔄 Sinkron akan melenyapkan semua dokumen bertaut.

### Kredensial

`NEXTCLOUD_URL`, `NEXTCLOUD_USER`, dan `NEXTCLOUD_PASSWORD` wajib diisi — bot menolak start tanpa ketiganya. Gunakan **App Password** (Settings → Security → Devices & sessions), bukan password login utama. Sharing publik harus diaktifkan di Nextcloud (Settings → Sharing → *Allow apps and users to share files*), karena link dibuat lewat OCS Share API sebagai share read-only.

Saat start bot memastikan folder penyimpanan ada, sekaligus jadi pemeriksaan kredensial: kalau gagal, log memberi tahu dan bot tetap jalan — fitur dokumennya yang mengeluh, bukan seluruh bot.

## Mode akses

`GROUP_ID` bersifat opsional dan menentukan cara bot dipakai:

- **Mode grup** — `GROUP_ID` diisi: bot melayani chat grup tersebut (operator terdaftar bekerja seperti biasa), dan pengingat jatuh tempo dikirim ke grup itu. Di luar grup tersebut, hanya user yang ID-nya ada di `ADMIN_IDS` yang direspons.
- **Mode langsung** — `GROUP_ID` dikosongkan: bot dipakai lewat chat pribadi dan **hanya merespons user yang ID-nya terdaftar di `ADMIN_IDS`**; pengingat jatuh tempo dikirim ke chat pribadi tiap admin tersebut. Karena itu `ADMIN_IDS` wajib diisi bila `GROUP_ID` kosong — bot menolak start kalau keduanya kosong.

Update dari chat/user di luar aturan di atas diabaikan tanpa balasan.

## Kantor & hak akses

Setiap transaksi tercatat di satu **kantor perwakilan (kanwil)**, dan setiap operator ditempatkan di satu kantor. Satu kantor boleh punya banyak operator.

| Peran | Kantor | Lihat transaksi | Kelola kantor & operator |
| --- | --- | --- | --- |
| `SUPERADMIN` | lintas kantor (`kantorId` kosong) | semua kantor, bisa dipersempit lewat `/kantor_filter` | ya |
| `OPERATOR` | tepat satu | hanya kantornya | tidak |

Batas kantor operator datang dari data operator, bukan dari pilihan tampilan, jadi tidak bisa dilepas lewat tombol mana pun. Filter kantor superadmin sebaliknya **hanya alat bantu lihat**: ia mempersempit daftar/rekap, tapi tidak menghalangi superadmin membuka transaksi kantor lain. Pembatasan berlaku di daftar, detail, dan **setiap aksi ber-id** (catat angsuran, edit, unggah, selesai, hapus) — id transaksi berurutan dan mudah ditebak, jadi tombol bukan satu-satunya jalan sebuah id sampai ke handler.

Perintah:

| Perintah | Untuk | Keterangan |
| --- | --- | --- |
| `/kantor_list` | semua | daftar kantor + jumlah transaksinya |
| `/kantor_tambah <nama>` | superadmin | mis. `/kantor_tambah Kanwil Surabaya` |
| `/kantor_hapus <id\|nama>` | superadmin | menonaktifkan; transaksi & operator lama tetap utuh |
| `/kantor_filter` | superadmin | pilih satu kantor atau kembali ke semua kantor |
| `/operator_list` | semua | superadmin melihat semua; operator hanya rekan sekantor |
| `/operator_tambah <telegram_id> <kantor> <nama>` | superadmin | `<kantor>` = id/nama dari `/kantor_list`, atau `superadmin` untuk peran lintas kantor. Bisa juga dengan me-reply pesan orangnya: `/operator_tambah <kantor> <nama>`. Mendaftarkan ulang orang yang sudah ada = memindahkan kantornya. |
| `/operator_hapus <telegram_id>` | superadmin | menonaktifkan operator |

Saat superadmin mencatat transaksi lewat `/tambah`, wizard menanyakan kantornya lebih dulu; operator biasa tidak ditanya — kantornya sudah melekat pada dirinya.

**Migrasi data lama** (`20260819090000_kantor_acl`): semua transaksi yang sudah ada dipindahkan ke kantor bernama **"Kantor Pusat"**, dan admin yang ada dinaikkan menjadi `SUPERADMIN` (lintas kantor). `ADMIN_IDS` di `.env` juga disemai sebagai superadmin saat boot.

## Web UI

Antarmuka web untuk pekerjaan yang sesak kalau dilakukan lewat chat: menelusuri banyak transaksi sekaligus, menyaring dan mencari, membaca jadwal cicilan sebagai tabel, dan mengisi satu formulir penuh alih-alih sepuluh langkah wizard.

Web dan bot **bukan dua sistem**: keduanya memakai database, service, dan aturan kantor yang sama, jadi apa pun yang dicatat lewat web langsung tampil di bot dan sebaliknya. Setiap mutasi lewat web juga menulis `AuditLog` yang sama, ditandai `"via": "web"` di payload-nya.

Dimatikan secara default (`WEB_ENABLED=false`) — instalasi yang cuma memakai bot tidak perlu tiba-tiba membuka port.

### Login: OTP lewat Telegram

Tidak ada password, dan tidak ada pendaftaran terpisah. Satu-satunya identitas yang sudah dipercaya sistem ini adalah `telegramUserId` operator, jadi itu pula yang dipakai web:

1. Operator memasukkan **Telegram User ID**-nya di `/masuk` (lupa? kirim `/init` ke bot, ID-nya ada di balasannya).
2. Bot mengirim **kode 6 angka** ke chat pribadinya, berlaku 5 menit.
3. Kode ditukar jadi sesi (cookie `HttpOnly`, umur `WEB_SESSION_HOURS`).

Konsekuensinya: yang bisa masuk hanya orang yang benar-benar memegang akun Telegram operator, tidak ada kredensial kedua yang bisa bocor, dan **mencabut akses cukup dengan menonaktifkan operatornya** — sesi web yang sedang berjalan langsung ikut mati (`aktif` diperiksa tiap permintaan).

Yang menjaga alur ini tetap sempit:

| Batas | Perilaku |
| --- | --- |
| Kode terikat browser | `idPermintaan` disimpan di cookie; enam angka yang terbaca di layar Telegram orang lain tidak bisa ditukar dari perangkat lain |
| Salah ketik | 5 percobaan per kode, lalu kode itu mati dan harus minta baru |
| Banjir permintaan | 5 permintaan kode per operator per 15 menit |
| Kode ganda | Meminta kode baru langsung membatalkan kode lama — hanya ada satu kode hidup per operator |
| Penyimpanan | Kode & token sesi disimpan sebagai HMAC (kunci: `BOT_TOKEN`), bukan teks polos, karena database ini ikut ke backup |
| Kode tak sampai | Kalau Telegram menolak (bot belum pernah diajak bicara), kodenya langsung dimatikan dan operator diberi tahu harus menekan Start dulu |

Pengiriman kode memakai `Api` grammY sendiri, bukan instance bot yang sedang polling — web tetap bisa mengirim kode walau bot sedang mati, dan `npm run web` bisa dijalankan sebagai proses terpisah tanpa dua proses berebut update.

### Halaman

| Jalur | Isi |
| --- | --- |
| `/` | Dasbor: saldo berjalan, jumlah transaksi aktif, jatuh tempo bulan ini, tabel jatuh tempo 7 hari ke depan + tunggakan, sisa per jenis |
| `/muamalah` | Daftar transaksi: cari judul/nama pihak, saring jenis & status, paginasi, sisa saldo per baris |
| `/muamalah/baru` | Formulir lengkap dalam satu halaman (termasuk skema cicilan); bisa disimpan sebagai draft |
| `/muamalah/:id` | Detail: rincian, **jadwal cicilan** lengkap dengan penanda tertutup/tertunggak, riwayat angsuran + form catat angsuran, dokumen, tombol jadikan berjalan / tandai selesai / batalkan |
| `/muamalah/:id/ubah` | Ubah semua field yang boleh diedit sekaligus (jenis & pihak tidak bisa diubah, sama seperti di bot) |
| `/template` | Daftar template akad; superadmin bisa mendaftarkan dari tautan, ubah judul, lepas, dan sinkron |
| `/kantor` | Daftar kantor + jumlah transaksinya; superadmin bisa menambah, menonaktifkan, dan memilih kantor yang ditampilkan |
| `/operator` | Daftar operator (operator biasa hanya melihat rekan sekantor); superadmin bisa menambah/memindahkan dan menonaktifkan |

Dokumen dikelola dari halaman detail transaksi: unggah berkas (diteruskan ke Nextcloud), daftarkan dari tautan, ubah nama, hapus/lepas, dan 🔄 sinkron folder — persis operasi yang ada di bot, termasuk aturan `UNGGAH` vs `TAUTAN` (lihat [Dokumen & template](#dokumen--template-nextcloud)). Berbeda dengan di Telegram, tautan Nextcloud **tidak** disamarkan di web: begitu ditekan, alamatnya toh muncul di bilah alamat browser.

### Hak akses

Aturan kantornya satu sumber dengan bot (`src/services/akses.ts`): operator hanya melihat dan menyentuh transaksi kantornya, superadmin melihat semuanya dan boleh mempersempit tampilan lewat filter kantor. Transaksi milik kantor lain dijawab **404 yang sama persis** dengan transaksi yang tidak ada — id transaksi berurutan, jadi membedakan keduanya sama saja memberi tahu kantor lain punya apa. Pembatasan itu berlaku di daftar, detail, dan setiap aksi ber-id, bukan cuma di tombol yang ditampilkan.

Filter kantor superadmin disimpan di baris sesi (server), bukan di cookie, supaya lingkup tampilan tidak bisa dikarang browser. Seperti di bot, filter itu **alat bantu lihat**: ia mempersempit daftar & rekap tapi tidak menghalangi superadmin membuka transaksi kantor lain.

### Catatan keamanan lain

- Semua form POST membawa token anti-CSRF turunan sesi; `SameSite=Lax` saja tidak menutup semua jalur POST lintas situs.
- Halaman dirender di server dengan escaping wajib (`src/web/html.ts`), dan CSP-nya melarang skrip/gaya sebaris maupun aset dari luar.
- Cookie sesi ber-flag `Secure` kecuali `WEB_SECURE_COOKIE=false`. Jalankan di balik reverse proxy HTTPS; `docker-compose.yml` sengaja memetakan portnya ke `127.0.0.1` saja.
- Unggahan di atas ~24 MB ditolak sebelum badan permintaannya dibaca ke memori.

### Menjalankan

```bash
# bersama bot (satu proses)
WEB_ENABLED=true npm run dev

# hanya web, tanpa bot yang polling
npm run web
```

Lalu buka `http://localhost:3000` (isi `WEB_SECURE_COOKIE=false` di `.env` untuk uji coba lewat HTTP polos). Dengan Docker, cukup `WEB_ENABLED=true` di `.env` — portnya sudah dipetakan di `docker-compose.yml`.

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

Volume datanya kini hanya menyimpan database SQLite (dan penanda healthcheck) — berkas dokumen ada di Nextcloud, jadi backup volume ini tidak lagi mencakup dokumen akad.

Backup:

```bash
# Compose memberi awalan nama proyek pada volume, jadi nama sebenarnya adalah
# <nama-folder-proyek>_muamalah-data — bukan "muamalah-data" saja. Pastikan dulu:
docker volume ls | grep muamalah-data

docker run --rm -v muamalah-database_muamalah-data:/data -v "$PWD":/backup \
  alpine tar czf /backup/backup.tar.gz /data
```

> Salah menyebut nama volume di sini tidak menghasilkan error: Docker justru membuat volume kosong baru dan menghasilkan arsip kosong. Cek isi arsipnya (`tar tzf backup.tar.gz`) setelah backup pertama.

## Uji coba tanpa menunggu cron

```bash
npm run job:reminder
```

## Test

```bash
npm test
```
