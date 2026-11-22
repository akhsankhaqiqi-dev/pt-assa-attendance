import { createClient, startRegistration, startAuthentication } from './vendor.js';

/* ================= KONFIGURASI ================= */
// URL & kunci "publishable" memang boleh ada di klien; keamanan dijaga oleh RLS dan Edge Function.
const SUPABASE_URL = 'https://snkykrhspefnpwpkardw.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_N4v75vo2WaWLVyX79XWiMg_YCG9yCVx';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Hanya untuk tampilan radar/tombol. Penentu sah-tidaknya absen adalah server (submit-attendance).
let OFFICE = { lat: -6.975303, lng: 112.296860, radius: 100 };
const IDLE_MS = 15 * 60 * 1000;
const HASH0 = location.hash;

const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const one = x => Array.isArray(x) ? x[0] : x;

/* ================= TAMPILAN & PESAN ================= */
const VIEWS = ['loginView', 'forgotView', 'resetView', 'appView'];
function showView(id) {
  VIEWS.forEach(v => $(v).classList.toggle('hidden', v !== id));
  $('authShell').classList.toggle('hidden', id === 'appView');
}
function setMsg(id, text, type) {
  const el = $(id);
  if (!text) { el.className = 'msg hidden'; el.textContent = ''; return; }
  el.className = 'msg ' + (type === 'ok' ? 'ok' : 'err');
  el.textContent = text;
}
let toastT;
function toast(text, type) {
  const el = $('toast');
  el.textContent = text; el.className = 'toast ' + (type === 'err' ? 'err' : 'ok');
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.add('hidden'), type === 'err' ? 6500 : 3500);
}
function authError(e) {
  const m = (e && e.message || '').toLowerCase();
  if (m.includes('invalid login')) return 'Email atau password salah.';
  if (m.includes('banned') || m.includes('disabled')) return 'Akun dinonaktifkan. Hubungi admin.';
  if (m.includes('not confirmed')) return 'Email belum dikonfirmasi. Hubungi admin.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Terlalu banyak percobaan. Coba lagi beberapa menit lagi.';
  if (m.includes('same password') || m.includes('different from the old')) return 'Password baru harus berbeda dari password lama.';
  if (m.includes('session') && m.includes('missing')) return 'Tautan pemulihan sudah kedaluwarsa. Minta tautan baru.';
  if (m.includes('weak') || m.includes('at least') || m.includes('pwned') || m.includes('compromised')) return 'Password terlalu lemah atau pernah bocor. Pilih yang lebih kuat.';
  return (e && e.message) || 'Terjadi kesalahan. Coba lagi.';
}
const pwOk = p => p.length >= 10 && /[A-Za-z]/.test(p) && /\d/.test(p);
const PW_RULE = 'Password minimal 10 karakter dan mengandung huruf serta angka.';

$('togglePw').onclick = () => {
  const p = $('password'), show = p.type === 'password';
  p.type = show ? 'text' : 'password';
  $('togglePw').setAttribute('aria-pressed', String(show));
  $('togglePw').setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
};

/* ================= PEMULIHAN & GANTI PASSWORD ================= */
let recoveryMode = false, forceChange = false;

supabase.auth.onAuthStateChange((event) => {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    history.replaceState(null, '', location.pathname + location.search);
    setMsg('resetMsg', '');
    showView('resetView');
  }
});

