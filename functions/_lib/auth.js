// Verifikasi Firebase ID token (login Google) di Cloudflare Pages Functions, tanpa library.
// Tanpa environment variable: Project ID Firebase (bukan rahasia) ditulis langsung di bawah.
// Pemakaian di handler:  const deny = await requireUser(request); if (deny) return deny;

const FIREBASE_PROJECT_ID = "baxdev-rbx";
const FIREBASE_DB_URL = "https://baxdev-rbx-default-rtdb.asia-southeast1.firebasedatabase.app";

// Proof-of-work diringankan agar upload ke Roblox instan tanpa jeda komputasi di browser/server.
export const POW_ENFORCE = false;
export const POW_BITS = 4;
const POW_WINDOW_S = 120;   // toleransi selisih jam klien-server
// Maintenance terjadwal: setiap hari 00.00 - 05.00 WIB (UTC+7, tanpa DST).
export const MAINTENANCE_TEXT =
  "Saat ini layanan sedang dalam proses pemeliharaan.\n" +
  "Layanan akan kembali tersedia nanti pagi.\n\n" +
  "Mohon maaf atas ketidaknyamanannya. Terima kasih atas pengertiannya.";

export function isScheduledMaintenance(now) {
  const wibHour = new Date((now || Date.now()) + 7 * 3600e3).getUTCHours();
  return wibHour >= 0 && wibHour < 5;
}

// In-memory cache untuk mempercepat verifikasi token, cek ban, VIP, dan kuota saat upload
const memCache = new Map(); // key -> { val, exp }
function getCached(key) {
  const hit = memCache.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.exp) {
    memCache.delete(key);
    return undefined;
  }
  return hit.val;
}
function setCached(key, val, ttlMs) {
  if (memCache.size > 5000) memCache.clear();
  memCache.set(key, { val, exp: Date.now() + ttlMs });
  return val;
}

// Owner (lolos baca /isAdmin di Security Rules) boleh tetap memakai layanan saat maintenance.
async function isOwnerToken(token) {
  const cacheKey = "owner:" + token.slice(-32);
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const r = await fetch(FIREBASE_DB_URL + "/isAdmin.json?auth=" + encodeURIComponent(token), { cache: "no-store" });
    return setCached(cacheKey, r.ok, 60000);
  } catch { return false; }
}

// Owner rank: akun Owner utama (8675322450) dan akun Owner kedua (11934540405).
export const OWNER_ROBLOX_ID = "8675322450";
export const SECOND_OWNER_ROBLOX_ID = "11934540405";
export const OWNER_ROBLOX_IDS = [OWNER_ROBLOX_ID, SECOND_OWNER_ROBLOX_ID];

export async function isOwnerSession(token, robloxId) {
  const rid = String(robloxId || "").trim();
  if (rid === SECOND_OWNER_ROBLOX_ID) return true;
  return OWNER_ROBLOX_IDS.includes(rid) && await isOwnerToken(token);
}

// vip/<robloxId>: { expiresAt (0 = permanen), plusUntil? (0 = permanen), ... }. VIP Plus selalu ikut VIP.
export function vipActive(v) { return !!v && (!v.expiresAt || v.expiresAt > Date.now()); }
export function plusActive(v) {
  return vipActive(v) && typeof v.plusUntil === "number" && (v.plusUntil === 0 || v.plusUntil > Date.now());
}

async function fetchVipRecord(rid) {
  const cacheKey = "vip:" + rid;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;
  const r = await fetch(FIREBASE_DB_URL + "/vip/" + rid + ".json", { cache: "no-store" });
  if (!r.ok) throw new Error("vip read " + r.status);
  const v = await r.json();
  return setCached(cacheKey, v, 30000);
}

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const jwksCache = {};   // url -> { keys, at }

