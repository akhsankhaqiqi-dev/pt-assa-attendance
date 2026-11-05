PT ASSA — PROTOTIPE WEBSITE ABSENSI
====================================

FILE
- index.html: antarmuka responsif HP/laptop, login admin dan karyawan, formulir admin
  untuk membuat akun karyawan (nama, username, password), GPS geofence, kamera selfie,
  riwayat lokal, dan ekspor CSV yang dapat dibuka di Excel.
- google_apps_script.gs: contoh penerima data ke Google Sheets di Google Drive.

CARA MENJALANKAN DEMO
1. Ekstrak ZIP.
2. Buka index.html di browser untuk melihat tampilan. Untuk GPS/kamera/WebAuthn,
   browser biasanya mensyaratkan HTTPS atau localhost.
3. Login demo: username admin | password assa123.
4. Data demo disimpan di localStorage browser/perangkat ini. Ekspor CSV dapat dibuka Excel.

PENTING — BELUM SIAP PRODUKSI
- Demo ini BUKAN sistem absensi produksi dan belum menyimpan data terpusat.
- URL Apps Script belum dikonfigurasi; perlu membuat Google Sheet, memasang
  google_apps_script.gs, deploy sebagai Web App, lalu mengisi ASSA_WEB_APP_URL
  pada index.html. Perhatikan autentikasi dan akses endpoint.
- Google Sheets adalah penyimpanan cloud; ekspor .xlsx dapat dilakukan dari Sheets
  (File > Download > Microsoft Excel). Otomatisasi ekspor .xlsx berkala perlu
  ditambahkan sesuai kebijakan Drive perusahaan.
- Login demo harus diganti dengan autentikasi backend yang aman; jangan gunakan
  password demo pada penggunaan nyata.
- Fingerprint belum aktif. WebAuthn/Passkeys memerlukan HTTPS, pendaftaran kredensial,
  server challenge, verifikasi signature, dan penyimpanan credential ID di backend.
  Biometrik tetap berada pada perangkat; website tidak membaca sidik jari mentah.
- Foto disimpan lokal sebagai data URL pada demo dan tidak ikut CSV. Produksi perlu
  upload ke folder Drive privat dengan kontrol akses dan kebijakan retensi.
- GPS browser dapat dipalsukan dan akurasinya bervariasi. Produksi perlu validasi
  server-side, pemeriksaan akurasi, audit, serta prosedur koreksi manual.
- Beri pemberitahuan dan dasar pemrosesan yang sesuai sebelum mengumpulkan lokasi,
  foto, atau data autentikasi karyawan. Batasi akses dan masa penyimpanan.

KOORDINAT KANTOR
Latitude: -6.975303
Longitude: 112.296860
Radius: 100 meter

WARNA/TEMA
Classic Blue Corporate — putih, biru navy, dan biru muda.

MANAJEMEN AKUN KARYAWAN (FITUR PROTOTIPE)
1. Login sebagai admin: admin / assa123.
2. Di panel admin, isi nama lengkap, username, dan password awal karyawan.
3. Klik Buat akun karyawan. Akun tersimpan pada browser/perangkat yang sama.
4. Karyawan dapat login berikutnya memakai username dan password yang dibuat admin.
5. Untuk penggunaan multi-perangkat/online, daftar akun harus dipindahkan ke backend
   terpusat. Jangan menyimpan password dalam localStorage seperti prototipe ini.