const linkError = (function handleLinkError() {
  const p = new URLSearchParams(HASH0.replace(/^#/, ''));
  if (p.get('error')) {
    const expired = p.get('error_code') === 'otp_expired';
    history.replaceState(null, '', location.pathname + location.search);
    showView('forgotView');
    setMsg('forgotMsg', expired
      ? 'Tautan pemulihan sudah kedaluwarsa atau sudah dipakai. Minta tautan baru di bawah ini.'
      : 'Tautan pemulihan tidak valid. Minta tautan baru di bawah ini.', 'err');
    return true;
  }
  return false;
})();

$('forgotLink').onclick = () => {
  setMsg('forgotMsg', '');
  $('forgotEmail').value = $('username').value.includes('@') ? $('username').value.trim() : '';
  showView('forgotView');
};
$('backToLogin1').onclick = () => showView('loginView');

$('forgotForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('forgotEmail').value.trim();
  const btn = $('forgotBtn'); btn.disabled = true;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
  btn.disabled = false;
  if (error) { setMsg('forgotMsg', authError(error), 'err'); return; }
  setMsg('forgotMsg', 'Jika email terdaftar, tautan pemulihan sudah dikirim. Cek kotak masuk dan folder spam, lalu buka tautannya di perangkat ini.', 'ok');
});

// Semua penggantian password lewat server: kebijakan + cek kebocoran (Pwned Passwords, k-anonymity).
async function changePassword(pw) {
  try { await callFn('set-password', { password: pw }); return null; }
  catch (e) { return e.message || 'Gagal menyimpan password.'; }
}

$('resetForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('newPassword').value, p2 = $('newPassword2').value;
  if (!pwOk(p1)) { setMsg('resetMsg', PW_RULE, 'err'); return; }
  if (p1 !== p2) { setMsg('resetMsg', 'Kedua password tidak sama.', 'err'); return; }
  const btn = $('resetBtn'); btn.disabled = true;
  try {
    if (forceChange) {
      const err = await changePassword(p1);
      if (err) { setMsg('resetMsg', err, 'err'); return; }
      forceChange = false;
      $('newPassword').value = ''; $('newPassword2').value = '';
      const { data: { user: u } } = await supabase.auth.getUser();
      await bootFromSession(u);
      return;
    }
    const err = await changePassword(p1);
    if (err) { setMsg('resetMsg', err, 'err'); return; }
    recoveryMode = false;
    await supabase.auth.signOut();
    $('newPassword').value = ''; $('newPassword2').value = ''; $('password').value = '';
    showView('loginView');
    setMsg('loginMsg', 'Password berhasil diubah. Silakan masuk dengan password baru.', 'ok');
  } finally { btn.disabled = false; }
});

/* ================= SESI & LOGIN ================= */
let me = null, loc = null, bioOK = false, photoData = null, stream = null;
let fails = 0, lockUntil = 0, idleT;

function armIdle() {
  clearTimeout(idleT);
  if (!me) return;
  idleT = setTimeout(() => doLogout('Sesi berakhir karena tidak ada aktivitas selama 15 menit.'), IDLE_MS);
}
['pointerdown', 'keydown', 'touchstart'].forEach(ev => addEventListener(ev, armIdle, { passive: true }));

async function loadOffice() {
  const { data } = await supabase.from('office_locations').select('latitude, longitude, radius_meters').eq('is_active', true).limit(1);
  if (data && data[0]) OFFICE = { lat: data[0].latitude, lng: data[0].longitude, radius: data[0].radius_meters };
}

// Peran ditentukan SERVER (tabel user_profiles + RLS), bukan daftar email di kode klien.
async function bootFromSession(u) {
  if (u.user_metadata && u.user_metadata.must_change_password) {
    forceChange = true;
    setMsg('resetMsg', 'Demi keamanan, ganti password awal Anda sebelum melanjutkan.', 'ok');
    showView('resetView');
    return false;
  }
  const { data: prof, error } = await supabase.from('user_profiles')
    .select('role, employee_id, employees(full_name, employment_status)')
    .eq('auth_user_id', u.id).maybeSingle();
  const emp = prof && one(prof.employees);
  if (error || !prof || (emp && emp.employment_status !== 'active')) {
    await supabase.auth.signOut();
    showView('loginView');
    setMsg('loginMsg', !prof || error ? 'Akun belum terdaftar di sistem absensi. Hubungi admin.' : 'Akun karyawan tidak aktif. Hubungi admin.', 'err');
    return false;
  }
  me = { uid: u.id, role: prof.role, employee_id: prof.employee_id, name: (emp && emp.full_name) || u.email, email: u.email };
  enterApp();
  return true;
}

