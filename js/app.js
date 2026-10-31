'use strict';

/* ============================================================
   WA HD – Status Quality
   Optimasi foto & video untuk Status WhatsApp.
   Semua diproses lokal di perangkat (tanpa server).
   ============================================================ */

/* ---------------- Util ---------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const evenDim = (n) => Math.max(2, n - (n % 2));

function fmtBytes(b) {
  if (!Number.isFinite(b)) return '-';
  if (b < 1024) return b + ' B';
  if (b < 1048576) return (b / 1024).toFixed(0) + ' KB';
  return (b / 1048576).toFixed(2) + ' MB';
}

function baseName(name) {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
}

let toastTimer = null;
function toast(msg, type = 'ok') {
  els.toast.textContent = msg;
  els.toast.className = 'toast show ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { els.toast.className = 'toast'; }, 3500);
}

/* Beri kesempatan UI menggambar sebelum kerja berat dimulai */
const nextFrame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));

const supportsCanvasFilter = (() => {
  try { return typeof document.createElement('canvas').getContext('2d').filter === 'string'; }
  catch (e) { return false; }
})();

/* ---------------- State & referensi elemen ---------------- */
const state = {
  file: null,
  kind: null,          // 'photo' | 'video'
  srcURL: null,
  img: null, imgW: 0, imgH: 0,
  video: null,
  outBlob: null, outURL: null, outName: '',
  busy: false,
  cancel: false,
  audioCtx: null,
};

const els = {};
['installBtn', 'screenHome', 'screenEditor', 'dropzone', 'btnPickPhoto', 'btnPickVideo', 'btnCamera',
 'inputAny', 'inputPhoto', 'inputVideo', 'inputCamera', 'btnBack', 'kindChip', 'fileName',
 'photoPreview', 'photoBefore', 'ba', 'baBefore', 'baAfter', 'baHandle', 'baRange',
 'videoPreview', 'vidBefore', 'vidAfter', 'vidToggle', 'optFormat', 'formatHint',
 'optPhoto', 'sRange', 'sVal', 'qRange', 'qVal', 'optVideo', 'optBitrate',
 'mediaInfo', 'btnProcess', 'btnProcessLabel', 'btnCancel', 'progressWrap', 'progressBar', 'progressText',
 'resultPanel', 'statSize', 'statRes', 'statDur', 'statDurWrap', 'btnSave', 'btnRedo',
 'toast', 'canvas', 'year'
].forEach(id => { els[id] = document.getElementById(id); });

/* ---------------- Target resolusi ---------------- */
const PHOTO_TW = 1080, PHOTO_TH = 1920; // target foto status WA
const VIDEO_TW = 720,  VIDEO_TH = 1280; // target video status WA

/* Aturan: TIDAK pernah menaik-skala (upscale) agar hasil tetap tajam.
   Jika sumber lebih kecil dari 1080×1920, kanvas memakai ukuran sumber
   yang dipotong di tengah ke rasio 9:16. */
function computePhotoTarget(sw, sh, format) {
  if (format === 'original') {
    const s = Math.min(1, PHOTO_TW / Math.max(sw, sh));
    return { w: Math.max(1, Math.round(sw * s)), h: Math.max(1, Math.round(sh * s)), upscaled: false };
  }
  const coverScale = Math.max(PHOTO_TW / sw, PHOTO_TH / sh);
  const scale = Math.min(coverScale, 1); // jangan upscale
  let w = Math.min(Math.round(sw * scale), PHOTO_TW);
  let h = Math.min(Math.round(sh * scale), PHOTO_TH);
  const ta = PHOTO_TW / PHOTO_TH;
  if (w / h > ta) w = Math.round(h * ta); else h = Math.round(w / ta);
  return { w: Math.max(1, w), h: Math.max(1, h), upscaled: coverScale > 1 };
}

function computeVideoTarget(vw, vh, format) {
  if (format === 'original') {
    const s = Math.min(1, VIDEO_TW / Math.max(vw, vh));
    return { w: evenDim(Math.round(vw * s)), h: evenDim(Math.round(vh * s)) };
  }
  const coverScale = Math.max(VIDEO_TW / vw, VIDEO_TH / vh);
  const scale = Math.min(coverScale, 1);
  let w = Math.min(Math.round(vw * scale), VIDEO_TW);
  let h = Math.min(Math.round(vh * scale), VIDEO_TH);
  const ta = VIDEO_TW / VIDEO_TH;
  if (w / h > ta) w = Math.round(h * ta); else h = Math.round(w / ta);
  return { w: evenDim(w), h: evenDim(h) };
}

