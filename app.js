'use strict';

const MAX_INSTA = 1440;
const JPEG_QUALITY = 0.95;
const SHARE_CACHE = 'square-share-target';
const SHARE_KEY = '/shared-image';

const els = {
  file: document.getElementById('file'),
  pickerLabel: document.querySelector('.picker label'),
  preview: document.getElementById('preview'),
  info: document.getElementById('info'),
  insta: document.getElementById('insta'),
  save: document.getElementById('save'),
  share: document.getElementById('share'),
  status: document.getElementById('status'),
  toast: document.getElementById('toast'),
  install: document.getElementById('install'),
  segItems: document.querySelectorAll('.seg-item'),
};

let sourceBitmap = null;
let sourceName = 'square.jpg';
let padColor = '#ffffff';

els.file.addEventListener('change', async (e) => {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  await loadImage(file);
});

// ドラッグ&ドロップ（PC）
['dragenter', 'dragover'].forEach((ev) => {
  els.pickerLabel.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    els.pickerLabel.classList.add('drag-over');
  });
});
['dragleave', 'drop'].forEach((ev) => {
  els.pickerLabel.addEventListener(ev, (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (ev === 'dragleave' && e.target !== els.pickerLabel) return;
    els.pickerLabel.classList.remove('drag-over');
  });
});
els.pickerLabel.addEventListener('drop', async (e) => {
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    setStatus('画像ファイルではありません');
    return;
  }
  await loadImage(file);
});

// ページ全体のドロップで誤ってブラウザがファイルを開かないようにガード
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => e.preventDefault());

els.insta.addEventListener('change', () => { render(); updateInfo(); });
els.save.addEventListener('click', onSave);
els.share.addEventListener('click', onShare);

els.segItems.forEach((btn) => {
  btn.addEventListener('click', () => {
    if (btn.disabled) return;
    padColor = btn.dataset.color;
    els.segItems.forEach((b) => b.setAttribute('aria-checked', b === btn ? 'true' : 'false'));
    render();
  });
});

// PWA インストールプロモート
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  els.install.hidden = false;
});
els.install.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  els.install.disabled = true;
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  els.install.disabled = false;
  els.install.hidden = true;
});
window.addEventListener('appinstalled', () => {
  els.install.hidden = true;
  deferredInstallPrompt = null;
});

// Share Target 受信: 起動時に Cache から取り出して自動ロード
window.addEventListener('load', tryLoadSharedImage);

async function tryLoadSharedImage() {
  const params = new URLSearchParams(location.search);
  if (!params.has('share')) return;
  history.replaceState(null, '', location.pathname);
  try {
    const cache = await caches.open(SHARE_CACHE);
    const response = await cache.match(SHARE_KEY);
    if (!response) return;
    const blob = await response.blob();
    const filenameHeader = response.headers.get('X-Share-Filename') || 'shared.jpg';
    const filename = decodeURIComponent(filenameHeader);
    const file = new File([blob], filename, { type: blob.type });
    await cache.delete(SHARE_KEY);
    await loadImage(file);
  } catch (e) {
    console.warn('共有画像の取得に失敗:', e);
  }
}

async function loadImage(file) {
  setStatus('読み込み中…');
  try {
    if (sourceBitmap && sourceBitmap.close) sourceBitmap.close();
    sourceBitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    sourceName = deriveOutName(file.name);
    render();
    updateInfo();
    els.save.disabled = false;
    els.share.disabled = !(navigator.canShare && navigator.share);
    els.insta.disabled = false;
    els.segItems.forEach((b) => { b.disabled = false; });
    setStatus('');
  } catch (err) {
    console.error(err);
    setStatus('画像の読み込みに失敗しました');
  }
}

function render() {
  if (!sourceBitmap) return;
  const canvas = squareCanvas(sourceBitmap, els.insta.checked, padColor);
  els.preview.innerHTML = '';
  els.preview.appendChild(canvas);
}

// square.sh 移植: 長辺=正方形・指定色パディング・中央配置・1440トグル
function squareCanvas(bitmap, insta, fill) {
  const w = bitmap.width;
  const h = bitmap.height;
  const side = Math.max(w, h);
  const outSide = (insta && side > MAX_INSTA) ? MAX_INSTA : side;
  const scale = outSide / side;

  const canvas = document.createElement('canvas');
  canvas.width = outSide;
  canvas.height = outSide;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  ctx.fillStyle = fill;
  ctx.fillRect(0, 0, outSide, outSide);

  const dx = (outSide - w * scale) / 2;
  const dy = (outSide - h * scale) / 2;
  ctx.drawImage(bitmap, dx, dy, w * scale, h * scale);

  return canvas;
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('toBlob 失敗')),
      'image/jpeg',
      JPEG_QUALITY
    );
  });
}

async function onSave() {
  if (!sourceBitmap) return;
  setStatus('生成中…');
  try {
    const canvas = squareCanvas(sourceBitmap, els.insta.checked, padColor);
    const blob = await canvasToBlob(canvas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = sourceName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('');
    toast('保存しました');
  } catch (err) {
    console.error(err);
    setStatus('保存に失敗しました');
  }
}

async function onShare() {
  if (!sourceBitmap) return;
  if (!(navigator.canShare && navigator.share)) {
    setStatus('この端末では共有非対応');
    return;
  }
  setStatus('生成中…');
  try {
    const canvas = squareCanvas(sourceBitmap, els.insta.checked, padColor);
    const blob = await canvasToBlob(canvas);
    const file = new File([blob], sourceName, { type: 'image/jpeg' });
    const data = { files: [file] };
    if (!navigator.canShare(data)) {
      setStatus('この端末ではファイル共有非対応');
      return;
    }
    await navigator.share(data);
    setStatus('');
    toast('共有しました');
  } catch (err) {
    if (err && err.name === 'AbortError') {
      setStatus('');
      return;
    }
    console.error(err);
    setStatus('共有に失敗しました');
  }
}

function deriveOutName(name) {
  const base = name.replace(/\.[^.]+$/, '');
  return `${base || 'square'}-sq.jpg`;
}

function setStatus(msg) {
  els.status.textContent = msg;
}

function updateInfo() {
  if (!sourceBitmap) {
    els.info.textContent = '';
    return;
  }
  const w = sourceBitmap.width;
  const h = sourceBitmap.height;
  const side = Math.max(w, h);
  const outSide = (els.insta.checked && side > MAX_INSTA) ? MAX_INSTA : side;
  els.info.textContent = `${w} × ${h}  →  ${outSide} × ${outSide}`;
}

let toastTimer = null;
function toast(msg, duration = 2000) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), duration);
}