function enterApp() {
  window.currentRole = me.role;
  setMsg('loginMsg', '');
  showView('appView');
  $('headerUser').textContent = me.role === 'admin' ? 'Admin PT ASSA' : me.name;
  $('hello').textContent = 'Selamat datang, ' + me.name;
  $('adminCard').classList.toggle('hidden', me.role !== 'admin');
  $('syncText').textContent = 'Terhubung ke server';
  render(); refreshButtons(); armIdle(); loadOffice();
  window.scrollTo(0, 0);
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  if (Date.now() < lockUntil) {
    setMsg('loginMsg', 'Terlalu banyak percobaan. Coba lagi dalam ' + Math.ceil((lockUntil - Date.now()) / 1000) + ' detik.', 'err');
    return;
  }
  const email = $('username').value.trim(), pw = $('password').value;
  const btn = $('loginBtn'); btn.disabled = true;
  setMsg('loginMsg', '');
  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      fails++; if (fails >= 5) { lockUntil = Date.now() + 30000; fails = 0; }
      setMsg('loginMsg', authError(error), 'err');
      return;
    }
    fails = 0;
    await bootFromSession(data.user);
  } finally { btn.disabled = false; }
});

function resetGpsUi() {
  ['gpsLat', 'gpsLng', 'gpsAcc'].forEach(i => $(i).textContent = '—');
  $('distanceText').textContent = 'Belum diperiksa';
  $('mapLink').classList.add('hidden');
  $('radarMe').classList.add('hidden');
  $('locLabel').textContent = 'Belum dicek';
  $('gpsStatus').textContent = '● GPS belum diperiksa'; $('gpsStatus').className = 'status wait';
}
async function doLogout(msg) {
  clearTimeout(idleT);
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  await supabase.auth.signOut();
  me = null; window.currentRole = null;
  bioOK = false; bioProof = null; photoData = null; loc = null;
  $('video').classList.add('hidden'); $('canvas').classList.add('hidden'); $('captureBtn').classList.add('hidden');
  $('photoText').textContent = 'Belum diambil';
  resetGpsUi();
  setBio('idle', 'Wajib setiap absen', 'Ketuk untuk verifikasi');
  $('password').value = '';
  $('headerUser').textContent = 'Portal Karyawan';
  refreshButtons();
  showView('loginView');
  if (msg) setMsg('loginMsg', msg, 'err');
}
$('logout').onclick = () => doLogout();

(async () => {
  if (linkError || /type=recovery/.test(HASH0)) return;
  const { data: { session } } = await supabase.auth.getSession();
  if (session) await bootFromSession(session.user);
})();

