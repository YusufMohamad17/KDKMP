# 📋 PANDUAN SETUP STOK OPNAME KDKMP KELUTAN
## Google Apps Script + Cloudflare Pages + GitHub

Dokumen ini berisi panduan untuk menyiapkan sistem Stok Opname digital yang baru, yang memisahkan bagian backend (Google Apps Script & Google Sheets) dengan bagian frontend (Website di Cloudflare Pages).

---

## 📦 STRUKTUR FILE PROYEK

| File | Keterangan | Lokasi |
|------|-----------|--------|
| `Code.gs` | Backend API logic (Google Apps Script) | Google Sheets Editor |
| `index.html` | Kerangka halaman utama (HTML5) | Web Server / Cloudflare |
| `style.css` | Desain tema, layout dashboard & responsif | Web Server / Cloudflare |
| `app.js` | Logika interaksi, sinkronisasi API & verifikasi | Web Server / Cloudflare |

---

## 🚀 CARA SETUP (Langkah demi Langkah)

### LANGKAH 1 — Buat Google Spreadsheet
1. Buka [Google Sheets](https://sheets.google.com).
2. Klik **+ Spreadsheet Baru** (kosong).
3. Beri nama spreadsheet Anda, misalnya: `Stok Opname KDKMP Kelutan`.
4. Biarkan tab spreadsheet ini terbuka.

---

### LANGKAH 2 — Buka Google Apps Script
1. Di dalam spreadsheet Anda, klik menu **Ekstensi → Apps Script**.
2. Tab baru Google Apps Script akan terbuka di browser Anda.

---

### LANGKAH 3 — Pasang Kode Backend (`Code.gs`)
1. Di editor Apps Script, tab **Code.gs** sudah ada secara default.
2. Hapus seluruh kode bawaan yang ada di editor tersebut.
3. Buka file `Code.gs` dari proyek ini, lalu **salin dan tempel (copy-paste)** seluruh isinya ke editor Apps Script.
4. Klik ikon 💾 **Simpan project** (atau tekan `Ctrl+S`).

---

### LANGKAH 4 — Deploy Backend sebagai Web App
Agar aplikasi web di luar Google (Cloudflare Pages) bisa membaca dan menulis data ke spreadsheet:
1. Klik tombol **Deploy** (kanan atas) → pilih **New deployment**.
2. Klik ikon ⚙️ (gear) di samping "Select type" → pilih **Web app**.
3. Atur konfigurasi sebagai berikut:
   - **Description**: `Stok Opname API v2`
   - **Execute as**: `Me (email-anda@gmail.com)` *(Sangat penting agar script memiliki akses menulis ke spreadsheet Anda)*
   - **Who has access**: `Anyone` *(Penting agar aplikasi frontend bisa memanggil API)*
4. Klik tombol **Deploy**.
5. Klik **Review permissions**, pilih akun Google Anda, klik **Advanced**, lalu klik **Go to ... (unsafe)** dan klik **Allow** untuk memberikan otorisasi akses.
6. **SALIN URL Web App** yang ditampilkan (URL ini akan berformat `https://script.google.com/macros/s/.../exec`). Simpan URL ini sementara di notepad.

---

### LANGKAH 5 — Setup Trigger Harian (Auto-Create Sheet)
Agar sheet baru otomatis dibuat setiap pagi sebelum shift dimulai:
1. Di panel kiri Apps Script, klik ikon jam ⏰ (**Pemicu / Triggers**).
2. Klik tombol **+ Tambahkan Pemicu (+ Add Trigger)** di kanan bawah.
3. Konfigurasikan pemicu sebagai berikut:
   - **Pilih fungsi yang akan dijalankan**: `dailySheetCreate`
   - **Pilih penyebaran yang akan dijalankan**: `Head`
   - **Pilih sumber acara**: `Berdasarkan waktu (Time-driven)`
   - **Pilih jenis pemicu berbasis waktu**: `Pemicu jam harian (Day timer)`
   - **Pilih waktu**: `Jam 07.00 hingga 08.00` (atau sesuaikan dengan jam pergantian shift pagi)
4. Klik **Simpan**.

---

### LANGKAH 6 — Upload Kode Frontend ke GitHub
Untuk menghosting web app di Cloudflare Pages secara gratis, disarankan untuk mengunggahnya ke repositori GitHub:
1. Buka [GitHub](https://github.com) dan buat repositori baru (misal: `stok-opname-kdkmp`).
2. Upload berkas-berkas berikut ke dalam repositori tersebut:
   - `index.html`
   - `style.css`
   - `app.js`
3. Komit dan push berkas-berkas tersebut ke branch `main`.

---

### LANGKAH 7 — Deploy ke Cloudflare Pages
1. Masuk ke dashboard [Cloudflare](https://dash.cloudflare.com) (buat akun jika belum punya).
2. Masuk ke menu **Workers & Pages** → klik **Create application** → pilih tab **Pages**.
3. Klik **Connect to Git** dan hubungkan dengan akun GitHub Anda.
4. Pilih repositori `stok-opname-kdkmp` yang telah Anda buat.
5. Klik **Begin setup**.
6. Pada bagian **Build settings**, biarkan semua default kosong (karena ini adalah situs HTML/JS statis murni tanpa build step).
7. Klik **Save and Deploy**.
8. Tunggu hingga proses selesai, Cloudflare akan memberikan Anda sebuah URL gratis (misal: `https://stok-opname-kdkmp.pages.dev`).

---

### LANGKAH 8 — Hubungkan Frontend dengan Backend API
1. Buka URL Cloudflare Pages Anda di browser (atau buka `index.html` langsung secara lokal untuk uji coba).
2. Anda akan otomatis diarahkan ke halaman **Pengaturan** karena API belum terhubung.
3. Tempelkan **Web App URL** yang telah Anda salin pada **LANGKAH 4** ke kolom input yang disediakan.
4. Klik **💾 Simpan Pengaturan**.
5. Klik **⚡ Tes Koneksi** untuk memastikan integrasi berjalan lancar. Status koneksi di pojok kiri bawah akan berubah menjadi **API Terhubung** (Hijau).
6. Selesai! Sekarang Anda dapat mengelola stok opname dari dashboard modern.

---

## 🛡️ FITUR VERIFIKASI UPLOAD SPREADSHEET

Sistem ini dilengkapi dengan tombol khusus **"Verifikasi Upload Spreadsheet"** di halaman **Input Stok**:

1. Setelah Anda menginput data dan mengklik **Simpan ke Sheets**, Anda dapat memverifikasi integritas data di spreadsheet.
2. Klik tombol **🛡️ Verifikasi Upload Spreadsheet**.
3. Aplikasi akan menghubungi Google Sheets secara real-time dan membandingkan data sel demi sel dengan data yang ditampilkan di layar input Anda.
4. **Hasil Verifikasi Cocok (Match):** Jika semua data sama persis, aplikasi menampilkan pesan sukses berwarna hijau menandakan data Anda terverifikasi 100% aman di Google Sheets.
5. **Hasil Verifikasi Tidak Cocok (Mismatch):** Jika ada perbedaan nilai (misalnya kegagalan jaringan saat upload atau ada orang lain yang mengedit sheet), aplikasi akan menyorot baris produk yang bermasalah dan menampilkan tabel perbandingannya (Nilai di Layar vs Nilai di Spreadsheet) sehingga Anda bisa melakukan simpan ulang.

---

## ⚡ OPTIMASI PERFORMA (Bebas Error/Timeout)

> [!TIP]
> Pada versi sebelumnya, penyimpanan data dilakukan per baris secara berulang-ulang (`setValue` berulang kali), yang sering menyebabkan error *Time Out* atau kegagalan simpan jika produk terlalu banyak. 
> 
> Pada versi baru ini, backend `Code.gs` telah dioptimalkan menggunakan **Bulk Saving**. Data dibaca ke dalam memori server Google, diperbarui sekaligus, lalu ditulis kembali menggunakan satu pemanggilan `setValues()`. Ini membuat proses penyimpanan menjadi **100x lebih cepat** dan menihilkan risiko kegagalan upload.
