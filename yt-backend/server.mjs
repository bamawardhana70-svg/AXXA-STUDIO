// Backend YouTube -> MP3 milik sendiri (tanpa API pihak ketiga).
// Jalankan di VPS / server Docker: butuh yt-dlp + ffmpeg (sudah ada di Dockerfile).
//
//   POST /convert   header x-backend-secret: <YT_BACKEND_SECRET>   body {"url":"https://youtu.be/..."}
//   -> 200 audio/mpeg (judul di header X-Audio-Title, URL-encoded) atau JSON {ok:false,message}
//   GET  /health    -> {ok:true}
//
// Env: YT_BACKEND_SECRET (wajib), PORT (3000), MAX_SECONDS (420), MAX_JOBS (3), YTDLP_COOKIES (opsional, path cookies.txt)
//
// Anti-lambat: yt-dlp + ffmpeg jalan sebagai satu process group. Kalau timeout atau client putus,
// seluruh group dimatikan (tidak ada ffmpeg yatim yang makan CPU), dan slot MAX_JOBS baru
// dibebaskan saat proses benar-benar selesai.

import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm, readdir, stat } from "node:fs/promises";
import { createReadStream } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { timingSafeEqual } from "node:crypto";

const PORT = Number(process.env.PORT || 3000);
const SECRET = String(process.env.YT_BACKEND_SECRET || "");
const MAX_SECONDS = Number(process.env.MAX_SECONDS || 420);   // batas audio Roblox: 7 menit
const MAX_JOBS = Number(process.env.MAX_JOBS || 3);
const MAX_BYTES = 20 * 1024 * 1024;                            // batas file audio Roblox
const JOB_TIMEOUT_MS = 150000;
const HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be"]);

if (SECRET.length < 16) {
  console.error("YT_BACKEND_SECRET wajib diisi (minimal 16 karakter).");
  process.exit(1);
}

let running = 0;

function send(res, status, obj) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(obj));
}

function secretOk(given) {
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(SECRET);
  return a.length === b.length && timingSafeEqual(a, b);
}

