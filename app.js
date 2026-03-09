const FIXED_API_URL = 'https://script.google.com/macros/s/AKfycbwP9zRmohJlkQpfJsGT1kAP9jb_48KpzZfzQ6dUkB7DlHEZSnkOvmoKiQv-JZ4sxZnBvg/exec';

console.log('APP JS VERSION: 2026-03-10-ui-fix-fast');

const state = {
  apiUrl: FIXED_API_URL,
  sessionToken: localStorage.getItem('sessionToken') || '',
  profile: JSON.parse(localStorage.getItem('profile') || 'null'),
  selectedSasaran: JSON.parse(localStorage.getItem('selectedSasaran') || 'null'),
  syncQueue: JSON.parse(localStorage.getItem('syncQueue') || '[]'),
  lastSasaran: JSON.parse(localStorage.getItem('lastSasaran') || '[]'),
  timWilayah: JSON.parse(localStorage.getItem('timWilayah') || '[]')
};

const $ = (sel) => document.querySelector(sel);

window.addEventListener('load', async () => {
  setTimeout(() => {
    $('#splash-screen').style.display = 'none';
    $('#app').classList.remove('hidden');
  }, 1200);

  setToday();
  refreshOfflineBanner();
  renderDraftQueue();
  setupNikKkInputLimit();
  setupRegJenisHandler();

  window.addEventListener('online', async () => {
    refreshOfflineBanner();
    toast('Koneksi kembali aktif');
    await syncQueueNow();
  });

  window.addEventListener('offline', () => {
    refreshOfflineBanner();
    toast('Koneksi terputus. Mode offline aktif');
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  }

  if (state.profile) {
    $('#loginCard').classList.add('hidden');
    renderProfile();
    $('#profileCard').classList.remove('hidden');

    await Promise.all([
      loadWilayahAuto(true),
      loadSasaranAuto(true)
    ]);
  }

  if (state.selectedSasaran) {
    renderSelectedSasaran();
    $('#pendampinganCard').classList.remove('hidden');
  }
});

function setToday() {
  const today = new Date().toISOString().slice(0, 10);
  $('#tanggalLaporan').value = today;
}

function refreshOfflineBanner() {
  const banner = $('#offlineBanner');
  if (navigator.onLine) banner.classList.add('hidden');
  else banner.classList.remove('hidden');
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 2600);
}

function showLoader(text = 'Memproses...') {
  $('#loader').classList.remove('hidden');
  $('.loader-text').textContent = text;
}

function hideLoader() {
  $('#loader').classList.add('hidden');
}

function saveState() {
  localStorage.setItem('sessionToken', state.sessionToken || '');
  localStorage.setItem('profile', JSON.stringify(state.profile || null));
  localStorage.setItem('selectedSasaran', JSON.stringify(state.selectedSasaran || null));
  localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue || []));
  localStorage.setItem('lastSasaran', JSON.stringify(state.lastSasaran || []));
  localStorage.setItem('timWilayah', JSON.stringify(state.timWilayah || []));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function api(action, payload) {
  let response;
  try {
    response = await fetchWithTimeout(FIXED_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify({ action, payload })
    }, 12000);
  } catch (err) {
    console.error('FETCH ERROR:', err);
    throw new Error('Koneksi ke backend gagal');
  }

  const text = await response.text();

  let data;
  try {
    data = JSON.parse(text);
  } catch (err) {
    console.error('JSON PARSE ERROR:', err, text);
    throw new Error('Respon backend bukan JSON valid');
  }

  if (!data.success) throw new Error(data.message || 'Request gagal');
  return data;
}

function setupNikKkInputLimit() {
  ['#regNik', '#regKK'].forEach(sel => {
    $(sel).addEventListener('input', (e) => {
      e.target.value = String(e.target.value || '').replace(/\D/g, '').slice(0, 16);
    });
  });
}

