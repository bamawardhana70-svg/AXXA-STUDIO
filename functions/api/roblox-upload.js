import { requireUser, requireVip, quotaBegin, quotaCommit } from "../_lib/auth.js";

// Cloudflare Pages Function — POST /api/roblox-upload
//
// Runs server-side (Cloudflare's edge), so unlike a fetch() from the app
// itself, it isn't subject to the browser's CORS restriction. Roblox's Open
// Cloud Assets API is built for server-to-server calls and does not return
// CORS headers to a browser origin, so this function exists to be that
// server: it re-posts the file + credentials the client sends here to
// Roblox and relays back a small JSON result. Nothing is logged, cached, or
// persisted here — the API key only passes through this request.
//
// Create Asset (POST /v1/assets) itself only returns an Operation path
// (operations/{id}) — the actual numeric assetId only shows up once that
// operation is polled to completion via GET /v1/{operationPath}. So this
// function polls that endpoint for a bounded window right after upload and
// returns the resolved assetId when it's ready. If Roblox is still
// processing past that window, it replies with pending:true and
// the operationPath so the client can resolve it later via
// /api/roblox-asset-status instead of the UI silently showing nothing.

// Flash polling di server hosting: cek sangat cepat (80ms..650ms, total ~2.1 detik).
// Begitu Roblox selesai memproses, Asset ID langsung dikirim; kalau Roblox masih indexing,
// langsung kembalikan operationPath agar slot upload berikutnya langsung jalan tanpa nunggu lama.
const POLL_DELAYS_MS = [80, 120, 180, 260, 360, 500, 650];
const SERVER_UPLOAD_RETRIES = 3;
const MAX_CONCURRENT_PER_ID = 2;

// Antrean upload maksimal 2 proses jalan bersamaan per ID Roblox / Group di sisi server hosting.
const uploadQueues = new Map();

function enqueueServerUpload(queueKey, taskFn) {
  let state = uploadQueues.get(queueKey);
  if (!state) {
    state = { active: 0, waiting: [] };
    uploadQueues.set(queueKey, state);
  }
  return new Promise((resolve, reject) => {
    const run = () => {
      state.active += 1;
      Promise.resolve()
        .then(() => taskFn())
        .then(resolve, reject)
        .finally(() => {
          state.active -= 1;
          if (state.waiting.length > 0) {
            const nextRun = state.waiting.shift();
            nextRun();
          } else if (state.active === 0 && uploadQueues.get(queueKey) === state) {
            uploadQueues.delete(queueKey);
          }
        });
    };
    if (state.active < MAX_CONCURRENT_PER_ID) {
      run();
    } else {
      state.waiting.push(run);
    }
  });
}

// Tipe yang boleh diunggah lewat endpoint ini. Model: .rbxm / .rbxmx (format native Roblox, content type
// harus persis model/x-rbxm karena browser tidak mengenal ekstensi ini) dan .glb (hasil Image to Mesh,
// diimpor Roblox sebagai Model berisi MeshPart).
const ASSET_TYPES = new Set(["Audio", "Model", "Decal", "Animation"]);
const NOUNS = { Audio: "audio", Model: "model", Decal: "gambar", Animation: "animasi" };
// Decal: format gambar yang diterima Open Cloud Assets API.
const DECAL_TYPES = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", bmp: "image/bmp", tga: "image/tga" };
const decalExt = (name) => String(name || "").split(".").pop().toLowerCase();
const MODEL_EXT = /\.(rbxmx?|glb)$/i;
const MODEL_CONTENT_TYPE = "model/x-rbxm";
const GLB_EXT = /\.glb$/i;
const GLB_CONTENT_TYPE = "model/gltf-binary";
const GLB_MAGIC = "glTF";        // biner: 4 byte pertama
const RBXM_MAGIC = "<roblox!";   // biner: 8 byte pertama
const RBXMX_TAG = "<roblox";     // XML: muncul di awal dokumen (setelah <?xml ...?> bila ada)

