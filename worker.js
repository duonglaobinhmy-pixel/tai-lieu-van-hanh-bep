const TOKEN_TTL_SECONDS = 4 * 60 * 60;
const STATE_KEY = "bep-binh-my:handover-state:v6";
const SECURITY_KEY = "bep-binh-my:security-policy:v1";
const AUDIT_PREFIX = "bep-binh-my:audit:";
const RATE_PREFIX = "bep-binh-my:rate:";
const AUDIT_TTL_SECONDS = 90 * 24 * 60 * 60;
const PASSWORD_ITERATIONS = 210000;
const MASKED_SECRET = "••••••••";

const DEFAULT_ADMIN = {
  id: "usr_admin",
  username: "admin",
  displayName: "Quản trị hệ thống",
  role: "admin",
  status: "active",
  salt: "IszD9jYnRgpxH_wEKHH-YQ",
  passwordHash: "pI7zb141_YSLg1rwQWICPa6fwhJS64YRLtk4h897y2A",
  iterations: PASSWORD_ITERATIONS,
  notes: "Tài khoản khởi tạo. Đổi mật khẩu ngay sau khi cấu hình IP."
};

const ROLE_PERMISSIONS = {
  admin: [
    "document:read",
    "state:read",
    "state:write",
    "accounts:read",
    "accounts:write",
    "security:manage",
    "audit:read",
    "system:open"
  ],
  operator: [
    "document:read",
    "state:read",
    "state:write",
    "system:open"
  ],
  viewer: [
    "document:read",
    "state:read"
  ]
};

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'"
  ].join("; "),
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "referrer-policy": "no-referrer",
  "strict-transport-security": "max-age=31536000; includeSubDomains",
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY"
};

function applySecurityHeaders(headers) {
  Object.entries(SECURITY_HEADERS).forEach(([key, value]) => headers.set(key, value));
  return headers;
}

function json(data, status = 200, extraHeaders = {}) {
  const headers = applySecurityHeaders(new Headers({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  }));
  return new Response(JSON.stringify(data), { status, headers });
}

function secureAssetResponse(response) {
  const headers = applySecurityHeaders(new Headers(response.headers));
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set("cache-control", "no-store");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function base64url(bytes) {
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function decodeJsonBase64url(value) {
  return JSON.parse(new TextDecoder().decode(fromBase64url(value)));
}

function constantTimeEqual(left, right) {
  const a = new TextEncoder().encode(String(left));
  const b = new TextEncoder().encode(String(right));
  let mismatch = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    mismatch |= (a[index % Math.max(1, a.length)] || 0) ^ (b[index % Math.max(1, b.length)] || 0);
  }
  return mismatch === 0;
}

function cleanString(value, maxLength = 500) {
  return String(value ?? "").replace(/\u0000/g, "").trim().slice(0, maxLength);
}

function normalizeUsername(value) {
  return cleanString(value, 40).toLowerCase();
}

function safeKeyPart(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 90);
}

function getSessionSecret(env) {
  const secret = cleanString(env.SESSION_SECRET, 500);
  if (secret.length < 32) throw new Error("SESSION_SECRET_NOT_CONFIGURED");
  return secret;
}

async function sign(data, secret) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64url(new Uint8Array(signature));
}

async function hashPassword(password, salt, iterations = PASSWORD_ITERATIONS) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(String(password)),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    hash: "SHA-256",
    salt: fromBase64url(salt),
    iterations
  }, key, 256);
  return base64url(new Uint8Array(bits));
}

async function verifyPassword(password, user) {
  if (!user?.salt || !user?.passwordHash) return false;
  const actual = await hashPassword(password, user.salt, Number(user.iterations || PASSWORD_ITERATIONS));
  return constantTimeEqual(actual, user.passwordHash);
}

async function makePasswordRecord(password) {
  const salt = base64url(crypto.getRandomValues(new Uint8Array(16)));
  return {
    salt,
    passwordHash: await hashPassword(password, salt, PASSWORD_ITERATIONS),
    iterations: PASSWORD_ITERATIONS
  };
}