function b64urlToBytes(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64urlToJson(s) { return JSON.parse(new TextDecoder().decode(b64urlToBytes(s))); }

async function loadKeys(url) {
  const res = await fetch(url, { cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) throw new Error("jwks");
  const data = await res.json();
  jwksCache[url] = { keys: data.keys || [], at: Date.now() };
  return jwksCache[url].keys;
}

// Cari kunci publik by kid. Cache 1 jam; kid tak dikenal baru memicu muat ulang bila cache sudah >5 menit (rotasi kunci).
async function findKey(url, kid) {
  const c = jwksCache[url];
  let keys = c && Date.now() - c.at < 3600e3 ? c.keys : await loadKeys(url);
  let jwk = keys.find((k) => k.kid === kid);
  if (!jwk && jwksCache[url] && Date.now() - jwksCache[url].at > 300e3) {
    keys = await loadKeys(url);
    jwk = keys.find((k) => k.kid === kid);
  }
  return jwk || null;
}

// Urai JWT RS256 tanpa memeriksa tanda tangan. null kalau bentuknya salah.
function parseJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  let header, payload;
  try { header = b64urlToJson(parts[0]); payload = b64urlToJson(parts[1]); } catch { return null; }
  if (!header || !payload || header.alg !== "RS256" || !header.kid) return null;
  return { parts, header, payload };
}

async function signatureValid(jwt, jwksUrl) {
  const jwk = await findKey(jwksUrl, jwt.header.kid);
  if (!jwk) return false;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  return crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlToBytes(jwt.parts[2]), new TextEncoder().encode(jwt.parts[0] + "." + jwt.parts[1]));
}

const timeValid = (p, now) => typeof p.exp === "number" && p.exp >= now - 30 && !(p.iat > now + 300);

export async function verifyIdToken(token, projectId) {
  const cacheKey = "jwt:" + token.slice(-40);
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;
  const jwt = parseJwt(token);
  if (!jwt) return null;
  const p = jwt.payload;
  const now = Math.floor(Date.now() / 1000);
  if (p.aud !== projectId || p.iss !== "https://securetoken.google.com/" + projectId) return null;
  if (!p.sub || !timeValid(p, now)) return null;
  const valid = await signatureValid(jwt, JWKS_URL);
  if (!valid) return null;
  const user = { uid: p.sub, email: p.email || "" };
  const ttlMs = Math.max(5000, Math.min(120000, (p.exp - now) * 1000));
  return setCached(cacheKey, user, ttlMs);
}

// ── Proof-of-work ──
const powSeen = new Map();   // msg -> kedaluwarsa (ms)

async function leadingZeroBits(msg) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(msg)));
  let bits = 0;
  for (let i = 0; i < d.length; i++) {
    if (d[i] === 0) { bits += 8; continue; }
    bits += Math.clz32(d[i]) - 24;
    break;
  }
  return bits;
}

// Balikkan Response (tolak) bila PoW tidak sah; null bila lolos.
async function checkPow(request) {
  const nowS = Math.floor(Date.now() / 1000);
  const info = { bits: POW_BITS, now: nowS };
  const m = /^(\d{10})\.([0-9a-z]{1,24})$/.exec(request.headers.get("x-bx-pow") || "");
  if (!m) return deny(403, "pow_required", "Verifikasi keamanan belum selesai. Muat ulang halaman lalu coba lagi.", info);
  const ts = Number(m[1]);
  if (Math.abs(nowS - ts) > POW_WINDOW_S) return deny(403, "pow_stale", "Jam perangkat tidak sinkron. Coba lagi.", info);
  let path;
  try { path = new URL(request.url).pathname; } catch { return deny(400, "bad_request", "URL tidak valid."); }
  const msg = "bx1|" + ts + "|" + request.method.toUpperCase() + "|" + path + "|" + m[2];
  if ((await leadingZeroBits(msg)) < POW_BITS) return deny(403, "pow_failed", "Verifikasi keamanan gagal. Muat ulang halaman lalu coba lagi.", info);
  const nowMs = Date.now();
  if (powSeen.size > 4000) {
    for (const [k, exp] of powSeen) if (exp < nowMs) powSeen.delete(k);
    if (powSeen.size > 8000) powSeen.clear();
  }
  if (powSeen.has(msg)) return deny(403, "pow_replay", "Permintaan ganda ditolak. Coba lagi.", info);
  powSeen.set(msg, nowMs + POW_WINDOW_S * 2000);
  return null;
}