function looksLikeRbxmBytes(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(256, bytes.length)));
  return head.startsWith(RBXM_MAGIC) || head.includes(RBXMX_TAG);
}

function looksLikeGlbBytes(bytes) {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(4, bytes.length)));
  return head === GLB_MAGIC;
}

// Cek isi file cocok dengan ekstensinya (TGA tidak punya magic number, jadi hanya dicek lewat ekstensi).
function looksLikeImageBytes(bytes, ext) {
  const b = bytes.subarray(0, Math.min(8, bytes.length));
  if (ext === "png") return b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
  if (ext === "jpg" || ext === "jpeg") return b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
  if (ext === "bmp") return b[0] === 0x42 && b[1] === 0x4d;
  return true;
}

function resolveContentType(assetType, fileName, fallbackType) {
  if (assetType === "Animation") return MODEL_CONTENT_TYPE;
  if (assetType === "Model") return GLB_EXT.test(fileName) ? GLB_CONTENT_TYPE : MODEL_CONTENT_TYPE;
  if (assetType === "Decal") return DECAL_TYPES[decalExt(fileName)] || "image/png";
  return fallbackType || "audio/mpeg";
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BG_POLL_DELAYS_MS = [1000, 1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000, 5000, 5000, 5000];
const FIREBASE_DB_URL = "https://baxdev-rbx-default-rtdb.asia-southeast1.firebasedatabase.app";

// Penyimpanan status job upload di memori server hosting agar ketika user menutup web lalu membuka lagi,
// atau saat banyak musik diantrekan di server, data progres & Asset ID langsung masuk otomatis.
const serverJobs = new Map();
const userServerJobs = new Map();
const JOB_TTL_MS = 6 * 3600 * 1000;

function recordServerJob(userId, entryId, patch) {
  if (!entryId) return null;
  const key = String(entryId);
  const now = Date.now();
  const prev = serverJobs.get(key) || { id: key, userId: String(userId || ""), createdAt: now };
  const next = { ...prev, ...patch, id: key, userId: String(userId || prev.userId || ""), updatedAt: now };
  serverJobs.set(key, next);
  if (next.userId) {
    let set = userServerJobs.get(next.userId);
    if (!set) {
      set = new Set();
      userServerJobs.set(next.userId, set);
    }
    set.add(key);
  }
  // Bersihkan job lama (> 6 jam) bila map sudah besar
  if (serverJobs.size > 600) {
    for (const [k, v] of serverJobs.entries()) {
      if (now - (v.updatedAt || v.createdAt || 0) > JOB_TTL_MS) {
        serverJobs.delete(k);
        const uSet = userServerJobs.get(v.userId);
        if (uSet) uSet.delete(k);
      }
    }
  }
  return next;
}

async function pollOperationWithDelays(operationPath, apiKey, delays) {
  const cleanPath = String(operationPath || "").replace(/^\/+/, "");
  const url = cleanPath.startsWith("operations/")
    ? `https://apis.roblox.com/assets/v1/${cleanPath}`
    : `https://apis.roblox.com/assets/v1/operations/${cleanPath}`;
  for (let i = 0; i < delays.length; i++) {
    await sleep(delays[i]);
    let res;
    try {
      res = await fetch(url, {
        headers: { "x-api-key": apiKey }
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    let op = null;
    try { op = await res.json(); } catch { continue; }
    if (op && op.done) return op;
  }
  return null;
}

async function pollOperation(operationPath, apiKey) {
  return pollOperationWithDelays(operationPath, apiKey, POLL_DELAYS_MS);
}

// Simpan hasil upload langsung dari server hosting ke Firebase Library user + feed/uploads
// supaya walaupun web/tab ditutup, semua musik yang selesai di server otomatis masuk ke akun user!
async function saveUploadToFirebaseServer(quota, entryId, entryData) {
  if (!quota || !quota.uid || !quota.token || !entryId) return;
  try {
    const authParam = `auth=${encodeURIComponent(quota.token)}`;
    const libUrl = `${FIREBASE_DB_URL}/library/${encodeURIComponent(quota.uid)}/${encodeURIComponent(String(entryId))}.json?${authParam}`;
    const tasks = [
      fetch(libUrl, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(entryData)
      })
    ];
    if (entryData.status === "done" && entryData.assetId) {
      tasks.push(
        fetch(`${FIREBASE_DB_URL}/uploads/${encodeURIComponent(quota.uid)}.json?${authParam}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: String(entryData.name || "").slice(0, 100),
            filename: String(entryData.filename || "").slice(0, 160),
            size: Number(entryData.size) || 0,
            assetId: String(entryData.assetId).slice(0, 30),
            status: "done",
            speed: Number(entryData.speed) || 1,
            at: Date.now()
          })
        }),
        fetch(`${FIREBASE_DB_URL}/feed.json?${authParam}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: String(entryData.name || "Audio").slice(0, 80),
            at: Date.now()
          })
        })
      );
    }
    await Promise.allSettled(tasks);
  } catch { /* ignore background firebase network error */ }
}

