// Sumber tool VIP Plus: SkyBox 360. Disajikan lewat /api/tool setelah cek VIP Plus.
export default String.raw`<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>SkyBox 360 — Panorama ke 6 Sisi Roblox</title>
<style>
:root{
  --bg:#050505;--text:#fff;--muted:rgba(255,255,255,.64);--faint:rgba(255,255,255,.4);
  --g1:rgba(255,255,255,.12);--g2:rgba(255,255,255,.035);--line:rgba(255,255,255,.17);
  --rim1:rgba(255,255,255,.7);--rim2:rgba(255,255,255,.26);
  --shadow:0 24px 60px rgba(0,0,0,.55);
  --inner:inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 24px rgba(255,255,255,.035);
  --btn:#fff;--btn-ink:#000;--hl:rgba(255,255,255,.14);--blob:rgba(255,255,255,.17);--field:rgba(255,255,255,.07);
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
}
:root[data-theme="light"]{
  --bg:#ececee;--text:#0a0a0a;--muted:rgba(0,0,0,.6);--faint:rgba(0,0,0,.4);
  --g1:rgba(255,255,255,.72);--g2:rgba(255,255,255,.36);--line:rgba(255,255,255,.9);
  --rim1:#fff;--rim2:rgba(255,255,255,.7);--shadow:0 20px 50px rgba(0,0,0,.14);
  --inner:inset 0 1px 0 #fff,inset 0 0 20px rgba(255,255,255,.4);
  --btn:#0a0a0a;--btn-ink:#fff;--hl:rgba(255,255,255,.95);--blob:rgba(0,0,0,.13);--field:rgba(255,255,255,.6);
}
*{box-sizing:border-box}
[hidden]{display:none!important}
html{-webkit-text-size-adjust:100%;background:transparent}
body{
  margin:0;background:transparent;color:var(--text);font:14px/1.5 var(--sans);
  padding:max(12px,env(safe-area-inset-top)) max(12px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(12px,env(safe-area-inset-left));
}
html.autoh,html.autoh body{overflow:hidden}
main{width:100%;max-width:920px;margin:0 auto;display:grid;gap:16px}
.glass{
  position:relative;
  background:radial-gradient(260px circle at var(--mx,50%) var(--my,-30%),var(--hl),transparent 62%),linear-gradient(135deg,var(--g1),var(--g2));
  -webkit-backdrop-filter:blur(28px) saturate(170%);backdrop-filter:blur(28px) saturate(170%);
  border:1px solid var(--line);box-shadow:var(--inner),var(--shadow);
}
.card{padding:clamp(16px,3vw,24px);border-radius:26px}
.top{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.brand{display:flex;align-items:center;gap:12px;min-width:0}
.logo{display:grid;flex:none;width:46px;height:46px;place-items:center;border-radius:16px;color:var(--text);border:1px solid var(--line);background:var(--field)}
.logo svg{width:22px;height:22px}
.kicker{color:var(--faint);font:700 10px var(--mono);letter-spacing:.2em}
h1{margin:2px 0 0;font-size:clamp(22px,4.5vw,30px);letter-spacing:-.02em;line-height:1.15}
h2{margin:0;font-size:16px;font-weight:700}
.sub{max-width:680px;margin:8px 0 0;color:var(--muted);font-size:13px}
.drop{
  position:relative;display:grid;min-height:150px;place-items:center;margin-top:14px;padding:22px;
  text-align:center;border:1.5px dashed var(--faint);border-radius:22px;background:var(--field);
  cursor:pointer;transition:border-color .2s,background .2s;
}
.drop:hover,.drop.drag-over{border-color:var(--text)}
.drop input{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer}
.drop-icon{display:grid;width:46px;height:46px;place-items:center;margin:0 auto 10px;border:1px solid var(--line);border-radius:50%}
.drop-icon svg{width:20px;height:20px}
.drop-title{display:block;font-size:14px;font-weight:650}
.drop-meta{display:block;margin-top:4px;color:var(--muted);font-size:11.5px}
.controls{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:14px}
.ctrl-group{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.field-wrap{display:flex;align-items:center;gap:8px;color:var(--muted);font-size:12px}
.field-wrap label{white-space:nowrap;font-weight:600}
select,input[type="text"]{
  min-height:40px;padding:0 14px;border:1px solid var(--line);border-radius:999px;
  background:var(--field);color:var(--text);font:inherit;font-size:12.5px;outline:none;
}
select:focus,input[type="text"]:focus{border-color:var(--text)}
.btn{
  min-height:42px;padding:0 20px;border:0;border-radius:999px;background:var(--btn);color:var(--btn-ink);
  font:inherit;font-size:13px;font-weight:700;cursor:pointer;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.5),0 6px 20px rgba(0,0,0,.25);
  transition:transform .15s,opacity .15s;display:inline-flex;align-items:center;justify-content:center;gap:7px;
}
.btn:hover:not(:disabled){transform:translateY(-1px)}
.btn:disabled{opacity:.4;cursor:not-allowed}
.btn-ghost{
  min-height:38px;padding:0 15px;border:1px solid var(--line);border-radius:999px;
  background:var(--field);color:var(--text);font:inherit;font-size:12px;font-weight:600;
  cursor:pointer;display:inline-flex;align-items:center;gap:6px;
}
.btn-ghost:hover:not(:disabled){border-color:var(--text)}
.progress{height:5px;overflow:hidden;margin-top:12px;border-radius:999px;background:var(--line)}
.progress>i{display:block;width:0;height:100%;border-radius:inherit;background:var(--text);transition:width .2s}
.status{min-height:20px;margin-top:10px;color:var(--muted);font-size:12.5px}
.status.error{color:#f87171;font-weight:600}
.status.success{color:#4ade80;font-weight:600}

/* 360 Viewer */
.viewer-wrap{
  position:relative;margin-top:12px;border-radius:20px;overflow:hidden;
  border:1px solid var(--line);background:#000;aspect-ratio:16/9;max-height:440px;width:100%;
}
body.fs-mode .viewer-wrap{
  position:fixed;inset:0;z-index:999;max-height:none;aspect-ratio:auto;border-radius:0;border:0;
}
#view-canvas{width:100%;height:100%;display:block;cursor:grab;touch-action:none}
#view-canvas:active{cursor:grabbing}
.viewer-hud{
  position:absolute;left:12px;right:12px;bottom:12px;display:flex;align-items:center;justify-content:space-between;
  gap:8px;flex-wrap:wrap;pointer-events:none;
}
.viewer-pill{
  pointer-events:auto;padding:6px 12px;border-radius:999px;font-size:11.5px;font-weight:600;
  background:rgba(0,0,0,.62);color:#fff;border:1px solid rgba(255,255,255,.2);
  -webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);display:inline-flex;align-items:center;gap:6px;cursor:pointer;
}
.viewer-hint{
  pointer-events:none;padding:5px 11px;border-radius:999px;font-size:11px;
  background:rgba(0,0,0,.55);color:rgba(255,255,255,.8);border:1px solid rgba(255,255,255,.14);
}

/* 6 Faces Grid */
.card-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.faces-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media(max-width:640px){.faces-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.face-card{
  border:1px solid var(--line);border-radius:18px;background:var(--field);overflow:hidden;
  display:flex;flex-direction:column;
}
.face-canvas-wrap{position:relative;aspect-ratio:1/1;background:#09090b;border-bottom:1px solid var(--line)}
.face-canvas-wrap canvas{width:100%;height:100%;display:block}
.face-badge{
  position:absolute;top:8px;left:8px;padding:3px 9px;border-radius:999px;font:700 10.5px var(--mono);
  background:rgba(0,0,0,.68);color:#fff;border:1px solid rgba(255,255,255,.18);
}
.face-state{
  position:absolute;bottom:8px;right:8px;padding:3px 8px;border-radius:999px;font-size:10.5px;font-weight:600;
  background:rgba(0,0,0,.72);color:#fff;border:1px solid rgba(255,255,255,.18);
}
.face-foot{padding:9px 11px;display:flex;align-items:center;justify-content:space-between;gap:8px}
.face-prop{font:600 11px var(--mono);color:var(--muted)}
.mini{
  padding:5px 11px;border:1px solid var(--line);border-radius:999px;background:var(--field);
  color:var(--text);font:600 11px var(--sans);cursor:pointer;
}
.mini:hover{border-color:var(--text)}

/* Results */
.id-list{display:grid;gap:7px;margin-top:10px}
.id-row{
  display:grid;grid-template-columns:86px minmax(0,1fr) auto;align-items:center;gap:10px;
  padding:9px 13px;border:1px solid var(--line);border-radius:14px;background:var(--field);
}
.id-row b{color:var(--muted);font-size:11.5px}
.id-row code{min-width:0;overflow:hidden;font:11.5px var(--mono);text-overflow:ellipsis;white-space:nowrap}
.code-wrap{margin-top:14px}
.code-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:12.5px;font-weight:650}
.code{
  display:block;width:100%;min-height:230px;resize:vertical;padding:14px;border:1px solid var(--line);
  border-radius:18px;background:rgba(0,0,0,.65);color:#f2f2f2;font:11.5px/1.6 var(--mono);white-space:pre;overflow:auto;
}
#toast{
  position:fixed;left:50%;bottom:22px;z-index:1200;display:grid;gap:8px;
  transform:translateX(-50%);pointer-events:none;
}
.toast-item{
  padding:10px 18px;border-radius:999px;font-size:12.5px;font-weight:600;
  background:rgba(20,20,24,.9);color:#fff;border:1px solid rgba(255,255,255,.22);
  box-shadow:0 10px 28px rgba(0,0,0,.45);transition:opacity .25s,transform .25s;
}
</style>
</head>
<body>
<main>
  <section class="card glass">
    <div class="top">
      <div class="brand">
        <div class="logo" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>
          </svg>
        </div>
        <div>
          <div class="kicker">BAXDEV / VIP PLUS TOOL</div>
          <h1>SkyBox 360° Studio</h1>
        </div>
      </div>
    </div>
    <p class="sub">Ubah gambar panorama 360° (equirectangular) menjadi 6 sisi SkyBox Roblox (Front, Back, Left, Right, Top, Bottom), lihat pratinjau 360° interaktif, lalu publish langsung ke Roblox lengkap dengan Script Studio.</p>

    <label class="drop" id="drop-zone">
      <input type="file" id="file-input" accept="image/png,image/jpeg,image/webp">
      <div>
        <div class="drop-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="16 16 12 12 8 16"/><line x1="12" y1="12" x2="12" y2="21"/>
            <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3"/>
          </svg>
        </div>
        <span class="drop-title" id="drop-title">Drop panorama 360° di sini atau klik untuk pilih gambar</span>
        <span class="drop-meta" id="drop-meta">Format PNG, JPG, atau WebP (rasio ideal 2:1, maks 25 MB)</span>
      </div>
    </label>

    <div class="controls">
      <div class="ctrl-group">
        <div class="field-wrap">
          <label for="face-size">Resolusi sisi</label>
          <select id="face-size">
            <option value="512">512 × 512 px (Cepat)</option>
            <option value="1024" selected>1024 × 1024 px (HD Standar)</option>
            <option value="2048">2048 × 2048 px (Ultra Tajam)</option>
          </select>
        </div>
        <div class="field-wrap">
          <label for="sky-name">Nama</label>
          <input type="text" id="sky-name" placeholder="Skybox" maxlength="32" value="Skybox">
        </div>
      </div>
      <div class="ctrl-group">
        <button type="button" class="btn" id="render-btn" disabled>Render Ulang 6 Sisi</button>
      </div>
    </div>

    <div class="progress" id="progress" hidden><i id="progress-fill"></i></div>
    <div class="status" id="status" role="status">Pilih gambar panorama 360° untuk mulai memotong 6 sisi SkyBox.</div>
  </section>

  <section class="card glass" id="preview-card" hidden>
    <div class="card-head">
      <div>
        <h2>Pratinjau 360° Interaktif</h2>
        <div style="font-size:12px;color:var(--muted)">Geser untuk melihat sekeliling tanpa sambungan, scroll untuk zoom.</div>
      </div>
    </div>
    <div class="viewer-wrap">
      <canvas id="view-canvas" tabindex="0" aria-label="Pratinjau 360 derajat SkyBox"></canvas>
      <div class="viewer-hud">
        <span class="viewer-hint">Geser: Lihat 360° · Scroll: Zoom</span>
        <div style="display:flex;gap:6px">
          <button type="button" class="viewer-pill" id="auto-rot-btn">Auto Putar: ON</button>
          <button type="button" class="viewer-pill" id="fs-btn">Layar Penuh</button>
        </div>
      </div>
    </div>
  </section>

  <section class="card glass" id="faces-card" hidden>
    <div class="card-head">
      <div>
        <h2>6 Sisi SkyBox Roblox</h2>
        <div style="font-size:12px;color:var(--muted)">Urutan properti sesuai objek <code>Lighting.Sky</code> di Roblox Studio.</div>
      </div>
      <div class="ctrl-group">
        <div class="field-wrap">
          <label for="upscale-sel">AI Upscale</label>
          <select id="upscale-sel">
            <option value="1" selected>1× (Asli)</option>
            <option value="2">2× AI Upscale</option>
            <option value="4">4× AI Upscale</option>
          </select>
        </div>
        <button type="button" class="btn-ghost" id="dl-all-btn">Download 6 PNG</button>
        <button type="button" class="btn" id="pub-btn">Publish 6 Sisi ke Roblox</button>
      </div>
    </div>
    <div class="faces-grid" id="faces-grid"></div>
  </section>

  <section class="card glass" id="results-card" hidden>
    <div class="card-head">
      <div>
        <h2>Hasil Publish &amp; Script Roblox Studio</h2>
        <div style="font-size:12px;color:var(--muted)">Tempel script di bawah ke Command Bar Roblox Studio untuk memasang SkyBox otomatis.</div>
      </div>
    </div>
    <div class="id-list" id="id-list"></div>
    <div class="code-wrap">
      <div class="code-head">
        <span>Script Command Bar Roblox Studio (Otomatis Pasang ke Lighting.Sky)</span>
        <button type="button" class="mini" id="copy-script-btn">Salin Script</button>
      </div>
      <textarea class="code" id="lua-code" readonly spellcheck="false"></textarea>
    </div>
  </section>
</main>
<div id="toast"></div>

<script>
const $ = id => document.getElementById(id);
const NL = String.fromCharCode(10);
const FACES = [
  { key: 'Front',  prop: 'SkyboxFt', label: 'Front (SkyboxFt)' },
  { key: 'Back',   prop: 'SkyboxBk', label: 'Back (SkyboxBk)' },
  { key: 'Left',   prop: 'SkyboxLf', label: 'Left (SkyboxLf)' },
  { key: 'Right',  prop: 'SkyboxRt', label: 'Right (SkyboxRt)' },
  { key: 'Top',    prop: 'SkyboxUp', label: 'Top (SkyboxUp)' },
  { key: 'Bottom', prop: 'SkyboxDn', label: 'Bottom (SkyboxDn)' }
];

let sourceBitmap = null;
let sourcePixels = null;
let sourceW = 0, sourceH = 0;
let faceCanvases = {};
let faceBlobs = {};
let busy = false;

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast-item';
  el.textContent = msg;
  $('toast').appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(8px)'; setTimeout(() => el.remove(), 260); }, 2500);
}

function setStatus(msg, type) {
  const s = $('status');
  s.textContent = msg;
  s.className = 'status' + (type ? ' ' + type : '');
}

function showProgress(pct) {
  $('progress').hidden = false;
  $('progress-fill').style.width = Math.max(0, Math.min(100, pct)) + '%';
}
function hideProgress() {
  $('progress').hidden = true;
  $('progress-fill').style.width = '0%';
}

async function copyText(text, msg) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const t = document.createElement('textarea');
      t.value = text; t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    toast(msg || 'Disalin');
  } catch (e) {
    toast('Gagal menyalin teks');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Bangun kartu 6 sisi
const gridEl = $('faces-grid');
FACES.forEach(f => {
  const card = document.createElement('div');
  card.className = 'face-card';
  card.innerHTML =
    '<div class="face-canvas-wrap">' +
      '<canvas id="cv-' + f.key + '" width="256" height="256"></canvas>' +
      '<span class="face-badge">' + f.key + '</span>' +
      '<span class="face-state" id="st-' + f.key + '" hidden></span>' +
    '</div>' +
    '<div class="face-foot">' +
      '<span class="face-prop">' + f.prop + '</span>' +
      '<button type="button" class="mini" data-dl="' + f.key + '">Unduh PNG</button>' +
    '</div>';
  gridEl.appendChild(card);
  faceCanvases[f.key] = card.querySelector('canvas');
});

gridEl.addEventListener('click', e => {
  const btn = e.target.closest('[data-dl]');
  if (!btn) return;
  const key = btn.dataset.dl;
  const blob = faceBlobs[key];
  if (!blob) return toast('Sisi belum selesai dirender');
  const base = ($('sky-name').value || 'Skybox').trim().replace(/[^A-Za-z0-9_-]+/g, '_') || 'Skybox';
  downloadBlob(blob, base + '_' + key + '.png');
});

$('dl-all-btn').addEventListener('click', async () => {
  const base = ($('sky-name').value || 'Skybox').trim().replace(/[^A-Za-z0-9_-]+/g, '_') || 'Skybox';
  for (const f of FACES) {
    if (faceBlobs[f.key]) {
      downloadBlob(faceBlobs[f.key], base + '_' + f.key + '.png');
      await new Promise(r => setTimeout(r, 160));
    }
  }
});

// Vektor arah tiap sisi cubemap Roblox
function faceDirection(faceKey, u, v) {
  // u, v di [-1, 1]
  switch (faceKey) {
    case 'Front':  return [ u, -v,  1];
    case 'Back':   return [-u, -v, -1];
    case 'Left':   return [-1, -v,  u];
    case 'Right':  return [ 1, -v, -u];
    case 'Top':    return [ u,  1,  v];
    case 'Bottom': return [ u, -1, -v];
    default:       return [ u, -v,  1];
  }
}

function renderCubemapFace(faceKey, size) {
  const cv = faceCanvases[faceKey];
  cv.width = size;
  cv.height = size;
  const ctx = cv.getContext('2d');
  const imgData = ctx.createImageData(size, size);
  const dst = imgData.data;
  const src = sourcePixels;
  const sw = sourceW, sh = sourceH;
  const invSize = 2 / size;
  const TWO_PI = Math.PI * 2;
  const INV_TWO_PI = 1 / TWO_PI;
  const INV_PI = 1 / Math.PI;

  let p = 0;
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) * invSize - 1;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) * invSize - 1;
      const dir = faceDirection(faceKey, u, v);
      const dx = dir[0], dy = dir[1], dz = dir[2];
      const len = Math.hypot(dx, dy, dz);
      const nx = dx / len, ny = dy / len, nz = dz / len;

      const lon = Math.atan2(nx, nz); // [-pi, pi]
      const lat = Math.asin(Math.max(-1, Math.min(1, ny))); // [-pi/2, pi/2]

      let uf = (lon * INV_TWO_PI + 0.5) * sw - 0.5;
      let vf = (0.5 - lat * INV_PI) * sh - 0.5;

      if (uf < 0) uf += sw;
      if (uf >= sw) uf -= sw;
      vf = Math.max(0, Math.min(sh - 1.001, vf));

      const x0 = Math.floor(uf), y0 = Math.floor(vf);
      const x1 = (x0 + 1) % sw, y1 = Math.min(sh - 1, y0 + 1);
      const fx = uf - x0, fy = vf - y0;
      const w00 = (1 - fx) * (1 - fy);
      const w10 = fx * (1 - fy);
      const w01 = (1 - fx) * fy;
      const w11 = fx * fy;

      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;

      dst[p]     = src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11;
      dst[p + 1] = src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11;
      dst[p + 2] = src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11;
      dst[p + 3] = 255;
      p += 4;
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return new Promise((resolve, reject) => cv.toBlob(b => b ? resolve(b) : reject(new Error('Gagal membuat PNG')), 'image/png'));
}

async function processPanorama() {
  if (!sourcePixels || busy) return;
  busy = true;
  $('render-btn').disabled = true;
  $('pub-btn').disabled = true;
  const size = Number($('face-size').value) || 1024;
  showProgress(5);
  setStatus('Memotong panorama menjadi 6 sisi (' + size + '×' + size + ' px)...');
  $('preview-card').hidden = false;
  $('faces-card').hidden = false;

  try {
    faceBlobs = {};
    for (let i = 0; i < FACES.length; i++) {
      const f = FACES[i];
      const st = $('st-' + f.key);
      st.hidden = false;
      st.textContent = 'Merender...';
      await new Promise(r => setTimeout(r, 15));
      faceBlobs[f.key] = await renderCubemapFace(f.key, size);
      st.textContent = size + '×' + size;
      showProgress(Math.round(((i + 1) / FACES.length) * 100));
    }
    setStatus('Selesai! 6 sisi SkyBox siap diunduh atau langsung dipublish ke Roblox.', 'success');
    drawViewer();
  } catch (e) {
    setStatus(e.message || 'Gagal memproses gambar panorama.', 'error');
  } finally {
    hideProgress();
    busy = false;
    $('render-btn').disabled = false;
    $('pub-btn').disabled = false;
  }
}

async function handleFile(file) {
  if (!file) return;
  if (!/^image\/(png|jpeg|webp)$/i.test(file.type)) {
    setStatus('Format harus PNG, JPG, atau WebP.', 'error');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    setStatus('Ukuran gambar maksimal 25 MB.', 'error');
    return;
  }
  try {
    setStatus('Membaca gambar panorama...');
    if (sourceBitmap && sourceBitmap.close) sourceBitmap.close();
    const bmp = await createImageBitmap(file);
    const maxW = 4096;
    const scale = Math.min(1, maxW / Math.max(bmp.width, bmp.height));
    sourceW = Math.max(64, Math.round(bmp.width * scale));
    sourceH = Math.max(32, Math.round(bmp.height * scale));
    const off = document.createElement('canvas');
    off.width = sourceW;
    off.height = sourceH;
    const octx = off.getContext('2d');
    octx.drawImage(bmp, 0, 0, sourceW, sourceH);
    sourcePixels = octx.getImageData(0, 0, sourceW, sourceH).data;
    sourceBitmap = bmp;

    const cleanName = file.name.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9 _-]+/g, ' ').trim().slice(0, 28);
    if (cleanName) $('sky-name').value = cleanName;
    $('drop-title').textContent = file.name;
    $('drop-meta').textContent = bmp.width + ' × ' + bmp.height + ' px · ' + (file.size / 1048576).toFixed(2) + ' MB';
    await processPanorama();
  } catch (e) {
    setStatus(e.message || 'Gambar tidak bisa dibaca.', 'error');
  }
}

const dropZone = $('drop-zone');
const fileInput = $('file-input');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('drag-over'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
dropZone.addEventListener('drop', e => {
  e.preventDefault();
  dropZone.classList.remove('drag-over');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
});
fileInput.addEventListener('change', () => {
  if (fileInput.files && fileInput.files[0]) handleFile(fileInput.files[0]);
});
$('render-btn').addEventListener('click', processPanorama);
$('face-size').addEventListener('change', () => { if (sourcePixels && !busy) processPanorama(); });

// ── 360° Interactive Viewer ──
const viewCanvas = $('view-canvas');
let yaw = 0, pitch = 0, fov = 75, autoRot = true, dragging = false, lastX = 0, lastY = 0;

function drawViewer() {
  if (!sourcePixels || $('preview-card').hidden) return;
  const rect = viewCanvas.getBoundingClientRect();
  const w = Math.max(160, Math.min(640, Math.round(rect.width * 0.65)));
  const h = Math.max(90, Math.min(360, Math.round(rect.height * 0.65)));
  if (viewCanvas.width !== w || viewCanvas.height !== h) {
    viewCanvas.width = w;
    viewCanvas.height = h;
  }
  const ctx = viewCanvas.getContext('2d');
  const img = ctx.createImageData(w, h);
  const dst = img.data;
  const src = sourcePixels;
  const sw = sourceW, sh = sourceH;

  const aspect = w / h;
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const cy = Math.cos(yaw), sy = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const INV_TWO_PI = 1 / (Math.PI * 2);
  const INV_PI = 1 / Math.PI;

  let p = 0;
  for (let y = 0; y < h; y++) {
    const ny = (1 - 2 * ((y + 0.5) / h)) * tanHalf;
    for (let x = 0; x < w; x++) {
      const nx = (2 * ((x + 0.5) / w) - 1) * tanHalf * aspect;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const rx = nx / len, ry = ny / len, rz = nz / len;

      // Rotasi pitch (X) lalu yaw (Y)
      const y1 = ry * cp - rz * sp;
      const z1 = ry * sp + rz * cp;
      const x2 = rx * cy + z1 * sy;
      const z2 = -rx * sy + z1 * cy;

      const lon = Math.atan2(x2, z2);
      const lat = Math.asin(Math.max(-1, Math.min(1, y1)));
      let u = Math.floor(((lon * INV_TWO_PI + 0.5) * sw)) % sw;
      if (u < 0) u += sw;
      const v = Math.max(0, Math.min(sh - 1, Math.floor((0.5 - lat * INV_PI) * sh)));
      const idx = (v * sw + u) * 4;
      dst[p] = src[idx];
      dst[p + 1] = src[idx + 1];
      dst[p + 2] = src[idx + 2];
      dst[p + 3] = 255;
      p += 4;
    }
  }
  ctx.putImageData(img, 0, 0);
}

let rafId = 0;
function tickViewer() {
  if (autoRot && !dragging && sourcePixels && !$('preview-card').hidden) {
    yaw += 0.0035;
    drawViewer();
  }
  rafId = requestAnimationFrame(tickViewer);
}
rafId = requestAnimationFrame(tickViewer);

viewCanvas.addEventListener('pointerdown', e => {
  dragging = true;
  lastX = e.clientX;
  lastY = e.clientY;
  viewCanvas.setPointerCapture(e.pointerId);
});
viewCanvas.addEventListener('pointermove', e => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  yaw -= dx * 0.005;
  pitch = Math.max(-1.45, Math.min(1.45, pitch + dy * 0.005));
  drawViewer();
});
viewCanvas.addEventListener('pointerup', () => { dragging = false; });
viewCanvas.addEventListener('pointercancel', () => { dragging = false; });
viewCanvas.addEventListener('wheel', e => {
  e.preventDefault();
  fov = Math.max(35, Math.min(110, fov + (e.deltaY > 0 ? 4 : -4)));
  drawViewer();
}, { passive: false });

$('auto-rot-btn').addEventListener('click', () => {
  autoRot = !autoRot;
  $('auto-rot-btn').textContent = 'Auto Putar: ' + (autoRot ? 'ON' : 'OFF');
});

let fsMode = false;
$('fs-btn').addEventListener('click', () => {
  fsMode = !fsMode;
  document.body.classList.toggle('fs-mode', fsMode);
  $('fs-btn').textContent = fsMode ? 'Tutup Layar Penuh' : 'Layar Penuh';
  if (window.parent !== window) window.parent.postMessage({ bx: 'fs', on: fsMode }, '*');
  setTimeout(drawViewer, 50);
});

// ── Publish 6 Sisi ke Roblox via Halaman Induk ──
function buildLuaScript(ids) {
  return [
    '-- SkyBox 360° Auto-Installer (BAXDEV)',
    '-- Tempel script ini di Command Bar Roblox Studio lalu tekan Enter.',
    'local Lighting = game:GetService("Lighting")',
    'local InsertService = game:GetService("InsertService")',
    '',
    'local function resolveDecalTexture(assetId)',
    '    local fallback = "rbxassetid://" .. tostring(assetId)',
    '    local ok, tex = pcall(function()',
    '        local m = InsertService:LoadAsset(tonumber(assetId))',
    '        local d = m:FindFirstChildWhichIsA("Decal", true)',
    '        local t = d and d.Texture or ""',
    '        m:Destroy()',
    '        return t',
    '    end)',
    '    if ok and type(tex) == "string" and tex ~= "" then return tex end',
    '    return fallback',
    'end',
    '',
    'local sky = Lighting:FindFirstChildOfClass("Sky") or Instance.new("Sky")',
    'sky.Name = ' + JSON.stringify(($('sky-name').value || 'Skybox').trim() || 'Skybox'),
    'sky.SkyboxFt = resolveDecalTexture(' + (ids.Front || '0') + ')',
    'sky.SkyboxBk = resolveDecalTexture(' + (ids.Back || '0') + ')',
    'sky.SkyboxLf = resolveDecalTexture(' + (ids.Left || '0') + ')',
    'sky.SkyboxRt = resolveDecalTexture(' + (ids.Right || '0') + ')',
    'sky.SkyboxUp = resolveDecalTexture(' + (ids.Top || '0') + ')',
    'sky.SkyboxDn = resolveDecalTexture(' + (ids.Bottom || '0') + ')',
    'sky.Parent = Lighting',
    'print("[BAXDEV] SkyBox 360 berhasil dipasang ke Lighting!")'
  ].join(NL);
}

$('pub-btn').addEventListener('click', () => {
  if (busy) return;
  if (FACES.some(f => !faceBlobs[f.key])) {
    toast('Render 6 sisi terlebih dahulu');
    return;
  }
  if (window.parent === window) {
    setStatus('Publish hanya tersedia di dalam aplikasi BAXDEV.', 'error');
    return;
  }
  busy = true;
  $('pub-btn').disabled = true;
  $('render-btn').disabled = true;
  const scale = Number($('upscale-sel').value) || 1;
  const name = ($('sky-name').value || 'Skybox').trim() || 'Skybox';
  const reqId = 'pub-' + Date.now() + '-' + Math.random().toString(36).slice(2);

  setStatus('Mengunggah 6 sisi SkyBox ke Roblox' + (scale > 1 ? ' (dengan AI Upscale ' + scale + '×)' : '') + '...');
  FACES.forEach(f => {
    const st = $('st-' + f.key);
    st.hidden = false;
    st.textContent = 'Menunggu...';
  });

  function onMsg(e) {
    const d = e.data;
    if (e.source !== window.parent || !d || d.bx !== 'publish' || d.id !== reqId) return;
    if (d.type === 'state' && d.face) {
      const st = $('st-' + d.face);
      if (st) { st.hidden = false; st.textContent = d.text || ''; }
      return;
    }
    if (d.type === 'error') {
      window.removeEventListener('message', onMsg);
      busy = false;
      $('pub-btn').disabled = false;
      $('render-btn').disabled = false;
      setStatus(d.message || 'Publish gagal.', 'error');
      return;
    }
    if (d.type === 'done') {
      window.removeEventListener('message', onMsg);
      busy = false;
      $('pub-btn').disabled = false;
      $('render-btn').disabled = false;
      const results = d.results || {};
      const ids = {};
      let okCount = 0;
      const idList = $('id-list');
      idList.innerHTML = '';

      FACES.forEach(f => {
        const r = results[f.key] || {};
        const st = $('st-' + f.key);
        if (r.assetId) {
          okCount++;
          ids[f.key] = r.assetId;
          if (st) st.textContent = 'ID: ' + r.assetId;
          const row = document.createElement('div');
          row.className = 'id-row';
          row.innerHTML =
            '<b>' + f.key + '</b>' +
            '<code>rbxassetid://' + r.assetId + '</code>' +
            '<button type="button" class="mini" data-copy="' + r.assetId + '">Salin ID</button>';
          idList.appendChild(row);
        } else {
          if (st) st.textContent = 'Gagal';
          const row = document.createElement('div');
          row.className = 'id-row';
          row.innerHTML =
            '<b>' + f.key + '</b>' +
            '<code>' + (r.error || 'Gagal diunggah') + '</code>' +
            '<span></span>';
          idList.appendChild(row);
        }
      });

      $('results-card').hidden = false;
      $('lua-code').value = buildLuaScript(ids);
      if (okCount === 6) {
        setStatus('Ke-6 sisi SkyBox berhasil dipublish ke Roblox!', 'success');
        toast('6 sisi SkyBox berhasil dipublish!');
      } else {
        setStatus(okCount + '/6 sisi berhasil dipublish. Cek detail di bawah.', okCount ? 'success' : 'error');
      }
    }
  }

  window.addEventListener('message', onMsg);
  window.parent.postMessage({
    bx: 'publish',
    type: 'request',
    id: reqId,
    files: faceBlobs,
    name,
    scale
  }, '*');
});

$('id-list').addEventListener('click', e => {
  const btn = e.target.closest('[data-copy]');
  if (btn) copyText(btn.dataset.copy, 'Asset ID disalin');
});
$('copy-script-btn').addEventListener('click', () => {
  if ($('lua-code').value) copyText($('lua-code').value, 'Script Roblox Studio disalin');
});

// ── Tema & Tinggi Otomatis Iframe ──
function applyBxTheme(data) {
  if (!data || !/^#[0-9a-fA-F]{6}$/.test(data.bg) || !Array.isArray(data.p) || data.p.length !== 3) return;
  const p = data.p.map(c => Array.isArray(c) && c.length === 3 ? c.map(v => Math.max(0, Math.min(255, Math.round(Number(v) || 0)))) : null);
  if (p.some(c => !c)) return;
  const rgb = c => 'rgb(' + c.join(',') + ')', rgba = (c, a) => 'rgba(' + c.join(',') + ',' + a + ')';
  const set = (k, v) => document.documentElement.style.setProperty(k, v);
  const l = p[0];
  set('--bg', data.bg); set('--text', rgb(l)); set('--muted', rgba(l, .64)); set('--faint', rgba(l, .4));
  set('--g1', rgba(l, .12)); set('--g2', rgba(l, .035)); set('--line', rgba(l, .17));
  set('--rim1', rgba(l, .7)); set('--rim2', rgba(l, .26)); set('--hl', rgba(l, .14)); set('--field', rgba(l, .07));
  set('--btn', rgb(l)); set('--btn-ink', data.bg); set('--blob', rgba(p[1], .26));
  if (data.scheme === 'light' || data.scheme === 'dark') set('color-scheme', data.scheme);
}
window.addEventListener('message', e => {
  if (e.source === window.parent && e.data && e.data.bx === 'theme') applyBxTheme(e.data);
});

(function () {
  if (window.parent === window) return;
  document.documentElement.classList.add('autoh');
  let last = 0;
  const send = () => {
    const h = Math.ceil(document.body.getBoundingClientRect().height);
    if (h && h !== last) { last = h; window.parent.postMessage({ bx: 'height', h }, '*'); }
  };
  new ResizeObserver(send).observe(document.body);
  window.addEventListener('load', send);
  send();
})();
</script>
</body>
</html>`;