function deny(status, code, message, extra) {
  return new Response(JSON.stringify({ ok: false, code, message, ...(extra || {}) }), {
    status, headers: { "content-type": "application/json", "cache-control": "no-store" }
  });
}

function sameOriginBrowser(request) {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site === "same-origin" || site === "same-site" || site === "cross-site";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try { return new URL(origin).host === new URL(request.url).host; } catch { return false; }
}

async function isUserBanned(uid) {
  const cacheKey = "ban:" + uid;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return cached;
  try {
    const br = await fetch(FIREBASE_DB_URL + "/bans/" + encodeURIComponent(uid) + ".json", { cache: "no-store" });
    if (br.ok) {
      const banned = (await br.text()).trim() !== "null";
      return setCached(cacheKey, banned, 45000);
    }
  } catch { /* lanjut */ }
  return false;
}

export async function requireUser(request) {
  if (!sameOriginBrowser(request)) {
    return deny(403, "forbidden_origin", "Permintaan hanya diterima dari situs resmi.");
  }
  if (POW_ENFORCE) {
    const powDeny = await checkPow(request);
    if (powDeny) return powDeny;
  }
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (isScheduledMaintenance() && !(m && await isOwnerToken(m[1]))) {
    return deny(503, "maintenance", MAINTENANCE_TEXT);
  }
  if (!m) return deny(401, "login_required", "Login Google dulu.");
  try {
    const user = await verifyIdToken(m[1], FIREBASE_PROJECT_ID);
    if (!user) return deny(401, "login_required", "Sesi login Google tidak valid. Login ulang.");
    if (await isUserBanned(user.uid)) {
      return deny(403, "banned", "Akun kamu diblokir dari layanan ini. Hubungi admin bila ini keliru.");
    }
  } catch {
    return deny(502, "auth_unavailable", "Gagal memverifikasi login. Coba lagi.");
  }
  return null;
}

// Gerbang fitur VIP (menu Spoof/Animasi). Sama seperti requireVipPlus tapi cukup VIP aktif. Gagal baca DB = tolak.
export async function requireVip(request, robloxId) {
  const rid = String(robloxId || "").trim();
  if (!/^[0-9]{1,20}$/.test(rid)) return deny(400, "roblox_required", "Isi Roblox User ID di Pengaturan dulu.");
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (m && await isOwnerSession(m[1], rid)) return null;
  let v;
  try {
    v = await fetchVipRecord(rid);
  } catch {
    return deny(502, "vip_unavailable", "Gagal memeriksa status VIP. Coba lagi.");
  }
  if (!vipActive(v)) return deny(403, "vip_required", "Menu Spoof khusus VIP.");
  return null;
}

// Gerbang fitur VIP Plus (dipanggil setelah requireUser lolos). Gagal baca DB = tolak (fitur berbayar, jangan fail-open).
// Balikkan Response (tolak) atau null kalau boleh.
export async function requireVipPlus(request, robloxId) {
  const rid = String(robloxId || "").trim();
  if (!/^[0-9]{1,20}$/.test(rid)) return deny(400, "roblox_required", "Isi Roblox User ID di Pengaturan dulu.");
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (m && await isOwnerSession(m[1], rid)) return null;
  let v;
  try {
    v = await fetchVipRecord(rid);
  } catch {
    return deny(502, "vip_unavailable", "Gagal memeriksa status VIP Plus. Coba lagi.");
  }
  if (!plusActive(v)) return deny(403, "vip_plus_required", "Fitur ini khusus VIP Plus.");
  return null;
}

// ── Kuota publish akun free (disimpan di Firebase: quota/<uid> = {day, count}) ──
export const FREE_DAILY_LIMIT = 5;
const WIB_MS = 7 * 3600e3, DAY_MS = 86400e3;
const wibDay = (now) => Math.floor((now + WIB_MS) / DAY_MS);

