// Cloudflare Pages Function — POST /api/roblox-animation
//
// Instant Roblox Animation Downloader & Spoofer (Re-uploader)
// Mendukung:
// - Direct Animation ID (AssetTypeId 24 - KeyframeSequence / CurveAnimation)
// - Catalog Animation & Emote ID (AssetTypeId 48, 50, 51, 52, 53, 54, 55, 61, 78 -> auto-unwrap ke KeyframeSequence)
// - Catalog Animation Bundle ID (auto-resolve via catalog.roblox.com -> auto-unwrap ke KeyframeSequence)
// - Private Animation ID (otomatis mencoba Open Cloud API Key, Session Cookie, & Auto-Detected Creator Place ID)

const POLL_DELAYS_MS = [150, 250, 350, 500, 650, 800, 1000, 1200];

const ANIMATION_ASSET_TYPES = new Set([24, 48, 50, 51, 52, 53, 54, 55, 61, 78]);

const ASSET_TYPE_NAMES = {
  1: "Image",
  2: "TShirt",
  3: "Audio",
  4: "Mesh",
  8: "Hat",
  9: "Place",
  10: "Model",
  11: "Shirt",
  12: "Pants",
  13: "Decal",
  17: "Head",
  18: "Face",
  19: "Gear",
  21: "Badge",
  24: "Animation",
  32: "Package",
  34: "GamePass",
  38: "Plugin",
  40: "MeshPart",
  48: "ClimbAnimation",
  50: "FallAnimation",
  51: "IdleAnimation",
  52: "JumpAnimation",
  53: "RunAnimation",
  54: "SwimAnimation",
  55: "WalkAnimation",
  61: "EmoteAnimation",
  62: "Video",
  78: "MoodAnimation"
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cleanCredential(raw) {
  const s = String(raw || "").trim();
  const warnMatch = /_\|WARNING:-DO-NOT-SHARE-THIS\.--[^|]+\|_[A-Za-z0-9._\-]+/.exec(s);
  if (warnMatch) return warnMatch[0];
  return s.replace(/[\r\n\u200B-\u200D\u2060\uFEFF\u00A0]/g, "").trim();
}

function isLikelyRoblosecurity(val) {
  if (!val) return false;
  return val.startsWith("_|WARNING:") || (val.length > 120 && !val.startsWith("RBX-"));
}

function extractAnimationId(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/^\d{1,19}$/.test(s)) return s;
  const urlMatch = /(?:rbxassetid:\/\/|roblox\.com\/(?:library|catalog|assets|bundles)\/|store\/asset\/|assets\/|id=)(\d{1,19})/i.exec(s);
  if (urlMatch) return urlMatch[1];
  const anyNum = /(\d{2,19})/.exec(s);
  return anyNum ? anyNum[1] : null;
}

function isLikelyBundleUrl(raw) {
  return /roblox\.com\/bundles\/\d+/i.test(String(raw || ""));
}

function looksLikeRbxmBytes(bytes) {
  if (!bytes || bytes.byteLength < 7) return false;
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(512, bytes.byteLength)));
  return head.startsWith("<roblox!") || head.includes("<roblox");
}

function hasKeyframeData(bytes) {
  if (!bytes || bytes.byteLength < 16) return false;
  const text = new TextDecoder("latin1").decode(bytes);
  return (
    text.includes("KeyframeSequence") ||
    text.includes("CurveAnimation") ||
    text.includes("AnimationRigData") ||
    text.includes("Keyframe")
  );
}

function extractInnerAnimationIds(bytes) {
  if (!bytes || !bytes.byteLength) return [];
  const text = new TextDecoder("latin1").decode(bytes);
  const out = [];
  const seen = new Set();
  const re = /(?:rbxassetid:\/\/|roblox\.com\/asset\/\?id=)(\d{4,19})/gi;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!seen.has(m[1])) {
      seen.add(m[1]);
      out.push(m[1]);
    }
  }
  return out;
}

function detectRbxmFormat(bytes) {
  if (!bytes || bytes.byteLength < 8) return "RBXM";
  const head = new TextDecoder("latin1").decode(bytes.slice(0, Math.min(256, bytes.byteLength)));
  if (head.startsWith("<roblox!")) return "RBXM (Binary)";
  if (head.includes("<roblox")) return "RBXMX (XML)";
  return "RBXM";
}