/* ---------------- Menggambar di kanvas ---------------- */
function drawCover(ctx, src, w, h, sw, sh, extra = 1) {
  const s = Math.max(w / sw, h / sh) * extra;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function drawFit(ctx, src, w, h, sw, sh, fill = 1) {
  const s = Math.min(w / sw, h / sh) * fill;
  const dw = sw * s, dh = sh * s;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/* Unsharp mask sederhana (kernel 3×3 berbentuk +) */
function sharpenCanvas(ctx, w, h, amount) {
  if (amount <= 0 || w < 3 || h < 3) return;
  const id = ctx.getImageData(0, 0, w, h);
  const src = id.data;
  const out = new Uint8ClampedArray(src);
  const stride = w * 4;
  for (let y = 1; y < h - 1; y++) {
    let i = (y * w + 1) * 4;
    for (let x = 1; x < w - 1; x++, i += 4) {
      for (let c = 0; c < 3; c++) {
        out[i + c] = clamp(
          src[i + c] * (1 + 4 * amount) -
          amount * (src[i - 4 + c] + src[i + 4 + c] + src[i - stride + c] + src[i + stride + c]),
          0, 255
        );
      }
    }
  }
  id.data.set(out);
  ctx.putImageData(id, 0, 0);
}

/* ---------------- Proses FOTO ---------------- */
async function processPhoto() {
  const src = state.img, sw = state.imgW, sh = state.imgH;
  const format = getFormat();
  const q = clamp(+els.qRange.value, 70, 100) / 100;
  const amount = (+els.sRange.value / 100) * 0.8;

  const t = computePhotoTarget(sw, sh, format);
  const canvas = els.canvas;
  canvas.width = t.w; canvas.height = t.h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  if (format === 'blur') {
    // Latar: versi blur dari foto itu sendiri
    if (supportsCanvasFilter) {
      ctx.save();
      ctx.filter = 'blur(' + Math.max(8, Math.round(t.h * 0.018)) + 'px)';
      drawCover(ctx, src, t.w, t.h, sw, sh, 1.18);
      ctx.restore();
    } else {
      drawCover(ctx, src, t.w, t.h, sw, sh, 1.05);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, 0, t.w, t.h);
    drawFit(ctx, src, t.w, t.h, sw, sh, 0.92);
  } else {
    // 'full' maupun 'original': kanvas sudah proporsional dengan sumber
    drawCover(ctx, src, t.w, t.h, sw, sh, 1);
  }

  sharpenCanvas(ctx, t.w, t.h, amount);

  const blob = await new Promise((resolve, reject) =>
    canvas.toBlob(b => b ? resolve(b) : reject(new Error('Gagal membuat gambar')), 'image/jpeg', q)
  );
  setOut(blob, baseName(state.file.name) + '_WAHD.jpg');
  return { w: t.w, h: t.h, upscaled: t.upscaled };
}

/* ---------------- Proses VIDEO ---------------- */
function pickVideoMime() {
  if (!window.MediaRecorder) return null;
  const list = [
    'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
    'video/mp4',
    'video/webm;codecs="h264,opus"',
    'video/webm;codecs="vp9,opus"',
    'video/webm'
  ];
  for (const m of list) {
    try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) { /* lanjut */ }
  }
  return '';
}

/* Audio video diarahkan ke graph AudioContext agar ikut terekam.
   Hanya boleh sekali per elemen video — hasilnya di-cache. */
function getAudioDest(video) {
  if (video.__audioDest) return video.__audioDest;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  try {
    if (!state.audioCtx || state.audioCtx.state === 'closed') state.audioCtx = new AC();
    if (state.audioCtx.state === 'suspended' && state.audioCtx.resume) state.audioCtx.resume();
    const srcNode = state.audioCtx.createMediaElementSource(video);
    const dest = state.audioCtx.createMediaStreamDestination();
    srcNode.connect(dest);
    video.__audioDest = dest;
    return dest;
  } catch (e) {
    console.warn('Hook audio gagal, rekam video saja:', e);
    return null;
  }
}

function renderVideoFrame(ctx, format, v, vw, vh, w, h) {
  if (format === 'blur') {
    if (supportsCanvasFilter) {
      ctx.save();
      ctx.filter = 'blur(' + Math.max(6, Math.round(h * 0.02)) + 'px)';
      drawCover(ctx, v, w, h, vw, vh, 1.15);
      ctx.restore();
    } else {
      drawCover(ctx, v, w, h, vw, vh, 1.1);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, w, h);
    drawFit(ctx, v, w, h, vw, vh, 0.94);
  } else if (format === 'original') {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);
    drawFit(ctx, v, w, h, vw, vh, 1);
  } else {
    drawCover(ctx, v, w, h, vw, vh, 1);
  }
}