function isRobloxQuotaExhausted(status, bodyText) {
  if (status !== 429) return false;
  return /does not have available quota|limit of \d+ has been reached/i.test(String(bodyText || ""));
}

async function fetchUserManageableGroups(userId) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3500);
    const r = await fetch(`https://groups.roblox.com/v2/users/${encodeURIComponent(userId)}/groups/roles`, {
      signal: ctrl.signal
    });
    clearTimeout(timer);
    if (!r.ok) return [];
    const j = await r.json().catch(() => null);
    const list = (j && Array.isArray(j.data)) ? j.data : [];
    return list
      .filter((item) => item && item.group && item.group.id && item.role && Number(item.role.rank) >= 100)
      .sort((a, b) => Number(b.role.rank) - Number(a.role.rank))
      .slice(0, 4)
      .map((item) => String(item.group.id));
  } catch {
    return [];
  }
}

// Kirim multipart/form-data dari memori server hosting ke Roblox Open Cloud dengan auto-retry
// apabila terjadi gangguan jaringan sementara, rate limit (429), atau 5xx dari Roblox.
async function postAssetFromHostingServer({ requestPayload, fileBytes, fileName, contentType, apiKey }) {
  let lastErr = null;
  let lastRes = null;
  let lastBodyText = "";

  for (let attempt = 0; attempt < SERVER_UPLOAD_RETRIES; attempt++) {
    const upstream = new FormData();
    // PENTING: "request" harus di-append sebagai string biasa, BUKAN dibungkus Blob.
    upstream.append("request", JSON.stringify(requestPayload));
    const fileBlob = new Blob([fileBytes], { type: contentType });
    upstream.append("fileContent", fileBlob, fileName);

    try {
      const res = await fetch("https://apis.roblox.com/assets/v1/assets", {
        method: "POST",
        headers: { "x-api-key": apiKey },
        body: upstream
      });
      const bodyText = await res.text();
      lastRes = res;
      lastBodyText = bodyText;

      if (res.ok) {
        return { res, bodyText, error: null };
      }
      // Jangan retry ke creator yang sama kalau kuota bulanan akun Roblox tersebut sudah habis (langsung lempar ke fallback)
      if (isRobloxQuotaExhausted(res.status, bodyText)) {
        return { res, bodyText, error: null };
      }
      // Retry untuk rate-limit per-detik (429) atau gangguan server Roblox (500/502/503/504)
      if ((res.status === 429 || res.status >= 500) && attempt < SERVER_UPLOAD_RETRIES - 1) {
        const retryAfter = Number(res.headers.get("retry-after") || 0);
        const waitMs = retryAfter > 0 ? Math.min(retryAfter * 1000, 4000) : 700 * (attempt + 1);
        await sleep(waitMs);
        continue;
      }
      return { res, bodyText, error: null };
    } catch (err) {
      lastErr = err;
      if (attempt < SERVER_UPLOAD_RETRIES - 1) {
        await sleep(600 * (attempt + 1));
        continue;
      }
    }
  }

  return { res: lastRes, bodyText: lastBodyText, error: lastErr };
}

