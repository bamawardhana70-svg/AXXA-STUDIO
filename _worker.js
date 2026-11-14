// Single-file Cloudflare Worker bundle.
// Auto-generated from functions/ — edit the source files under functions/ instead.

import * as _auth from "./functions/_lib/auth.js";
import * as api_geo from "./functions/api/geo.js";
import * as api_image_upscale from "./functions/api/image-upscale.js";
import * as api_roblox_animation from "./functions/api/roblox-animation.js";
import * as api_roblox_asset_check from "./functions/api/roblox-asset-check.js";
import * as api_roblox_asset_status from "./functions/api/roblox-asset-status.js";
import * as api_roblox_my_audio from "./functions/api/roblox-my-audio.js";
import * as api_roblox_permission from "./functions/api/roblox-permission.js";
import * as api_roblox_profile from "./functions/api/roblox-profile.js";
import * as api_roblox_test from "./functions/api/roblox-test.js";
import * as api_roblox_upload from "./functions/api/roblox-upload.js";
import * as api_tiktok_download from "./functions/api/tiktok-download.js";
import * as api_tool from "./functions/api/tool.js";
import * as api_youtube_download from "./functions/api/youtube-download.js";
import * as api_youtube_title from "./functions/api/youtube-title.js";
import * as tool_image_to_mesh from "./functions/_tools/image-to-mesh.js";
import * as tool_obfus from "./functions/_tools/obfus.js";
import * as tool_skybox_360 from "./functions/_tools/skybox-360.js";

const ROUTES = {
  "/api/geo": api_geo,
  "/api/image-upscale": api_image_upscale,
  "/api/roblox-animation": api_roblox_animation,
  "/api/roblox-asset-check": api_roblox_asset_check,
  "/api/roblox-asset-status": api_roblox_asset_status,
  "/api/roblox-my-audio": api_roblox_my_audio,
  "/api/roblox-permission": api_roblox_permission,
  "/api/roblox-profile": api_roblox_profile,
  "/api/roblox-test": api_roblox_test,
  "/api/roblox-upload": api_roblox_upload,
  "/api/tiktok-download": api_tiktok_download,
  "/api/tool": api_tool,
  "/api/youtube-download": api_youtube_download,
  "/api/youtube-title": api_youtube_title,
  "/api/tool/image-to-mesh": tool_image_to_mesh,
  "/api/tool/obfus": tool_obfus,
  "/api/tool/skybox-360": tool_skybox_360,
};

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const mod = ROUTES[path];
    if (mod) {
      const context = {
        request,
        env: env || {},
        params: {},
        waitUntil: ctx && ctx.waitUntil ? ctx.waitUntil.bind(ctx) : () => {},
        next: () => env && env.ASSETS ? env.ASSETS.fetch(request) : new Response("Not found", { status: 404 })
      };
      const method = request.method.toUpperCase();
      const handler = mod["onRequest" + method[0] + method.slice(1).toLowerCase()] || mod.onRequest;
      if (!handler) {
        return new Response(JSON.stringify({ ok: false, message: "Method not allowed" }), {
          status: 405,
          headers: { "content-type": "application/json" }
        });
      }
      return handler(context);
    }
    if (env && env.ASSETS) {
      return env.ASSETS.fetch(request);
    }
    return new Response("Not found", { status: 404 });
  }
};