function setupRegJenisHandler() {
  $('#regJenis').addEventListener('change', toggleRegGender);
}

function toggleRegGender() {
  const jenis = $('#regJenis').value;
  const row = $('#rowRegJenisKelamin');

  if (jenis === 'BUMIL' || jenis === 'BUFAS') {
    row.classList.add('hidden');
    $('#regJenisKelamin').value = 'P';
  } else {
    row.classList.remove('hidden');
    if ($('#regJenisKelamin').value === 'P' && !$('#regJenisKelamin').dataset.locked) {
      // dibiarkan
    }
  }
}

function validateNik(value) {
  return /^\d{16}$/.test(String(value || ''));
}

function validateKk(value) {
  return /^\d{16}$/.test(String(value || ''));
}

function getAgeLabel(tanggalLahir) {
  if (!tanggalLahir) return '-';
  const dob = new Date(tanggalLahir);
  if (isNaN(dob.getTime())) return '-';

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();

  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }

  return `${age} th`;
}

function saveLoginSuccess(result) {
  state.sessionToken = result.data.session_token;
  state.profile = {
    id_kader: result.data.id_kader,
    nama_kader: result.data.nama_kader,
    id_tim: result.data.id_tim,
    nama_tim: result.data.nama_tim,
    role_akses: result.data.role_akses
  };
  saveState();
}

function renderProfile() {
  if (!state.profile) return;

  $('#statusText').textContent = `Login sebagai ${state.profile.nama_kader}`;
  $('#profileBox').innerHTML = `
    <div class="item">
      <strong>${escapeHtml(state.profile.nama_kader)}</strong>
      ID Kader: ${escapeHtml(state.profile.id_kader)}<br>
      Tim: ${escapeHtml(state.profile.nama_tim)} (${escapeHtml(state.profile.id_tim)})<br>
      Role: ${escapeHtml(state.profile.role_akses || 'KADER')}
    </div>
  `;
}

function renderWilayah(rows) {
  const box = $('#wilayahBox');

  if (!rows || rows.length === 0) {
    box.innerHTML = `<div class="item">Wilayah tim belum tersedia.</div>`;
    return;
  }

  box.innerHTML = rows.map(r => `
    <div class="item">
      <strong>${escapeHtml(r.dusun_rw)}</strong>
      ${escapeHtml(r.desa_kelurahan)}, ${escapeHtml(r.kecamatan)}
    </div>
  `).join('');
}

function populateDusunDropdown() {
  const select = $('#regDusun');
  const uniqueDusun = [...new Map(
    (state.timWilayah || []).map(w => [String(w.dusun_rw), w])
  ).values()];

  if (!uniqueDusun.length) {
    select.innerHTML = `<option value="">Wilayah tidak tersedia</option>`;
    select.disabled = true;
    return;
  }

  select.innerHTML = uniqueDusun.map(w => `
    <option value="${escapeAttr(w.dusun_rw)}">${escapeHtml(w.dusun_rw)}</option>
  `).join('');

  if (uniqueDusun.length === 1) {
    select.disabled = true;
    select.value = uniqueDusun[0].dusun_rw;
  } else {
    select.disabled = false;
  }
}

async function loadWilayahAuto(silent = false) {
  if (state.timWilayah && state.timWilayah.length > 0) {
    $('#wilayahCard').classList.remove('hidden');
    renderWilayah(state.timWilayah);
    populateDusunDropdown();
    return;
  }

  try {
    if (!silent) showLoader('Memuat wilayah tim...');
    const result = await api('getTimWilayah', {
      session_token: state.sessionToken
    });

    state.timWilayah = result.data || [];
    saveState();

    $('#wilayahCard').classList.remove('hidden');
    renderWilayah(state.timWilayah);
    populateDusunDropdown();

    if (!silent) toast('Wilayah tim dimuat');
  } catch (err) {
    console.error('AUTO WILAYAH ERROR:', err);
    if (!silent) toast(err.message);
  } finally {
    if (!silent) hideLoader();
  }
}