/* ================= JAM, GPS ================= */
const now = () => new Date();
const TZ = 'Asia/Jakarta';
function fmtClock(d) { return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: TZ }); }
const fmtIso = iso => fmtClock(new Date(iso));
const dateKeyAt = d => d.toLocaleDateString('sv-SE', { timeZone: TZ });
const dateKey = () => dateKeyAt(now());
function haversine(a, b) { const R = 6371000, rad = x => x * Math.PI / 180, dLat = rad(b.lat - a.lat), dLon = rad(b.lng - a.lng), x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(x)); }
function updateClock() { $('clock').textContent = fmtClock(now()); $('dateText').textContent = now().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', timeZone: TZ }); }
setInterval(updateClock, 1000); updateClock();

/* Radar mini: posisi relatif terhadap kantor (cincin = radius) */
function updateRadar(p, d, inside) {
  const lat0 = OFFICE.lat * Math.PI / 180;
  const dx = (p.lng - OFFICE.lng) * 111320 * Math.cos(lat0);
  const dy = (p.lat - OFFICE.lat) * 110540;
  const k = 60 / OFFICE.radius, maxR = 92;
  let x = dx * k, y = -dy * k;
  const len = Math.hypot(x, y);
  if (len > maxR) { x = x / len * maxR; y = y / len * maxR; }
  const cx = 100 + x, cy = 100 + y;
  $('radarMe').classList.remove('hidden');
  $('radarMeDot').setAttribute('cx', cx); $('radarMeDot').setAttribute('cy', cy);
  $('radarMeRing').setAttribute('cx', cx); $('radarMeRing').setAttribute('cy', cy);
  $('radarMeDot').setAttribute('class', 'me ' + (inside ? 'in' : 'out'));
  $('radarMeRing').style.stroke = inside ? 'var(--ok)' : 'var(--bad)';
}

$('checkGps').onclick = () => {
  if (!navigator.geolocation) { toast('Browser tidak mendukung GPS.', 'err'); return; }
  $('gpsStatus').textContent = 'Memeriksa GPS…';
  $('gpsStatus').className = 'status wait';
  navigator.geolocation.getCurrentPosition(p => {
    loc = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    const d = haversine(loc, OFFICE), inside = d <= OFFICE.radius;
    $('gpsLat').textContent = loc.lat.toFixed(6);
    $('gpsLng').textContent = loc.lng.toFixed(6);
    $('gpsAcc').textContent = '±' + Math.round(loc.accuracy) + ' m';
    $('distanceText').textContent = Math.round(d) + ' m dari kantor';
    $('mapLink').href = 'https://www.google.com/maps?q=' + loc.lat + ',' + loc.lng;
    $('mapLink').classList.remove('hidden');
    $('locLabel').textContent = inside ? 'Dalam area' : 'Di luar area';
    $('gpsStatus').textContent = inside ? '● Dalam radius ' + OFFICE.radius + ' m' : '● Di luar radius';
    $('gpsStatus').className = 'status ' + (inside ? '' : 'bad');
    $('flowMsg').textContent = 'Akurasi GPS ±' + Math.round(loc.accuracy) + ' m. Jarak ' + Math.round(d) + ' m.';
    updateRadar(loc, d, inside);
    refreshButtons();
  }, e => { $('gpsStatus').textContent = '● GPS gagal'; $('gpsStatus').className = 'status bad'; toast('Lokasi gagal diakses: ' + e.message, 'err'); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
};

/* ================= PEMANGGIL EDGE FUNCTION ================= */
async function callFn(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let msg = error.message;
    try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch {}
    throw new Error(msg);
  }
  if (data && data.error) throw new Error(data.error);
  return data;
}

/* ---------- Fingerprint / passkey (WebAuthn), berlaku untuk semua akun ---------- */
let bioProof = null, bioBusy = false;
function setBio(state, text, hint) {
  $('fpScan').dataset.state = state;
  $('bioText').textContent = text;
  if (hint) $('fpHint').textContent = hint;
}
async function verifyFingerprint() {
  if (bioBusy || !me) return;
  if (!window.isSecureContext || !window.PublicKeyCredential) {
    setBio('err', 'Tidak didukung', 'Buka halaman lewat HTTPS di perangkat yang punya sensor sidik jari / kunci layar.');
    return;
  }
  bioBusy = true; bioOK = false; bioProof = null; refreshButtons();
  try {
    setBio('busy', 'Memeriksa…', 'Menghubungi server…');
    const st = await callFn('webauthn', { action: 'status' });
    if (!st.configured) throw new Error('Buka halaman ini lewat alamat HTTPS (bukan file lokal) agar fingerprint dapat dipakai. Alamat sekarang: ' + location.origin);

    if (!st.registered) {
      setBio('busy', 'Mendaftarkan…', 'Perangkat belum terdaftar. Ikuti perintah sidik jari / kunci layar.');
      const optionsJSON = await callFn('webauthn', { action: 'register-options' });
      const att = await startRegistration({ optionsJSON });
      await callFn('webauthn', { action: 'register-verify', response: att });
    }

    setBio('busy', 'Menunggu sidik jari…', 'Tempelkan jari pada sensor atau gunakan kunci layar.');
    const optionsJSON = await callFn('webauthn', { action: 'auth-options' });
    const asr = await startAuthentication({ optionsJSON });
    const res = await callFn('webauthn', { action: 'auth-verify', response: asr });
    if (!res.verified) throw new Error('Verifikasi ditolak server.');

    bioOK = true;
    bioProof = { credential_uuid: res.credential_uuid, verified_at: res.verified_at };
    setBio('ok', '✔ Terverifikasi server', 'Terverifikasi. Berlaku 2 menit dan hanya untuk satu kali absen.');
  } catch (e) {
    const cancelled = e && (e.name === 'NotAllowedError' || e.name === 'AbortError');
    setBio('err', 'Gagal', cancelled ? 'Dibatalkan atau waktu habis. Ketuk lagi untuk mencoba.' : (e.message || 'Terjadi kesalahan.'));
  } finally {
    bioBusy = false; refreshButtons();
  }
}
$('bioBtn').onclick = verifyFingerprint;
$('fpScan').onclick = verifyFingerprint;

/* ================= KAMERA ================= */
$('cameraBtn').onclick = async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    $('canvas').classList.add('hidden');
    $('video').srcObject = stream; $('video').classList.remove('hidden'); $('captureBtn').classList.remove('hidden'); $('photoText').textContent = 'Kamera aktif';
  } catch (e) { toast('Kamera tidak dapat dibuka. Izinkan akses kamera dan gunakan HTTPS. ' + e.message, 'err'); }
};
$('captureBtn').onclick = () => {
  const v = $('video'), c = $('canvas');
  const maxW = 640, scale = Math.min(1, maxW / (v.videoWidth || maxW));
  c.width = Math.round(v.videoWidth * scale); c.height = Math.round(v.videoHeight * scale);
  c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
  photoData = c.toDataURL('image/jpeg', .72);
  $('photoText').textContent = 'Foto berhasil diambil';
  $('video').classList.add('hidden'); c.classList.remove('hidden'); $('captureBtn').classList.add('hidden');
  if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  refreshButtons();
};

