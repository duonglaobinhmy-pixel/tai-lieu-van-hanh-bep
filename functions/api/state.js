
function base64url(bytes) {
  let binary = "";
  bytes.forEach((b) => binary += String.fromCharCode(b));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function hmac(secret, data) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data)));
}
async function verifyAuth(request, env) {
  const header = request.headers.get("Authorization") || "";
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7);
  const [body, sig] = token.split(".");
  if (!body || !sig || !env.AUTH_TOKEN_SECRET) return false;
  const expected = base64url(await hmac(env.AUTH_TOKEN_SECRET, body));
  if (expected !== sig) return false;
  try {
    const normalized = body.replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(normalized));
    return payload.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
const KEY = "bep-binh-my:handover-state:v5";

export async function onRequestGet(context) {
  if (!(await verifyAuth(context.request, context.env))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const raw = await context.env.BBM_DATA.get(KEY);
  const state = raw ? JSON.parse(raw) : {
    version: 0,
    accounts: [],
    handover: { workflowVersion: "5.0" },
    checklist: [],
    changes: [],
    updatedAt: null
  };
  return Response.json({ state }, {
    headers: { "Cache-Control": "no-store" }
  });
}

export async function onRequestPut(context) {
  if (!(await verifyAuth(context.request, context.env))) {
    return Response.json({ error: "UNAUTHORIZED" }, { status: 401 });
  }
  const incoming = await context.request.json();
  const currentRaw = await context.env.BBM_DATA.get(KEY);
  const current = currentRaw ? JSON.parse(currentRaw) : { version: 0 };
  if (Number(incoming.version || 0) !== Number(current.version || 0)) {
    return Response.json({ error: "VERSION_CONFLICT", currentVersion: current.version }, { status: 409 });
  }
  const next = {
    version: Number(current.version || 0) + 1,
    accounts: Array.isArray(incoming.accounts) ? incoming.accounts : [],
    handover: incoming.handover || {},
    checklist: Array.isArray(incoming.checklist) ? incoming.checklist : [],
    changes: Array.isArray(incoming.changes) ? incoming.changes : [],
    updatedAt: new Date().toISOString()
  };
  await context.env.BBM_DATA.put(KEY, JSON.stringify(next));
  return Response.json({ ok: true, version: next.version, updatedAt: next.updatedAt });
}
