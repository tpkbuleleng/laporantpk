const state = {
  apiUrl: localStorage.getItem('apiUrl') || '',
  sessionToken: localStorage.getItem('sessionToken') || '',
  profile: JSON.parse(localStorage.getItem('profile') || 'null'),
  selectedSasaran: JSON.parse(localStorage.getItem('selectedSasaran') || 'null'),
  syncQueue: JSON.parse(localStorage.getItem('syncQueue') || '[]'),
  lastSasaran: JSON.parse(localStorage.getItem('lastSasaran') || '[]')
};

const $ = (sel) => document.querySelector(sel);

window.addEventListener('load', async () => {
  setTimeout(() => {
    $('#splash-screen').style.display = 'none';
    $('#app').classList.remove('hidden');
  }, 1700);

  $('#apiUrl').value = state.apiUrl || '';
  setToday();

  refreshOfflineBanner();
  renderDraftQueue();

  if (state.profile) {
    renderProfile();
    $('#profileCard').classList.remove('hidden');
  }

  if (state.selectedSasaran) {
    renderSelectedSasaran();
    $('#pendampinganCard').classList.remove('hidden');
  }

  if (state.lastSasaran.length > 0) {
    renderSasaran(state.lastSasaran);
    $('#sasaranCard').classList.remove('hidden');
  }

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
});

function setToday() {
  const today = new Date().toISOString().slice(0, 10);
  $('#tanggalLaporan').value = today;
}

function refreshOfflineBanner() {
  const banner = $('#offlineBanner');
  if (navigator.onLine) {
    banner.classList.add('hidden');
  } else {
    banner.classList.remove('hidden');
  }
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
  localStorage.setItem('apiUrl', state.apiUrl || '');
  localStorage.setItem('sessionToken', state.sessionToken || '');
  localStorage.setItem('profile', JSON.stringify(state.profile || null));
  localStorage.setItem('selectedSasaran', JSON.stringify(state.selectedSasaran || null));
  localStorage.setItem('syncQueue', JSON.stringify(state.syncQueue || []));
  localStorage.setItem('lastSasaran', JSON.stringify(state.lastSasaran || []));
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 20000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

async function api(action, payload) {
  const apiUrl = $('#apiUrl').value.trim();
  if (!apiUrl) throw new Error('Isi URL Web App terlebih dahulu');

  state.apiUrl = apiUrl;
  saveState();

  const response = await fetchWithTimeout(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain;charset=utf-8'
    },
    body: JSON.stringify({ action, payload })
  }, 25000);

  const data = await response.json();
  if (!data.success) throw new Error(data.message || 'Request gagal');
  return data;
}

$('#btnSaveApi').addEventListener('click', () => {
  state.apiUrl = $('#apiUrl').value.trim();
  saveState();
  toast('URL backend disimpan');
});

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

    state.sessionToken = result.data.session_token;
    state.profile = {
      id_kader: result.data.id_kader,
      nama_kader: result.data.nama_kader,
      id_tim: result.data.id_tim,
      nama_tim: result.data.nama_tim,
      role_akses: result.data.role_akses
    };
    saveState();

    if (result.data.wajib_ganti_password) {
      $('#changePasswordCard').classList.remove('hidden');
      toast('Login berhasil. Ganti password terlebih dahulu.');
    } else {
      renderProfile();
      $('#profileCard').classList.remove('hidden');
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
    renderProfile();
    $('#profileCard').classList.remove('hidden');
    toast('Password berhasil diubah');
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
});

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

$('#btnLoadWilayah').addEventListener('click', async () => {
  try {
    showLoader('Memuat wilayah tim...');
    const result = await api('getTimWilayah', {
      session_token: state.sessionToken
    });

    $('#wilayahCard').classList.remove('hidden');
    $('#wilayahBox').innerHTML = result.data.map(r => `
      <div class="item">
        <strong>${escapeHtml(r.dusun_rw)}</strong>
        ${escapeHtml(r.desa_kelurahan)}, ${escapeHtml(r.kecamatan)}
        <div class="badge">${String(r.is_wilayah_utama) === 'TRUE' ? 'Wilayah utama' : 'Wilayah binaan'}</div>
      </div>
    `).join('');

    toast('Wilayah tim dimuat');
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
});

$('#btnLoadSasaran').addEventListener('click', loadSasaran);
$('#btnSearchSasaran').addEventListener('click', loadSasaran);

let searchTimer = null;
$('#keywordSasaran').addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if ($('#keywordSasaran').value.trim().length >= 2 || $('#keywordSasaran').value.trim().length === 0) {
      loadSasaran();
    }
  }, 450);
});

async function loadSasaran() {
  try {
    showLoader('Mencari sasaran...');
    const result = await api('getSasaranByTim', {
      session_token: state.sessionToken,
      keyword: $('#keywordSasaran').value.trim()
    });

    state.lastSasaran = result.data || [];
    saveState();

    $('#sasaranCard').classList.remove('hidden');
    renderSasaran(state.lastSasaran);
    toast('Data sasaran dimuat');
  } catch (err) {
    toast(err.message);
  } finally {
    hideLoader();
  }
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
      ${escapeHtml(r.kode_jenis_sasaran)} • ${escapeHtml(r.dusun_rw)}<br>
      NIK: ${escapeHtml(r.nik_sasaran)}<br>
      <div class="item-actions">
        <button class="btn btn-secondary" onclick="pilihSasaran('${escapeAttr(r.id_sasaran)}','${escapeAttr(r.nama_sasaran)}','${escapeAttr(r.kode_jenis_sasaran)}')">Pilih Sasaran</button>
      </div>
    </div>
  `).join('');
}

window.pilihSasaran = function(id, nama, jenis) {
  state.selectedSasaran = { id, nama, jenis };
  saveState();
  renderSelectedSasaran();
  $('#pendampinganCard').classList.remove('hidden');
  toast('Sasaran dipilih');
};

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
  if (!navigator.onLine) {
    return toast('Tidak ada koneksi internet');
  }

  if (!state.syncQueue.length) {
    return toast('Tidak ada antrean sync');
  }

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

$('#btnLogout').addEventListener('click', () => {
  state.sessionToken = '';
  state.profile = null;
  state.selectedSasaran = null;
  state.lastSasaran = [];
  saveState();

  $('#profileCard').classList.add('hidden');
  $('#wilayahCard').classList.add('hidden');
  $('#sasaranCard').classList.add('hidden');
  $('#pendampinganCard').classList.add('hidden');
  $('#changePasswordCard').classList.add('hidden');
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