function parseYoutube(value) {
  try {
    const u = new URL(String(value || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.href;
  } catch { return null; }
}

function readBody(req, limit = 4096) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on("data", (c) => { size += c.length; if (size > limit) { reject(new Error("too_large")); req.destroy(); } else chunks.push(c); });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function killGroup(p) {
  if (!p || !p.pid) return;
  try { process.kill(-p.pid, "SIGKILL"); }          // matikan yt-dlp + ffmpeg anaknya sekaligus
  catch { try { p.kill("SIGKILL"); } catch { /* sudah mati */ } }
}

function runYtDlp(url, dir, job) {
  return new Promise((resolve) => {
    const args = [
      "--ignore-config", "--no-playlist", "--no-warnings", "--no-progress",
      "--socket-timeout", "20", "--retries", "3", "--fragment-retries", "3", "--extractor-retries", "2",
      "--http-chunk-size", "10M",                       // hindari throttling YouTube pada download satu aliran
      "-f", "bestaudio/best",
      "-x", "--audio-format", "mp3", "--audio-quality", "64K",
      "--match-filter", `duration<=${MAX_SECONDS}`,
      "--print", "title", "--no-simulate",
      "-o", join(dir, "audio.%(ext)s")
    ];
    if (process.env.YTDLP_COOKIES) args.push("--cookies", process.env.YTDLP_COOKIES);
    args.push("--", url);

    const p = spawn("yt-dlp", args, { stdio: ["ignore", "pipe", "pipe"], detached: true });
    job.proc = p;
    if (job.cancelled) killGroup(p);                    // client sudah putus sebelum spawn selesai
    let out = "", err = "";
    p.stdout.on("data", (d) => { out += d; if (out.length > 20000) out = out.slice(-20000); });
    p.stderr.on("data", (d) => { err += d; if (err.length > 20000) err = err.slice(-20000); });
    const timer = setTimeout(() => { job.timedOut = true; killGroup(p); }, JOB_TIMEOUT_MS);
    p.on("error", () => { clearTimeout(timer); resolve({ code: -1, out, err: "yt-dlp tidak terpasang di server." }); });
    p.on("close", (code) => { clearTimeout(timer); resolve({ code, out, err }); });
  });
}

function explain(r, job) {
  if (job && job.timedOut) return "Proses terlalu lama (lebih dari 2,5 menit). Coba lagi, atau pakai video yang lebih pendek.";
  const t = (r.out + "\n" + r.err).toLowerCase();
  if (t.includes("does not pass filter")) return `Video lebih dari ${Math.round(MAX_SECONDS / 60)} menit (batas audio Roblox).`;
  if (t.includes("sign in to confirm") || t.includes("not a bot")) return "YouTube meminta verifikasi dari IP server. Pasang cookies (YTDLP_COOKIES) atau pindah server.";
  if (t.includes("private video") || t.includes("members-only")) return "Video privat atau khusus member.";
  if (t.includes("unavailable") || t.includes("not available")) return "Video tidak tersedia.";
  if (t.includes("age") && t.includes("restrict")) return "Video dibatasi umur.";
  if (t.includes("tidak terpasang")) return "yt-dlp tidak terpasang di server.";
  return "Gagal mengambil audio dari YouTube.";
}

async function convert(url, res) {
  const dir = await mkdtemp(join(tmpdir(), "yt-"));
  const cleanup = () => rm(dir, { recursive: true, force: true }).catch(() => {});
  const job = { proc: null, cancelled: false, timedOut: false };
  const t0 = Date.now();
  // Client putus / tab ditutup sebelum respons selesai: hentikan yt-dlp supaya CPU tidak terbuang.
  res.on("close", () => {
    if (!res.writableFinished) { job.cancelled = true; killGroup(job.proc); }
  });
  if (res.destroyed) job.cancelled = true;
  try {
    const r = await runYtDlp(url, dir, job);
    if (job.cancelled) { await cleanup(); return; }
    const files = (await readdir(dir)).filter((f) => f.endsWith(".mp3"));
    if (!files.length) {
      console.error("yt-dlp gagal:", r.code, (r.err || r.out).slice(-300));
      await cleanup();
      return send(res, 422, { ok: false, message: explain(r, job) });
    }
    const path = join(dir, files[0]);
    const { size } = await stat(path);
    if (!size || size > MAX_BYTES) { await cleanup(); return send(res, 413, { ok: false, message: "Hasil konversi melebihi batas 20 MB Roblox." }); }
    console.log(`convert ok ${((Date.now() - t0) / 1000).toFixed(1)}s ${size}B`);
    const title = (r.out.split("\n").map((s) => s.trim()).find(Boolean) || "").slice(0, 120);
    const headers = { "content-type": "audio/mpeg", "content-length": String(size), "cache-control": "no-store" };
    if (title) headers["x-audio-title"] = encodeURIComponent(title);
    res.writeHead(200, headers);
    const stream = createReadStream(path);
    stream.on("close", cleanup);
    stream.on("error", () => { res.destroy(); cleanup(); });
    res.on("close", () => stream.destroy());
    stream.pipe(res);
  } catch (e) {
    await cleanup();
    if (!res.headersSent) send(res, 500, { ok: false, message: "Kesalahan server saat convert." });
  }
}

const POLL_DELAYS_MS = [80, 120, 180, 260, 360, 500, 650];
const MAX_CONCURRENT_PER_ID = 2;
const uploadQueues = new Map();

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueUpload(queueKey, fn) {
  let state = uploadQueues.get(queueKey);
  if (!state) {
    state = { active: 0, waiting: [] };
    uploadQueues.set(queueKey, state);
  }
  return new Promise((resolve, reject) => {
    const run = () => {
      state.active += 1;
      Promise.resolve()
        .then(() => fn())
        .then(resolve, reject)
        .finally(() => {
          state.active -= 1;
          if (state.waiting.length > 0) {
            state.waiting.shift()();
          } else if (state.active === 0 && uploadQueues.get(queueKey) === state) {
            uploadQueues.delete(queueKey);
          }
        });
    };
    if (state.active < MAX_CONCURRENT_PER_ID) run();
    else state.waiting.push(run);
  });
}

async function pollRobloxOperation(operationPath, apiKey) {
  const cleanPath = String(operationPath || "").replace(/^\/+/, "");
  const url = cleanPath.startsWith("operations/")
    ? `https://apis.roblox.com/assets/v1/${cleanPath}`
    : `https://apis.roblox.com/assets/v1/operations/${cleanPath}`;
  for (let i = 0; i < POLL_DELAYS_MS.length; i++) {
    await sleep(POLL_DELAYS_MS[i]);
    try {
      const r = await fetch(url, { headers: { "x-api-key": apiKey } });
      if (!r.ok) continue;
      const op = await r.json().catch(() => null);
      if (op && op.done) return op;
    } catch { /* retry next tick */ }
  }
  return null;
}

async function handleUploadAsset(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req, 32 * 1024 * 1024));
  } catch (e) {
    return send(res, e && e.message === "too_large" ? 413 : 400, { ok: false, message: "Payload upload tidak valid atau terlalu besar." });
  }
  const { requestPayload, fileName, contentType, apiKey, creatorType, fileBase64 } = body || {};
  if (!requestPayload || !apiKey || !fileBase64) {
    return send(res, 400, { ok: false, message: "Data upload tidak lengkap." });
  }
  const fileBuf = Buffer.from(String(fileBase64), "base64");
  if (!fileBuf.length || fileBuf.length > MAX_BYTES) {
    return send(res, 400, { ok: false, message: "Ukuran file tidak valid (maks 20MB)." });
  }
  const creator = (requestPayload.creationContext && requestPayload.creationContext.creator) || {};
  const queueKey = creator.groupId ? `Group:${creator.groupId}` : `User:${creator.userId || "anon"}`;

  await enqueueUpload(queueKey, async () => {
    let lastRes = null;
    let lastText = "";
    let lastErr = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const fd = new FormData();
      fd.append("request", JSON.stringify(requestPayload));
      fd.append("fileContent", new Blob([fileBuf], { type: contentType || "application/octet-stream" }), fileName || "asset");
      try {
        const r = await fetch("https://apis.roblox.com/assets/v1/assets", {
          method: "POST",
          headers: { "x-api-key": apiKey },
          body: fd
        });
        const txt = await r.text();
        lastRes = r;
        lastText = txt;
        if (r.ok) break;
        if ((r.status === 429 || r.status >= 500) && attempt < 2) {
          await sleep(900 * (attempt + 1));
          continue;
        }
        break;
      } catch (err) {
        lastErr = err;
        if (attempt < 2) await sleep(800 * (attempt + 1));
      }
    }

    if (!lastRes) {
      return send(res, 502, { ok: false, message: "Gagal menghubungi Roblox dari server hosting: " + (lastErr && lastErr.message ? lastErr.message : "network error") });
    }
    let data = {};
    try { data = JSON.parse(lastText); } catch {}
    if (!lastRes.ok) {
      const detail = data.message || lastText.slice(0, 200) || `HTTP ${lastRes.status}`;
      const hint = creatorType === "Group" && (lastRes.status === 401 || lastRes.status === 403)
        ? " Pastikan API key dibuat dari Group ini (atau kamu punya izin Manage Assets di Group), dan Group ID sudah benar."
        : "";
      return send(res, lastRes.status, { ok: false, message: `Roblox menolak upload (HTTP ${lastRes.status}): ${detail}${hint}` });
    }
    const operationPath = data.path || null;
    if (data.done && data.response && data.response.assetId) {
      const id = String(data.response.assetId);
      return send(res, 200, { ok: true, assetId: id, message: `Berhasil dipublish via server hosting. Asset ID: ${id}` });
    }
    if (!operationPath) {
      return send(res, 200, { ok: true, assetId: null, operationPath: null, message: "Terkirim ke Roblox Open Cloud via server hosting." });
    }
    const op = data.done ? data : await pollRobloxOperation(operationPath, apiKey);
    if (!op) {
      return send(res, 200, { ok: true, pending: true, operationPath, message: "Terkirim via server hosting, masih diproses Roblox." });
    }
    if (op.error) {
      return send(res, 400, { ok: false, message: `Roblox menolak asset ini: ${op.error.message || "upload gagal."}` });
    }
    const assetId = op.response && op.response.assetId ? String(op.response.assetId) : null;
    return send(res, 200, {
      ok: true,
      assetId,
      operationPath,
      message: assetId ? `Berhasil dipublish via server hosting. Asset ID: ${assetId}` : "Terkirim ke Roblox Open Cloud via server hosting."
    });
  });
}