async function processVideo(onProgress) {
  const v = state.video;
  const vw = v.videoWidth, vh = v.videoHeight;
  const format = getFormat();
  let end = v.duration;
  if (!isFinite(end) || end <= 0) end = 600; // durasi metadata hilang — batasi 10 menit
  const t = computeVideoTarget(vw, vh, format);

  const mime = pickVideoMime();
  if (mime === null) throw new Error('Browser ini tidak mendukung perekaman video (MediaRecorder).');

  const canvas = els.canvas;
  canvas.width = t.w; canvas.height = t.h;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  let stream = null, rec = null, wakeLock = null;
  try {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (e) { /* opsional */ }

    stream = canvas.captureStream(30);
    const dest = getAudioDest(v);
    const hasAudio = !!dest;
    if (dest) dest.stream.getAudioTracks().forEach(tr => stream.addTrack(tr));

    const opts = { videoBitsPerSecond: getBitrate() };
    if (mime) opts.mimeType = mime;
    rec = new MediaRecorder(stream, opts);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(resolve => { rec.onstop = resolve; });

    v.pause();
    try { v.currentTime = 0; } catch (e) { /* ok */ }
    v.muted = !hasAudio; // jika audio diarahkan ke graph, elemen tidak boleh di-mute

    renderVideoFrame(ctx, format, v, vw, vh, t.w, t.h); // frame pertama
    rec.start(250);
    await v.play().catch(e => { throw new Error('Tidak dapat memutar video untuk diproses: ' + e.message); });

    await new Promise(resolve => {
      const loop = () => {
        if (state.cancel || v.ended || v.currentTime >= end - 1 / 60) { resolve(); return; }
        renderVideoFrame(ctx, format, v, vw, vh, t.w, t.h);
        onProgress(clamp(v.currentTime / end, 0, 1));
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    });

    v.pause();
    try { if (rec.state !== 'inactive') rec.stop(); } catch (e) { /* ok */ }
    await stopped;

    if (state.cancel) return null;

    const type = (mime || 'video/webm').split(';')[0];
    const ext = type === 'video/mp4' ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });
    setOut(blob, baseName(state.file.name) + '_WAHD.' + ext);
    return { w: t.w, h: t.h, dur: Math.max(0.1, v.currentTime), ext };
  } finally {
    try { v.pause(); } catch (e) { /* ok */ }
    if (stream) stream.getTracks().forEach(tr => tr.stop());
    try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) { /* ok */ }
    try { if (wakeLock) wakeLock.release(); } catch (e) { /* ok */ }
  }
}

/* ---------------- Muat file ---------------- */
function decodeImage(file, url) {
  if (window.createImageBitmap) {
    return createImageBitmap(file).catch(() => decodeViaImg(url));
  }
  return decodeViaImg(url);
}
function decodeViaImg(url) {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onload = () => resolve(im);
    im.onerror = () => reject(new Error('Gambar tidak dapat dibaca (mis. format HEIC tidak didukung browser ini).'));
    im.src = url;
  });
}

