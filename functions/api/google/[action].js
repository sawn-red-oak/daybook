/* Cloudflare Pages Function: keeps a Radicchio device signed in to Google.

   Routes (same origin as the app only):
     GET  /api/google/ping      → {ok:true}; tells the app this server exists
     POST /api/google/token     {code, client_id} → exchanges a sign-in code for
                                tokens; stores the refresh token in a cookie
     POST /api/google/refresh   → a fresh access token from that cookie
     POST /api/google/signout   → revokes the refresh token, clears the cookie

   The refresh token never reaches the page: it lives in an HttpOnly cookie,
   encrypted (AES-GCM) with a key derived from GOOGLE_CLIENT_SECRET, scoped
   to /api/google. Requests must carry the header X-Radicchio: 1, which a
   cross-site form can't send, and the cookie is SameSite=Strict.

   Needs one Cloudflare environment variable (encrypted): GOOGLE_CLIENT_SECRET,
   the secret of the OAuth client whose ID is in config.js. Without it, ping
   says the server isn't ready and the app uses plain browser sign-in. */

const COOKIE = "rt";
const MAX_AGE = 60 * 60 * 24 * 365;           // a year; Google revokes unused tokens after 6 months

export async function onRequest(ctx) {
  const { request, env, params } = ctx;
  const action = String(params.action || "");
  try {
    if (action === "ping" && request.method === "GET")
      return json({ ok: !!env.GOOGLE_CLIENT_SECRET });
    if (request.method !== "POST") return json({ error: "method" }, 405);
    if (request.headers.get("X-Radicchio") !== "1") return json({ error: "forbidden" }, 403);
    if (!env.GOOGLE_CLIENT_SECRET) return json({ error: "not configured" }, 503);
    const key = await cookieKey(env.GOOGLE_CLIENT_SECRET);
    if (action === "token") return await token(request, env, key);
    if (action === "refresh") return await refresh(request, env, key);
    if (action === "signout") return await signout(request, key);
    return json({ error: "not found" }, 404);
  } catch (e) {
    return json({ error: "server error" }, 500);
  }
}

async function token(request, env, key) {
  const body = await request.json().catch(() => ({}));
  if (!body.code || !body.client_id) return json({ error: "missing code" }, 400);
  const r = await google({
    code: body.code, client_id: body.client_id, client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: "postmessage", grant_type: "authorization_code"
  });
  if (!r.access_token) return json({ error: r.error || "exchange failed" }, 400);
  const out = { access_token: r.access_token, expires_in: r.expires_in || 3600, remembered: !!r.refresh_token };
  if (!r.refresh_token) return json(out);      // Google only sends one on first consent
  const sealed = await seal(key, JSON.stringify({ rt: r.refresh_token, cid: body.client_id }));
  return json(out, 200, { "Set-Cookie": cookie(sealed, MAX_AGE) });
}

async function refresh(request, env, key) {
  const s = await readCookie(request, key);
  if (!s) return json({ error: "no session" }, 401);
  const r = await google({
    refresh_token: s.rt, client_id: s.cid, client_secret: env.GOOGLE_CLIENT_SECRET, grant_type: "refresh_token"
  });
  if (!r.access_token) return json({ error: r.error || "refresh failed" }, 401, { "Set-Cookie": cookie("", 0) });
  return json({ access_token: r.access_token, expires_in: r.expires_in || 3600 });
}

async function signout(request, key) {
  const s = await readCookie(request, key);
  if (s) await fetch("https://oauth2.googleapis.com/revoke?token=" + encodeURIComponent(s.rt), { method: "POST" }).catch(() => {});
  return json({ ok: true }, 200, { "Set-Cookie": cookie("", 0) });
}

/* ---------- helpers ---------- */
async function google(fields) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString()
  });
  return res.json().catch(() => ({}));
}
function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status, headers: Object.assign({ "Content-Type": "application/json", "Cache-Control": "no-store" }, headers)
  });
}
function cookie(value, maxAge) {
  return `${COOKIE}=${value}; Path=/api/google; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Strict`;
}
async function readCookie(request, key) {
  const m = (request.headers.get("Cookie") || "").match(new RegExp("(?:^|;\\s*)" + COOKIE + "=([^;]+)"));
  if (!m) return null;
  try { return JSON.parse(await open(key, m[1])); } catch (e) { return null; }
}
async function cookieKey(secret) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("radicchio-refresh-cookie:" + secret));
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}
async function seal(key, text) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(text)));
  const all = new Uint8Array(iv.length + ct.length); all.set(iv); all.set(ct, iv.length);
  return b64url(all);
}
async function open(key, token) {
  const all = unb64url(token);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: all.slice(0, 12) }, key, all.slice(12));
  return new TextDecoder().decode(pt);
}
function b64url(bytes) {
  let s = ""; bytes.forEach(b => s += String.fromCharCode(b));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function unb64url(s) {
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "=";
  return Uint8Array.from(atob(s), c => c.charCodeAt(0));
}

export const _test = { seal, open, cookieKey, readCookie, cookie };