async function loadSasaranAuto(silent = false) {
  try {
    if (!silent) showLoader('Memuat sasaran...');
    const result = await api('getSasaranByTim', {
      session_token: state.sessionToken,
      keyword: ''
    });

    state.lastSasaran = result.data || [];
    saveState();

    $('#sasaranCard').classList.remove('hidden');
    applySasaranFilter();

    if (!silent) toast('Data sasaran dimuat');
  } catch (err) {
    console.error('AUTO SASARAN ERROR:', err);
    if (!silent) toast(err.message);
  } finally {
    if (!silent) hideLoader();
  }
}

function applySasaranFilter() {
  const jenis = $('#filterJenisSasaran').value;
  const keyword = ($('#keywordSasaran').value || '').trim().toUpperCase();

  const filtered = (state.lastSasaran || []).filter(r => {
    const matchJenis = !jenis || String(r.kode_jenis_sasaran) === jenis;
    const matchKeyword = !keyword || [
      r.nama_sasaran,
      r.dusun_rw,
      r.kode_jenis_sasaran
    ].some(v => String(v || '').toUpperCase().includes(keyword));

    return matchJenis && matchKeyword;
  });

  renderSasaran(filtered);
}

function renderSasaran(rows) {
  const box = $('#sasaranBox');
  if (!rows || rows.length === 0) {
    box.innerHTML = `<div class="item">Tidak ada sasaran ditemukan.</div>`;
    return;
  }

  box.innerHTML = rows.map(r => `
    <div class="item">
      <strong>${escapeHtml(r.nama_sasaran)}</strong>
      ${escapeHtml(r.kode_jenis_sasaran)} • ${escapeHtml(getAgeLabel(r.tanggal_lahir))} • ${escapeHtml(r.dusun_rw)}
      <div class="item-actions">
        <button class="btn btn-secondary" onclick="pilihSasaran('${escapeAttr(r.id_sasaran)}','${escapeAttr(r.nama_sasaran)}','${escapeAttr(r.kode_jenis_sasaran)}')">Pilih Sasaran</button>
      </div>
    </div>
  `).join('');
}

function renderSelectedSasaran() {
  if (!state.selectedSasaran) return;
  $('#selectedSasaran').innerHTML = `
    <div class="item">
      <strong>${escapeHtml(state.selectedSasaran.nama)}</strong>
      ID Sasaran: ${escapeHtml(state.selectedSasaran.id)}<br>
      Jenis: ${escapeHtml(state.selectedSasaran.jenis)}
    </div>
  `;
}

function getFormByJenis(jenis) {
  const map = {
    CATIN: 'FRM0002',
    BUMIL: 'FRM0003',
    BUFAS: 'FRM0004',
    BADUTA: 'FRM0005'
  };
  return map[jenis] || 'FRM0001';
}

function buildPendampinganPayload() {
  return {
    session_token: state.sessionToken,
    client_submit_id: `SUB-${Date.now()}`,
    tanggal_laporan: $('#tanggalLaporan').value,
    id_form: getFormByJenis(state.selectedSasaran.jenis),
    versi_form: 1,
    id_sasaran: state.selectedSasaran.id,
    payload_json: {
      CATATAN: $('#catatanPendampingan').value.trim()
    },
    sync_source: navigator.onLine ? 'ONLINE' : 'OFFLINE_DRAFT',
    app_version: '1.0.0',
    device_id: `ANDROID-${navigator.userAgent.slice(0, 20)}`
  };
}

function renderDraftQueue() {
  const box = $('#draftBox');
  const card = $('#draftCard');

  if (!state.syncQueue.length) {
    card.classList.add('hidden');
    box.innerHTML = '';
    return;
  }

  card.classList.remove('hidden');
  box.innerHTML = state.syncQueue.map(q => `
    <div class="item">
      <strong>${escapeHtml(q.payload.id_sasaran)}</strong>
      Tanggal: ${escapeHtml(q.payload.tanggal_laporan)}<br>
      Antrean: ${escapeHtml(q.id)}<br>
      Dibuat: ${escapeHtml(q.created_at)}
    </div>
  `).join('');
}