async function maybeGunzip(bytes) {
  if (bytes && bytes.byteLength >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b && typeof DecompressionStream !== "undefined") {
    try {
      const ds = new DecompressionStream("gzip");
      const stream = new Blob([bytes]).stream().pipeThrough(ds);
      const out = await new Response(stream).arrayBuffer();
      return new Uint8Array(out);
    } catch {
      return bytes;
    }
  }
  return bytes;
}

// Ambil metadata dari Economy API atau Open Cloud Assets API
async function fetchQuickMetadata(assetId, { apiKey, sessionToken }) {
  try {
    const headers = {
      "User-Agent": "Roblox/WinInet",
      "Accept": "application/json"
    };
    if (sessionToken) headers["Cookie"] = `.ROBLOSECURITY=${sessionToken}`;
    const res = await fetch(`https://economy.roblox.com/v2/assets/${assetId}/details`, {
      headers,
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const d = await res.json().catch(() => null);
      if (d && (d.AssetId || d.TargetId || d.Name)) {
        const typeId = Number(d.AssetTypeId || 0);
        const creator = d.Creator || {};
        return {
          assetId: String(assetId),
          name: String(d.Name || `Animation_${assetId}`),
          description: String(d.Description || ""),
          assetTypeId: typeId || null,
          assetType: ASSET_TYPE_NAMES[typeId] || (typeId === 24 ? "Animation" : "Unknown"),
          creatorName: String(creator.Name || "Roblox"),
          creatorType: String(creator.CreatorType || "User"),
          creatorId: String(creator.CreatorTargetId || creator.Id || ""),
          isPublicDomain: Boolean(d.IsPublicDomain)
        };
      }
    }
  } catch {
    // Abaikan jika gagal/timeout
  }

  if (apiKey && !isLikelyRoblosecurity(apiKey)) {
    try {
      const ocRes = await fetch(
        `https://apis.roblox.com/assets/v1/assets/${assetId}?readMask=assetId,assetType,displayName,description,creationContext`,
        {
          headers: { "x-api-key": apiKey, "Accept": "application/json" },
          signal: AbortSignal.timeout(5000)
        }
      );
      if (ocRes.ok) {
        const oc = await ocRes.json().catch(() => null);
        if (oc) {
          const rawType = String(oc.assetType || "").replace(/^ASSET_TYPE_/i, "");
          const isAnim = /animation/i.test(rawType);
          return {
            assetId: String(assetId),
            name: String(oc.displayName || `Animation_${assetId}`),
            description: String(oc.description || ""),
            assetTypeId: isAnim ? 24 : null,
            assetType: isAnim ? "Animation" : rawType || "Animation",
            creatorName: "Roblox Creator",
            creatorType: oc.creationContext?.creator?.groupId ? "Group" : "User",
            creatorId: String(oc.creationContext?.creator?.groupId || oc.creationContext?.creator?.userId || ""),
            isPublicDomain: false
          };
        }
      }
    } catch {
      // Abaikan
    }
  }

  return null;
}

// Jika user memasukkan Bundle ID (misal 82 atau URL roblox.com/bundles/82/...), ambil Asset ID animasi di dalamnya
async function tryResolveBundleAnimationId(bundleId) {
  try {
    const res = await fetch(`https://catalog.roblox.com/v1/bundles/${bundleId}/details`, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) return null;
    const data = await res.json().catch(() => null);
    if (!data || !Array.isArray(data.items)) return null;
    const animItem =
      data.items.find((it) => it && it.type === "Asset" && ANIMATION_ASSET_TYPES.has(Number(it.assetType))) ||
      data.items.find((it) => it && it.type === "Asset" && it.id);
    if (!animItem || !animItem.id) return null;
    return {
      assetId: String(animItem.id),
      bundleName: String(data.name || `Bundle ${bundleId}`),
      itemName: String(animItem.name || data.name || `Animation ${animItem.id}`)
    };
  } catch {
    return null;
  }
}

// Cari otomatis RootPlaceId milik Creator (User/Group) & User sendiri agar Private Animation yang terikat Place dapat diunduh
async function discoverCandidatePlaceIds({ explicitPlaceId, meta, userId }) {
  const out = [];
  const add = (pid) => {
    const s = String(pid || "").trim();
    if (/^\d{1,19}$/.test(s) && s !== "0" && !out.includes(s)) out.push(s);
  };
  add(explicitPlaceId);

  const queries = [];
  if (meta && meta.creatorId) {
    if (String(meta.creatorType).toLowerCase() === "group") {
      queries.push(`https://games.roblox.com/v2/groups/${encodeURIComponent(meta.creatorId)}/games?accessFilter=Public&limit=10`);
    } else {
      queries.push(`https://games.roblox.com/v2/users/${encodeURIComponent(meta.creatorId)}/games?accessFilter=2&limit=10`);
    }
  }
  if (userId && /^\d{1,19}$/.test(String(userId)) && (!meta || String(userId) !== String(meta.creatorId))) {
    queries.push(`https://games.roblox.com/v2/users/${encodeURIComponent(userId)}/games?accessFilter=2&limit=10`);
  }

  await Promise.all(
    queries.map(async (url) => {
      try {
        const r = await fetch(url, { headers: { "Accept": "application/json" }, signal: AbortSignal.timeout(4000) });
        if (!r.ok) return;
        const d = await r.json().catch(() => null);
        for (const g of (d && Array.isArray(d.data) ? d.data : [])) {
          if (g && g.rootPlace && g.rootPlace.id) add(g.rootPlace.id);
        }
      } catch {
        // Abaikan
      }
    })
  );

  return out.slice(0, 6);
}

async function downloadFromCdnUrl(cdnLocation) {
  const cdnRes = await fetch(cdnLocation, {
    headers: { "Accept": "*/*" },
    signal: AbortSignal.timeout(15000)
  });
  if (!cdnRes.ok) return null;
  const bytes = await maybeGunzip(new Uint8Array(await cdnRes.arrayBuffer()));
  if (!bytes.byteLength || !looksLikeRbxmBytes(bytes)) return null;
  return bytes;
}

// Ambil file RBXM dari Roblox AssetDelivery (Public -> Authenticated -> Place-Scoped)
async function fetchSingleAssetBinary(assetId, { apiKey, sessionToken, placeIds = [] }) {
  let detectedTypeId = null;
  let sawNotFound = false;
  let sawAuthDenied = false;
  let lastErrorMsg = "";

  // 1) Coba Public AssetDelivery v2 terlebih dahulu (TANPA x-api-key agar tidak ditolak karena scope legacy-asset:manage)
  try {
    const pubRes = await fetch(`https://assetdelivery.roblox.com/v2/assetId/${assetId}`, {
      headers: {
        "User-Agent": "Roblox/WinInet",
        "Accept": "application/json"
      },
      signal: AbortSignal.timeout(8000)
    });
    const pubData = await pubRes.json().catch(() => ({}));
    if (pubData && pubData.assetTypeId) detectedTypeId = Number(pubData.assetTypeId);
    const pubLoc =
      (Array.isArray(pubData.locations) && pubData.locations[0] && pubData.locations[0].location) ||
      pubData.location ||
      null;
    if (pubLoc) {
      const bytes = await downloadFromCdnUrl(pubLoc);
      if (bytes) {
        return {
          ok: true,
          bytes,
          format: detectRbxmFormat(bytes),
          assetTypeId: detectedTypeId,
          authSource: "public"
        };
      }
    }
    const errObj = Array.isArray(pubData.errors) && pubData.errors[0] ? pubData.errors[0] : null;
    const errCode = Number((errObj && errObj.code) || pubRes.status || 0);
    const errMsg = String((errObj && errObj.message) || pubData.message || "");
    if (errMsg) lastErrorMsg = errMsg;
    if (errCode === 404 || /not found|cannot be found/i.test(errMsg)) {
      sawNotFound = true;
    } else if (errCode === 401 || errCode === 403 || /not authorized|authentication required|permission|private/i.test(errMsg)) {
      sawAuthDenied = true;
    }
  } catch (e) {
    lastErrorMsg = e && e.message ? e.message : "Network error";
  }

  // 2) Cadangan Public v1 direct
  if (!sawNotFound && !sawAuthDenied) {
    try {
      const v1Res = await fetch(`https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`, {
        headers: { "User-Agent": "Roblox/WinInet", "Accept": "*/*" },
        redirect: "follow",
        signal: AbortSignal.timeout(8000)
      });
      if (v1Res.ok) {
        const bytes = await maybeGunzip(new Uint8Array(await v1Res.arrayBuffer()));
        if (looksLikeRbxmBytes(bytes)) {
          return {
            ok: true,
            bytes,
            format: detectRbxmFormat(bytes),
            assetTypeId: detectedTypeId,
            authSource: "public-v1"
          };
        }
      } else if (v1Res.status === 404) {
        sawNotFound = true;
      } else if (v1Res.status === 401 || v1Res.status === 403) {
        sawAuthDenied = true;
      }
    } catch {
      // Lanjut ke autentikasi private
    }
  }

  // 3) Jika Private / Butuh Autentikasi: coba menggunakan Session Cookie (.ROBLOSECURITY) & Place ID (seperti ZaneeZ/AssetDownloader)
  const candidatePlaces = placeIds.length ? [...placeIds, "0"] : ["0"];
  if (sessionToken) {
    for (const pid of candidatePlaces) {
      try {
        const headers = {
          "User-Agent": "Roblox/WinInet",
          "Accept": "application/json",
          "Cookie": `.ROBLOSECURITY=${sessionToken}`
        };
        if (pid && pid !== "0") headers["Roblox-Place-Id"] = String(pid);
        const r = await fetch(`https://assetdelivery.roblox.com/v2/assetId/${assetId}`, {
          headers,
          signal: AbortSignal.timeout(8000)
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.assetTypeId) detectedTypeId = Number(d.assetTypeId);
        const loc =
          (Array.isArray(d.locations) && d.locations[0] && d.locations[0].location) ||
          d.location ||
          null;
        if (loc) {
          const bytes = await downloadFromCdnUrl(loc);
          if (bytes) {
            return {
              ok: true,
              bytes,
              format: detectRbxmFormat(bytes),
              assetTypeId: detectedTypeId,
              authSource: "private-cookie"
            };
          }
        }
        const errObj = Array.isArray(d.errors) && d.errors[0] ? d.errors[0] : null;
        if (errObj && errObj.message) lastErrorMsg = errObj.message;
      } catch {
        // Coba Place ID berikutnya
      }
    }
  }

  // 4) Coba Open Cloud Asset Delivery API (jika Open Cloud API Key punya scope legacy-asset:manage)
  if (apiKey && !isLikelyRoblosecurity(apiKey)) {
    for (const pid of candidatePlaces.slice(0, 3)) {
      try {
        const headers = {
          "x-api-key": apiKey,
          "Accept": "application/json"
        };
        if (pid && pid !== "0") headers["Roblox-Place-Id"] = String(pid);
        const r = await fetch(`https://apis.roblox.com/asset-delivery-api/v1/assetId/${assetId}`, {
          headers,
          signal: AbortSignal.timeout(8000)
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.assetTypeId) detectedTypeId = Number(d.assetTypeId);
        const loc =
          (Array.isArray(d.locations) && d.locations[0] && d.locations[0].location) ||
          d.location ||
          null;
        if (loc) {
          const bytes = await downloadFromCdnUrl(loc);
          if (bytes) {
            return {
              ok: true,
              bytes,
              format: detectRbxmFormat(bytes),
              assetTypeId: detectedTypeId,
              authSource: "opencloud"
            };
          }
        }
      } catch {
        // Lanjut
      }
    }
  }

  if (sawAuthDenied) {
    return {
      ok: false,
      code: "PRIVATE_ASSET",
      status: 403,
      hasSessionToken: Boolean(sessionToken),
      message: sessionToken
        ? `Animasi ID ${assetId} bersifat Private dan akun/cookie Roblox yang digunakan tidak memiliki izin akses ke animasi ini.`
        : `Animasi ID ${assetId} berstatus Private di Roblox. Untuk mengunduh animasi private, masukkan Cookie .ROBLOSECURITY akun yang memiliki akses.`
    };
  }

  if (sawNotFound) {
    return {
      ok: false,
      code: "INVALID_ANIMATION_ID",
      status: 404,
      message: `Animation ID ${assetId} tidak ditemukan di Roblox.`
    };
  }

  return {
    ok: false,
    code: "ROBLOX_API_ERROR",
    status: 502,
    message: lastErrorMsg || `Gagal mengambil animasi ${assetId} dari Roblox.`
  };
}

// Ambil animasi lengkap dengan auto-unwrap untuk Catalog Animation / Emote / Bundle
async function resolveAndFetchAnimation(rawInput, { apiKey, sessionToken, placeId, userId }) {
  let targetId = extractAnimationId(rawInput);
  if (!targetId) {
    return {
      ok: false,
      code: "INVALID_ANIMATION_ID",
      status: 400,
      message: "Masukkan Animation ID Roblox yang valid (contoh: 507771019)."
    };
  }

  // Jika input berupa URL bundle (roblox.com/bundles/82/...), langsung resolve bundle dulu
  let bundleResolved = null;
  if (isLikelyBundleUrl(rawInput)) {
    bundleResolved = await tryResolveBundleAnimationId(targetId);
    if (bundleResolved) targetId = bundleResolved.assetId;
  }

  let quickMeta = await fetchQuickMetadata(targetId, { apiKey, sessionToken });

  // Cari Place ID milik creator / user secara paralel bila asset tidak public
  let candidatePlaceIds = [];
  if (placeId) candidatePlaceIds.push(String(placeId));
  if (!quickMeta || !quickMeta.isPublicDomain) {
    candidatePlaceIds = await discoverCandidatePlaceIds({
      explicitPlaceId: placeId,
      meta: quickMeta,
      userId
    });
  }

  let delivery = await fetchSingleAssetBinary(targetId, {
    apiKey,
    sessionToken,
    placeIds: candidatePlaceIds
  });

  // Jika 404 dan belum dicoba sebagai Bundle ID, cek apakah ID tersebut adalah Bundle ID animasi
  if (!delivery.ok && delivery.code === "INVALID_ANIMATION_ID" && !bundleResolved) {
    bundleResolved = await tryResolveBundleAnimationId(targetId);
    if (bundleResolved) {
      targetId = bundleResolved.assetId;
      quickMeta = await fetchQuickMetadata(targetId, { apiKey, sessionToken });
      delivery = await fetchSingleAssetBinary(targetId, {
        apiKey,
        sessionToken,
        placeIds: candidatePlaceIds
      });
    }
  }

  if (!delivery.ok) {
    const meta = quickMeta || {
      assetId: String(targetId),
      name: `Animation_${targetId}`,
      description: "",
      assetTypeId: 24,
      assetType: "Animation",
      creatorName: "Roblox",
      creatorType: "User",
      creatorId: "",
      isPublicDomain: false
    };
    let msg = delivery.message;
    if (delivery.code === "PRIVATE_ASSET" && quickMeta && quickMeta.name) {
      msg = delivery.hasSessionToken
        ? `Animasi Private "${quickMeta.name}" (ID ${targetId} oleh ${quickMeta.creatorName}) tidak memberikan izin akses ke akunmu.`
        : `Animasi "${quickMeta.name}" (ID ${targetId} oleh ${quickMeta.creatorName}) berstatus Private. Masukkan Cookie .ROBLOSECURITY di bawah untuk mengunduh animasi private yang diizinkan.`;
    }
    return {
      ok: false,
      code: delivery.code,
      status: delivery.status,
      assetInfo: meta,
      message: msg
    };
  }

  // Jika file yang terunduh adalah Catalog Animation Wrapper / Emote (berisi URL rbxassetid:// ke KeyframeSequence asli),
  // otomatis unwrap dan ambil file KeyframeSequence (.rbxm) aslinya agar langsung siap pakai di Roblox Studio & Spoofer!
  if (!hasKeyframeData(delivery.bytes)) {
    const innerIds = extractInnerAnimationIds(delivery.bytes);
    for (const innerId of innerIds) {
      const innerDelivery = await fetchSingleAssetBinary(innerId, {
        apiKey,
        sessionToken,
        placeIds: candidatePlaceIds
      });
      if (innerDelivery.ok && hasKeyframeData(innerDelivery.bytes)) {
        delivery = innerDelivery;
        break;
      }
    }
  }

  const effectiveTypeId = (quickMeta && quickMeta.assetTypeId) || delivery.assetTypeId || 24;
  if (
    effectiveTypeId &&
    !ANIMATION_ASSET_TYPES.has(effectiveTypeId) &&
    !hasKeyframeData(delivery.bytes)
  ) {
    const detectedName = ASSET_TYPE_NAMES[effectiveTypeId] || `Type ${effectiveTypeId}`;
    return {
      ok: false,
      code: "UNSUPPORTED_ANIMATION",
      status: 400,
      message: `Asset ID ${targetId} bukan Animation (terdeteksi sebagai ${detectedName}).`
    };
  }

  const meta = quickMeta || {
    assetId: String(targetId),
    name: bundleResolved ? bundleResolved.itemName : `Animation_${targetId}`,
    description: "",
    assetTypeId: 24,
    assetType: "Animation",
    creatorName: "Roblox",
    creatorType: "User",
    creatorId: "",
    isPublicDomain: true
  };

  return {
    ok: true,
    animationId: String(targetId),
    meta,
    delivery
  };
}

async function pollOperation(operationPath, apiKey) {
  for (let i = 0; i < POLL_DELAYS_MS.length; i++) {
    await sleep(POLL_DELAYS_MS[i]);
    let res;
    try {
      res = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
        headers: { "x-api-key": apiKey }
      });
    } catch {
      continue;
    }
    if (!res.ok) continue;
    let op = null;
    try {
      op = await res.json();
    } catch {
      continue;
    }
    if (op && op.done) return op;
  }
  return null;
}

async function uploadAnimationToRoblox({ bytes, displayName, description, creatorType, userId, groupId, apiKey }) {
  const safeName = String(displayName || "Animation").trim().slice(0, 30) || "Animation";
  const safeDesc = String(description || "Uploaded via baxdev Animation Spoofer").slice(0, 500);

  if (!apiKey || isLikelyRoblosecurity(apiKey)) {
    return {
      ok: false,
      code: "AUTHENTICATION_REQUIRED",
      status: 401,
      message: "Hubungkan akun Roblox & Open Cloud API Key di menu Pengaturan terlebih dahulu untuk mengupload ulang animasi."
    };
  }

  const creator = creatorType === "Group" && groupId ? { groupId: String(groupId) } : { userId: String(userId) };
  const requestPayload = {
    assetType: "Animation",
    displayName: safeName,
    description: safeDesc,
    creationContext: { creator }
  };

  const upstream = new FormData();
  upstream.append("request", JSON.stringify(requestPayload));
  const blob = new Blob([bytes], { type: "model/x-rbxm" });
  upstream.append("fileContent", blob, `${safeName.replace(/[^a-zA-Z0-9_-]+/g, "_") || "animation"}.rbxm`);

  let res;
  try {
    res = await fetch("https://apis.roblox.com/assets/v1/assets", {
      method: "POST",
      headers: { "x-api-key": apiKey },
      body: upstream
    });
  } catch (err) {
    return {
      ok: false,
      code: "NETWORK_ERROR",
      status: 502,
      message: "Gagal menghubungi Roblox Open Cloud: " + (err && err.message ? err.message : "network error")
    };
  }

  const bodyText = await res.text();
  let data = {};
  try {
    data = JSON.parse(bodyText);
  } catch {
    // Bukan JSON
  }

  if (!res.ok) {
    const detail = data.message || bodyText.slice(0, 200) || `HTTP ${res.status}`;
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      status: res.status,
      message: `Gagal mengupload animasi ke Roblox (HTTP ${res.status}): ${detail}`
    };
  }

  if (data.done && data.response && data.response.assetId) {
    return {
      ok: true,
      newAssetId: String(data.response.assetId),
      pending: false,
      operationPath: data.path || null
    };
  }

  const operationPath = data.path || null;
  if (!operationPath) {
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      status: 502,
      message: "Roblox tidak mengembalikan operation path maupun Asset ID."
    };
  }

  const op = await pollOperation(operationPath, apiKey);
  if (!op) {
    return {
      ok: true,
      newAssetId: null,
      pending: true,
      operationPath
    };
  }
  if (op.error) {
    return {
      ok: false,
      code: "UPLOAD_FAILED",
      status: 400,
      message: `Roblox menolak upload animasi: ${op.error.message || "upload gagal."}`
    };
  }
  const resolvedId = op.response && op.response.assetId ? String(op.response.assetId) : null;
  return {
    ok: true,
    newAssetId: resolvedId,
    pending: !resolvedId,
    operationPath
  };
}