// Opsional: bila server hosting eksternal (VPS/Docker di UPLOAD_BACKEND_URL atau YT_BACKEND_URL)
// dikonfigurasi, delegasikan upload asset melalui server hosting tersebut. Jika tidak ada atau gagal
// dihubungi, otomatis lanjutkan upload langsung dari server hosting utama ini.
async function tryExternalHostingRelay(env, payload) {
  const rawUrl = String((env && (env.UPLOAD_BACKEND_URL || env.YT_BACKEND_URL)) || "").trim().replace(/\/+$/, "");
  const secret = String((env && (env.UPLOAD_BACKEND_SECRET || env.YT_BACKEND_SECRET)) || "").trim();
  if (!rawUrl || !secret) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 55000);
  try {
    const res = await fetch(`${rawUrl}/upload-asset`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-backend-secret": secret
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal
    });
    if (res.status === 404) return null; // Backend lama belum punya route /upload-asset -> fallback ke server utama
    const data = await res.json().catch(() => null);
    if (!data || typeof data !== "object") return null;
    return { status: res.status, data };
  } catch {
    return null; // Fallback otomatis ke server hosting utama
  } finally {
    clearTimeout(timer);
  }
}

function uint8ToBase64(bytes) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export async function onRequestPost(context) {
  // Bungkus semua error tak terduga jadi JSON supaya klien dapat pesan jelas (bukan halaman HTML 500).
  try {
    return await handleUpload(context);
  } catch (err) {
    return json({ ok: false, message: "Kesalahan server saat upload: " + (err && err.message ? err.message : "tidak diketahui") }, 500);
  }
}