function setChk(id, text, state) { const el = $(id); el.textContent = text; el.dataset.s = state; }
let submitting = false;
function refreshButtons() {
  const inside = !!loc && haversine(loc, OFFICE) <= OFFICE.radius, ready = inside && bioOK && !!photoData && !!bioProof && !submitting;
  setChk('chkGps', !loc ? '○ Belum' : (inside ? '✔ Selesai' : '✖ Di luar area'), !loc ? '' : (inside ? 'ok' : 'bad'));
  setChk('chkBio', bioOK ? '✔ Selesai' : '○ Belum', bioOK ? 'ok' : '');
  setChk('chkPhoto', photoData ? '✔ Selesai' : '○ Belum', photoData ? 'ok' : '');
  $('inBtn').disabled = !ready; $('outBtn').disabled = !ready;
}

/* ================= KIRIM ABSEN (divalidasi server) ================= */
async function submitAttendance(type) {
  if (submitting || !me) return;
  submitting = true; refreshButtons();
  $('syncText').textContent = 'Mengirim…';
  try {
    const res = await callFn('submit-attendance', {
      type, lat: loc.lat, lng: loc.lng, accuracy: loc.accuracy, photo: photoData, credential_uuid: bioProof.credential_uuid,
    });
    toast('Absen ' + type + ' tercatat pukul ' + fmtIso(res.time) + ' (' + res.distance_meters + ' m dari kantor).', 'ok');
    $('syncText').textContent = 'Tersimpan di server';
    photoData = null; bioOK = false; bioProof = null; $('photoText').textContent = 'Belum diambil';
    setBio('idle', 'Wajib setiap absen', 'Ketuk untuk verifikasi');
    $('canvas').classList.add('hidden');
    await render();
  } catch (e) {
    $('syncText').textContent = 'Gagal dikirim';
    toast(e.message, 'err');
    if (/sidik jari/i.test(e.message)) { bioOK = false; bioProof = null; setBio('idle', 'Wajib setiap absen', 'Ulangi verifikasi sidik jari'); }
  } finally {
    submitting = false; refreshButtons();
  }
}
$('inBtn').onclick = () => submitAttendance('masuk');
$('outBtn').onclick = () => submitAttendance('pulang');

/* ================= PENGAJUAN DI LUAR AREA (dibatasi RLS) ================= */
$('requestBtn').onclick = async () => {
  const detail = $('reasonDetail').value.trim();
  if (!detail) { toast('Isi keterangan pengajuan terlebih dahulu.', 'err'); return; }
  if (!me || me.role !== 'employee' || !me.employee_id) { toast('Pengajuan hanya untuk akun karyawan.', 'err'); return; }
  const btn = $('requestBtn'); btn.disabled = true;
  const { error } = await supabase.from('outside_area_requests').insert({
    employee_id: me.employee_id, reason: $('reason').value, detail: detail.slice(0, 300),
    latitude: loc ? loc.lat : null, longitude: loc ? loc.lng : null,
  });
  btn.disabled = false;
  if (error) { toast('Pengajuan gagal dikirim. Coba lagi.', 'err'); return; }
  $('reasonDetail').value = '';
  toast('Pengajuan terkirim dan menunggu persetujuan admin.', 'ok');
};

