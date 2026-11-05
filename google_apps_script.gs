/**
 * PT ASSA — Google Apps Script receiver (starter)
 * 1) Buat Google Sheet baru di akun Drive perusahaan.
 * 2) Extensions > Apps Script, tempel kode ini.
 * 3) Isi SPREADSHEET_ID di bawah.
 * 4) Deploy > New deployment > Web app; Execute as: Me; access sesuai kebijakan perusahaan.
 * 5) Salin URL /exec ke ASSA_WEB_APP_URL di index.html.
 *
 * Catatan: untuk produksi, tambahkan autentikasi server, validasi GPS server-side,
 * pembatasan akses, dan penyimpanan foto ke folder Drive privat. Jangan publikasikan
 * endpoint tanpa kontrol akses. WebAuthn memerlukan backend challenge terpisah.
 */
const SPREADSHEET_ID = 'GANTI_DENGAN_ID_GOOGLE_SHEET';
const SHEET_NAME = 'Absensi';
function doPost(e) {
  const data = JSON.parse(e.postData.contents);
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(['Waktu Server','Username','Tanggal','Jenis','Jam Perangkat','Latitude','Longitude','Akurasi GPS (m)','Status','Alasan','Keterangan']);
  }
  // Jangan percaya status/lokasi dari browser saja; verifikasi ulang di server sebelum produksi.
  sh.appendRow([new Date(), data.username || '', data.date || '', data.type || '',
    data.time || '', data.lat || '', data.lng || '', data.accuracy || '',
    data.status || '', data.reason || '', data.detail || '']);
  return ContentService.createTextOutput(JSON.stringify({ok:true})).setMimeType(ContentService.MimeType.JSON);
}