$('#btnFill').addEventListener('click', () => {
  const val = $('#quickAccount').value;
  if (!val) return toast('Pilih akun uji terlebih dahulu');
  const parsed = JSON.parse(val);
  $('#username').value = parsed.u;
  $('#password').value = parsed.p;
});

$('#btnLogin').addEventListener('click', async () => {
  try {
    showLoader('Login...');
    const result = await api('login', {
      username_login: $('#username').value.trim(),
      password: $('#password').value,
      device_id: `ANDROID-${navigator.userAgent.slice(0, 20)}`,
      app_version: '1.0.0'
    });

    saveLoginSuccess(result);

    if (result.data.wajib_ganti_password) {
      $('#changePasswordCard').classList.remove('hidden');
      $('#loginCard').classList.add('hidden');
      toast('Login berhasil. Ganti password terlebih dahulu.');
    } else {
      $('#loginCard').classList.add('hidden');
      renderProfile();
      $('#profileCard').classList.remove('hidden');

      await Promise.all([
        loadWilayahAuto(true),
        loadSasaranAuto(true)
      ]);

      toast('Login berhasil');
    }
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
});

$('#btnChangePassword').addEventListener('click', async () => {
  try {
    showLoader('Menyimpan password...');
    await api('changePassword', {
      session_token: state.sessionToken,
      password_lama: $('#oldPassword').value,
      password_baru: $('#newPassword').value
    });

    $('#changePasswordCard').classList.add('hidden');
    $('#loginCard').classList.add('hidden');
    renderProfile();
    $('#profileCard').classList.remove('hidden');

    await Promise.all([
      loadWilayahAuto(true),
      loadSasaranAuto(true)
    ]);

    toast('Password berhasil diubah');
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
});

$('#btnLoadWilayah').addEventListener('click', async () => {
  await loadWilayahAuto(false);
});

$('#btnLoadSasaran').addEventListener('click', async () => {
  if (state.lastSasaran && state.lastSasaran.length > 0) {
    $('#sasaranCard').classList.remove('hidden');
    applySasaranFilter();
    return toast('Data sasaran dimuat');
  }
  await loadSasaranAuto(false);
});

$('#btnSearchSasaran').addEventListener('click', applySasaranFilter);
$('#filterJenisSasaran').addEventListener('change', applySasaranFilter);

let searchTimer = null;
$('#keywordSasaran').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    applySasaranFilter();
  }, 250);
});

window.pilihSasaran = function(id, nama, jenis) {
  state.selectedSasaran = { id, nama, jenis };
  saveState();
  renderSelectedSasaran();
  $('#pendampinganCard').classList.remove('hidden');
  toast('Sasaran dipilih');
};

$('#btnOpenRegistrasi').addEventListener('click', async () => {
  $('#registrasiCard').classList.remove('hidden');
  await loadWilayahAuto(true);
  populateDusunDropdown();
  toast('Form registrasi sasaran dibuka');
});