async function readQuota(uid, token) {
  const day = wibDay(Date.now());
  const cacheKey = `q:${uid}:${day}`;
  const cached = getCached(cacheKey);
  if (cached !== undefined) return { day, used: cached };
  const r = await fetch(FIREBASE_DB_URL + "/quota/" + encodeURIComponent(uid) + ".json?auth=" + encodeURIComponent(token), { cache: "no-store" });
  if (!r.ok) throw new Error("quota read " + r.status);
  const rec = await r.json();
  const used = rec && rec.day === day ? Number(rec.count) || 0 : 0;
  setCached(cacheKey, used, 30000);
  return { day, used };
}

// ── Kuota publish akun VIP / VIP Plus (tanpa limit 100 audio) ──
export const VIP_PERIOD_MS = 6 * 3600e3;
export const VIP_PERIOD_LIMIT = 999999;
const vipPeriod = (now) => Math.floor(now / VIP_PERIOD_MS);

// Cek sebelum upload. VIP / VIP Plus & Owner bebas tanpa limit 100 audio.
export async function quotaBegin(request, robloxId) {
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get("authorization") || "");
  if (!m) return { ok: true, skip: true };
  try {
    const user = await verifyIdToken(m[1], FIREBASE_PROJECT_ID);
    if (!user) return { ok: true, skip: true };
    const rid = String(robloxId || "").trim();
    if (/^[0-9]{1,20}$/.test(rid)) {
      if (await isOwnerSession(m[1], rid)) return { ok: true, owner: true, uid: user.uid, token: m[1] };
      try {
        const v = await fetchVipRecord(rid);
        if (vipActive(v)) {
          return { ok: true, uid: user.uid, token: m[1], vip: true, unlimited: true };
        }
      } catch { /* anggap bukan VIP */ }
    }
    const q = await readQuota(user.uid, m[1]);
    if (q.used >= FREE_DAILY_LIMIT) return { ok: false, used: q.used, limit: FREE_DAILY_LIMIT };
    return { ok: true, uid: user.uid, token: m[1] };
  } catch {
    return { ok: true, skip: true };
  }
}

async function bumpCounter(path, token, periodKey, periodNow) {
  const url = FIREBASE_DB_URL + path + ".json?auth=" + encodeURIComponent(token);
  for (let attempt = 0; attempt < 6; attempt++) {
    const g = await fetch(url, { headers: { "X-Firebase-ETag": "true" }, cache: "no-store" });
    if (!g.ok) throw new Error(path + " read " + g.status);
    const etag = g.headers.get("ETag");
    const rec = await g.json();
    const used = rec && rec[periodKey] === periodNow ? Number(rec.count) || 0 : 0;
    const headers = { "content-type": "application/json" };
    if (etag) headers["if-match"] = etag;
    const w = await fetch(url, { method: "PUT", headers, body: JSON.stringify({ [periodKey]: periodNow, count: used + 1 }) });
    if (w.ok) return used + 1;
    if (w.status !== 412) return null;
    await new Promise((r) => setTimeout(r, 40 + Math.random() * 120));
  }
  return null;
}

// Catat 1 publish setelah upload berhasil. VIP / Owner tidak dibatasi limit 100 audio.
export async function quotaCommit(q) {
  if (!q || q.skip || q.owner || q.vip || q.unlimited || !q.uid) return null;
  try {
    const day = wibDay(Date.now());
    const cacheKey = `q:${q.uid}:${day}`;
    const nextUsed = (getCached(cacheKey) || 0) + 1;
    setCached(cacheKey, nextUsed, 30000);
    bumpCounter("/quota/" + encodeURIComponent(q.uid), q.token, "day", day).then((u) => {
      if (u != null) setCached(cacheKey, u, 30000);
    }).catch(() => {});
    return { used: nextUsed, limit: FREE_DAILY_LIMIT };
  } catch { return null; }
}
