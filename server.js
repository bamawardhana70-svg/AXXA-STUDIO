import http from "node:http";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as geoApi from "./functions/api/geo.js";
import * as imageUpscaleApi from "./functions/api/image-upscale.js";
import * as robloxAssetCheckApi from "./functions/api/roblox-asset-check.js";
import * as robloxAssetStatusApi from "./functions/api/roblox-asset-status.js";
import * as robloxMyAudioApi from "./functions/api/roblox-my-audio.js";
import * as robloxPermissionApi from "./functions/api/roblox-permission.js";
import * as robloxProfileApi from "./functions/api/roblox-profile.js";
import * as robloxTestApi from "./functions/api/roblox-test.js";
import * as robloxUploadApi from "./functions/api/roblox-upload.js";
import * as tiktokDownloadApi from "./functions/api/tiktok-download.js";
import * as toolApi from "./functions/api/tool.js";
import * as youtubeDownloadApi from "./functions/api/youtube-download.js";
import * as youtubeTitleApi from "./functions/api/youtube-title.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = Number(process.env.PORT || 3000);
const HOST = "0.0.0.0";

const API_ROUTES = {
  "geo": geoApi,
  "image-upscale": imageUpscaleApi,
  "roblox-asset-check": robloxAssetCheckApi,
  "roblox-asset-status": robloxAssetStatusApi,
  "roblox-my-audio": robloxMyAudioApi,
  "roblox-permission": robloxPermissionApi,
  "roblox-profile": robloxProfileApi,
  "roblox-test": robloxTestApi,
  "roblox-upload": robloxUploadApi,
  "tiktok-download": tiktokDownloadApi,
  "tool": toolApi,
  "youtube-download": youtubeDownloadApi,
  "youtube-title": youtubeTitleApi,
};

const METHOD_HANDLERS = {
  GET: "onRequestGet",
  POST: "onRequestPost",
  PUT: "onRequestPut",
  PATCH: "onRequestPatch",
  DELETE: "onRequestDelete",
  OPTIONS: "onRequestOptions",
  HEAD: "onRequestHead",
};

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

const BLOCKED_PREFIXES = [
  "/functions/",
  "/yt-backend/",
  "/yt-worker/",
  "/.git/",
];

const BLOCKED_FILES = new Set([
  "/server.js",
  "/_worker.js",
  "/_headers",
  "/_redirects",
  "/_routes.json",
  "/database.rules.json",
  "/package.json",
  "/package-lock.json",
  "/.env",
  "/.env.example",
  "/.gitignore",
]);

function readBodyBuffer(req, maxBytes = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Payload Too Large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handleApiRequest(req, res, routeName) {
  const mod = API_ROUTES[routeName];
  const method = (req.method || "GET").toUpperCase();
  const fnName = METHOD_HANDLERS[method];
  const fn = mod[fnName] || (method === "HEAD" ? mod.onRequestGet : null) || mod.onRequest;

  if (typeof fn !== "function") {
    res.writeHead(405, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ ok: false, message: "Method tidak didukung." }));
    return;
  }

  const proto = String(req.headers["x-forwarded-proto"] || "http").split(",")[0].trim();
  const host = String(req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`).split(",")[0].trim();
  const fullUrl = `${proto}://${host}${req.url || "/"}`;

  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (Array.isArray(v)) {
      for (const item of v) headers.append(k, item);
    } else if (typeof v === "string") {
      headers.set(k, v);
    }
  }

  let body;
  if (method !== "GET" && method !== "HEAD") {
    body = await readBodyBuffer(req);
  }

  const webReq = new Request(fullUrl, {
    method,
    headers,
    body: body && body.length > 0 ? body : undefined,
  });

  const context = {
    request: webReq,
    env: process.env,
    params: {},
    data: {},
    waitUntil: (promise) => {
      Promise.resolve(promise).catch(() => {});
    },
  };

  const webRes = await fn(context);
  res.statusCode = webRes.status || 200;
  webRes.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (method === "HEAD" || !webRes.body) {
    res.end();
    return;
  }

  const arrayBuf = await webRes.arrayBuffer();
  res.end(Buffer.from(arrayBuf));
}

async function serveStatic(req, res, pathname) {
  if (pathname === "/admin" || pathname === "/admin.html") {
    res.writeHead(301, { Location: "/owner" });
    res.end();
    return;
  }

  let relPath = pathname;
  if (relPath === "/") {
    relPath = "/index.html";
  } else if (relPath === "/owner") {
    relPath = "/owner.html";
  }

  const normalized = path.posix.normalize(relPath);
  if (
    normalized.includes("..") ||
    BLOCKED_FILES.has(normalized) ||
    BLOCKED_PREFIXES.some((prefix) => normalized.startsWith(prefix))
  ) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const filePath = path.join(__dirname, normalized);
  let stat;
  try {
    stat = await fsp.stat(filePath);
    if (!stat.isFile()) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("Not Found");
      return;
    }
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("Not Found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || "application/octet-stream";

  res.setHeader("X-Content-Type-Options", "nosniff");
  if (normalized === "/owner.html") {
    res.setHeader("X-Robots-Tag", "noindex, nofollow");
    res.setHeader("Cache-Control", "no-store");
  } else if (
    normalized === "/index.html" ||
    normalized === "/firebase-config.js" ||
    normalized === "/sw.js" ||
    normalized === "/manifest.webmanifest"
  ) {
    res.setHeader("Cache-Control", "no-cache");
  }
  if (normalized === "/sw.js") {
    res.setHeader("Service-Worker-Allowed", "/");
  }

  // Support HTTP Range requests for video/audio
  const range = req.headers.range;
  if (range && stat.size > 0) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (match) {
      const start = match[1] ? parseInt(match[1], 10) : 0;
      const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
      if (start <= end && start < stat.size) {
        res.writeHead(206, {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": end - start + 1,
        });
        if (req.method === "HEAD") {
          res.end();
        } else {
          fs.createReadStream(filePath, { start, end }).pipe(res);
        }
        return;
      }
    }
  }

  res.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": stat.size,
    "Accept-Ranges": "bytes",
  });
  if (req.method === "HEAD") {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const pathname = decodeURIComponent(parsedUrl.pathname);

    const apiMatch = /^\/api\/([^/]+)\/?$/.exec(pathname);
    if (apiMatch && Object.prototype.hasOwnProperty.call(API_ROUTES, apiMatch[1])) {
      await handleApiRequest(req, res, apiMatch[1]);
      return;
    }

    await serveStatic(req, res, pathname);
  } catch (err) {
    if (!res.headersSent) {
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(
        JSON.stringify({
          ok: false,
          message: err && err.message ? err.message : "Internal Server Error",
        })
      );
    } else {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  console.log(`baxdev server listening on http://${HOST}:${PORT}`);
});