function loadVideo() {
  return new Promise((resolve, reject) => {
    const v = document.createElement('video');
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.preload = 'auto';
    const to = setTimeout(() => reject(new Error('Waktu muat video habis')), 30000);
    v.onloadedmetadata = async () => {
      clearTimeout(to);
      if (!v.videoWidth) { reject(new Error('Video tidak dapat dibaca.')); return; }
      // WebM hasil rekaman sering tidak menyimpan durasi di metadata —
      // paksa browser menghitungnya dengan seek ke titik jauh.
      if (!isFinite(v.duration)) {
        try { v.currentTime = 1e7; } catch (e) { /* ok */ }
        await new Promise((res) => {
          const h = () => {
            if (isFinite(v.duration)) {
              v.removeEventListener('durationchange', h);
              res();
            }
          };
          v.addEventListener('durationchange', h);
          setTimeout(res, 2500); // jaring pengaman
        });
        try { v.currentTime = 0; } catch (e) { /* ok */ }
      }
      state.video = v;
      resolve();
    };
    v.onerror = () => {
      clearTimeout(to);
      reject(new Error('Video tidak dapat dibaca. Format mungkin tidak didukung browser (mis. HEVC/AVI).'));
    };
    v.src = state.srcURL;
  });
}

async function handleFile(file) {
  if (state.busy) { toast('Sedang memproses, tunggu sebentar', 'warn'); return; }
  try {
    resetMedia(false);
    state.file = file;
    state.srcURL = URL.createObjectURL(file);
    if (file.type.startsWith('image/')) {
      state.kind = 'photo';
      state.img = await decodeImage(file, state.srcURL);
      state.imgW = state.img.width || state.img.naturalWidth;
      state.imgH = state.img.height || state.img.naturalHeight;
      showEditor();
    } else if (file.type.startsWith('video/')) {
      state.kind = 'video';
      await loadVideo();
      showEditor();
    } else {
      throw new Error('File tidak dikenali. Pilih foto (JPG/PNG/WebP) atau video (MP4/WebM).');
    }
  } catch (e) {
    console.error(e);
    resetMedia(true);
    toast(e.message || 'Gagal memuat file', 'err');
  }
}

/* ---------------- Tampilan ---------------- */
function getFormat() {
  return $('#optFormat .seg-btn.active').dataset.format;
}
function getBitrate() {
  return +$('#optBitrate .seg-btn.active').dataset.br * 1000000;
}

function setOut(blob, name) {
  if (state.outURL) URL.revokeObjectURL(state.outURL);
  state.outBlob = blob;
  state.outName = name;
  state.outURL = URL.createObjectURL(blob);
}

function showEditor() {
  els.screenHome.hidden = true;
  els.screenEditor.hidden = false;
  els.resultPanel.hidden = true;
  els.fileName.textContent = state.file.name;
  window.scrollTo(0, 0);

  if (state.kind === 'photo') {
    els.kindChip.textContent = 'Foto HD';
    els.optPhoto.hidden = false;
    els.optVideo.hidden = true;
    els.photoPreview.hidden = false;
    els.videoPreview.hidden = true;
    els.ba.hidden = true;
    els.photoBefore.hidden = false;
    els.photoBefore.src = state.srcURL;
    els.mediaInfo.textContent = 'Sumber: ' + state.imgW + '×' + state.imgH + ' px · ' + fmtBytes(state.file.size);
  } else {
    els.kindChip.textContent = 'Video HD';
    els.optPhoto.hidden = true;
    els.optVideo.hidden = false;
    els.photoPreview.hidden = true;
    els.videoPreview.hidden = false;
    els.vidToggle.hidden = true;
    els.vidAfter.removeAttribute('src');
    els.vidBefore.src = state.srcURL;
    setVidPreview('before');
    const d = state.video.duration;
    const dTxt = isFinite(d) ? d.toFixed(1) + ' dtk' : 'durasi tak diketahui';
    let info = 'Sumber: ' + state.video.videoWidth + '×' + state.video.videoHeight +
      ' · ' + fmtBytes(state.file.size) + ' · ' + dTxt;
    if (isFinite(d) && d > 60) {
      info += ' · ⚠️ proses berjalan real-time ±' + Math.ceil(d) + ' dtk, jangan tutup layar';
    }
    els.mediaInfo.textContent = info;
  }
  updateFormatHint();
}

function updateFormatHint() {
  if (!state.kind) return;
  const f = getFormat();
  let txt = '';
  if (state.kind === 'photo') {
    const t = computePhotoTarget(state.imgW, state.imgH, f);
    txt = 'Hasil: ' + t.w + '×' + t.h + ' px';
    if (f === 'blur') txt += ' · latar blur otomatis';
    if (f === 'original') txt += ' · tanpa potongan, maks 1080 px';
    if (f !== 'original' && t.upscaled) txt += ' · ⚠️ coba "9:16 + Latar Blur" agar tak terpotong';
  } else {
    const v = state.video;
    const t = computeVideoTarget(v.videoWidth, v.videoHeight, f);
    txt = 'Hasil: ' + t.w + '×' + t.h + ' px';
    if (f === 'blur') txt += ' · latar blur otomatis';
    txt += f === 'original' ? ' · tanpa potongan, maks 720 px' : ' · dipotong 9:16';
  }
  els.formatHint.textContent = txt;
}