const server = http.createServer(async (req, res) => {
  const path = (req.url || "").split("?")[0];
  if (req.method === "GET" && path === "/health") return send(res, 200, { ok: true });
  if (req.method === "POST" && path === "/upload-asset") {
    if (!secretOk(req.headers["x-backend-secret"])) return send(res, 401, { ok: false, message: "Tidak diizinkan." });
    return handleUploadAsset(req, res);
  }
  if (req.method !== "POST" || path !== "/convert") return send(res, 404, { ok: false, message: "Tidak ditemukan." });
  if (!secretOk(req.headers["x-backend-secret"])) return send(res, 401, { ok: false, message: "Tidak diizinkan." });

  let body;
  try { body = JSON.parse(await readBody(req)); } catch { return send(res, 400, { ok: false, message: "Body harus JSON." }); }
  const url = parseYoutube(body && body.url);
  if (!url) return send(res, 400, { ok: false, message: "Link harus dari YouTube." });
  if (running >= MAX_JOBS) return send(res, 429, { ok: false, message: "Server sedang penuh. Coba lagi sebentar." });

  running++;
  try { await convert(url, res); }                      // selesai begitu yt-dlp selesai; streaming file tidak menahan slot
  finally { running = Math.max(0, running - 1); }
});

server.requestTimeout = 0;
server.listen(PORT, () => console.log("yt-backend jalan di :" + PORT));
