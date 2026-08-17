# Bot Muamalah

Sistem manajemen dan pencatatan muamalah non-tunai (utang-piutang, investasi, qardh, dsb.) via bot Telegram, dipakai bersama oleh operator di sebuah grup.

## Fitur

- **CRUD & daftar muamalah** — wizard inline keyboard (`/tambah`, `/list`, `/filter`), edit field, catat angsuran, tandai selesai, hapus (soft delete; hard delete khusus admin lewat `/hapus_permanen`).
- **Status transaksi** — `DRAFT` → `BERJALAN` → `SELESAI`, atau `BATAL`. Transaksi bisa disimpan sebagai draft dari langkah konfirmasi wizard; draft tidak dihitung di rekap dan tidak memicu pengingat sampai diaktifkan lewat tombol "Jadikan Berjalan". **Keterlambatan bukan status**: dihitung saat ditampilkan dari `jatuhTempo` pada transaksi `BERJALAN`, sehingga mengubah jatuh tempo langsung tercermin tanpa job pembetulan.
- **Skema cicilan** — untuk utang/piutang/qardh, disimpan parametrik (jumlah cicilan, periode bulanan/mingguan, tanggal cicilan pertama). Jadwal, nominal per cicilan, dan cicilan berikutnya dihitung dari ketiga kolom itu di `src/utils/cicilan.ts` — sisa pembagian ditumpuk ke cicilan terakhir agar totalnya persis sama dengan pokok.
- **Notifikasi jatuh tempo** — pengingat otomatis harian jam 08:00 WIB (H-7, H-3, H-1, H-0, dan terlambat mingguan) dikirim ke grup (atau ke chat pribadi admin bila `GROUP_ID` kosong); `/jatuhtempo` untuk cek manual kapan saja.
- **Manajemen dokumen akad** — upload/download dokumen per transaksi, plus template akad siap unduh (`/template`, `/template_tambah` untuk admin).
- **Rekap** (`/rekap`) dan **manajemen operator** (`/operator_list`, `/operator_tambah`, `/operator_hapus`, admin-only) dengan audit log di setiap mutasi.

## Mode akses

`GROUP_ID` bersifat opsional dan menentukan cara bot dipakai:

- **Mode grup** — `GROUP_ID` diisi: bot melayani chat grup tersebut (operator terdaftar bekerja seperti biasa), dan pengingat jatuh tempo dikirim ke grup itu. Di luar grup tersebut, hanya user yang ID-nya ada di `ADMIN_IDS` yang direspons.
- **Mode langsung** — `GROUP_ID` dikosongkan: bot dipakai lewat chat pribadi dan **hanya merespons user yang ID-nya terdaftar di `ADMIN_IDS`**; pengingat jatuh tempo dikirim ke chat pribadi tiap admin tersebut. Karena itu `ADMIN_IDS` wajib diisi bila `GROUP_ID` kosong — bot menolak start kalau keduanya kosong.

Update dari chat/user di luar aturan di atas diabaikan tanpa balasan.

## Menjalankan secara lokal

```bash
npm install
cp .env.example .env   # isi BOT_TOKEN, ADMIN_IDS (GROUP_ID opsional)
npx prisma migrate dev
npm run dev
```

## Menjalankan dengan Docker

```bash
cp .env.example .env   # isi BOT_TOKEN, ADMIN_IDS (GROUP_ID opsional)
docker compose up -d --build
docker compose logs -f bot
```

Data (database SQLite + dokumen akad) disimpan di volume bernama `muamalah-data`, sehingga tetap ada saat container dibangun ulang.

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
