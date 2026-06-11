// ============================================================
//  STOK OPNAME KDKMP KELUTAN - Google Apps Script Backend
//  Simpan file ini sebagai Code.gs di Google Apps Script
// ============================================================

const SPREADSHEET_ID = ''; // Kosongkan - script akan pakai spreadsheet aktif
const CONFIG_SHEET   = '_CONFIG';

// ---------- ENTRY POINT WEB APP ----------

function doGet(e) {
  // Jika ada query parameter 'action', layani sebagai API JSON (untuk Cloudflare Pages)
  if (e && e.parameter && e.parameter.action) {
    return handleApiRequest(e);
  }
  
  // Jika tidak ada parameter, layani sebagai Web App HTML biasa (kemampuan fallback)
  return HtmlService
    .createHtmlOutputFromFile('Index')
    .setTitle('Stok Opname – KDKMP Kelutan')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  return handleApiRequest(e);
}

// Handler request API dari eksternal (Cloudflare Pages)
function handleApiRequest(e) {
  let action = '';
  let params = {};
  
  // Deteksi payload JSON dari body request POST
  if (e && e.postData && e.postData.contents) {
    try {
      const payload = JSON.parse(e.postData.contents);
      action = payload.action;
      params = payload;
    } catch (err) {
      // Fallback ke parameter query jika parsing gagal
      action = e.parameter.action;
      params = e.parameter;
    }
  } else if (e && e.parameter) {
    action = e.parameter.action;
    params = e.parameter;
  }
  
  let result = {};
  try {
    switch (action) {
      case 'getTodayInfo':
        result = getTodayInfo();
        break;
      case 'getSheetList':
        result = getSheetList();
        break;
      case 'getShiftData':
        result = getShiftData(params.sheetName, params.shift);
        break;
      case 'saveShiftData':
        let rowData = params.rowData;
        if (typeof rowData === 'string') {
          rowData = JSON.parse(rowData);
        }
        result = saveShiftData(params.sheetName, params.shift, rowData);
        break;
      case 'getProductList':
        result = getProductList();
        break;
      case 'addProduct':
        result = addProduct(params.barcode, params.nama);
        break;
      default:
        result = { error: 'Action tidak dikenal: ' + action };
    }
  } catch (err) {
    result = { error: err.message || err.toString() };
  }
  
  // Mengembalikan data berupa JSON.
  // ContentService otomatis mendukung CORS redirect secara bawaan ketika dipanggil via fetch()
  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

// ---------- HELPERS SPREADSHEET ----------

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetByName(name) {
  return getSpreadsheet().getSheetByName(name);
}

// Format tanggal → "1 juni 2026"
function formatSheetDate(date) {
  const BULAN = ['januari','februari','maret','april','mei','juni',
                 'juli','agustus','september','oktober','november','desember'];
  return `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
}

// Parse "1 juni 2026" → Date
function parseSheetDate(str) {
  const BULAN = ['januari','februari','maret','april','mei','juni',
                 'juli','agustus','september','oktober','november','desember'];
  const parts = str.trim().toLowerCase().split(' ');
  if (parts.length < 3) return null;
  const d = parseInt(parts[0]);
  const m = BULAN.indexOf(parts[1]);
  const y = parseInt(parts[2]);
  if (m === -1) return null;
  return new Date(y, m, d);
}

// ---------- KONFIGURASI PRODUK ----------

function getProductList() {
  const ss   = getSpreadsheet();
  let cfg    = ss.getSheetByName(CONFIG_SHEET);

  // Jika sheet config belum ada, buat dengan data default
  if (!cfg) {
    cfg = ss.insertSheet(CONFIG_SHEET);
    cfg.hideSheet();
    const header = [['Barcode','Nama Produk']];
    const products = [
      ['2696521',  'CARNATION Evaporated 405g'],
      ['2696527',  'CARNATION Pbg 38g'],
      ['2696426',  'CARNATION SBC 365g'],
      ['2696521',  'MILO ACTIV-GO SICh 22g'],
      ['2696409',  'MILO 3in1 ACTIV-GO SICh 34g'],
      ['6001008',  'MILO ACTIV-GO Pouch 300g'],
      ['2696523',  'MILO ACTIV-GO UHT 110ml'],
      ['2696523',  'MILO ACTIV-GO UHT 180ml'],
      ['6001051',  'MILO ACTIV-GO RTD 220ml'],
      ['2696527',  'KITKAT RTD CHOCOLATE DRINK CAN'],
      ['2696422',  'DANCOW Coklat Fortigro UHT 110ml'],
      ['2696423',  'DANCOW Strawberry Fortigro UHT 110ml'],
      ['2696525',  'DANCOW Instant Frtgro SICh 26g'],
      ['2696525',  'DANCOW Coklat Frtgro SICh 38g'],
      ['2696405',  'DANCOW Full Cream Fortigro 780g'],
      ['2696405',  'DANCOW Fortigro Instant BIB 780g'],
      ['2696405',  'DANCOW Coklat Fortigro BIB 390g'],
    ];
    cfg.getRange(1, 1, 1, 2).setValues(header);
    cfg.getRange(2, 1, products.length, 2).setValues(products);
  }

  const data = cfg.getDataRange().getValues();
  return data.slice(1).map(r => ({ barcode: String(r[0]), nama: r[1] }));
}

// ---------- MANAJEMEN SHEET HARIAN ----------

function ensureTodaySheet() {
  const today     = new Date();
  const sheetName = formatSheetDate(today);
  const ss        = getSpreadsheet();
  let sheet       = ss.getSheetByName(sheetName);

  if (!sheet) {
    // Cari sheet kemarin untuk copy data akhir shift → awal shift hari ini
    const yesterday     = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const ySheetName    = formatSheetDate(yesterday);
    const ySheet        = ss.getSheetByName(ySheetName);

    sheet = ss.insertSheet(sheetName);
    _setupSheetStructure(sheet);

    if (ySheet) {
      _copyAkhirToAwal(ySheet, sheet);
    } else {
      // Sheet pertama: isi produk kosong
      _populateBlankProducts(sheet);
    }
  }
  return sheetName;
}

function _setupSheetStructure(sheet) {
  // Header baris 1
  const headers = [
    ['Barcode','Nama Produk',
     'Awal: Stok Grocery','Awal: Gudang','Awal: Produk Baru/Belum Receipt (Pcs)','Awal: Total','Awal: On hand/Stock Sistem',
     'Akhir: Stok Grocery','Akhir: Gudang','Akhir: Produk Baru/Belum Receipt (Pcs)','Akhir: Total','Akhir: On hand/Stock Sistem',
     'Terjual (Awal-Akhir)']
  ];
  sheet.getRange(1, 1, 1, 13).setValues(headers);
  sheet.setFrozenRows(1);

  // Format header
  const headerRange = sheet.getRange(1, 1, 1, 13);
  headerRange.setBackground('#1a73e8');
  headerRange.setFontColor('#ffffff');
  headerRange.setFontWeight('bold');
  headerRange.setWrap(true);

  // Lebar kolom
  sheet.setColumnWidth(1, 110); // Barcode
  sheet.setColumnWidth(2, 250); // Nama
  for (let c = 3; c <= 13; c++) sheet.setColumnWidth(c, 100);
}

function _populateBlankProducts(sheet) {
  const products = getProductList();
  const rows = products.map((p, i) => {
    const row = i + 2;
    return [
      p.barcode, p.nama,
      '', '', '', `=IF(C${row}="","",C${row}+D${row}+E${row})`, '',
      '', '', '', `=IF(H${row}="","",H${row}+I${row}+J${row})`, '',
      `=IF(F${row}="","",IF(K${row}="",F${row},F${row}-K${row}))`
    ];
  });
  if (rows.length > 0) {
    sheet.getRange(2, 1, rows.length, 13).setValues(rows);
  }
  _applyDataFormatting(sheet, rows.length);
}

function _copyAkhirToAwal(srcSheet, destSheet) {
  const products = getProductList();
  const srcData  = srcSheet.getDataRange().getValues();

  // Buat map barcode+nama → row data akhir dari kemarin
  const srcMap = {};
  for (let r = 1; r < srcData.length; r++) {
    const key = `${srcData[r][0]}_${srcData[r][1]}`;
    srcMap[key] = srcData[r];
  }

  const rows = products.map((p, i) => {
    const row     = i + 2;
    const key     = `${p.barcode}_${p.nama}`;
    const src     = srcMap[key];
    // Kolom akhir shift kemarin: H(7)=Grocery, I(8)=Gudang, J(9)=ProdukBaru, K(10)=Total, L(11)=OnHand
    const grocery = src ? (src[7] || '') : '';
    const gudang  = src ? (src[8] || '') : '';
    const pbaru   = src ? (src[9] || '') : '';
    const onhand  = src ? (src[11] || '') : '';

    return [
      p.barcode, p.nama,
      grocery, gudang, pbaru,
      `=IF(C${row}="","",C${row}+D${row}+E${row})`, onhand,
      '', '', '', `=IF(H${row}="","",H${row}+I${row}+J${row})`, '',
      `=IF(F${row}="","",IF(K${row}="",F${row},F${row}-K${row}))`
    ];
  });

  if (rows.length > 0) {
    destSheet.getRange(2, 1, rows.length, 13).setValues(rows);
  }
  _applyDataFormatting(destSheet, rows.length);
}

function _applyDataFormatting(sheet, rowCount) {
  if (rowCount < 1) return;
  const dataRange = sheet.getRange(2, 1, rowCount, 13);

  // Warna baris alternating
  for (let r = 0; r < rowCount; r++) {
    const bg = r % 2 === 0 ? '#f8f9fa' : '#ffffff';
    sheet.getRange(r + 2, 1, 1, 13).setBackground(bg);
  }

  // Highlight kolom awal (C-G) hijau muda, akhir (H-L) biru muda
  sheet.getRange(2, 3, rowCount, 5).setBackground('#d9ead3');
  sheet.getRange(2, 8, rowCount, 5).setBackground('#cfe2f3');
  sheet.getRange(2, 13, rowCount, 1).setBackground('#fff2cc');

  dataRange.setVerticalAlignment('middle');
  sheet.getRange(2, 3, rowCount, 11).setHorizontalAlignment('center');
}

// ---------- API: BACA DATA ----------

function getShiftData(sheetName, shift) {
  const sheet = getSheetByName(sheetName);
  if (!sheet) return { error: 'Sheet tidak ditemukan: ' + sheetName };

  const data = sheet.getDataRange().getValues();
  const result = [];

  // shift 'awal' → kolom C(2),D(3),E(4),F(5),G(6)
  // shift 'akhir' → kolom H(7),I(8),J(9),K(10),L(11)
  const offset = shift === 'awal' ? 2 : 7;

  for (let r = 1; r < data.length; r++) {
    const row = data[r];
    result.push({
      row: r + 1, // 1-based spreadsheet row
      barcode: String(row[0]),
      nama: row[1],
      grocery:   row[offset]     !== '' ? row[offset]     : 0,
      gudang:    row[offset + 1] !== '' ? row[offset + 1] : 0,
      produkBaru:row[offset + 2] !== '' ? row[offset + 2] : 0,
      total:     row[offset + 3] !== '' ? row[offset + 3] : 0,
      onHand:    row[offset + 4] !== '' ? row[offset + 4] : 0,
    });
  }
  return { data: result };
}

// ---------- API: SIMPAN DATA (OPTIMIZED BULK WRITE) ----------

function saveShiftData(sheetName, shift, rowData) {
  try {
    const sheet = getSheetByName(sheetName);
    if (!sheet) return { error: 'Sheet tidak ditemukan: ' + sheetName };

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return { error: 'Sheet kosong' };

    // Ambil data dan formula dalam satu panggilan (efisiensi tinggi)
    const range = sheet.getRange(2, 1, lastRow - 1, 13);
    const values = range.getValues();
    const formulas = range.getFormulas();

    // Map data baru berdasarkan index baris (1-based)
    const rowMap = {};
    rowData.forEach(item => {
      rowMap[item.row] = item;
    });

    const startColIdx = shift === 'awal' ? 2 : 7; // C (2) atau H (7)

    for (let i = 0; i < values.length; i++) {
      const sheetRow = i + 2;
      const newItem = rowMap[sheetRow];
      
      if (newItem) {
        // Update data di memori
        values[i][startColIdx]     = (newItem.grocery !== '' && newItem.grocery !== null) ? Number(newItem.grocery) : '';
        values[i][startColIdx + 1] = (newItem.gudang !== '' && newItem.gudang !== null) ? Number(newItem.gudang) : '';
        values[i][startColIdx + 2] = (newItem.produkBaru !== '' && newItem.produkBaru !== null) ? Number(newItem.produkBaru) : '';
        // startColIdx+3 (total) dilewati agar formula tidak terhapus
        values[i][startColIdx + 4] = (newItem.onHand !== '' && newItem.onHand !== null) ? Number(newItem.onHand) : '';
      }

      // Pertahankan formula spreadsheet asli untuk kolom formula (F, K, M)
      for (let j = 0; j < 13; j++) {
        if (formulas[i][j] !== '') {
          values[i][j] = formulas[i][j];
        }
      }
    }

    // Tulis kembali data yang sudah di-update secara masal (bulk write)
    range.setValues(values);
    SpreadsheetApp.flush();
    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- API: DAFTAR SHEET ----------

function getSheetList() {
  const ss     = getSpreadsheet();
  const sheets = ss.getSheets()
    .map(s => s.getName())
    .filter(n => n !== CONFIG_SHEET && !n.startsWith('_'));
  return { sheets };
}

// ---------- API: TAMBAH PRODUK ----------

function addProduct(barcode, nama) {
  try {
    const ss  = getSpreadsheet();
    let cfg   = ss.getSheetByName(CONFIG_SHEET);
    if (!cfg) {
      getProductList(); // init config
      cfg = ss.getSheetByName(CONFIG_SHEET);
    }
    const lastRow = cfg.getLastRow();
    cfg.getRange(lastRow + 1, 1, 1, 2).setValues([[barcode, nama]]);

    // Tambah ke semua sheet yang ada
    const sheetList = getSheetList().sheets;
    sheetList.forEach(sheetName => {
      const sheet  = ss.getSheetByName(sheetName);
      const newRow = sheet.getLastRow() + 1;
      sheet.getRange(newRow, 1, 1, 13).setValues([[
        barcode, nama,
        '', '', '', `=IF(C${newRow}="","",C${newRow}+D${newRow}+E${newRow})`, '',
        '', '', '', `=IF(H${newRow}="","",H${newRow}+I${newRow}+J${newRow})`, '',
        `=IF(F${newRow}="","",IF(K${newRow}="",F${newRow},F${newRow}-K${newRow}))`
      ]]);
      sheet.getRange(newRow, 3, 1, 5).setBackground('#d9ead3');
      sheet.getRange(newRow, 8, 1, 5).setBackground('#cfe2f3');
      sheet.getRange(newRow, 13, 1, 1).setBackground('#fff2cc');
    });

    return { success: true };
  } catch (e) {
    return { error: e.message };
  }
}

// ---------- API: INFO HARI INI ----------

function getTodayInfo() {
  const today     = new Date();
  const sheetName = ensureTodaySheet();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  return {
    today:     sheetName,
    yesterday: formatSheetDate(yesterday),
    date:      today.toISOString(),
  };
}

// ---------- TRIGGER HARIAN (Time-driven) ----------
// Daftarkan trigger ini di Apps Script Triggers: setiap hari jam 07:00
function dailySheetCreate() {
  ensureTodaySheet();
}