/* ================= ADMIN: KARYAWAN (lewat Edge Function admin-employees) ================= */
$('addEmployee').onclick = async () => {
  if (!me || me.role !== 'admin') { toast('Hanya admin yang dapat membuat akun.', 'err'); return; }
  const full_name = $('empName').value.trim(), email = $('empEmail').value.trim(), password = $('empPassword').value;
  if (!full_name || !email || !password) { toast('Lengkapi nama, email, dan password awal.', 'err'); return; }
  if (!pwOk(password)) { toast(PW_RULE, 'err'); return; }
  const btn = $('addEmployee'); btn.disabled = true;
  try {
    await callFn('admin-employees', { action: 'create', full_name, email, password });
    $('empName').value = ''; $('empEmail').value = ''; $('empPassword').value = '';
    $('employeeMsg').textContent = 'Akun dibuat. Berikan email dan password awal kepada karyawan; mereka wajib menggantinya saat login pertama.';
    await renderEmployees();
  } catch (e) { toast(e.message, 'err'); }
  finally { btn.disabled = false; }
};
$('employeeList').addEventListener('click', async e => {
  const r = e.target.closest('button[data-reset]');
  if (r) {
    if (!confirm('Reset passkey karyawan ini? Ia harus mendaftarkan sidik jari perangkat barunya lagi saat absen berikutnya.')) return;
    r.disabled = true;
    try { const res = await callFn('admin-employees', { action: 'reset-passkey', employee_id: r.dataset.reset }); toast(res.removed ? 'Passkey direset. Karyawan bisa mendaftarkan perangkat baru.' : 'Karyawan ini belum punya passkey.', 'ok'); }
    catch (err) { toast(err.message, 'err'); }
    r.disabled = false; return;
  }
  const b = e.target.closest('button[data-id]');
  if (!b) return;
  const next = b.dataset.status === 'active' ? 'inactive' : 'active';
  if (!confirm(next === 'inactive' ? 'Nonaktifkan karyawan ini? Ia tidak akan bisa masuk lagi.' : 'Aktifkan kembali karyawan ini?')) return;
  b.disabled = true;
  try { await callFn('admin-employees', { action: 'set-status', employee_id: b.dataset.id, status: next }); await renderEmployees(); }
  catch (err) { toast(err.message, 'err'); b.disabled = false; }
});
async function renderEmployees() {
  if (!me || me.role !== 'admin') return;
  const { data, error } = await supabase.from('employees').select('id, full_name, email, employment_status').order('created_at', { ascending: true });
  if (error) { $('employeeList').innerHTML = '<tr><td colspan="4">Gagal memuat daftar karyawan</td></tr>'; return; }
  $('employeeList').innerHTML = data.map(x => {
    const own = x.id === me.employee_id, act = x.employment_status === 'active';
    return `<tr><td>${esc(x.full_name)}</td><td>${esc(x.email)}</td><td>${act ? 'Aktif' : 'Nonaktif'}</td><td>${own ? '—' : `<button type="button" class="linkbtn" data-id="${esc(x.id)}" data-status="${esc(x.employment_status)}">${act ? 'Nonaktifkan' : 'Aktifkan'}</button> <button type="button" class="linkbtn" data-reset="${esc(x.id)}">Reset passkey</button>`}</td></tr>`;
  }).join('') || '<tr><td colspan="4">Belum ada karyawan</td></tr>';
}

/* ================= GRAFIK 3D / 2D ================= */
function chartDays(counts) {
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    out.push({ label: d.toLocaleDateString('id-ID', { weekday: 'short', timeZone: TZ }), n: counts[dateKeyAt(d)] || 0 });
  }
  return out;
}
function renderChart(counts) {
  const data = chartDays(counts), max = Math.max(1, ...data.map(d => d.n)), H = 140;
  $('barStage').innerHTML = data.map(d => {
    const h = d.n ? Math.max(20, Math.round(d.n / max * H)) : 4;
    return `<div class="bar" style="--h:${h}px"${d.n ? '' : ' data-z="1"'}><div class="f front"><span>${d.n}</span></div><div class="f right"></div><div class="f tface"></div><span class="blabel">${esc(d.label)}</span></div>`;
  }).join('');
  $('chart').setAttribute('aria-label', 'Jumlah absen masuk 7 hari terakhir: ' + data.map(d => d.label + ' ' + d.n).join(', '));
  $('chartEmpty').classList.toggle('hidden', data.some(d => d.n));
}
function setChartMode(m) {
  $('chart').classList.toggle('flat', m === '2d');
  $('chart3d').setAttribute('aria-pressed', String(m === '3d'));
  $('chart2d').setAttribute('aria-pressed', String(m === '2d'));
  $('rotWrap').classList.toggle('hidden', m === '2d');
}
$('chart3d').onclick = () => setChartMode('3d');
$('chart2d').onclick = () => setChartMode('2d');
$('chartRot').oninput = e => $('chart').style.setProperty('--ry', e.target.value + 'deg');