function setVidPreview(which) {
  els.vidBefore.hidden = which !== 'before';
  els.vidAfter.hidden = which !== 'after';
  if (which === 'after') els.vidBefore.pause(); else els.vidAfter.pause();
  $$('#vidToggle .seg-btn').forEach(b => b.classList.toggle('active', b.dataset.vp === which));
}

function showPhotoResult(res) {
  els.photoBefore.hidden = true;
  els.ba.hidden = false;
  els.baBefore.src = state.srcURL;
  els.baAfter.src = state.outURL;
  els.baRange.value = 50;
  els.baAfter.style.clipPath = 'inset(0 0 0 50%)';
  els.baHandle.style.left = '50%';

  els.statSize.textContent = fmtBytes(state.file.size) + ' → ' + fmtBytes(state.outBlob.size);
  els.statRes.textContent = res.w + '×' + res.h;
  els.statDurWrap.hidden = true;
  els.resultPanel.hidden = false;
  els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  if (res.upscaled) toast('Foto lebih kecil dari 1080×1920 — hasil tidak diperbesar agar tetap tajam.', 'warn');
}

function showVideoResult(res) {
  els.statSize.textContent = fmtBytes(state.file.size) + ' → ' + fmtBytes(state.outBlob.size);
  els.statRes.textContent = res.w + '×' + res.h;
  els.statDurWrap.hidden = false;
  els.statDur.textContent = res.dur.toFixed(1) + ' dtk';
  els.vidAfter.src = state.outURL;
  els.vidToggle.hidden = false;
  setVidPreview('after');
  els.resultPanel.hidden = false;
  els.resultPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  if (res.ext === 'webm') toast('Browser ini merekam WebM (bukan MP4). File tetap bisa dibagikan.', 'warn');
}

function resetResult() {
  els.resultPanel.hidden = true;
  if (state.kind === 'photo') {
    els.ba.hidden = true;
    els.photoBefore.hidden = false;
  } else {
    els.vidToggle.hidden = true;
    setVidPreview('before');
    els.vidAfter.removeAttribute('src');
  }
  if (state.outURL) {
    URL.revokeObjectURL(state.outURL);
    state.outURL = null; state.outBlob = null;
  }
}

function resetMedia(goHome) {
  state.cancel = true;
  if (state.video) {
    try { state.video.pause(); } catch (e) { /* ok */ }
    state.video.removeAttribute('src');
    try { state.video.load(); } catch (e) { /* ok */ }
    state.video = null;
  }
  state.img = null;
  state.file = null;
  state.kind = null;
  if (state.srcURL) { URL.revokeObjectURL(state.srcURL); state.srcURL = null; }
  if (state.outURL) { URL.revokeObjectURL(state.outURL); state.outURL = null; state.outBlob = null; }
  els.vidBefore.removeAttribute('src');
  els.vidAfter.removeAttribute('src');
  els.photoBefore.removeAttribute('src');
  els.baAfter.removeAttribute('src');
  els.progressWrap.hidden = true;
  if (goHome) {
    els.screenEditor.hidden = true;
    els.screenHome.hidden = false;
    window.scrollTo(0, 0);
  }
}

function setBusy(b) {
  [els.btnProcess, els.btnBack, els.btnSave, els.btnRedo].forEach(x => x.disabled = b);
  $$('#optFormat .seg-btn, #optBitrate .seg-btn').forEach(x => x.disabled = b);
  [els.qRange, els.sRange].forEach(x => x.disabled = b);
  els.btnProcessLabel.textContent = b ? 'Memproses…' : 'Optimasi Sekarang';
  els.btnCancel.hidden = !(b && state.kind === 'video');
}

function setProgress(p) {
  const pct = Math.round(p * 100);
  els.progressBar.style.width = pct + '%';
  els.progressText.textContent = pct + '% — biarkan layar menyala…';
}

