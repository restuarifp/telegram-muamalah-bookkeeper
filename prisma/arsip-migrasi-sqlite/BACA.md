# Arsip migrasi SQLite

Riwayat migrasi dari masa sistem ini memakai SQLite (sampai 21 Agustus 2026).
Disimpan sebagai catatan, **bukan** untuk dijalankan: SQL-nya spesifik SQLite
(mis. `PRAGMA`, dan pola "buat tabel baru lalu salin" yang dipakai Prisma karena
SQLite tidak bisa mengubah foreign key lewat ALTER).

Setelah pindah ke PostgreSQL, `prisma/migrations` dimulai ulang dari satu migrasi
`init` yang membentuk skema utuh. Perpindahan datanya sendiri dilakukan oleh
`scripts/migrasi-sqlite-ke-postgres.ts`, bukan oleh migrasi Prisma.