/* ================= RENDER DATA DARI SERVER (RLS membatasi baris yang terlihat) ================= */
const TYPE_LABEL = { masuk: 'Masuk', pulang: 'Pulang' };
const STATUS_LABEL = { valid: 'Valid', pending_review: 'Menunggu tinjauan', rejected: 'Ditolak' };
const ATT_COLS = 'photo_path, attendance_date, attendance_type, attendance_time, status, latitude, longitude, accuracy, distance_meters, employees(full_name, email)';

async function render() {
  if (!me) return;
  const since = dateKeyAt(new Date(Date.now() - 6 * 86400000));
  const isAdmin = me.role === 'admin';
  const [hist, mine, wk, total] = await Promise.all([
    supabase.from('attendance').select(ATT_COLS).order('attendance_time', { ascending: false }).limit(12),
    me.employee_id
      ? supabase.from('attendance').select('attendance_type, attendance_time').eq('employee_id', me.employee_id).eq('attendance_date', dateKey())
      : Promise.resolve({ data: [] }),
    supabase.from('attendance').select('attendance_date').eq('attendance_type', 'masuk').gte('attendance_date', since).limit(2000),
    isAdmin ? supabase.from('attendance').select('id', { count: 'exact', head: true }) : Promise.resolve({ count: 0 }),
  ]);
  if (hist.error || wk.error) toast('Sebagian data gagal dimuat. Muat ulang halaman.', 'err');

  $('history').innerHTML = (hist.data || []).map(x => {
    const who = isAdmin ? ' · ' + esc((one(x.employees) || {}).full_name || '') : '';
    const pic = x.photo_path ? ` <button type="button" class="linkbtn" data-photo="${esc(x.photo_path)}" data-meta="${esc(x.attendance_date + ' ' + fmtIso(x.attendance_time) + ' · ' + (TYPE_LABEL[x.attendance_type] || ''))}">Foto</button>` : '';
    return `<tr><td>${esc(x.attendance_date)}</td><td>${esc(TYPE_LABEL[x.attendance_type] || x.attendance_type)}${who}${pic}</td><td>${esc(fmtIso(x.attendance_time))}</td><td>${esc(STATUS_LABEL[x.status] || x.status)}</td></tr>`;
  }).join('') || '<tr><td colspan="4">Belum ada catatan</td></tr>';

  const t = mine.data || [];
  const inRow = t.find(x => x.attendance_type === 'masuk'), outRow = t.find(x => x.attendance_type === 'pulang');
  $('inTime').textContent = inRow ? fmtIso(inRow.attendance_time) : '—';
  $('outTime').textContent = outRow ? fmtIso(outRow.attendance_time) : '—';
  $('totalRows').textContent = total.count ?? 0;

  const counts = {};
  (wk.data || []).forEach(r => { counts[r.attendance_date] = (counts[r.attendance_date] || 0) + 1; });
  renderChart(counts);
  renderEmployees(); renderRequests();
}