/* ---------------- Aksi utama ---------------- */
async function onProcess() {
  if (!state.file) return;
  if (state.busy) { toast('Sedang memproses…', 'warn'); return; }
  state.busy = true;
  state.cancel = false; // reset penanda batal dari sesi media sebelumnya
  try {
    setBusy(true);
    if (state.kind === 'photo') {
      await nextFrame();
      const res = await processPhoto();
      showPhotoResult(res);
    } else {
      els.progressWrap.hidden = false;
      setProgress(0);
      const res = await processVideo(setProgress);
      els.progressWrap.hidden = true;
      if (!res) toast('Proses dibatalkan', 'warn');
      else showVideoResult(res);
    }
  } catch (e) {
    console.error(e);
    els.progressWrap.hidden = true;
    toast(e.message || 'Terjadi kesalahan saat memproses', 'err');
  } finally {
    state.busy = false;
    state.cancel = false;
    setBusy(false);
  }
}

function saveOut() {
  if (!state.outBlob) return;
  const a = document.createElement('a');
  a.href = state.outURL;
  a.download = state.outName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('Disimpan: ' + state.outName);
}

/* ---------------- Inisialisasi ---------------- */
function init() {
  els.year.textContent = new Date().getFullYear();

  // Pemilih file
  els.btnPickPhoto.addEventListener('click', () => els.inputPhoto.click());
  els.btnPickVideo.addEventListener('click', () => els.inputVideo.click());
  els.btnCamera.addEventListener('click', () => els.inputCamera.click());
  els.dropzone.addEventListener('click', () => els.inputAny.click());
  els.dropzone.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); els.inputAny.click(); }
  });
  [els.inputAny, els.inputPhoto, els.inputVideo, els.inputCamera].forEach(inp => {
    inp.addEventListener('change', () => {
      const f = inp.files && inp.files[0];
      inp.value = '';
      if (f) handleFile(f);
    });
  });

  // Drag & drop
  ['dragover', 'drop'].forEach(ev => window.addEventListener(ev, (e) => {
    if (!els.dropzone.contains(e.target)) e.preventDefault();
  }));
  els.dropzone.addEventListener('dragover', (e) => { e.preventDefault(); els.dropzone.classList.add('drag'); });
  els.dropzone.addEventListener('dragleave', () => els.dropzone.classList.remove('drag'));
  els.dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    els.dropzone.classList.remove('drag');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  // Tombol segmen (format & bitrate & preview video)
  $$('.seg').forEach(seg => seg.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (!btn || state.busy) return;
    $$('.seg-btn', seg).forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (seg.id === 'optFormat') updateFormatHint();
  }));

  // Slider
  els.qRange.addEventListener('input', () => { els.qVal.textContent = els.qRange.value + '%'; });
  els.sRange.addEventListener('input', () => { els.sVal.textContent = els.sRange.value + '%'; });
  els.baRange.addEventListener('input', () => {
    const v = +els.baRange.value;
    els.baAfter.style.clipPath = 'inset(0 0 0 ' + v + '%)';
    els.baHandle.style.left = v + '%';
  });

  // Toggle preview video asli/hasil
  els.vidToggle.addEventListener('click', (e) => {
    const btn = e.target.closest('.seg-btn');
    if (btn) setVidPreview(btn.dataset.vp);
  });

  // Aksi
  els.btnProcess.addEventListener('click', onProcess);
  els.btnCancel.addEventListener('click', () => { state.cancel = true; });
  els.btnBack.addEventListener('click', () => {
    if (state.busy) { toast('Tunggu proses selesai atau batalkan dulu', 'warn'); return; }
    resetMedia(true);
  });
  els.btnSave.addEventListener('click', saveOut);
  els.btnRedo.addEventListener('click', resetResult);

  // PWA: tombol install
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    window.__deferredInstall = e;
    els.installBtn.hidden = false;
  });
  els.installBtn.addEventListener('click', async () => {
    const ev = window.__deferredInstall;
    if (!ev) return;
    ev.prompt();
    try {
      const c = await ev.userChoice;
      if (c && c.outcome === 'accepted') els.installBtn.hidden = true;
    } catch (e) { /* ok */ }
    window.__deferredInstall = null;
  });

  // Service worker (offline)
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => { /* mis. file:// */ });
    });
  }
}

init();