export async function onRequestPost(context) {
  try {
    return await handleRequest(context);
  } catch (err) {
    return json(
      {
        ok: false,
        code: "ROBLOX_API_ERROR",
        message: "Kesalahan server: " + (err && err.message ? err.message : "tidak diketahui")
      },
      500
    );
  }
}

async function handleRequest(context) {
  const { request } = context;
  const env = (context && context.env) || (typeof process !== "undefined" ? process.env : {}) || {};

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, code: "INVALID_REQUEST", message: "Body permintaan tidak valid (bukan JSON)." }, 400);
  }

  const action = String(body.action || "download").trim().toLowerCase();
  const rawApiKey = cleanCredential(body.apiKey || env.ROBLOX_OPEN_CLOUD_KEY || "");
  const rawSession = cleanCredential(
    body.sessionToken ||
      (isLikelyRoblosecurity(rawApiKey) ? rawApiKey : "") ||
      env.ROBLOX_SECURITY_COOKIE ||
      env.ROBLOX_COOKIE ||
      ""
  );
  const apiKey = isLikelyRoblosecurity(rawApiKey) ? "" : rawApiKey;
  const sessionToken = rawSession;
  const userId = String(body.userId || "").trim();
  const placeId = String(body.placeId || env.ROBLOX_DEFAULT_PLACE_ID || env.DEFAULT_PLACE_ID || "").trim();

  const resolved = await resolveAndFetchAnimation(body.animationId || body.assetId, {
    apiKey,
    sessionToken,
    placeId,
    userId
  });

  if (!resolved.ok) {
    return json(
      {
        ok: false,
        code: resolved.code,
        assetInfo: resolved.assetInfo || null,
        message: resolved.message
      },
      resolved.status || 400
    );
  }

  const { animationId, meta, delivery } = resolved;

  if (action === "inspect") {
    return json({
      ok: true,
      assetInfo: meta,
      access: {
        accessible: true,
        code: "ACCESS_GRANTED",
        format: delivery.format,
        sizeBytes: delivery.bytes.byteLength
      }
    });
  }

  if (action === "download") {
    const safeFileBase =
      String(meta.name || `animation_${animationId}`)
        .replace(/[^a-zA-Z0-9_\-. ]+/g, "")
        .trim()
        .replace(/\s+/g, "_")
        .slice(0, 50) || `animation_${animationId}`;
    const filename = `${safeFileBase}_${animationId}.rbxm`;

    return new Response(delivery.bytes, {
      status: 200,
      headers: {
        "Content-Type": "model/x-rbxm",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(delivery.bytes.byteLength),
        "Cache-Control": "no-store",
        "X-Asset-Id": String(animationId),
        "X-Asset-Name": encodeURIComponent(meta.name || `Animation ${animationId}`),
        "X-Asset-Creator": encodeURIComponent(meta.creatorName || "Roblox"),
        "X-Asset-Format": delivery.format,
        "X-Asset-Size": String(delivery.bytes.byteLength)
      }
    });
  }

  if (action === "spoof") {
    const creatorType = String(body.creatorType || "User").trim() === "Group" ? "Group" : "User";
    const targetUserId = String(body.targetUserId || userId || "").trim();
    const targetGroupId = String(body.groupId || "").trim();

    if (!apiKey) {
      return json(
        {
          ok: false,
          code: "AUTHENTICATION_REQUIRED",
          message: "Pastikan User ID dan Open Cloud API Key kamu sudah tersimpan di menu Pengaturan untuk mengupload ulang animasi."
        },
        401
      );
    }

    const displayName = String(body.displayName || meta.name || `Animation ${animationId}`).trim().slice(0, 30) || "Animation";
    const description = String(body.description || meta.description || `Spoofed from ${animationId}`).slice(0, 500);

    const uploadResult = await uploadAnimationToRoblox({
      bytes: delivery.bytes,
      displayName,
      description,
      creatorType,
      userId: targetUserId,
      groupId: targetGroupId,
      apiKey
    });

    if (!uploadResult.ok) {
      return json(
        {
          ok: false,
          code: uploadResult.code || "UPLOAD_FAILED",
          assetInfo: meta,
          message: uploadResult.message
        },
        uploadResult.status || 400
      );
    }

    return json({
      ok: true,
      sourceAssetId: String(animationId),
      sourceAssetName: meta.name,
      newAssetId: uploadResult.newAssetId,
      pending: Boolean(uploadResult.pending),
      operationPath: uploadResult.operationPath || null,
      creatorType,
      targetId: creatorType === "Group" ? targetGroupId : targetUserId,
      displayName,
      format: delivery.format,
      sizeBytes: delivery.bytes.byteLength,
      message: uploadResult.newAssetId
        ? `Selesai! Animation ID baru berhasil dibuat: ${uploadResult.newAssetId}`
        : "Animasi terkirim ke Roblox, sedang diproses untuk menghasilkan Animation ID baru."
    });
  }

  return json({ ok: false, code: "INVALID_ACTION", message: `Action "${action}" tidak dikenali.` }, 400);
}

export async function onRequestGet() {
  return json({ ok: false, message: "Gunakan POST." }, 405);
}

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