function getClientContext(request) {
  const cf = request.cf || {};
  return {
    ip: cleanString(request.headers.get("cf-connecting-ip") || "0.0.0.0", 80),
    country: cleanString(cf.country || request.headers.get("cf-ipcountry") || "", 8),
    city: cleanString(cf.city || "", 120),
    colo: cleanString(cf.colo || "", 20),
    userAgent: cleanString(request.headers.get("user-agent") || "", 350)
  };
}

function parseCookies(request) {
  return Object.fromEntries(
    (request.headers.get("cookie") || "")
      .split(";")
      .map((part) => part.trim().split("="))
      .filter(([key]) => key)
      .map(([key, ...rest]) => [key, rest.join("=")])
  );
}

function sessionCookie(token, maxAge) {
  return [
    `bbm_session=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Strict",
    `Max-Age=${maxAge}`
  ].join("; ");
}

function clearSessionCookie() {
  return "bbm_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0";
}

async function createToken(user, env, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    sid: crypto.randomUUID(),
    iat: now,
    exp: now + ttlSeconds
  };
  const body = base64url(new TextEncoder().encode(JSON.stringify(payload)));
  return `${body}.${await sign(body, getSessionSecret(env))}`;
}

async function verifyToken(token, env) {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) return null;
  const expected = await sign(body, getSessionSecret(env));
  if (!constantTimeEqual(expected, signature)) return null;
  try {
    const payload = decodeJsonBase64url(body);
    if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function defaultPolicy() {
  return {
    version: 1,
    enforceIpAllowlist: false,
    sessionTtlSeconds: TOKEN_TTL_SECONDS,
    maxLoginAttempts: 5,
    loginWindowSeconds: 15 * 60,
    users: [{ ...DEFAULT_ADMIN }],
    ipRules: [],
    updatedAt: null,
    updatedBy: "system"
  };
}

async function loadPolicy(env) {
  if (!env.BBM_DATA) return defaultPolicy();
  const raw = await env.BBM_DATA.get(SECURITY_KEY);
  if (!raw) return defaultPolicy();
  try {
    const parsed = JSON.parse(raw);
    return {
      ...defaultPolicy(),
      ...parsed,
      users: Array.isArray(parsed.users) ? parsed.users : [{ ...DEFAULT_ADMIN }],
      ipRules: Array.isArray(parsed.ipRules) ? parsed.ipRules : []
    };
  } catch {
    return defaultPolicy();
  }
}

async function savePolicy(env, policy) {
  if (!env.BBM_DATA) throw new Error("KV_NOT_CONFIGURED");
  await env.BBM_DATA.put(SECURITY_KEY, JSON.stringify(policy));
}

function ipv4ToInt(ip) {
  const parts = String(ip).split(".");
  if (parts.length !== 4) return null;
  let number = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value < 0 || value > 255) return null;
    number = ((number << 8) | value) >>> 0;
  }
  return number >>> 0;
}

function isValidCidr(value) {
  const cidr = cleanString(value, 80);
  if (!cidr || cidr === "0.0.0.0/0" || cidr === "::/0") return false;
  if (cidr.includes(":")) return !cidr.includes("/") && /^[0-9a-f:]+$/i.test(cidr);
  const [ip, prefixText] = cidr.split("/");
  if (ipv4ToInt(ip) === null) return false;
  if (prefixText === undefined) return true;
  const prefix = Number(prefixText);
  return Number.isInteger(prefix) && prefix >= 0 && prefix <= 32;
}

function cidrMatches(ip, cidrValue) {
  const cidr = cleanString(cidrValue, 80);
  if (ip.includes(":") || cidr.includes(":")) {
    return cleanString(ip, 80).toLowerCase() === cidr.toLowerCase();
  }
  const [networkText, prefixText = "32"] = cidr.split("/");
  const address = ipv4ToInt(ip);
  const network = ipv4ToInt(networkText);
  const prefix = Number(prefixText);
  if (address === null || network === null || !Number.isInteger(prefix)) return false;
  const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
  return (address & mask) === (network & mask);
}

function activeIpRules(policy) {
  const now = Date.now();
  return (policy.ipRules || []).filter((rule) => {
    if (!rule.enabled) return false;
    if (!rule.expiresAt) return true;
    const expiresAt = Date.parse(rule.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
}

function matchingIpRules(policy, ip, role = null) {
  return activeIpRules(policy).filter((rule) => {
    const roleAllowed = !role || (rule.roles || []).includes(role) || (rule.roles || []).includes("all");
    return roleAllowed && cidrMatches(ip, rule.cidr);
  });
}

function isRoleAllowedFromIp(policy, ip, role) {
  if (!policy.enforceIpAllowlist) return true;
  return matchingIpRules(policy, ip, role).length > 0;
}

function hasPermission(user, permission) {
  return (ROLE_PERMISSIONS[user?.role] || []).includes(permission);
}

async function authorize(request, env, requiredPermission = "document:read") {
  const context = getClientContext(request);
  const token = parseCookies(request).bbm_session;
  const payload = await verifyToken(token, env);
  if (!payload) return { ok: false, status: 401, error: "UNAUTHORIZED", context };

  const policy = await loadPolicy(env);
  const user = policy.users.find((candidate) => candidate.id === payload.sub);
  if (!user || user.status !== "active" || user.role !== payload.role) {
    return { ok: false, status: 401, error: "SESSION_REVOKED", context, policy };
  }
  if (!isRoleAllowedFromIp(policy, context.ip, user.role)) {
    return { ok: false, status: 403, error: "IP_NOT_ALLOWED", context, policy, user };
  }
  if (!hasPermission(user, requiredPermission)) {
    return { ok: false, status: 403, error: "FORBIDDEN", context, policy, user };
  }
  return { ok: true, user, policy, payload, context };
}

async function writeAudit(env, entry) {
  if (!env.BBM_DATA) return;
  const timestamp = new Date().toISOString();
  const reverseTime = String(9999999999999 - Date.now()).padStart(13, "0");
  const key = `${AUDIT_PREFIX}${reverseTime}:${crypto.randomUUID()}`;
  const payload = {
    id: crypto.randomUUID(),
    timestamp,
    event: cleanString(entry.event, 80),
    result: cleanString(entry.result, 30),
    username: cleanString(entry.username, 40),
    role: cleanString(entry.role, 20),
    ip: cleanString(entry.context?.ip, 80),
    country: cleanString(entry.context?.country, 8),
    city: cleanString(entry.context?.city, 120),
    colo: cleanString(entry.context?.colo, 20),
    userAgent: cleanString(entry.context?.userAgent, 350),
    reason: cleanString(entry.reason, 160),
    detail: cleanString(entry.detail, 500)
  };
  try {
    await env.BBM_DATA.put(key, JSON.stringify(payload), { expirationTtl: AUDIT_TTL_SECONDS });
  } catch {
    // Audit không được làm hỏng luồng đăng nhập nếu KV tạm thời bị giới hạn.
  }
}

function rateKey(ip, windowSeconds) {
  const bucket = Math.floor(Date.now() / (windowSeconds * 1000));
  return `${RATE_PREFIX}${safeKeyPart(ip)}:${bucket}`;
}

async function readRate(env, policy, ip) {
  if (!env.BBM_DATA) return { count: 0, blocked: false };
  const key = rateKey(ip, policy.loginWindowSeconds);
  const raw = await env.BBM_DATA.get(key);
  const count = Number(raw || 0);
  return {
    key,
    count,
    blocked: count >= Number(policy.maxLoginAttempts || 5)
  };
}

async function registerLoginFailure(env, policy, ip, currentCount) {
  if (!env.BBM_DATA) return;
  try {
    await env.BBM_DATA.put(
      rateKey(ip, policy.loginWindowSeconds),
      String(Number(currentCount || 0) + 1),
      { expirationTtl: Number(policy.loginWindowSeconds || 900) }
    );
  } catch {
    // Cloudflare KV giới hạn ghi cùng một key; WAF/rate limit vẫn nên là lớp ngoài.
  }
}

function emptyState() {
  return {
    version: 0,
    accounts: [],
    handover: {
      workflowVersion: "6.1",
      operationPortalUrl: ""
    },
    checklist: [],
    changes: [],
    updatedAt: null
  };
}

function cleanAccountRows(rows) {
  return (Array.isArray(rows) ? rows : []).slice(0, 100).map((row) => {
    const values = Array.isArray(row) ? row : [];
    return Array.from({ length: 7 }, (_, index) => cleanString(values[index], index === 6 ? 1000 : 300));
  });
}

function accountKey(row) {
  return `${cleanString(row?.[0], 300).toLowerCase()}|${cleanString(row?.[2], 300).toLowerCase()}`;
}

function mergeMaskedAccountFields(incomingRows, currentRows) {
  const currentMap = new Map(cleanAccountRows(currentRows).map((row) => [accountKey(row), row]));
  return cleanAccountRows(incomingRows).map((row) => {
    if (row[3] !== MASKED_SECRET) return row;
    const current = currentMap.get(accountKey(row));
    return current ? row.map((value, index) => index === 3 ? current[3] : value) : row.map((value, index) => index === 3 ? "" : value);
  });
}

function stateForRole(state, role) {
  const copy = structuredClone(state);
  if (role !== "admin") {
    copy.accounts = [];
    return copy;
  }
  copy.accounts = cleanAccountRows(copy.accounts).map((row) => (
    row.map((value, index) => index === 3 && value ? MASKED_SECRET : value)
  ));
  return copy;
}

async function handleLogin(request, env) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const context = getClientContext(request);
  const policy = await loadPolicy(env);
  const rate = await readRate(env, policy, context.ip);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_REQUEST" }, 400);
  }

  const username = normalizeUsername(body.username);
  const password = String(body.password || "");
  if (rate.blocked) {
    await writeAudit(env, {
      event: "LOGIN_RATE_LIMITED",
      result: "denied",
      username,
      context,
      reason: "TOO_MANY_ATTEMPTS"
    });
    return json({ error: "TOO_MANY_ATTEMPTS" }, 429);
  }

  const user = policy.users.find((candidate) => candidate.username === username);
  const passwordOwner = user || DEFAULT_ADMIN;
  const passwordValid = await verifyPassword(password, passwordOwner);

  if (!user || user.status !== "active" || !passwordValid) {
    await registerLoginFailure(env, policy, context.ip, rate.count);
    await writeAudit(env, {
      event: "LOGIN_FAILED",
      result: "denied",
      username,
      role: user?.role,
      context,
      reason: !user ? "UNKNOWN_USER" : user.status !== "active" ? "USER_DISABLED" : "INVALID_PASSWORD"
    });
    return json({ error: "INVALID_CREDENTIALS" }, 401);
  }

  if (!isRoleAllowedFromIp(policy, context.ip, user.role)) {
    await writeAudit(env, {
      event: "LOGIN_BLOCKED_IP",
      result: "denied",
      username: user.username,
      role: user.role,
      context,
      reason: "IP_NOT_ALLOWED"
    });
    return json({ error: "IP_NOT_ALLOWED" }, 403);
  }

  const ttl = Math.min(Math.max(Number(policy.sessionTtlSeconds || TOKEN_TTL_SECONDS), 900), 12 * 60 * 60);
  const token = await createToken(user, env, ttl);
  await writeAudit(env, {
    event: "LOGIN_SUCCEEDED",
    result: "allowed",
    username: user.username,
    role: user.role,
    context,
    detail: policy.enforceIpAllowlist ? "IP allowlist enforced" : "Audit-only IP mode"
  });

  return json({
    ok: true,
    user: {
      username: user.username,
      displayName: user.displayName,
      role: user.role
    },
    expiresIn: ttl,
    clientIp: context.ip,
    ipEnforced: Boolean(policy.enforceIpAllowlist)
  }, 200, { "set-cookie": sessionCookie(token, ttl) });
}

async function handleLogout(request, env) {
  if (request.method !== "POST") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const auth = await authorize(request, env);
  if (auth.ok) {
    await writeAudit(env, {
      event: "LOGOUT",
      result: "allowed",
      username: auth.user.username,
      role: auth.user.role,
      context: auth.context
    });
  }
  return json({ ok: true }, 200, { "set-cookie": clearSessionCookie() });
}

async function handleSession(request, env) {
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  const auth = await authorize(request, env);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  return json({
    authenticated: true,
    user: {
      username: auth.user.username,
      displayName: auth.user.displayName,
      role: auth.user.role
    },
    permissions: ROLE_PERMISSIONS[auth.user.role] || [],
    clientIp: auth.context.ip,
    ipEnforced: Boolean(auth.policy.enforceIpAllowlist),
    matchedIpRules: matchingIpRules(auth.policy, auth.context.ip, auth.user.role).map((rule) => rule.label),
    expiresAt: new Date(Number(auth.payload.exp) * 1000).toISOString()
  });
}

async function handleState(request, env) {
  const permission = request.method === "PUT" ? "state:write" : "state:read";
  const auth = await authorize(request, env, permission);
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (!env.BBM_DATA) return json({ error: "KV_NOT_CONFIGURED" }, 500);

  if (request.method === "GET") {
    const raw = await env.BBM_DATA.get(STATE_KEY);
    const state = raw ? JSON.parse(raw) : emptyState();
    return json({ state: stateForRole(state, auth.user.role) });
  }

  if (request.method === "PUT") {
    try {
      const incoming = await request.json();
      const currentRaw = await env.BBM_DATA.get(STATE_KEY);
      const current = currentRaw ? JSON.parse(currentRaw) : emptyState();

      if (Number(incoming.version || 0) !== Number(current.version || 0)) {
        return json({ error: "VERSION_CONFLICT", currentVersion: current.version }, 409);
      }

      const nextAccounts = auth.user.role === "admin"
        ? mergeMaskedAccountFields(incoming.accounts, current.accounts)
        : cleanAccountRows(current.accounts);

      const next = {
        version: Number(current.version || 0) + 1,
        accounts: nextAccounts,
        handover: {
          handoverFrom: cleanString(incoming.handover?.handoverFrom, 160),
          handoverTo: cleanString(incoming.handover?.handoverTo, 160),
          handoverDate: cleanString(incoming.handover?.handoverDate, 20),
          workflowVersion: cleanString(incoming.handover?.workflowVersion, 30),
          backupLocation: cleanString(incoming.handover?.backupLocation, 400),
          supportChannel: cleanString(incoming.handover?.supportChannel, 300),
          operationPortalUrl: cleanString(incoming.handover?.operationPortalUrl, 500)
        },
        checklist: (Array.isArray(incoming.checklist) ? incoming.checklist : []).slice(0, 100).map(Boolean),
        changes: (Array.isArray(incoming.changes) ? incoming.changes : []).slice(0, 200).map((row) => (
          (Array.isArray(row) ? row : []).slice(0, 6).map((value) => cleanString(value, 1000))
        )),
        updatedAt: new Date().toISOString(),
        updatedBy: auth.user.username
      };

      await env.BBM_DATA.put(STATE_KEY, JSON.stringify(next));
      await writeAudit(env, {
        event: "STATE_UPDATED",
        result: "allowed",
        username: auth.user.username,
        role: auth.user.role,
        context: auth.context,
        detail: `Version ${next.version}`
      });
      return json({ ok: true, version: next.version, updatedAt: next.updatedAt });
    } catch {
      return json({ error: "INVALID_REQUEST" }, 400);
    }
  }

  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
}

function publicUser(user) {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    status: user.status,
    notes: user.notes || "",
    hasPassword: Boolean(user.passwordHash)
  };
}

function publicPolicy(policy, context) {
  return {
    version: policy.version,
    enforceIpAllowlist: Boolean(policy.enforceIpAllowlist),
    sessionTtlSeconds: policy.sessionTtlSeconds,
    maxLoginAttempts: policy.maxLoginAttempts,
    loginWindowSeconds: policy.loginWindowSeconds,
    users: policy.users.map(publicUser),
    ipRules: (policy.ipRules || []).map((rule) => ({
      id: rule.id,
      label: rule.label,
      cidr: rule.cidr,
      roles: rule.roles,
      enabled: Boolean(rule.enabled),
      expiresAt: rule.expiresAt || "",
      notes: rule.notes || ""
    })),
    currentIp: context.ip,
    updatedAt: policy.updatedAt,
    updatedBy: policy.updatedBy,
    recommendations: [
      "IP quản trị văn phòng cố định /32",
      "IP đầu ra VPN kỹ thuật /32",
      "IP mạng Bếp cố định /32 cho operator",
      "IP khẩn cấp có ngày hết hạn"
    ]
  };
}

function normalizeRoles(roles) {
  const allowed = new Set(["admin", "operator", "viewer", "all"]);
  return [...new Set((Array.isArray(roles) ? roles : []).map((role) => cleanString(role, 20)).filter((role) => allowed.has(role)))];
}

async function buildUpdatedUsers(incomingUsers, currentUsers, currentUsername) {
  if (!Array.isArray(incomingUsers) || incomingUsers.length === 0 || incomingUsers.length > 50) {
    throw new Error("INVALID_USERS");
  }
  const currentById = new Map(currentUsers.map((user) => [user.id, user]));
  const usernames = new Set();
  const updated = [];

  for (const candidate of incomingUsers) {
    const id = cleanString(candidate.id, 80) || `usr_${crypto.randomUUID()}`;
    const existing = currentById.get(id);
    const username = normalizeUsername(candidate.username);
    const displayName = cleanString(candidate.displayName, 120);
    const role = cleanString(candidate.role, 20);
    const status = cleanString(candidate.status, 20);

    if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("INVALID_USERNAME");
    if (usernames.has(username)) throw new Error("DUPLICATE_USERNAME");
    if (!["admin", "operator", "viewer"].includes(role)) throw new Error("INVALID_ROLE");
    if (!["active", "disabled"].includes(status)) throw new Error("INVALID_STATUS");
    if (existing?.username === currentUsername && status !== "active") throw new Error("CANNOT_DISABLE_CURRENT_USER");
    usernames.add(username);

    let passwordRecord = existing ? {
      salt: existing.salt,
      passwordHash: existing.passwordHash,
      iterations: existing.iterations
    } : null;
    const newPassword = String(candidate.newPassword || "");
    if (newPassword) {
      if (newPassword.length < 12 || newPassword.length > 200) throw new Error("WEAK_PASSWORD");
      passwordRecord = await makePasswordRecord(newPassword);
    }
    if (!passwordRecord?.passwordHash) throw new Error("PASSWORD_REQUIRED");

    updated.push({
      id,
      username,
      displayName: displayName || username,
      role,
      status,
      ...passwordRecord,
      notes: cleanString(candidate.notes, 500)
    });
  }

  if (!updated.some((user) => user.role === "admin" && user.status === "active")) {
    throw new Error("ACTIVE_ADMIN_REQUIRED");
  }
  return updated;
}

function buildUpdatedIpRules(incomingRules) {
  if (!Array.isArray(incomingRules) || incomingRules.length > 100) throw new Error("INVALID_IP_RULES");
  const labels = new Set();
  return incomingRules.map((candidate) => {
    const label = cleanString(candidate.label, 100);
    const cidr = cleanString(candidate.cidr, 80);
    const roles = normalizeRoles(candidate.roles);
    const expiresAt = cleanString(candidate.expiresAt, 40);
    if (!label || labels.has(label.toLowerCase())) throw new Error("INVALID_IP_LABEL");
    if (!isValidCidr(cidr)) throw new Error("INVALID_CIDR");
    if (roles.length === 0) throw new Error("IP_ROLE_REQUIRED");
    if (expiresAt && !Number.isFinite(Date.parse(expiresAt))) throw new Error("INVALID_EXPIRY");
    labels.add(label.toLowerCase());
    return {
      id: cleanString(candidate.id, 80) || `ip_${crypto.randomUUID()}`,
      label,
      cidr,
      roles,
      enabled: Boolean(candidate.enabled),
      expiresAt: expiresAt || "",
      notes: cleanString(candidate.notes, 500)
    };
  });
}

async function handleSecurity(request, env) {
  const auth = await authorize(request, env, "security:manage");
  if (!auth.ok) return json({ error: auth.error }, auth.status);

  if (request.method === "GET") {
    return json({ policy: publicPolicy(auth.policy, auth.context) });
  }

  if (request.method === "PUT") {
    try {
      const incoming = await request.json();
      const users = await buildUpdatedUsers(incoming.users, auth.policy.users, auth.user.username);
      const ipRules = buildUpdatedIpRules(incoming.ipRules);
      const enforceIpAllowlist = Boolean(incoming.enforceIpAllowlist);
      const currentUser = users.find((user) => user.id === auth.user.id);
      const candidatePolicy = {
        ...auth.policy,
        version: Number(auth.policy.version || 0) + 1,
        enforceIpAllowlist,
        sessionTtlSeconds: Math.min(Math.max(Number(incoming.sessionTtlSeconds || TOKEN_TTL_SECONDS), 900), 12 * 60 * 60),
        maxLoginAttempts: Math.min(Math.max(Number(incoming.maxLoginAttempts || 5), 3), 10),
        loginWindowSeconds: Math.min(Math.max(Number(incoming.loginWindowSeconds || 900), 300), 3600),
        users,
        ipRules,
        updatedAt: new Date().toISOString(),
        updatedBy: auth.user.username
      };

      if (enforceIpAllowlist && !isRoleAllowedFromIp(candidatePolicy, auth.context.ip, currentUser.role)) {
        return json({
          error: "CURRENT_IP_NOT_ALLOWED",
          currentIp: auth.context.ip
        }, 400);
      }

      await savePolicy(env, candidatePolicy);
      await writeAudit(env, {
        event: "SECURITY_POLICY_UPDATED",
        result: "allowed",
        username: auth.user.username,
        role: auth.user.role,
        context: auth.context,
        detail: `IP enforcement: ${enforceIpAllowlist ? "on" : "off"}; users: ${users.length}; rules: ${ipRules.length}`
      });
      return json({ ok: true, policy: publicPolicy(candidatePolicy, auth.context) });
    } catch (error) {
      return json({ error: error.message || "INVALID_SECURITY_POLICY" }, 400);
    }
  }

  return json({ error: "METHOD_NOT_ALLOWED" }, 405);
}

async function handleAudit(request, env) {
  const auth = await authorize(request, env, "audit:read");
  if (!auth.ok) return json({ error: auth.error }, auth.status);
  if (request.method !== "GET") return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  if (!env.BBM_DATA) return json({ error: "KV_NOT_CONFIGURED" }, 500);

  const url = new URL(request.url);
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 100), 1), 200);
  const listed = await env.BBM_DATA.list({ prefix: AUDIT_PREFIX, limit });
  const entries = (await Promise.all(
    listed.keys.map(async ({ name }) => {
      const raw = await env.BBM_DATA.get(name);
      try {
        return raw ? JSON.parse(raw) : null;
      } catch {
        return null;
      }
    })
  )).filter(Boolean).sort((a, b) => String(b.timestamp).localeCompare(String(a.timestamp)));

  return json({ entries, retentionDays: 90, limit });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/health") return json({ ok: true, service: "Bep Binh My Portal" });
      if (url.pathname === "/api/login") return handleLogin(request, env);
      if (url.pathname === "/api/logout") return handleLogout(request, env);
      if (url.pathname === "/api/session") return handleSession(request, env);
      if (url.pathname === "/api/state") return handleState(request, env);
      if (url.pathname === "/api/security") return handleSecurity(request, env);
      if (url.pathname === "/api/audit") return handleAudit(request, env);
      if (url.pathname.startsWith("/api/")) return json({ error: "NOT_FOUND" }, 404);

      if (!env.ASSETS) return json({ error: "ASSETS_NOT_CONFIGURED" }, 500);
      return secureAssetResponse(await env.ASSETS.fetch(request));
    } catch (error) {
      return json({
        error: "INTERNAL_ERROR",
        requestId: crypto.randomUUID()
      }, 500);
    }
  }
};
