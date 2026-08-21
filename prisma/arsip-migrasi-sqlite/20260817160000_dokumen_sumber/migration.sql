-- Dokumen akad kini bisa didaftarkan dari tautan Nextcloud, bukan hanya diunggah
-- lewat Telegram. Kolom ini merekam asalnya, karena itu yang menentukan sejauh
-- mana bot boleh menyentuh berkasnya: yang diunggah bot boleh di-rename dan
-- dihapus, yang cuma ditunjuk hanya boleh dilepas dari daftar.
--
-- Default 'UNGGAH' tepat untuk baris lama: sebelum ini satu-satunya cara
-- menambah dokumen memang lewat unggahan bot.
ALTER TABLE "Dokumen" ADD COLUMN "sumber" TEXT NOT NULL DEFAULT 'UNGGAH';
