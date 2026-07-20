const PORTAL_PASSWORD = "BepBinhMy@2026";
const TOKEN_TTL_SECONDS = 8 * 60 * 60;
const STATE_KEY = "bep-binh-my:handover-state:v6";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function base64url(bytes) {
  let binary = "";
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sign(data) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(PORTAL_PASSWORD),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(signature));
}

async function createToken() {
  const payload = {
    sub: "bbm-admin",
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS
  };
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await sign(body)}`;
}

async function isAuthorized(request) {
  const header = request.headers.get("authorization") || "";
  if (!header.startsWith("Bearer ")) return false;

  const [body, signature] = header.slice(7).split(".");
  if (!body || !signature || (await sign(body)) !== signature) return false;

  try {
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
    const payload = JSON.parse(atob(padded));
    return Number(payload.exp || 0) > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function emptyState() {
  return {
    version: 0,
    accounts: [],
    handover: { workflowVersion: "6.0" },
    checklist: [],
    changes: [],
    updatedAt: null
  };
}

async function handleLogin(request) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  try {
    const { password = "" } = await request.json();
    if (String(password) !== PORTAL_PASSWORD) return json({ error: "INVALID_PASSWORD" }, 401);
    return json({ token: await createToken(), expiresIn: TOKEN_TTL_SECONDS });
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400);
  }
}

async function handleState(request, env) {
  if (!(await isAuthorized(request))) return json({ error: "UNAUTHORIZED" }, 401);
  if (!env.BBM_DATA) return json({ error: "KV_NOT_CONFIGURED" }, 500);

  if (request.method === "GET") {
    const raw = await env.BBM_DATA.get(STATE_KEY);
    return json({ state: raw ? JSON.parse(raw) : emptyState() });
  }

  if (request.method === "PUT") {
    try {
      const incoming = await request.json();
      const currentRaw = await env.BBM_DATA.get(STATE_KEY);
      const current = currentRaw ? JSON.parse(currentRaw) : emptyState();

      if (Number(incoming.version || 0) !== Number(current.version || 0)) {
        return json({ error: "VERSION_CONFLICT", currentVersion: current.version }, 409);
      }

      const next = {
        version: Number(current.version || 0) + 1,
        accounts: Array.isArray(incoming.accounts) ? incoming.accounts : [],
        handover: incoming.handover || {},
        checklist: Array.isArray(incoming.checklist) ? incoming.checklist : [],
        changes: Array.isArray(incoming.changes) ? incoming.changes : [],
        updatedAt: new Date().toISOString()
      };

      await env.BBM_DATA.put(STATE_KEY, JSON.stringify(next));
      return json({ ok: true, version: next.version, updatedAt: next.updatedAt });
    } catch {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
  }

  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/login") return handleLogin(request);
    if (url.pathname === "/api/state") return handleState(request, env);

    return env.ASSETS.fetch(request);
  }
};
