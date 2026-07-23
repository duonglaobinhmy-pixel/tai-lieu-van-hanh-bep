import test from "node:test";
import assert from "node:assert/strict";
import worker from "../worker.js";

class MemoryKv {
  constructor() {
    this.data = new Map();
  }

  async get(key) {
    return this.data.get(key) ?? null;
  }

  async put(key, value) {
    this.data.set(key, String(value));
  }

  async list({ prefix = "", limit = 1000 } = {}) {
    const keys = [...this.data.keys()]
      .filter((key) => key.startsWith(prefix))
      .sort()
      .slice(0, limit)
      .map((name) => ({ name }));
    return { keys, list_complete: true };
  }
}

const kv = new MemoryKv();
const env = {
  BBM_DATA: kv,
  SESSION_SECRET: "test-session-secret-that-is-long-and-random-123456789",
  ASSETS: {
    fetch: async () => new Response("<!doctype html><title>Portal</title>", {
      headers: { "content-type": "text/html; charset=utf-8" }
    })
  }
};

function makeRequest(path, { method = "GET", ip = "203.0.113.10", cookie = "", body } = {}) {
  const headers = new Headers({
    "cf-connecting-ip": ip,
    "cf-ipcountry": "VN",
    "user-agent": "BinhMy-Test/1.0"
  });
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return new Request(`https://portal.example${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body)
  });
}

async function call(path, options) {
  const response = await worker.fetch(makeRequest(path, options), env);
  const data = await response.json().catch(() => null);
  return { response, data };
}

function cookieFrom(response) {
  return response.headers.get("set-cookie").split(";")[0];
}

test("health and HTML responses include security headers", async () => {
  const health = await call("/api/health");
  assert.equal(health.response.status, 200);
  assert.match(health.response.headers.get("content-security-policy"), /frame-ancestors 'none'/);

  const html = await worker.fetch(makeRequest("/"), env);
  assert.equal(html.status, 200);
  assert.equal(html.headers.get("x-frame-options"), "DENY");
  assert.equal(html.headers.get("cache-control"), "no-store");
});

test("admin login uses secure cookie and exposes the correct session", async () => {
  const login = await call("/api/login", {
    method: "POST",
    body: { username: "admin", password: "BepBinhMy@2026" }
  });
  assert.equal(login.response.status, 200);
  assert.match(login.response.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.response.headers.get("set-cookie"), /SameSite=Strict/);
  const cookie = cookieFrom(login.response);

  const session = await call("/api/session", { cookie });
  assert.equal(session.response.status, 200);
  assert.equal(session.data.user.role, "admin");
  assert.equal(session.data.clientIp, "203.0.113.10");
  assert.equal(session.data.ipEnforced, false);

  globalThis.adminCookie = cookie;
});

test("failed login is rejected and written to audit", async () => {
  const failed = await call("/api/login", {
    method: "POST",
    ip: "203.0.113.11",
    body: { username: "admin", password: "wrong-password" }
  });
  assert.equal(failed.response.status, 401);
  assert.equal(failed.data.error, "INVALID_CREDENTIALS");
});

test("admin can configure role-based users and IP rules", async () => {
  const current = await call("/api/security", { cookie: globalThis.adminCookie });
  assert.equal(current.response.status, 200);
  const admin = current.data.policy.users[0];

  const saved = await call("/api/security", {
    method: "PUT",
    cookie: globalThis.adminCookie,
    body: {
      enforceIpAllowlist: true,
      sessionTtlSeconds: 14400,
      maxLoginAttempts: 5,
      loginWindowSeconds: 900,
      users: [
        { ...admin, newPassword: "" },
        {
          displayName: "Vận hành Bếp",
          username: "operator.bep",
          role: "operator",
          status: "active",
          newPassword: "Operator@BinhMy2026",
          notes: "Chỉ vận hành"
        },
        {
          displayName: "Quản lý đọc",
          username: "viewer.quanly",
          role: "viewer",
          status: "active",
          newPassword: "Viewer@BinhMy2026",
          notes: "Chỉ đọc"
        }
      ],
      ipRules: [
        {
          label: "Văn phòng Admin",
          cidr: "203.0.113.10/32",
          roles: ["admin"],
          enabled: true,
          expiresAt: "",
          notes: ""
        },
        {
          label: "Mạng Bếp",
          cidr: "203.0.113.20/32",
          roles: ["operator"],
          enabled: true,
          expiresAt: "",
          notes: ""
        },
        {
          label: "Mạng quản lý",
          cidr: "203.0.113.30/32",
          roles: ["viewer"],
          enabled: true,
          expiresAt: "",
          notes: ""
        }
      ]
    }
  });
  assert.equal(saved.response.status, 200);
  assert.equal(saved.data.policy.enforceIpAllowlist, true);
  assert.equal(saved.data.policy.users.length, 3);
  assert.equal(saved.data.policy.users[1].passwordHash, undefined);
});

test("server blocks a valid password from an unauthorized IP", async () => {
  const blocked = await call("/api/login", {
    method: "POST",
    ip: "203.0.113.99",
    body: { username: "admin", password: "BepBinhMy@2026" }
  });
  assert.equal(blocked.response.status, 403);
  assert.equal(blocked.data.error, "IP_NOT_ALLOWED");
});

test("operator can use state but cannot manage security", async () => {
  const login = await call("/api/login", {
    method: "POST",
    ip: "203.0.113.20",
    body: { username: "operator.bep", password: "Operator@BinhMy2026" }
  });
  assert.equal(login.response.status, 200);
  const operatorCookie = cookieFrom(login.response);

  const state = await call("/api/state", { ip: "203.0.113.20", cookie: operatorCookie });
  assert.equal(state.response.status, 200);
  assert.deepEqual(state.data.state.accounts, []);

  const update = await call("/api/state", {
    method: "PUT",
    ip: "203.0.113.20",
    cookie: operatorCookie,
    body: {
      ...state.data.state,
      checklist: [true, false],
      changes: [["2026-07-23", "6.1", "Test", "Operator update", "operator.bep", "Draft"]],
      accounts: [["Should", "Not", "Persist", "A secret"]]
    }
  });
  assert.equal(update.response.status, 200);

  const security = await call("/api/security", { ip: "203.0.113.20", cookie: operatorCookie });
  assert.equal(security.response.status, 403);
});

test("viewer is read-only and sensitive sections are omitted server-side", async () => {
  const login = await call("/api/login", {
    method: "POST",
    ip: "203.0.113.30",
    body: { username: "viewer.quanly", password: "Viewer@BinhMy2026" }
  });
  assert.equal(login.response.status, 200);
  const viewerCookie = cookieFrom(login.response);

  const state = await call("/api/state", { ip: "203.0.113.30", cookie: viewerCookie });
  assert.equal(state.response.status, 200);
  assert.deepEqual(state.data.state.accounts, []);

  const update = await call("/api/state", {
    method: "PUT",
    ip: "203.0.113.30",
    cookie: viewerCookie,
    body: state.data.state
  });
  assert.equal(update.response.status, 403);
});

test("admin audit endpoint contains allowed and denied IP events", async () => {
  const audit = await call("/api/audit?limit=100", { cookie: globalThis.adminCookie });
  assert.equal(audit.response.status, 200);
  assert.ok(audit.data.entries.some((entry) => entry.event === "LOGIN_SUCCEEDED"));
  assert.ok(audit.data.entries.some((entry) => entry.event === "LOGIN_FAILED"));
  assert.ok(audit.data.entries.some((entry) => entry.event === "LOGIN_BLOCKED_IP"));
  assert.ok(audit.data.entries.some((entry) => entry.ip === "203.0.113.99"));
});
