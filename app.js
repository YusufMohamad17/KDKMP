// ═══════════════════════════════════════════════
//  GLOBAL STATE
// ═══════════════════════════════════════════════
let currentShift = 'awal';
let currentSheet = '';
let productData = []; // [{row, barcode, nama, grocery, gudang, produkBaru, total, onHand}]
let pendingChanges = {}; // key: `${row}_${field}` -> value
let sheetsList = [];
let connectionActive = false;

// ═══════════════════════════════════════════════
//  INITIALIZATION
// ═══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Start clock
  updateClock();
  setInterval(updateClock, 1000);

  // Load API settings
  loadSettings();

  // Initial data load if API is configured
  if (getGasUrl()) {
    initApp();
  } else {
    showPage('pengaturan');
    showToast('⚠️ Hubungkan Web App URL terlebih dahulu!', 'warning');
  }
});

function updateClock() {
  const now = new Date();
  const options = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
  document.getElementById('headerDate').textContent = now.toLocaleDateString('id-ID', options);
  document.getElementById('headerTime').textContent = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ═══════════════════════════════════════════════
//  API CLIENT HELPER
// ═══════════════════════════════════════════════
async function callApi(action, params = {}) {
  const url = getGasUrl();
  if (!url) {
    updateConnectionStatus(false);
    return { error: 'Web App URL tidak terkonfigurasi. Buka menu Pengaturan.' };
  }

  // Gabungkan action ke payload
  const payload = {
    action: action,
    ...params
  };

  try {
    // Gunakan POST dengan text/plain untuk menghindari CORS preflight OPTIONS request
    const response = await fetch(url, {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'text/plain;charset=utf-8'
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    updateConnectionStatus(true);
    return data;
  } catch (error) {
    console.error('API Call Error:', error);
    updateConnectionStatus(false);
    return { error: `Gagal terhubung ke API: ${error.message}` };
  }
}

// ═══════════════════════════════════════════════
//  SETTINGS & STORAGE
// ═══════════════════════════════════════════════
function getGasUrl() {
  return localStorage.getItem('stok_opname_gas_url') || '';
}

function loadSettings() {
  const url = getGasUrl();
  document.getElementById('gasUrlInput').value = url;
  if (url) {
    document.getElementById('apiEndpointDisplay').textContent = url;
    document.getElementById('setupNotice').style.display = 'none';
    document.getElementById('connectedNotice').style.display = 'block';
  } else {
    document.getElementById('setupNotice').style.display = 'block';
    document.getElementById('connectedNotice').style.display = 'none';
  }
}

function saveSettings() {
  const url = document.getElementById('gasUrlInput').value.trim();
  if (!url) {
    showToast('⚠️ URL tidak boleh kosong!', 'warning');
    return;
  }
  
  if (!url.startsWith('https://script.google.com/')) {
    showToast('⚠️ URL harus berupa endpoint Google Script!', 'warning');
    return;
  }

  localStorage.setItem('stok_opname_gas_url', url);
  loadSettings();
  showToast('✅ Pengaturan berhasil disimpan!', 'success');
  
  // Coba init aplikasi setelah simpan URL
  initApp();
}

async function testConnection() {
  showToast('⚡ Menguji koneksi...', 'info');
  const res = await callApi('getTodayInfo');
  
  if (res && !res.error) {
    showToast('🚀 Koneksi Berhasil! API terhubung.', 'success');
    updateConnectionStatus(true);
  } else {
    showToast('❌ Koneksi Gagal! Periksa URL Anda.', 'error');
    updateConnectionStatus(false);
  }
}

function updateConnectionStatus(active) {
  connectionActive = active;
  const statusIndicator = document.getElementById('connectionStatus');
  const statusText = document.getElementById('connectionStatusText');
  const topDot = document.getElementById('topConnectionDot');

  if (active) {
    if (statusIndicator) statusIndicator.className = 'status-badge online';
    if (statusText) statusText.textContent = 'API Terhubung';
    if (topDot) {
      topDot.className = 'status-dot online';
      topDot.parentElement.title = 'API Terhubung (Klik untuk tes ulang)';
    }
  } else {
    if (statusIndicator) statusIndicator.className = 'status-badge offline';
    if (statusText) statusText.textContent = 'API Terputus';
    if (topDot) {
      topDot.className = 'status-dot offline';
      topDot.parentElement.title = 'API Terputus (Klik untuk tes ulang)';
    }
  }
}

// ═══════════════════════════════════════════════
//  APP INITIALIZATION & DATA LOADING
// ═══════════════════════════════════════════════
async function initApp() {
  showToast('⏳ Memuat data inisialisasi...', 'info');
  const info = await callApi('getTodayInfo');
  
  if (info.error) {
    showToast('❌ Gagal memuat data hari ini: ' + info.error, 'error');
    return;
  }

  // Load sheets list
  await loadSheetList(info.today);
}

async function loadSheetList(selectName) {
  const res = await callApi('getSheetList');
  if (res.error) {
    showToast('❌ Gagal memuat daftar sheet: ' + res.error, 'error');
    return;
  }

  sheetsList = res.sheets || [];
  populateSheetSelects(sheetsList, selectName);

  if (selectName) {
    currentSheet = selectName;
    await loadInputData();
  }
}

function populateSheetSelects(sheets, selectName) {
  const sorted = [...sheets].reverse(); // Terbaru di atas
  const options = sorted.map(s =>
    `<option value="${s}" ${s === selectName ? 'selected' : ''}>${s}</option>`
  ).join('');

  document.getElementById('sheetSelect').innerHTML = options;
  document.getElementById('rekapSheetSelect').innerHTML = options;
}

async function loadInputData() {
  if (!currentSheet) return;
  
  document.getElementById('tableContainer').innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <span>Memuat data input (${currentSheet})...</span>
    </div>
  `;

  const res = await callApi('getShiftData', { sheetName: currentSheet, shift: currentShift });
  
  if (res.error) {
    showToast('❌ Gagal: ' + res.error, 'error');
    document.getElementById('tableContainer').innerHTML = `
      <div class="empty-state">
        <div class="e-icon">⚠️</div>
        <div class="e-title">Gagal memuat data</div>
        <div class="e-sub">${res.error}</div>
      </div>
    `;
    return;
  }

  productData = res.data || [];
  renderInputTable(productData);
  updateDashboardInfo();
}

// ═══════════════════════════════════════════════
//  UI RENDERERS
// ═══════════════════════════════════════════════
function renderInputTable(data) {
  const container = document.getElementById('tableContainer');
  if (!data || data.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="e-icon">📦</div>
        <div class="e-title">Tidak ada data produk</div>
        <div class="e-sub">Daftar produk masih kosong. Tambahkan di tab Master Produk.</div>
      </div>
    `;
    return;
  }

  const rows = data.map(p => {
    // Check if there are unsaved pending changes in memory
    const valGrocery = pendingChanges[`${p.row}_grocery`]?.value !== undefined ? pendingChanges[`${p.row}_grocery`].value : (p.grocery || 0);
    const valGudang = pendingChanges[`${p.row}_gudang`]?.value !== undefined ? pendingChanges[`${p.row}_gudang`].value : (p.gudang || 0);
    const valProdukBaru = pendingChanges[`${p.row}_produkBaru`]?.value !== undefined ? pendingChanges[`${p.row}_produkBaru`].value : (p.produkBaru || 0);
    const valOnHand = pendingChanges[`${p.row}_onHand`]?.value !== undefined ? pendingChanges[`${p.row}_onHand`].value : (p.onHand || 0);

    const isModGrocery = pendingChanges[`${p.row}_grocery`] ? 'modified' : '';
    const isModGudang = pendingChanges[`${p.row}_gudang`] ? 'modified' : '';
    const isModProdukBaru = pendingChanges[`${p.row}_produkBaru`] ? 'modified' : '';
    const isModOnHand = pendingChanges[`${p.row}_onHand`] ? 'modified' : '';

    return `
      <tr data-row="${p.row}" data-barcode="${p.barcode}">
        <td>
          <span class="prod-name">${p.nama}</span>
          <span class="prod-barcode">${p.barcode || '–'}</span>
        </td>
        <td class="td-center">
          <div class="cell-input-wrapper">
            <span class="mobile-label">Stok Grocery</span>
            <input type="number" class="grid-input ${isModGrocery}" min="0" 
              data-field="grocery" data-row="${p.row}" value="${valGrocery}"
              oninput="onFieldChange(this, ${p.row}, 'grocery')">
          </div>
        </td>
        <td class="td-center">
          <div class="cell-input-wrapper">
            <span class="mobile-label">Stok Gudang</span>
            <input type="number" class="grid-input ${isModGudang}" min="0" 
              data-field="gudang" data-row="${p.row}" value="${valGudang}"
              oninput="onFieldChange(this, ${p.row}, 'gudang')">
          </div>
        </td>
        <td class="td-center">
          <div class="cell-input-wrapper">
            <span class="mobile-label">Produk Baru</span>
            <input type="number" class="grid-input ${isModProdukBaru}" min="0" 
              data-field="produkBaru" data-row="${p.row}" value="${valProdukBaru}"
              oninput="onFieldChange(this, ${p.row}, 'produkBaru')">
          </div>
        </td>
        <td class="td-center">
          <span class="row-total-val" id="total-${p.row}">${calcTotal(valGrocery, valGudang, valProdukBaru)}</span>
        </td>
        <td class="td-center">
          <div class="cell-input-wrapper">
            <span class="mobile-label">On Hand (Sistem)</span>
            <input type="number" class="grid-input ${isModOnHand}" min="0" 
              data-field="onHand" data-row="${p.row}" value="${valOnHand}"
              oninput="onFieldChange(this, ${p.row}, 'onHand')">
          </div>
        </td>
      </tr>
    `;
  }).join('');

  container.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Nama Produk / Barcode</th>
          <th class="td-center">Stok Grocery</th>
          <th class="td-center">Stok Gudang</th>
          <th class="td-center">Produk Baru</th>
          <th class="td-center">Total Fisik</th>
          <th class="td-center">On Hand (Sistem)</th>
        </tr>
      </thead>
      <tbody id="tableBody">${rows}</tbody>
    </table>
  `;
}

function calcTotal(g, d, p) {
  const v = (Number(g) || 0) + (Number(d) || 0) + (Number(p) || 0);
  return v || '0';
}

function updateDashboardInfo() {
  if (!productData || productData.length === 0) return;

  const total = productData.length;
  
  // Count how many products are filled. A product is filled if grocery > 0, gudang > 0, or onHand > 0
  const filled = productData.filter(p => 
    (Number(p.grocery) > 0 || Number(p.gudang) > 0 || Number(p.onHand) > 0)
  ).length;

  const empty = total - filled;

  // Update text metrics
  document.getElementById('dashTotalCount').textContent = total;
  document.getElementById('dashFilledCount').textContent = filled;
  document.getElementById('dashEmptyCount').textContent = empty;
  document.getElementById('dashActiveDate').textContent = `Tanggal: ${currentSheet || '-'}`;
  document.getElementById('progressRatio').textContent = `${filled} / ${total} Produk`;

  // Calculate percentage and update completion ring
  const percent = total > 0 ? Math.round((filled / total) * 100) : 0;
  document.getElementById('completionPercent').textContent = `${percent}%`;

  // Update SVG dash offset
  const ring = document.getElementById('completionRing');
  const radius = 34;
  const circumference = 2 * Math.PI * radius; // Approx 213.6
  const offset = circumference - (percent / 100) * circumference;
  ring.style.strokeDashoffset = offset;
}

// ═══════════════════════════════════════════════
//  EVENT HANDLERS & INPUT MODIFICATIONS
// ═══════════════════════════════════════════════
function onFieldChange(el, row, field) {
  el.classList.add('modified');
  
  const key = `${row}_${field}`;
  pendingChanges[key] = { row, field, value: el.value };

  // Update total value live on UI
  const rowEl = document.querySelector(`tr[data-row="${row}"]`);
  if (rowEl) {
    const g = rowEl.querySelector('[data-field="grocery"]')?.value || 0;
    const d = rowEl.querySelector('[data-field="gudang"]')?.value || 0;
    const p = rowEl.querySelector('[data-field="produkBaru"]')?.value || 0;
    const totalEl = document.getElementById(`total-${row}`);
    const totalVal = calcTotal(g, d, p);
    
    if (totalEl) {
      totalEl.textContent = totalVal;
    }
  }

  updateSaveBar();
}

function updateSaveBar() {
  const count = Object.keys(pendingChanges).length;
  const bar = document.getElementById('saveBar');
  const countEl = document.getElementById('changedCount');
  const statusEl = document.getElementById('saveStatus');

  if (count > 0) {
    bar.style.display = 'flex';
    countEl.textContent = count;
    statusEl.innerHTML = `🛡️ <strong>${count}</strong> perubahan belum disimpan ke Google Sheets.`;
  } else {
    bar.style.display = 'none';
  }
}

function resetChanges() {
  pendingChanges = {};
  updateSaveBar();
  loadInputData();
  showToast('↩ Perubahan dibatalkan.', 'info');
}

async function saveData() {
  const count = Object.keys(pendingChanges).length;
  if (count === 0) return;

  const saveBtn = document.getElementById('saveBtn');
  saveBtn.disabled = true;
  saveBtn.textContent = '⏳ Menyimpan...';

  // Group pending changes by row index
  const rowMap = {};
  Object.values(pendingChanges).forEach(c => {
    if (!rowMap[c.row]) {
      const rowEl = document.querySelector(`tr[data-row="${c.row}"]`);
      rowMap[c.row] = {
        row: c.row,
        grocery: rowEl.querySelector('[data-field="grocery"]')?.value || '',
        gudang: rowEl.querySelector('[data-field="gudang"]')?.value || '',
        produkBaru: rowEl.querySelector('[data-field="produkBaru"]')?.value || '',
        onHand: rowEl.querySelector('[data-field="onHand"]')?.value || ''
      };
    }
  });

  const rowData = Object.values(rowMap);

  showToast('⏳ Menyimpan data ke spreadsheet...', 'info');
  const res = await callApi('saveShiftData', {
    sheetName: currentSheet,
    shift: currentShift,
    rowData: JSON.stringify(rowData) // Send as stringified JSON to prevent nested serialization issues
  });

  saveBtn.disabled = false;
  saveBtn.textContent = '💾 Simpan Ke Sheets';

  if (res.error) {
    showToast('❌ Gagal menyimpan: ' + res.error, 'error');
    return;
  }

  // Success
  pendingChanges = {};
  updateSaveBar();
  showToast('✅ Data berhasil disimpan ke Google Sheets!', 'success');
  
  // Reload input grid to get updated values
  await loadInputData();
}

function setShift(shift) {
  if (Object.keys(pendingChanges).length > 0) {
    if (!confirm('Anda memiliki perubahan yang belum disimpan. Pindah shift akan membatalkan perubahan tersebut. Lanjutkan?')) {
      return;
    }
  }

  currentShift = shift;
  document.getElementById('btnAwal').classList.toggle('active', shift === 'awal');
  document.getElementById('btnAkhir').classList.toggle('active', shift === 'akhir');
  
  pendingChanges = {};
  updateSaveBar();
  loadInputData();
}

function onSheetChange() {
  if (Object.keys(pendingChanges).length > 0) {
    if (!confirm('Anda memiliki perubahan yang belum disimpan. Pindah tanggal akan membatalkan perubahan tersebut. Lanjutkan?')) {
      // Revert selection
      document.getElementById('sheetSelect').value = currentSheet;
      return;
    }
  }

  currentSheet = document.getElementById('sheetSelect').value;
  // Sync both dropdowns
  document.getElementById('rekapSheetSelect').value = currentSheet;
  
  pendingChanges = {};
  updateSaveBar();
  loadInputData();
}

function refreshData() {
  if (Object.keys(pendingChanges).length > 0) {
    if (!confirm('Segarkan data akan menghapus semua inputan lokal yang belum disimpan. Lanjutkan?')) {
      return;
    }
  }
  pendingChanges = {};
  updateSaveBar();
  loadInputData();
}

function filterTable() {
  const query = document.getElementById('searchInput').value.toLowerCase();
  const rows = document.querySelectorAll('#tableBody tr');

  rows.forEach(tr => {
    const name = tr.querySelector('.prod-name')?.textContent.toLowerCase() || '';
    const barcode = tr.dataset.barcode?.toLowerCase() || '';
    
    if (name.includes(query) || barcode.includes(query)) {
      tr.style.display = '';
    } else {
      tr.style.display = 'none';
    }
  });
}

// ═══════════════════════════════════════════════
//  VERIFICATION LOGIC
// ═══════════════════════════════════════════════
async function verifySpreadsheetData() {
  const modal = document.getElementById('verifyModal');
  const body = document.getElementById('verifyModalBody');

  modal.classList.add('open');
  body.innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <span>Mengambil data terbaru dari Google Sheets untuk verifikasi...</span>
    </div>
  `;

  try {
    const res = await callApi('getShiftData', { sheetName: currentSheet, shift: currentShift });
    if (res.error) {
      throw new Error(res.error);
    }

    const sheetData = res.data || [];
    const diffs = [];

    sheetData.forEach(sheetItem => {
      const rowEl = document.querySelector(`tr[data-row="${sheetItem.row}"]`);
      if (!rowEl) return;

      const localGrocery = Number(rowEl.querySelector('[data-field="grocery"]')?.value) || 0;
      const localGudang = Number(rowEl.querySelector('[data-field="gudang"]')?.value) || 0;
      const localProdukBaru = Number(rowEl.querySelector('[data-field="produkBaru"]')?.value) || 0;
      const localOnHand = Number(rowEl.querySelector('[data-field="onHand"]')?.value) || 0;

      const sheetGrocery = Number(sheetItem.grocery) || 0;
      const sheetGudang = Number(sheetItem.gudang) || 0;
      const sheetProdukBaru = Number(sheetItem.produkBaru) || 0;
      const sheetOnHand = Number(sheetItem.onHand) || 0;

      const itemDiffs = [];
      if (localGrocery !== sheetGrocery) {
        itemDiffs.push({ field: 'Stok Grocery', local: localGrocery, sheet: sheetGrocery });
      }
      if (localGudang !== sheetGudang) {
        itemDiffs.push({ field: 'Stok Gudang', local: localGudang, sheet: sheetGudang });
      }
      if (localProdukBaru !== sheetProdukBaru) {
        itemDiffs.push({ field: 'Produk Baru', local: localProdukBaru, sheet: sheetProdukBaru });
      }
      if (localOnHand !== sheetOnHand) {
        itemDiffs.push({ field: 'On Hand (Sistem)', local: localOnHand, sheet: sheetOnHand });
      }

      if (itemDiffs.length > 0) {
        diffs.push({
          nama: sheetItem.nama,
          barcode: sheetItem.barcode,
          row: sheetItem.row,
          differences: itemDiffs
        });
      }
    });

    if (diffs.length === 0) {
      body.innerHTML = `
        <div class="verif-result-card match">
          <div class="verif-icon">🛡️✅</div>
          <h4 class="verif-title">Verifikasi Berhasil!</h4>
          <p class="verif-desc">Seluruh data stok opname di layar Anda cocok 100% dengan data yang tersimpan di Google Spreadsheet.</p>
        </div>
        <p style="font-size: 0.82rem; color: var(--text-muted); text-align: center; line-height: 1.4;">
          Semua baris, kolom, dan input sinkron secara penuh pada shift <strong>${currentShift === 'awal' ? 'Awal' : 'Akhir'}</strong> tanggal <strong>${currentSheet}</strong>.
        </p>
      `;
    } else {
      const diffHtml = diffs.map(d => `
        <div class="diff-item">
          <div class="diff-prod-title">${d.nama} <span class="prod-barcode">#${d.barcode} (Baris ${d.row})</span></div>
          <div class="diff-grid">
            ${d.differences.map(dif => `
              <div>
                <span class="diff-label">${dif.field}</span>
                <div style="margin-top: 4px;">
                  <span class="diff-val-local" title="Data di layar">${dif.local}</span> 
                  <span style="color:var(--text-light)">→</span> 
                  <span class="diff-val-sheet" title="Data di spreadsheet">${dif.sheet}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('');

      body.innerHTML = `
        <div class="verif-result-card mismatch">
          <div class="verif-icon">🛡️⚠️</div>
          <h4 class="verif-title">Terdeteksi Perbedaan Data</h4>
          <p class="verif-desc">Ada ${diffs.length} produk yang memiliki perbedaan nilai antara layar input Anda dengan Google Spreadsheet.</p>
        </div>
        <p style="font-size: 0.8rem; font-weight: 700; margin-bottom: 12px; color: var(--text-main);">Daftar Perbedaan (Layar Input → Google Sheet):</p>
        <div class="diff-list">
          ${diffHtml}
        </div>
        <div style="margin-top: 20px; background-color: var(--slate-50); border: 1px solid var(--card-border); border-radius: var(--radius-md); padding: 12px; font-size: 0.78rem; color: var(--text-muted); line-height: 1.4;">
          💡 <strong>Tips:</strong> Jika perbedaan ini berasal dari perubahan yang Anda buat di layar tetapi belum di-upload, klik tombol <strong>Simpan Ke Sheets</strong> di bar bawah untuk menuliskannya ke Google Sheets.
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = `
      <div class="verif-result-card mismatch">
        <div class="verif-icon">❌</div>
        <h4 class="verif-title">Gagal Melakukan Verifikasi</h4>
        <p class="verif-desc">${err.message || err}</p>
      </div>
    `;
  }
}

function closeVerifyModal() {
  document.getElementById('verifyModal').classList.remove('open');
}

// ═══════════════════════════════════════════════
//  REKAP PAGE LOGIC
// ═══════════════════════════════════════════════
async function loadRekap() {
  const sheet = document.getElementById('rekapSheetSelect').value;
  if (!sheet) return;

  document.getElementById('rekapContainer').innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <span>Memuat data rekap penjualan (${sheet})...</span>
    </div>
  `;

  // Parallel fetches for 'awal' and 'akhir' shift
  const [resAwal, resAkhir] = await Promise.all([
    callApi('getShiftData', { sheetName: sheet, shift: 'awal' }),
    callApi('getShiftData', { sheetName: sheet, shift: 'akhir' })
  ]);

  if (resAwal.error || resAkhir.error) {
    const errMsg = resAwal.error || resAkhir.error;
    showToast('❌ Gagal: ' + errMsg, 'error');
    document.getElementById('rekapContainer').innerHTML = `
      <div class="empty-state">
        <div class="e-icon">⚠️</div>
        <div class="e-title">Gagal memuat rekap</div>
        <div class="e-sub">${errMsg}</div>
      </div>
    `;
    return;
  }

  renderRekap(resAwal.data || [], resAkhir.data || [], sheet);
}

function renderRekap(awal, akhir, sheet) {
  const akhirMap = {};
  akhir.forEach(p => {
    akhirMap[p.row] = p;
  });

  let totalAwal = 0;
  let totalAkhir = 0;
  let totalTerjual = 0;

  const rows = awal.map(p => {
    const ak = akhirMap[p.row] || {};
    const tAwal = Number(p.total) || 0;
    const tAkhir = Number(ak.total) || 0;
    
    // Terjual = Awal - Akhir (hanya jika awal > 0)
    const tJual = tAwal > 0 ? Math.max(0, tAwal - tAkhir) : 0;
    
    totalAwal += tAwal;
    totalAkhir += tAkhir;
    totalTerjual += tJual;

    const jualCell = tJual > 0
      ? `<td class="td-center"><span class="row-sell-val">-${tJual}</span></td>`
      : `<td class="td-center" style="color:var(--text-light)">–</td>`;

    return `
      <tr>
        <td>
          <span class="prod-name">${p.nama}</span>
          <span class="prod-barcode">${p.barcode || '–'}</span>
        </td>
        <td class="td-center row-total-val" style="background-color: var(--emerald-50); color: var(--emerald-600);">${tAwal || '–'}</td>
        <td class="td-center row-total-val" style="background-color: var(--indigo-50); color: var(--indigo-600);">${tAkhir || '–'}</td>
        ${jualCell}
      </tr>
    `;
  }).join('');

  document.getElementById('rekapContainer').innerHTML = `
    <!-- Summary Stat Cards -->
    <div class="stat-row">
      <div class="stat-box">
        <div class="s-val" style="color: var(--emerald-600);">${totalAwal}</div>
        <div class="s-lbl">Total Stok Awal</div>
      </div>
      <div class="stat-box">
        <div class="s-val" style="color: var(--indigo-600);">${totalAkhir}</div>
        <div class="s-lbl">Total Stok Akhir</div>
      </div>
      <div class="stat-box">
        <div class="s-val" style="color: var(--rose-600);">${totalTerjual}</div>
        <div class="s-lbl">Total Terjual</div>
      </div>
    </div>

    <!-- Rekap Table -->
    <div class="data-card">
      <div class="table-control-row">
        <h3 style="font-size: 0.95rem; font-weight: 700;">Tabel Penjualan (${sheet})</h3>
      </div>
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>Produk</th>
              <th class="td-center">Stok Awal Shift</th>
              <th class="td-center">Stok Akhir Shift</th>
              <th class="td-center">Kuantitas Terjual</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
          <tfoot>
            <tr>
              <td style="padding: 16px 20px;">Total Kuantitas</td>
              <td class="td-center row-total-val" style="background-color: var(--emerald-50); color: var(--emerald-600);">${totalAwal}</td>
              <td class="td-center row-total-val" style="background-color: var(--indigo-50); color: var(--indigo-600);">${totalAkhir}</td>
              <td class="td-center row-sell-val" style="background-color: var(--rose-50); color: var(--rose-600); border-radius: 0; display: table-cell;">${totalTerjual > 0 ? '-' + totalTerjual : '–'}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;
}

// ═══════════════════════════════════════════════
//  MASTER PRODUK LOGIC
// ═══════════════════════════════════════════════
async function loadProduk() {
  document.getElementById('produkContainer').innerHTML = `
    <div class="loader-container">
      <div class="spinner"></div>
      <span>Memuat katalog master produk...</span>
    </div>
  `;

  const products = await callApi('getProductList');
  if (products.error) {
    showToast('❌ Gagal memuat produk: ' + products.error, 'error');
    document.getElementById('produkContainer').innerHTML = `
      <div class="empty-state">
        <div class="e-icon">⚠️</div>
        <div class="e-title">Gagal memuat produk</div>
        <div class="e-sub">${products.error}</div>
      </div>
    `;
    return;
  }

  renderProdukTable(products);
}

function renderProdukTable(products) {
  if (!products || products.length === 0) {
    document.getElementById('produkContainer').innerHTML = `
      <div class="empty-state">
        <div class="e-icon">📦</div>
        <div class="e-title">Belum ada produk terdaftar</div>
        <div class="e-sub">Klik tombol "Tambah Produk Baru" untuk mendaftarkan master produk.</div>
      </div>
    `;
    return;
  }

  const rows = products.map((p, index) => `
    <tr>
      <td class="td-center" style="font-size:0.75rem; color:var(--text-muted); font-weight:700;">${index + 1}</td>
      <td>
        <span class="prod-name">${p.nama}</span>
      </td>
      <td class="prod-barcode">${p.barcode || '–'}</td>
    </tr>
  `).join('');

  document.getElementById('produkContainer').innerHTML = `
    <table>
      <thead>
        <tr>
          <th class="td-center" style="width: 60px;">#</th>
          <th>Nama Lengkap Produk</th>
          <th>Barcode / Kode</th>
        </tr>
      </thead>
      <tbody id="produkTableBody">
        ${rows}
      </tbody>
    </table>
  `;
}

function filterProdukTable() {
  const query = document.getElementById('searchProdukInput').value.toLowerCase();
  const rows = document.querySelectorAll('#produkTableBody tr');

  rows.forEach(tr => {
    const name = tr.querySelector('.prod-name')?.textContent.toLowerCase() || '';
    const barcode = tr.querySelector('.prod-barcode')?.textContent.toLowerCase() || '';
    
    if (name.includes(query) || barcode.includes(query)) {
      tr.style.display = '';
    } else {
      tr.style.display = 'none';
    }
  });
}

// Add Product Dialog
function openAddModal() {
  document.getElementById('newBarcode').value = '';
  document.getElementById('newNama').value = '';
  document.getElementById('addModal').classList.add('open');
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('open');
}

async function submitAddProduct() {
  const barcode = document.getElementById('newBarcode').value.trim();
  const nama = document.getElementById('newNama').value.trim();

  if (!barcode || !nama) {
    showToast('⚠️ Mohon isi barcode dan nama produk!', 'warning');
    return;
  }

  closeAddModal();
  showToast('⏳ Menambahkan produk baru...', 'info');

  const res = await callApi('addProduct', { barcode, nama });
  
  if (res.error) {
    showToast('❌ Gagal: ' + res.error, 'error');
    return;
  }

  showToast('✅ Produk berhasil ditambahkan ke master!', 'success');
  
  // Reload products list
  await loadProduk();
  // Reload input list too
  await loadInputData();
}

function closeModal(e) {
  if (e.target.classList.contains('modal-backdrop')) {
    closeAddModal();
    closeVerifyModal();
  }
}

// ═══════════════════════════════════════════════
//  NAVIGATION PAGE CONTROLLER
// ═══════════════════════════════════════════════
function showPage(name) {
  // Navigation elements active class (Desktop top navbar)
  document.querySelectorAll('.nav-item-top').forEach(item => {
    item.classList.remove('active');
  });
  const activeNavItem = document.getElementById(`nav-${name}`);
  if (activeNavItem) activeNavItem.classList.add('active');

  // Navigation elements active class (Mobile bottom navigation)
  document.querySelectorAll('.bottom-nav-item').forEach(item => {
    item.classList.remove('active');
  });
  const activeBottomItem = document.getElementById(`btn-nav-${name}`);
  if (activeBottomItem) activeBottomItem.classList.add('active');

  // Page sections active class
  document.querySelectorAll('.page-section').forEach(section => {
    section.classList.remove('active');
  });
  const activeSection = document.getElementById(`page-${name}`);
  if (activeSection) activeSection.classList.add('active');

  // Page descriptions on Top Bar
  const titleEl = document.getElementById('pageTitle');
  const subEl = document.getElementById('pageSubtitle');

  if (titleEl) {
    switch (name) {
      case 'dashboard':
        titleEl.textContent = 'Dashboard Ringkasan';
        break;
      case 'input':
        titleEl.textContent = 'Pencatatan Stok Opname';
        break;
      case 'rekap':
        titleEl.textContent = 'Laporan Penjualan Harian';
        break;
      case 'produk':
        titleEl.textContent = 'Master Katalog Produk';
        break;
      case 'pengaturan':
        titleEl.textContent = 'Konfigurasi Sistem';
        break;
    }
  }

  if (subEl) {
    switch (name) {
      case 'dashboard':
        subEl.textContent = 'Selamat datang di Sistem Stok Opname Digital KDKMP Kelutan.';
        break;
      case 'input':
        subEl.textContent = 'Input jumlah fisik stok grocery, gudang, produk baru, dan stok sistem.';
        break;
      case 'rekap':
        subEl.textContent = 'Perbandingan data stok Awal Shift vs Akhir Shift dan kalkulasi unit terjual.';
        break;
      case 'produk':
        subEl.textContent = 'Daftar produk terdaftar di sistem. Tambah master produk baru.';
        break;
      case 'pengaturan':
        subEl.textContent = 'Hubungkan web app static ini dengan backend Google Sheets API Anda.';
        break;
    }
  }

  // Handle specific page loading functions
  if (name === 'dashboard') {
    updateDashboardInfo();
  } else if (name === 'rekap') {
    loadRekap();
  } else if (name === 'produk') {
    loadProduk();
  }

  // Sidebar mobile toggle close
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.remove('open');
}

function quickNav(page, shift = null) {
  showPage(page);
  if (shift) {
    setShift(shift);
  }
}

function toggleSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (sidebar) sidebar.classList.toggle('open');
}

// ═══════════════════════════════════════════════
//  TOAST WRAPPER
// ═══════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  
  let icon = 'ℹ️';
  if (type === 'success') icon = '✅';
  if (type === 'error') icon = '❌';
  if (type === 'warning') icon = '⚠️';

  el.innerHTML = `<span>${icon}</span> <span>${msg}</span>`;
  wrap.appendChild(el);

  // Remove toast after animation ends
  setTimeout(() => {
    el.remove();
  }, 3000);
}
