# WA HD – Status Quality 📱✨

Aplikasi web (PWA) untuk menjaga **foto & video tetap jernih** sebelum diunggah ke **Status WhatsApp**. Semua diproses **100% di perangkat** — tanpa server, tanpa upload, privat, dan bisa dipakai offline.

## ✨ Fitur

| Fitur | Keterangan |
|---|---|
| 🖼️ Foto HD | Optimasi kualitas foto agar tetap tajam (JPEG kualitas tinggi + penajaman) |
| 🎥 Video HD | Optimasi resolusi & bitrate video (H.264/MP4 bila didukung) |
| 📱 Format WhatsApp | Sesuaikan ke rasio 9:16 khas Status WA (penuh, latar blur, atau asli) |
| ✨ Anti Blur | Ketajaman otomatis untuk melawan kompresi WhatsApp |
| 👁️ Preview | Slider perbandingan sebelum/sesudah |
| 💾 Simpan ke Perangkat | Simpan hasil siap unggah ke penyimpanan perangkat |

### Cara kerjanya (singkat)
WhatsApp memampatkan Status hingga ±720p. Kuncinya: unggah media **1080×1920 (9:16)** dengan kualitas tinggi + sedikit penajaman, sehingga setelah kompresi WA hasilnya tetap terlihat tajam. Aplikasi ini melakukan tepi itu secara otomatis — dan **tidak pernah memperbesar** foto/video agar tidak malah buram.

## 🚀 Menjalankan di komputer

Aplikasi butuh server web lokal (tidak bisa dibuka langsung via `file://` karena batasan browser untuk PWA/kamera).

**Opsi 1 — Python** (sudah terpasang di komputer ini):
```bash
cd "C:\Users\panda\Downloads\Wa Status Quality"
python -m http.server 8080
```

**Opsi 2 — Skrip PowerShell** (tanpa Python):
```powershell
cd "C:\Users\panda\Downloads\Wa Status Quality"
powershell -NoProfile -ExecutionPolicy Bypass -File tools\serve.ps1 -Port 8080
```

Lalu buka **http://localhost:8080** di Chrome/Edge.

## 📲 Install di HP (jadi aplikasi)

Karena PWA butuh **HTTPS**, host dulu foldernya ke salah satu layanan gratis:
- **Netlify Drop** — buka https://app.netlify.com/drop lalu tarik seluruh folder ini
- **GitHub Pages** / **Cloudflare Pages** — upload sebagai repo/proyek

Setelah dapat alamat `https://...`:

**Android (Chrome):** buka alamatnya → menu ⋮ → *Tambahkan ke layar utama / Install app*
**Desktop (Chrome/Edge):** ikon install muncul di address bar, atau tombol **📲 Install** di dalam aplikasi
**iPhone (Safari):** tombol Bagikan → *Tambahkan ke Layar Utama*

## 🧪 Tips pemakaian

- **Foto lanskap**: pilih format **9:16 + Latar Blur** agar seluruh foto terlihat dengan latar estetik.
- **Foto kecil (< 1080 px)**: aplikasi sengaja tidak memperbesar — pakai format **Asli** atau **Latar Blur**.
- **Video panjang**: diproses penuh sesuai durasi asli secara *real-time* (video 1 menit = proses ±1 menit) — biarkan layar menyala sampai selesai, atau gunakan tombol *Batalkan*.
- **Bitrate video**: *Seimbang 8 Mbps* cukup untuk kebanyakan kasus; pakai *Maksimal 12 Mbps* untuk video detail.

## ⚠️ Keterbatasan

- Proses video memakai `MediaRecorder` browser: berjalan real-time (video 1 menit = proses ±1 menit).
- Hasil video berformat **MP4** bila browser mendukung; jika tidak, fallback **WebM** (tetap bisa dibagikan, kebanyakan HP Android modern mendukung MP4).
- Foto HEIC (iPhone) perlu dikonversi dulu oleh aplikasi Kamera/Foto iOS saat memilih file.

## 🔒 Privasi

Tidak ada data yang dikirim ke mana pun — semua pemrosesan terjadi di browser kamu. Aplikasi bekerja penuh secara offline setelah pertama kali dibuka.

## 📁 Struktur

```
├── index.html          Halaman aplikasi
├── css/style.css       Tema gelap ala WhatsApp
├── js/app.js           Logika inti (foto, video, share, PWA)
├── manifest.webmanifest  Identitas PWA
├── sw.js               Service worker (offline)
├── icons/              Ikon aplikasi (dibuat dari logo sumber oleh tools/make-icons-from-logo.ps1)
└── tools/              Skrip pembantu (ikon, font, media uji, server lokal)
```
