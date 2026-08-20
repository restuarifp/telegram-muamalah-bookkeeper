/**
 * Satu-satunya JavaScript di sisi klien: konfirmasi untuk aksi yang tidak bisa
 * dibatalkan. Disimpan sebagai modul TS dengan alasan yang sama seperti CSS
 * (lihat src/web/style.ts) — halaman ini dirender server, dan tidak ada build
 * step untuk aset.
 *
 * Ditulis sebagai berkas terpisah, bukan atribut onsubmit, supaya Content
 * Security Policy bisa melarang skrip sebaris sepenuhnya.
 */
export const JS = `
document.addEventListener("submit", function (e) {
  var pesan = e.target instanceof HTMLFormElement && e.target.dataset.konfirmasi;
  if (pesan && !window.confirm(pesan)) e.preventDefault();
});

// Kolom kode OTP: langsung kirim begitu enam angka terisi, supaya tidak perlu
// pindah tangan dari papan ketik angka ke tombol.
var kode = document.querySelector(".kode-otp");
if (kode) {
  kode.addEventListener("input", function () {
    kode.value = kode.value.replace(/\\D/g, "").slice(0, 6);
    if (kode.value.length === 6) kode.form.requestSubmit();
  });
}
`;
