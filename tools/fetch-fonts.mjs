// Unduh font Plus Jakarta Sans (lisensi OFL) agar aplikasi bisa memakainya offline.
// Jalankan: node tools/fetch-fonts.mjs
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const fontsDir = path.join(root, 'fonts');
await mkdir(fontsDir, { recursive: true });

// UA modern -> Google merespons woff2; UA legacy (curl) -> truetype
const UA_WOFF2 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const UA_TTF = 'curl/8.6.0';
const FAMILY = 'Plus+Jakarta+Sans';
const WEIGHTS = [400, 500, 600, 700, 800];

async function fetchCss(ua, weights) {
  const url = `https://fonts.googleapis.com/css2?family=${FAMILY}:wght@${weights.join(';')}&display=swap`;
  const res = await fetch(url, { headers: { 'User-Agent': ua } });
  if (!res.ok) throw new Error(`Gagal mengambil CSS (${res.status})`);
  return res.text();
}

// 1) WOFF2 per weight (subset latin) untuk web
const css = await fetchCss(UA_WOFF2, WEIGHTS);
const re = /\/\* latin \*\/\s*@font-face\s*\{[^{}]*?font-weight:\s*(\d+)[^{}]*?url\((https:[^)]+?\.woff2)\)/g;
const found = new Map();
let m;
while ((m = re.exec(css)) !== null) found.set(m[1], m[2]);
if (found.size !== WEIGHTS.length) {
  throw new Error(`Subset latin tidak lengkap: ${found.size} dari ${WEIGHTS.length}`);
}
for (const [w, url] of found) {
  const res = await fetch(url, { headers: { 'User-Agent': UA_WOFF2 } });
  if (!res.ok) throw new Error(`Gagal mengunduh woff2 ${w} (${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(path.join(fontsDir, `plus-jakarta-sans-${w}.woff2`), buf);
  console.log(`woff2 ${w}: ${(buf.length / 1024).toFixed(1)} KB`);
}

// 2) TTF ExtraBold untuk ikon (GDI+ tidak mendukung woff2)
const cssTtf = await fetchCss(UA_TTF, [800]);
const mTtf = cssTtf.match(/url\((https:[^)]+?\.ttf)\)/);
if (!mTtf) throw new Error('URL TTF tidak ditemukan');
const resT = await fetch(mTtf[1]);
if (!resT.ok) throw new Error(`Gagal mengunduh TTF (${resT.status})`);
await writeFile(path.join(__dirname, 'PlusJakartaSans-ExtraBold.ttf'), Buffer.from(await resT.arrayBuffer()));
console.log('ttf 800: ok');
console.log('Selesai — font tersimpan di fonts/ dan tools/.');