async function handleUpload(context) {
  const { request, env } = context;

  const [denied, form] = await Promise.all([
    requireUser(request),
    request.formData().catch(() => null)
  ]);
  if (denied) return denied;
  if (!form) {
    return json({ ok: false, message: "Body permintaan tidak valid (bukan multipart/form-data)." }, 400);
  }

  const file = form.get("file");
  const userId = String(form.get("userId") || "").trim();
  // Buang spasi, newline, dan karakter tak terlihat (zero-width/BOM) yang suka ikut ke-paste di HP.
  const apiKey = String(form.get("apiKey") || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  const creatorType = String(form.get("creatorType") || "User").trim();
  const groupId = String(form.get("groupId") || "").trim();
  const backupUserId = String(form.get("backupUserId") || (env && env.FALLBACK_ROBLOX_USER_ID) || "").trim();
  const backupApiKey = String(form.get("backupApiKey") || (env && env.FALLBACK_ROBLOX_API_KEY) || "").replace(/[\s\u200B-\u200D\u2060\uFEFF\u00A0]/g, "");
  const entryId = String(form.get("entryId") || `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`).trim();
  const speed = Number(form.get("speed") || 1) || 1;
  const asyncQueue = String(form.get("asyncQueue") || "") === "1";
  const assetType = String(form.get("assetType") || "Audio");
  const noun = NOUNS[assetType] || "audio";
  const displayName = String(form.get("displayName") || "Untitled").trim().slice(0, 30) || "Untitled";
  const description = String(form.get("description") || "");

  if (!ASSET_TYPES.has(assetType)) {
    return json({ ok: false, message: "Tipe asset tidak didukung. Yang tersedia: Audio, Animation, Model, dan Decal." }, 400);
  }
  if (!(file instanceof File)) {
    return json({ ok: false, message: `File ${noun} tidak ditemukan di request.` }, 400);
  }
  if (!userId || !apiKey) {
    return json({ ok: false, message: "userId dan apiKey wajib diisi." }, 400);
  }
  if (creatorType === "Group" && !groupId) {
    return json({ ok: false, message: "groupId wajib diisi kalau creatorType = Group." }, 400);
  }
  if (file.size === 0) {
    return json({ ok: false, message: `File ${noun} kosong (0 byte) — coba upload ulang dari halaman Upload.` }, 400);
  }
  const MAX_BYTES = 20 * 1024 * 1024; // sama dengan batas di upload.html (MAX_FILE_MB)
  if (file.size > MAX_BYTES) {
    return json({ ok: false, message: `File ${noun} melebihi batas 20MB.` }, 400);
  }

  // Salin seluruh byte file ke memori server hosting sekali di awal supaya aman untuk validasi,
  // antrean berurutan, dan tetap jalan di latar belakang walaupun browser ditutup oleh user!
  const fileBuffer = await file.arrayBuffer();
  const fileBytes = new Uint8Array(fileBuffer);
  const fileName = file.name || (assetType === "Audio" ? "audio.mp3" : "asset");

  if (assetType === "Model") {
    if (!MODEL_EXT.test(fileName)) {
      return json({ ok: false, message: "Model harus berformat .rbxm, .rbxmx, atau .glb." }, 400);
    }
    if (GLB_EXT.test(fileName)) {
      if (!looksLikeGlbBytes(fileBytes)) {
        return json({ ok: false, message: "Isi file bukan GLB yang valid. Buat ulang mesh lalu coba lagi." }, 400);
      }
    } else if (!looksLikeRbxmBytes(fileBytes)) {
      return json({ ok: false, message: "Isi file bukan model Roblox yang valid. Ekspor ulang dari Roblox Studio (Save to File As → .rbxm)." }, 400);
    }
  }

  if (assetType === "Animation") {
    if (!/\.rbxmx?$/i.test(fileName)) {
      return json({ ok: false, message: "Animasi harus berformat .rbxm atau .rbxmx (ekspor KeyframeSequence dari Roblox Studio)." }, 400);
    }
    if (!looksLikeRbxmBytes(fileBytes)) {
      return json({ ok: false, message: "Isi file bukan file Roblox yang valid. Ekspor ulang KeyframeSequence dari Roblox Studio (klik kanan > Save to File)." }, 400);
    }
  }

  if (assetType === "Decal") {
    const ext = decalExt(fileName);
    if (!DECAL_TYPES[ext]) {
      return json({ ok: false, message: "Gambar harus berformat PNG, JPG, BMP, atau TGA." }, 400);
    }
    if (!looksLikeImageBytes(fileBytes, ext)) {
      return json({ ok: false, message: `Isi file bukan gambar ${ext.toUpperCase()} yang valid.` }, 400);
    }
  }

  // Menu Spoof (upload Animasi) dan RBXM to ID (upload Model) khusus VIP: dicek di server supaya tidak bisa dilewati dari browser.
  if (assetType === "Animation" || assetType === "Model") {
    const vipDeny = await requireVip(request, userId);
    if (vipDeny) return vipDeny;
  }

  // Cek kuota terlebih dahulu sebelum memasukkan ke antrean server
  const quota = await quotaBegin(request, userId);
  if (!quota.ok) {
    const message = `Kuota publish hari ini sudah habis (${quota.used}/${quota.limit}) dan reset besok jam 00.00 WIB. Beli VIP atau tukar kode di Pengaturan → Akun.`;
    return json({
      ok: false, code: "quota_exceeded",
      message,
      quota: { used: quota.used, limit: quota.limit }
    }, 429);
  }

  const uploadedAt = new Date().toISOString();
  const baseLibEntry = assetType === "Audio" ? {
    id: entryId,
    name: displayName,
    filename: fileName,
    size: fileBytes.length,
    uploadedAt,
    speed,
    kind: "audio"
  } : null;

  // Daftarkan langsung di memori server & Firebase sebagai 'proc' begitu file diterima server!
  if (baseLibEntry) {
    const initEntry = { ...baseLibEntry, assetId: null, status: "proc" };
    recordServerJob(userId, entryId, initEntry);
    saveUploadToFirebaseServer(quota, entryId, initEntry);
  }

  const queueKey = creatorType === "Group" ? `Group:${groupId}` : `User:${userId}`;
  const qState = uploadQueues.get(queueKey);
  const queueBusy = Boolean(qState && qState.active >= MAX_CONCURRENT_PER_ID);
  const contentType = resolveContentType(assetType, fileName, file.type);

  // Fungsi pekerja utama di server hosting yang tetap berjalan sampai selesai walaupun browser ditutup!
  const uploadPromise = enqueueServerUpload(queueKey, async () => {
    const finishOk = async (obj) => {
      const qi = await quotaCommit(quota);
      if (qi) obj.quota = qi;
      obj.hostedBy = obj.hostedBy || "server";
      obj.entryId = entryId;
      if (baseLibEntry) {
        if (obj.assetId) {
          const doneEntry = {
            ...baseLibEntry,
            assetId: String(obj.assetId),
            status: "done"
          };
          recordServerJob(userId, entryId, doneEntry);
          await saveUploadToFirebaseServer(quota, entryId, doneEntry);
        } else if (obj.pending && obj.operationPath) {
          const procEntry = {
            ...baseLibEntry,
            assetId: null,
            operationPath: obj.operationPath,
            status: "proc"
          };
          recordServerJob(userId, entryId, procEntry);
          await saveUploadToFirebaseServer(quota, entryId, procEntry);
        }
      }
      return json(obj);
    };

    const failWithSync = async (message, status) => {
      const cleanMsg = String(message || "Upload gagal").slice(0, 160);
      if (baseLibEntry) {
        const failEntry = {
          ...baseLibEntry,
          assetId: null,
          status: "fail",
          reason: cleanMsg
        };
        recordServerJob(userId, entryId, failEntry);
        await saveUploadToFirebaseServer(quota, entryId, failEntry);
      }
      return json({ ok: false, entryId, message }, status || 200);
    };

    const creator = creatorType === "Group" ? { groupId } : { userId };
    let activeApiKey = apiKey;
    let requestPayload = {
      assetType,
      displayName,
      description,
      creationContext: { creator }
    };

    // Jika ada server hosting eksternal (UPLOAD_BACKEND_URL / YT_BACKEND_URL), coba eksekusi lewat sana dulu.
    const relayed = await tryExternalHostingRelay(env, {
      requestPayload,
      fileName,
      contentType,
      apiKey: activeApiKey,
      creatorType,
      fileBase64: uint8ToBase64(fileBytes)
    });
    if (relayed && relayed.data) {
      if (relayed.status >= 200 && relayed.status < 300 && relayed.data.ok) {
        return finishOk({ ...relayed.data, hostedBy: "hosting-backend" });
      }
      if (relayed.data.message && !isRobloxQuotaExhausted(relayed.status, relayed.data.message)) {
        return failWithSync(relayed.data.message, relayed.status || 400);
      }
    }

    // Eksekusi upload langsung dari server hosting ini ke Roblox Open Cloud (dengan auto-retry di sisi server).
    let { res, bodyText, error } = await postAssetFromHostingServer({
      requestPayload,
      fileBytes,
      fileName,
      contentType,
      apiKey: activeApiKey
    });

    // Auto-Fallback jika Roblox menolak dengan HTTP 429 "User does not have available quota for Audio asset upload. The limit of 100 has been reached"
    if (res && isRobloxQuotaExhausted(res.status, bodyText)) {
      const fallbacks = [];
      if (backupUserId && backupApiKey && (backupUserId !== userId || backupApiKey !== apiKey)) {
        fallbacks.push({ creator: { userId: backupUserId }, key: backupApiKey });
      }
      if (creatorType === "User" && groupId) {
        fallbacks.push({ creator: { groupId }, key: activeApiKey });
      } else if (creatorType === "Group" && userId) {
        fallbacks.push({ creator: { userId }, key: activeApiKey });
      }
      const autoGroups = await fetchUserManageableGroups(userId);
      for (const gid of autoGroups) {
        if (gid !== groupId) {
          fallbacks.push({ creator: { groupId: gid }, key: activeApiKey });
        }
      }
      for (const fb of fallbacks) {
        const fbPayload = {
          assetType,
          displayName,
          description,
          creationContext: { creator: fb.creator }
        };
        const attemptRes = await postAssetFromHostingServer({
          requestPayload: fbPayload,
          fileBytes,
          fileName,
          contentType,
          apiKey: fb.key
        });
        if (attemptRes.res && attemptRes.res.ok) {
          res = attemptRes.res;
          bodyText = attemptRes.bodyText;
          error = null;
          activeApiKey = fb.key;
          requestPayload = fbPayload;
          break;
        }
      }
    }

    if (error || !res) {
      return failWithSync(
        "Gagal menghubungi Roblox dari server hosting: " + (error && error.message ? error.message : "network error"),
        502
      );
    }

    let data = {};
    try { data = JSON.parse(bodyText); } catch { /* Roblox didn't return JSON */ }

    if (!res.ok) {
      const detail = data.message || bodyText.slice(0, 200) || `HTTP ${res.status}`;
      if (isRobloxQuotaExhausted(res.status, detail)) {
        return failWithSync(
          `Kuota bulanan dari pihak Roblox untuk akun #${userId} sudah penuh (${detail}). Solusi instan tanpa tunggu tanggal reset: ganti Creator Type ke Group (isi Group ID) atau masukkan Akun/API Key Roblox Cadangan di Pengaturan → Roblox.`
        );
      }
      const hint = creatorType === "Group" && (res.status === 401 || res.status === 403)
        ? " Pastikan API key dibuat dari Group ini (atau kamu punya izin Manage Assets di Group), dan Group ID sudah benar."
        : "";
      const keyHint = res.status === 401
        ? " 401 = Roblox tidak mengenali key-nya. Cek: (1) tekan Simpan lagi di Pengaturan setelah paste key baru, (2) di bagian Keamanan key, isi Accepted IP Addresses dengan DUA baris: 0.0.0.0/0 dan ::/0 (IPv4 + IPv6), (3) key belum expired / masih Enabled, (4) key disalin utuh tanpa spasi."
        : "";
      const scopeHint = (res.status === 403)
        ? " Pastikan API key punya scope Assets (Read + Write) — buat di creator.roblox.com → Credentials."
        : "";
      return failWithSync(`Roblox menolak upload (HTTP ${res.status}): ${detail}${keyHint}${hint}${scopeHint}`);
    }

    const operationPath = data.path || null;
    if (data.done && data.response && data.response.assetId) {
      const directId = String(data.response.assetId);
      return finishOk({
        ok: true,
        assetId: directId,
        message: `Berhasil dipublish via server hosting. Asset ID: ${directId}`
      });
    }
    if (!operationPath) {
      return finishOk({ ok: true, message: "Terkirim ke Roblox Open Cloud via server hosting.", assetId: null, operationPath: null });
    }

    const op = data.done ? data : await pollOperation(operationPath, activeApiKey);
    if (!op) {
      // Lanjutkan polling di latar belakang server hosting sampai selesai dan simpan otomatis ke serverJobs & Firebase Library
      // sehingga walaupun user menutup web, Asset ID tetap masuk otomatis!
      const bgTask = (async () => {
        const finalOp = await pollOperationWithDelays(operationPath, activeApiKey, BG_POLL_DELAYS_MS);
        if (!finalOp || !baseLibEntry) return;
        if (finalOp.error) {
          const failEntry = {
            ...baseLibEntry,
            assetId: null,
            status: "fail",
            reason: String(finalOp.error.message || "Roblox menolak asset ini").slice(0, 160)
          };
          recordServerJob(userId, entryId, failEntry);
          await saveUploadToFirebaseServer(quota, entryId, failEntry);
        } else if (finalOp.response && finalOp.response.assetId) {
          const doneEntry = {
            ...baseLibEntry,
            assetId: String(finalOp.response.assetId),
            status: "done"
          };
          recordServerJob(userId, entryId, doneEntry);
          await saveUploadToFirebaseServer(quota, entryId, doneEntry);
        }
      })();
      if (context && typeof context.waitUntil === "function") {
        try { context.waitUntil(bgTask); } catch {}
      }
      return finishOk({
        ok: true,
        pending: true,
        operationPath,
        message: "Terkirim via server hosting, masih diproses Roblox. ID aset akan muncul begitu selesai."
      });
    }
    if (op.error) {
      return failWithSync(`Roblox menolak asset ini: ${op.error.message || "upload gagal."}`);
    }

    const assetId = op.response && op.response.assetId ? String(op.response.assetId) : null;
    if (!assetId) {
      return finishOk({ ok: true, message: "Terkirim ke Roblox Open Cloud via server hosting.", assetId: null, operationPath });
    }
    return finishOk({
      ok: true,
      assetId,
      message: `Berhasil dipublish via server hosting. Asset ID: ${assetId}`
    });
  });

  if (context && typeof context.waitUntil === "function") {
    try { context.waitUntil(uploadPromise.catch(() => {})); } catch {}
  }

  // Jika mode antrean banyak musik (asyncQueue=1) dan slot server sedang penuh (atau proses > 1.2 detik),
  // langsung kembalikan respons serverQueued:true agar seluruh file di browser masuk ke RAM server dalam sekejap (<1 detik)
  // dan user bebas menutup web kapan saja sementara server menyelesaikan semua antrean di latar belakang!
  if (asyncQueue && baseLibEntry) {
    if (queueBusy) {
      return json({
        ok: true,
        pending: true,
        serverQueued: true,
        entryId,
        hostedBy: "server",
        message: "Masuk antrean server hosting — tetap jalan otomatis walau web ditutup."
      });
    }
    const fastRace = await Promise.race([
      uploadPromise,
      sleep(1400).then(() => null)
    ]);
    if (fastRace) return fastRace;
    return json({
      ok: true,
      pending: true,
      serverQueued: true,
      entryId,
      hostedBy: "server",
      message: "Sedang diproses di server hosting — tetap jalan otomatis walau web ditutup."
    });
  }

  return uploadPromise;
}

// Endpoint GET /api/roblox-upload?userId=...&ids=...
// Mengambil daftar musik yang sedang/sudah selesai diproses di server hosting agar otomatis masuk ke Library
// baik saat halaman masih dibuka maupun ketika user menutup web lalu membukanya kembali.
export async function onRequestGet(context) {
  const { request } = context;
  const denied = await requireUser(request);
  if (denied) return denied;

  const url = new URL(request.url);
  const userId = String(url.searchParams.get("userId") || "").trim();
  const idsParam = String(url.searchParams.get("ids") || "").trim();
  const jobs = [];
  const seen = new Set();

  if (idsParam) {
    for (const rawId of idsParam.split(",")) {
      const id = rawId.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const job = serverJobs.get(id);
      if (job) jobs.push(job);
    }
  }
  if (userId) {
    const uSet = userServerJobs.get(userId);
    if (uSet) {
      for (const id of uSet) {
        if (seen.has(id)) continue;
        seen.add(id);
        const job = serverJobs.get(id);
        if (job) jobs.push(job);
      }
    }
  }

  const qUser = userId ? uploadQueues.get(`User:${userId}`) : null;
  const activeCount = qUser ? qUser.active : 0;
  const waitingCount = qUser && Array.isArray(qUser.waiting) ? qUser.waiting.length : 0;

  return json({
    ok: true,
    activeCount,
    waitingCount,
    jobs
  });
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}