/* ================= PENGAJUAN: layar admin & status karyawan ================= */
const REQ_LABEL = { pending: ['Menunggu', 'wait'], approved: ['Disetujui', 'ok'], rejected: ['Ditolak', 'bad'] };
const pill = s => { const [t, c] = REQ_LABEL[s] || [s, '']; return `<span class="pill ${c}">${esc(t)}</span>`; };
async function renderRequests() {
  if (!me) return;
  if (me.role === 'admin') {
    const { data, error } = await supabase.from('outside_area_requests')
      .select('id, request_date, reason, detail, status, employees(full_name)').order('created_at', { ascending: false }).limit(25);
    if (error) { $('requestList').innerHTML = '<tr><td colspan="5">Gagal memuat pengajuan</td></tr>'; return; }
    $('requestList').innerHTML = data.map(r => `<tr><td>${esc(r.request_date)}</td><td>${esc((one(r.employees) || {}).full_name || '')}</td><td>${esc(r.reason)}</td><td>${esc(r.detail || '')}</td><td>${r.status === 'pending'
      ? `<div class="rowbtns"><button type="button" class="linkbtn" data-req="${esc(r.id)}" data-to="approved">Setujui</button><button type="button" class="linkbtn" data-req="${esc(r.id)}" data-to="rejected">Tolak</button></div>`
      : pill(r.status)}</td></tr>`).join('') || '<tr><td colspan="5">Belum ada pengajuan</td></tr>';
  } else {
    const { data } = await supabase.from('outside_area_requests').select('request_date, reason, status').order('created_at', { ascending: false }).limit(5);
    $('myReqWrap').classList.toggle('hidden', !(data && data.length));
    $('myRequests').innerHTML = (data || []).map(r => `<tr><td>${esc(r.request_date)}</td><td>${esc(r.reason)}</td><td>${pill(r.status)}</td></tr>`).join('');
  }
}
$('requestList').addEventListener('click', async e => {
  const b = e.target.closest('button[data-req]');
  if (!b || !me || me.role !== 'admin') return;
  const to = b.dataset.to;
  if (!confirm(to === 'approved' ? 'Setujui pengajuan ini?' : 'Tolak pengajuan ini?')) return;
  b.disabled = true;
  const { error } = await supabase.from('outside_area_requests')
    .update({ status: to, reviewed_by: me.uid, reviewed_at: new Date().toISOString() })
    .eq('id', b.dataset.req).eq('status', 'pending');
  if (error) { toast('Gagal memperbarui pengajuan.', 'err'); b.disabled = false; return; }
  toast(to === 'approved' ? 'Pengajuan disetujui.' : 'Pengajuan ditolak.', 'ok');
  renderRequests();
});

/* ================= FOTO SELFIE (signed URL 60 detik, bucket privat) ================= */
$('history').addEventListener('click', async e => {
  const b = e.target.closest('button[data-photo]');
  if (!b) return;
  b.disabled = true;
  const { data, error } = await supabase.storage.from('selfies').createSignedUrl(b.dataset.photo, 60);
  b.disabled = false;
  if (error || !data) { toast('Foto tidak dapat dibuka.', 'err'); return; }
  $('photoImg').src = data.signedUrl;
  $('photoMeta').textContent = b.dataset.meta || '';
  $('photoDlg').showModal();
});
$('photoDlg').addEventListener('close', () => { $('photoImg').removeAttribute('src'); });

/* ================= DIALOG UMUM ================= */
document.addEventListener('click', e => {
  const o = e.target.closest('[data-open]');
  if (o) { $(o.dataset.open).showModal(); return; }
  const c = e.target.closest('[data-close]');
  if (c) c.closest('dialog').close();
});

/* ================= EKSPOR CSV ================= */
const safeText = v => { let s = String(v ?? ''); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replaceAll('"', '""') + '"'; };
async function exportCSV() {
  if (!me) return;
  const { data, error } = await supabase.from('attendance').select(ATT_COLS).order('attendance_time', { ascending: false }).range(0, 4999);
  if (error) { toast('Gagal mengekspor data.', 'err'); return; }
  const head = ['tanggal', 'jam', 'nama', 'email', 'jenis', 'status', 'lat', 'lng', 'akurasi_m', 'jarak_m'];
  const rows = data.map(r => {
    const e = one(r.employees) || {};
    return [safeText(r.attendance_date), safeText(fmtIso(r.attendance_time)), safeText(e.full_name), safeText(e.email), safeText(TYPE_LABEL[r.attendance_type]), safeText(STATUS_LABEL[r.status]), r.latitude ?? '', r.longitude ?? '', Math.round(r.accuracy ?? 0), Math.round(r.distance_meters ?? 0)].join(';');
  });
  const blob = new Blob(['﻿' + [head.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), url = URL.createObjectURL(blob), x = document.createElement('a');
  x.href = url; x.download = 'Absensi_PT_ASSA_' + dateKey() + '.csv'; x.click(); URL.revokeObjectURL(url);
}
$('exportBtn').onclick = exportCSV; $('exportAdmin').onclick = exportCSV;
refreshButtons();
