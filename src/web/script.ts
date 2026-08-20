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

// Formulir transaksi: hanya tampilkan bagian yang berlaku untuk jenis akad yang
// dipilih (margin buat murabahah, nisbah buat bagi hasil, dan seterusnya).
// Sekadar penyempurnaan — tanpa skrip ini seluruh bidang tetap terlihat dan
// formulirnya tetap bisa dikirim, karena server yang memutuskan mana yang
// dipakai untuk jenis bersangkutan.
var pilihJenis = document.getElementById("jenis");
if (pilihJenis) {
  var sesuaikan = function () {
    var jenis = pilihJenis.value;
    var bagian = document.querySelectorAll("[data-jenis]");
    for (var i = 0; i < bagian.length; i++) {
      var untuk = (bagian[i].getAttribute("data-jenis") || "").split(" ");
      bagian[i].hidden = untuk.indexOf(jenis) === -1;
    }
  };
  // Sebutan kedua pihak juga ikut jenisnya (pemberi/penerima, penjual/pembeli).
  // Sumbernya atribut data- pada tiap <option>, yang dirender server dari
  // PERAN_PIHAK — bukan salinan daftar peran di sini.
  var labelSatu = document.getElementById("label-pihak");
  var labelDua = document.getElementById("label-pihak-kedua");
  var sesuaikanPeran = function () {
    var opsi = pilihJenis.options[pilihJenis.selectedIndex];
    if (!opsi || !labelSatu || !labelDua) return;
    labelSatu.textContent = opsi.getAttribute("data-peran-pertama") || "Pihak pertama";
    labelDua.textContent = opsi.getAttribute("data-peran-kedua") || "Pihak kedua";
  };

  pilihJenis.addEventListener("change", function () {
    sesuaikan();
    sesuaikanPeran();
  });
  sesuaikan();
  sesuaikanPeran();
}

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