$('#btnRegistrasiSasaran').addEventListener('click', async () => {
  try {
    const nik = $('#regNik').value.trim();
    const kk = $('#regKK').value.trim();

    if (!validateNik(nik)) return toast('Masukkan 16 digit NIK');
    if (!validateKk(kk)) return toast('Masukkan 16 digit Nomor KK');

    showLoader('Menyimpan registrasi...');
    const result = await api('registerSasaran', {
      session_token: state.sessionToken,
      nama_sasaran: $('#regNama').value.trim(),
      kode_jenis_sasaran: $('#regJenis').value,
      nik_sasaran: nik,
      no_kk: kk,
      tanggal_lahir: $('#regTanggalLahir').value,
      jenis_kelamin: $('#regJenisKelamin').value,
      dusun_rw: $('#regDusun').value,
      alamat: $('#regAlamat').value.trim(),
      app_version: '1.0.0'
    });

    toast(`Registrasi berhasil: ${result.data.nama_sasaran}`);

    $('#regNama').value = '';
    $('#regJenis').value = '';
    $('#regNik').value = '';
    $('#regKK').value = '';
    $('#regTanggalLahir').value = '';
    $('#regJenisKelamin').value = '';
    $('#regAlamat').value = '';
    toggleRegGender();

    await loadSasaranAuto(true);
    applySasaranFilter();
    $('#registrasiCard').classList.add('hidden');
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
});

$('#btnSaveDraft').addEventListener('click', () => {
  try {
    if (!state.selectedSasaran) return toast('Pilih sasaran terlebih dahulu');
    if (!$('#tanggalLaporan').value) return toast('Tanggal laporan wajib diisi');

    const payload = buildPendampinganPayload();
    state.syncQueue.push({
      id: `Q-${Date.now()}`,
      action: 'submitPendampingan',
      payload,
      created_at: new Date().toISOString()
    });
    saveState();
    renderDraftQueue();
    toast('Draft disimpan');
  } catch (err) {
    toast(err.message);
  }
});

$('#btnSubmitPendampingan').addEventListener('click', async () => {
  try {
    if (!state.selectedSasaran) return toast('Pilih sasaran terlebih dahulu');
    if (!$('#tanggalLaporan').value) return toast('Tanggal laporan wajib diisi');

    const payload = buildPendampinganPayload();

    if (!navigator.onLine) {
      state.syncQueue.push({
        id: `Q-${Date.now()}`,
        action: 'submitPendampingan',
        payload,
        created_at: new Date().toISOString()
      });
      saveState();
      renderDraftQueue();
      return toast('Offline. Data masuk antrean sync');
    }

    showLoader('Mengirim pendampingan...');
    await api('submitPendampingan', payload);
    $('#catatanPendampingan').value = '';
    toast('Pendampingan berhasil disubmit');
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
});

$('#btnSyncNow').addEventListener('click', syncQueueNow);

async function syncQueueNow() {
  if (!navigator.onLine) return toast('Tidak ada koneksi internet');
  if (!state.syncQueue.length) return toast('Tidak ada antrean sync');

  showLoader('Sinkronisasi data...');
  const remain = [];

  for (const item of state.syncQueue) {
    try {
      await api(item.action, item.payload);
    } catch (err) {
      remain.push(item);
    }
  }

  state.syncQueue = remain;
  saveState();
  renderDraftQueue();

  hideLoader();
  toast(remain.length ? 'Sebagian draft belum berhasil sync' : 'Semua draft berhasil disinkronkan');
}

$('#btnLogout').addEventListener('click', () => {
  state.sessionToken = '';
  state.profile = null;
  state.selectedSasaran = null;
  state.lastSasaran = [];
  state.timWilayah = [];
  state.syncQueue = [];
  saveState();

  $('#loginCard').classList.remove('hidden');
  $('#profileCard').classList.add('hidden');
  $('#wilayahCard').classList.add('hidden');
  $('#sasaranCard').classList.add('hidden');
  $('#pendampinganCard').classList.add('hidden');
  $('#changePasswordCard').classList.add('hidden');
  $('#registrasiCard').classList.add('hidden');
  $('#profileBox').innerHTML = '';
  $('#wilayahBox').innerHTML = '';
  $('#sasaranBox').innerHTML = '';
  $('#selectedSasaran').innerHTML = '';
  $('#statusText').textContent = 'Belum login';

  toast('Anda sudah keluar');
});

function escapeHtml(str) {
  return String(str || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function escapeAttr(str) {
  return String(str || '').replaceAll("'", "\\'");
}
