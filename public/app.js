const API_LOGIN = "/api/login";
const API_LOGOUT = "/api/logout";
const API_SESSION = "/api/session";
const API_STATE = "/api/state";
const API_SECURITY = "/api/security";
const API_AUDIT = "/api/audit";

let currentSession = null;
let securityPolicy = null;
let stateVersion = 0;
let autoSaveTimer = null;
let isLoadingState = false;

const loginGate = document.getElementById("loginGate");
const app = document.getElementById("app");
const usernameInput = document.getElementById("portalUsername");
const passwordInput = document.getElementById("portalPassword");
const loginMessage = document.getElementById("loginMessage");

const ROLE_LABELS = {
  admin: "Admin",
  operator: "Operator",
  viewer: "Viewer"
};

const SECURITY_ERRORS = {
  INVALID_USERS: "Danh sách user không hợp lệ.",
  INVALID_USERNAME: "Username chỉ dùng chữ thường, số, dấu chấm, gạch dưới hoặc gạch ngang; tối thiểu 3 ký tự.",
  DUPLICATE_USERNAME: "Username đang bị trùng.",
  INVALID_ROLE: "Vai trò user không hợp lệ.",
  INVALID_STATUS: "Trạng thái user không hợp lệ.",
  CANNOT_DISABLE_CURRENT_USER: "Không thể tự vô hiệu hóa tài khoản đang đăng nhập.",
  ACTIVE_ADMIN_REQUIRED: "Phải còn ít nhất một Admin đang hoạt động.",
  PASSWORD_REQUIRED: "User mới phải có mật khẩu.",
  WEAK_PASSWORD: "Mật khẩu mới phải có ít nhất 12 ký tự.",
  INVALID_IP_RULES: "Danh sách IP không hợp lệ.",
  INVALID_IP_LABEL: "Tên rule IP bị trống hoặc trùng.",
  INVALID_CIDR: "IP/CIDR không hợp lệ hoặc đang mở quá rộng.",
  IP_ROLE_REQUIRED: "Mỗi IP phải cấp cho ít nhất một vai trò.",
  INVALID_EXPIRY: "Ngày hết hạn IP không hợp lệ.",
  CURRENT_IP_NOT_ALLOWED: "IP hiện tại chưa nằm trong rule dành cho Admin. Hệ thống không bật chặn để tránh tự khóa bạn."
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function hasPermission(permission) {
  return Boolean(currentSession?.permissions?.includes(permission));
}

function setSyncStatus(text, type = "pending", time = "") {
  const status = document.getElementById("syncStatus");
  const dot = document.getElementById("syncDot");
  const timeElement = document.getElementById("syncTime");
  if (status) status.textContent = text;
  if (dot) dot.className = `sync-dot ${type}`;
  if (timeElement && time) timeElement.textContent = time;
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(url, {
    ...options,
    headers,
    credentials: "same-origin"
  });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json().catch(() => ({}))
    : {};
  if (!contentType.includes("application/json")) {
    const error = new Error("WORKER_API_UNAVAILABLE");
    error.status = response.status;
    throw error;
  }
  if (!response.ok) {
    const error = new Error(data.error || "API_ERROR");
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

function showLogin(message = "") {
  currentSession = null;
  app.classList.add("hidden");
  loginGate.classList.remove("hidden");
  if (message) loginMessage.textContent = message;
}

function openPortal(session) {
  currentSession = session;
  loginGate.classList.add("hidden");
  app.classList.remove("hidden");
  applyAccess();
}

function applyAccess() {
  if (!currentSession) return;
  const role = currentSession?.user?.role || "viewer";
  document.body.dataset.role = role;
  document.querySelectorAll("[data-role]").forEach((element) => {
    const roles = element.dataset.role.split(",").map((value) => value.trim());
    element.classList.toggle("hidden", !roles.includes(role));
  });
  document.querySelectorAll("[data-permission]").forEach((element) => {
    element.classList.toggle("hidden", !hasPermission(element.dataset.permission));
  });

  document.getElementById("currentUserLabel").textContent =
    `${currentSession.user.displayName || currentSession.user.username} · ${ROLE_LABELS[role] || role}`;
  document.getElementById("currentIpLabel").textContent = currentSession.clientIp || "Không xác định";

  if (!hasPermission("state:write")) {
    document.querySelectorAll(".main input, .main textarea, .main select").forEach((input) => {
      if (input.id !== "globalSearch") input.disabled = true;
    });
  }
}

function loginErrorMessage(error) {
  if (error.message === "INVALID_CREDENTIALS") return "Tên đăng nhập hoặc mật khẩu không đúng.";
  if (error.message === "TOO_MANY_ATTEMPTS") return "Đã nhập sai quá nhiều lần. Vui lòng chờ rồi thử lại.";
  if (error.message === "WORKER_API_UNAVAILABLE") {
    return "Trang đang mở ở chế độ xem tĩnh nên API đăng nhập chưa chạy. Hãy dùng npm run dev hoặc URL sau khi deploy Worker.";
  }
  return "Không thể đăng nhập. Kiểm tra kết nối hoặc cấu hình Worker.";
}

async function login() {
  loginMessage.textContent = "Đang xác thực tài khoản...";
  try {
    const result = await apiFetch(API_LOGIN, {
      method: "POST",
      body: JSON.stringify({
        username: usernameInput.value,
        password: passwordInput.value
      })
    });
    passwordInput.value = "";
    loginMessage.textContent = "";
    const session = await apiFetch(API_SESSION);
    openPortal(session);
    await loadCloudState();
    if (session.user.role === "admin") {
      await Promise.all([loadSecurity(), loadAudit()]);
    }
    if (!result.ipEnforced && session.user.role === "admin") {
      document.getElementById("securityMessage").textContent =
        `Đang ghi log IP ${result.clientIp}, nhưng chưa chặn IP ngoài danh sách.`;
    }
  } catch (error) {
    loginMessage.textContent = loginErrorMessage(error);
  }
}

document.getElementById("loginButton").addEventListener("click", login);
passwordInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") login();
});
usernameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") passwordInput.focus();
});
document.getElementById("toggleLoginPassword").addEventListener("click", (event) => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  event.target.textContent = passwordInput.type === "password" ? "Hiện" : "Ẩn";
});
document.getElementById("logoutButton").addEventListener("click", async () => {
  try {
    await apiFetch(API_LOGOUT, { method: "POST" });
  } finally {
    location.reload();
  }
});

document.getElementById("printButton").addEventListener("click", () => window.print());
document.getElementById("themeButton").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("bbm_theme", document.body.classList.contains("dark") ? "dark" : "light");
});
if (localStorage.getItem("bbm_theme") === "dark") document.body.classList.add("dark");

const navLinks = [...document.querySelectorAll('.sidebar-nav a[href^="#"]')];
const sections = [...document.querySelectorAll("section[id]")];
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (!entry.isIntersecting) return;
    navLinks.forEach((link) => link.classList.toggle("active", link.getAttribute("href") === `#${entry.target.id}`));
  });
}, { rootMargin: "-20% 0px -70% 0px" });
sections.forEach((section) => observer.observe(section));

document.getElementById("globalSearch").addEventListener("input", (event) => {
  const query = event.target.value.trim().toLowerCase();
  document.querySelectorAll(".searchable").forEach((element) => {
    element.style.display = !query || element.innerText.toLowerCase().includes(query) ? "" : "none";
  });
});

const defaultAccounts = [
  ["n8n Production", "", "", "Cloudflare Secret / Password Manager", "Workflow Automation", "", ""],
  ["OpenClaw", "", "", "Password Manager", "AI Monitoring", "", ""],
  ["VPS Tino", "", "", "Password Manager", "Server Administration", "", ""],
  ["SSH", "", "", "SSH Key Vault", "Technical Access", "", "Ưu tiên SSH Key"],
  ["Cloudflare", "", "", "Cloudflare Account", "DNS & Security", "", ""],
  ["Google Workspace", "", "", "Google Workspace Admin", "Workspace Admin", "", ""],
  ["Google Drive", "", "", "Google Workspace", "File Storage", "", ""],
  ["Google Sheets - Báo cơm", "", "", "Google Workspace", "Input Data", "", ""],
  ["Google Sheets - Định mức", "", "", "Google Workspace", "Master Data", "", ""],
  ["Bảng LED", "", "", "Google Workspace", "Kitchen Output", "", ""],
  ["Đề xuất đặt hàng", "", "", "Google Workspace", "Accounting Output", "", ""],
  ["Phiếu xuất kho", "", "", "Google Workspace", "Warehouse Output", "", ""],
  ["Backup", "", "", "Kho backup riêng", "Recovery", "", ""]
];

function addAccountRow(values = ["", "", "", "", "", "", ""]) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input data-f="system" value="${esc(values[0])}"></td>
    <td><input data-f="url" value="${esc(values[1])}" placeholder="https:// hoặc IP"></td>
    <td><input data-f="username" value="${esc(values[2])}"></td>
    <td><input data-f="secretRef" value="${esc(values[3])}" placeholder="Tên secret / vault, không nhập mật khẩu"></td>
    <td><input data-f="role" value="${esc(values[4])}"></td>
    <td><input data-f="owner" value="${esc(values[5])}"></td>
    <td><textarea data-f="notes">${esc(values[6])}</textarea></td>
    <td><button class="delete-row" type="button">Xóa</button></td>`;
  row.querySelector(".delete-row").addEventListener("click", () => {
    if (confirm("Xóa tài khoản này?")) {
      row.remove();
      scheduleAutoSave();
    }
  });
  document.getElementById("accountRows").appendChild(row);
}

function accountData() {
  return [...document.querySelectorAll("#accountRows tr")].map((row) => (
    [...row.querySelectorAll("[data-f]")].map((input) => input.value)
  ));
}

const handoverFields = [
  "handoverFrom",
  "handoverTo",
  "handoverDate",
  "workflowVersion",
  "backupLocation",
  "supportChannel",
  "operationPortalUrl"
];

function getHandover() {
  const result = {};
  handoverFields.forEach((id) => { result[id] = document.getElementById(id).value; });
  return result;
}

function fillHandover(values = {}) {
  handoverFields.forEach((id) => {
    if (values[id] !== undefined) document.getElementById(id).value = values[id];
  });
  updateOperationLinks(values.operationPortalUrl || "");
}

function validOperationUrl(value) {
  try {
    const url = new URL(value || "/", location.origin);
    if (url.protocol !== "https:" && url.origin !== location.origin) return null;
    return url.href;
  } catch {
    return null;
  }
}

function updateOperationLinks(configuredUrl) {
  const validUrl = validOperationUrl(configuredUrl);
  const fallback = `${location.origin}/`;
  const href = validUrl || fallback;
  ["operationLaunchNav", "operationHeroLink", "operationSopLink"].forEach((id) => {
    const link = document.getElementById(id);
    if (link) link.href = href;
  });
  const display = document.getElementById("systemLoginUrlDisplay");
  if (display) {
    display.textContent = validUrl
      ? href
      : `Chưa cấu hình — đang mở trang đăng nhập ${fallback}`;
  }
}

function getChecklist() {
  return [...document.querySelectorAll('.checklist-panel input[type="checkbox"], .acceptance-grid input[type="checkbox"]')]
    .map((checkbox) => checkbox.checked);
}

function fillChecklist(values = []) {
  document.querySelectorAll('.checklist-panel input[type="checkbox"], .acceptance-grid input[type="checkbox"]')
    .forEach((checkbox, index) => { checkbox.checked = Boolean(values[index]); });
}

function getChanges() {
  return [...document.querySelectorAll("#changeRows tr")].map((row) => (
    [...row.querySelectorAll("input,textarea,select")].map((input) => input.value)
  ));
}

function addChangeRow(values = ["", "", "", "", "", "Draft"]) {
  const row = document.createElement("tr");
  row.innerHTML = `
    <td><input type="date" value="${esc(values[0])}"></td>
    <td><input value="${esc(values[1])}"></td>
    <td><input value="${esc(values[2])}"></td>
    <td><textarea>${esc(values[3])}</textarea></td>
    <td><input value="${esc(values[4])}"></td>
    <td><select>
      <option ${values[5] === "Draft" ? "selected" : ""}>Draft</option>
      <option ${values[5] === "Approved" ? "selected" : ""}>Approved</option>
      <option ${values[5] === "Deployed" ? "selected" : ""}>Deployed</option>
    </select></td>
    <td><button class="delete-row" type="button">Xóa</button></td>`;
  row.querySelector(".delete-row").addEventListener("click", () => {
    row.remove();
    scheduleAutoSave();
  });
  document.getElementById("changeRows").appendChild(row);
}

function collectState() {
  return {
    version: stateVersion,
    accounts: accountData(),
    handover: getHandover(),
    checklist: getChecklist(),
    changes: getChanges(),
    updatedAt: new Date().toISOString()
  };
}

function renderState(state = {}) {
  isLoadingState = true;
  document.getElementById("accountRows").innerHTML = "";
  if (currentSession?.user?.role === "admin") {
    (state.accounts?.length ? state.accounts : defaultAccounts).forEach(addAccountRow);
  }
  fillHandover(state.handover || { workflowVersion: "6.1", operationPortalUrl: "" });
  fillChecklist(state.checklist || []);
  document.getElementById("changeRows").innerHTML = "";
  (state.changes?.length
    ? state.changes
    : [["2026-07-23", "6.1", "Security Layer", "Bổ sung RBAC, IP allowlist, audit log và link web vận hành.", "Ban AI", "Approved"]]
  ).forEach(addChangeRow);
  stateVersion = Number(state.version || 0);
  isLoadingState = false;
  applyAccess();
}

async function loadCloudState() {
  setSyncStatus("Đang tải dữ liệu...","pending");
  try {
    const result = await apiFetch(API_STATE);
    renderState(result.state || {});
    setSyncStatus(
      "Đã đồng bộ Cloudflare",
      "ok",
      result.state?.updatedAt ? new Date(result.state.updatedAt).toLocaleString("vi-VN") : "Chưa có dữ liệu"
    );
  } catch (error) {
    if (error.status === 401 || error.status === 403) {
      showLogin(error.message === "IP_NOT_ALLOWED" ? "IP hiện tại không còn được phép." : "Phiên đăng nhập đã hết hạn.");
      return;
    }
    setSyncStatus("Không tải được dữ liệu", "error", "Kiểm tra Worker và KV");
  }
}

async function saveCloudState(showAlert = true) {
  if (!hasPermission("state:write")) return;
  setSyncStatus("Đang lưu...", "pending");
  try {
    const result = await apiFetch(API_STATE, {
      method: "PUT",
      body: JSON.stringify(collectState())
    });
    stateVersion = result.version;
    setSyncStatus("Đã lưu lên Cloudflare", "ok", new Date(result.updatedAt).toLocaleString("vi-VN"));
    if (showAlert) alert("Đã lưu. Mọi thiết bị được cấp quyền sẽ thấy dữ liệu mới.");
  } catch (error) {
    setSyncStatus("Lưu thất bại", "error", "Kiểm tra quyền hoặc xung đột phiên bản");
    if (showAlert) {
      alert(error.message === "VERSION_CONFLICT"
        ? "Dữ liệu đã được cập nhật ở thiết bị khác. Hãy tải lại trang trước khi lưu."
        : "Không thể lưu dữ liệu.");
    }
  }
}

function scheduleAutoSave() {
  if (isLoadingState || !hasPermission("state:write")) return;
  clearTimeout(autoSaveTimer);
  setSyncStatus("Có thay đổi chưa lưu", "dirty", "Tự lưu sau 2 giây");
  autoSaveTimer = setTimeout(() => saveCloudState(false), 2000);
}

document.getElementById("addAccount").addEventListener("click", () => {
  addAccountRow();
  scheduleAutoSave();
});
document.getElementById("saveAccounts").addEventListener("click", () => saveCloudState(true));
document.getElementById("addChange").addEventListener("click", () => {
  addChangeRow();
  scheduleAutoSave();
});
document.addEventListener("input", (event) => {
  if (event.target.closest("#loginGate") || event.target.closest("#access-control") || event.target.id === "globalSearch") return;
  if (event.target.matches("input, textarea, select")) scheduleAutoSave();
});
document.addEventListener("change", (event) => {
  if (event.target.closest("#loginGate") || event.target.closest("#access-control")) return;
  if (event.target.matches("input, textarea, select")) {
    if (event.target.id === "operationPortalUrl") updateOperationLinks(event.target.value);
    scheduleAutoSave();
  }
});

document.getElementById("exportAccounts").addEventListener("click", () => {
  const payload = {
    project: "Bếp Bình Mỹ",
    version: "6.1",
    exportedAt: new Date().toISOString(),
    state: collectState()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "bep-binh-my-cloud-backup.json";
  link.click();
  URL.revokeObjectURL(link.href);
});

document.getElementById("importAccounts").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;
  try {
    const payload = JSON.parse(await file.text());
    renderState(payload.state || payload);
    await saveCloudState(true);
  } catch {
    alert("File JSON không hợp lệ.");
  }
});

function addSecurityUserRow(user = {}) {
  const row = document.createElement("tr");
  row.dataset.id = user.id || "";
  row.innerHTML = `
    <td><input data-user="displayName" value="${esc(user.displayName || "")}" placeholder="Tên hiển thị"></td>
    <td><input data-user="username" value="${esc(user.username || "")}" placeholder="username"></td>
    <td><select data-user="role">
      <option value="admin" ${user.role === "admin" ? "selected" : ""}>Admin</option>
      <option value="operator" ${user.role === "operator" ? "selected" : ""}>Operator</option>
      <option value="viewer" ${user.role === "viewer" ? "selected" : ""}>Viewer</option>
    </select></td>
    <td><select data-user="status">
      <option value="active" ${user.status !== "disabled" ? "selected" : ""}>Đang hoạt động</option>
      <option value="disabled" ${user.status === "disabled" ? "selected" : ""}>Vô hiệu hóa</option>
    </select></td>
    <td><input data-user="newPassword" type="password" autocomplete="new-password" placeholder="${user.hasPassword ? "Để trống nếu giữ nguyên" : "Tối thiểu 12 ký tự"}"></td>
    <td><textarea data-user="notes">${esc(user.notes || "")}</textarea></td>
    <td><button class="delete-row" type="button">Xóa</button></td>`;
  const isCurrentUser = user.username === currentSession?.user?.username;
  if (isCurrentUser) {
    row.querySelector('[data-user="status"]').disabled = true;
    row.querySelector(".delete-row").disabled = true;
    row.querySelector(".delete-row").title = "Không thể xóa user đang đăng nhập";
  }
  row.querySelector(".delete-row").addEventListener("click", () => row.remove());
  document.getElementById("securityUserRows").appendChild(row);
}

function securityUsersData() {
  return [...document.querySelectorAll("#securityUserRows tr")].map((row) => {
    const value = (field) => row.querySelector(`[data-user="${field}"]`).value;
    return {
      id: row.dataset.id,
      displayName: value("displayName"),
      username: value("username"),
      role: value("role"),
      status: value("status"),
      newPassword: value("newPassword"),
      notes: value("notes")
    };
  });
}

function datetimeLocalValue(isoValue) {
  if (!isoValue) return "";
  const date = new Date(isoValue);
  if (Number.isNaN(date.getTime())) return "";
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function addIpRuleRow(rule = {}) {
  const roles = rule.roles || ["admin"];
  const row = document.createElement("tr");
  row.dataset.id = rule.id || "";
  row.innerHTML = `
    <td><input data-ip="label" value="${esc(rule.label || "")}" placeholder="VD: Văn phòng quản trị"></td>
    <td><input data-ip="cidr" value="${esc(rule.cidr || "")}" placeholder="203.0.113.10/32"></td>
    <td><div class="role-checks">
      <label><input type="checkbox" data-ip-role="admin" ${roles.includes("admin") ? "checked" : ""}> Admin</label>
      <label><input type="checkbox" data-ip-role="operator" ${roles.includes("operator") ? "checked" : ""}> Operator</label>
      <label><input type="checkbox" data-ip-role="viewer" ${roles.includes("viewer") ? "checked" : ""}> Viewer</label>
    </div></td>
    <td><input data-ip="enabled" type="checkbox" ${rule.enabled !== false ? "checked" : ""}></td>
    <td><input data-ip="expiresAt" type="datetime-local" value="${datetimeLocalValue(rule.expiresAt)}"></td>
    <td><textarea data-ip="notes">${esc(rule.notes || "")}</textarea></td>
    <td><button class="delete-row" type="button">Xóa</button></td>`;
  row.querySelector(".delete-row").addEventListener("click", () => row.remove());
  document.getElementById("ipRuleRows").appendChild(row);
}

function ipRulesData() {
  return [...document.querySelectorAll("#ipRuleRows tr")].map((row) => {
    const value = (field) => row.querySelector(`[data-ip="${field}"]`);
    const expiresAt = value("expiresAt").value;
    return {
      id: row.dataset.id,
      label: value("label").value,
      cidr: value("cidr").value,
      roles: [...row.querySelectorAll("[data-ip-role]:checked")].map((input) => input.dataset.ipRole),
      enabled: value("enabled").checked,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : "",
      notes: value("notes").value
    };
  });
}

function renderSecurity(policy) {
  securityPolicy = policy;
  document.getElementById("enforceIpAllowlist").checked = Boolean(policy.enforceIpAllowlist);
  document.getElementById("sessionTtlMinutes").value = Math.round(Number(policy.sessionTtlSeconds || 14400) / 60);
  document.getElementById("maxLoginAttempts").value = Number(policy.maxLoginAttempts || 5);
  document.getElementById("loginWindowMinutes").value = Math.round(Number(policy.loginWindowSeconds || 900) / 60);
  document.getElementById("securityUserRows").innerHTML = "";
  policy.users.forEach(addSecurityUserRow);
  document.getElementById("ipRuleRows").innerHTML = "";
  policy.ipRules.forEach(addIpRuleRow);
  document.getElementById("securityWarning").classList.toggle("hidden", Boolean(policy.enforceIpAllowlist));
  document.getElementById("currentIpLabel").textContent = policy.currentIp || currentSession.clientIp;
}

async function loadSecurity() {
  try {
    const result = await apiFetch(API_SECURITY);
    renderSecurity(result.policy);
  } catch (error) {
    document.getElementById("securityMessage").textContent = "Không tải được chính sách bảo mật.";
  }
}

async function saveSecurity() {
  const message = document.getElementById("securityMessage");
  message.className = "form-message";
  message.textContent = "Đang kiểm tra và lưu chính sách...";
  try {
    const result = await apiFetch(API_SECURITY, {
      method: "PUT",
      body: JSON.stringify({
        enforceIpAllowlist: document.getElementById("enforceIpAllowlist").checked,
        sessionTtlSeconds: Number(document.getElementById("sessionTtlMinutes").value) * 60,
        maxLoginAttempts: Number(document.getElementById("maxLoginAttempts").value),
        loginWindowSeconds: Number(document.getElementById("loginWindowMinutes").value) * 60,
        users: securityUsersData(),
        ipRules: ipRulesData()
      })
    });
    renderSecurity(result.policy);
    message.className = "form-message success";
    message.textContent = result.policy.enforceIpAllowlist
      ? "Đã lưu. Từ bây giờ chỉ user đúng vai trò và IP hợp lệ mới vào được."
      : "Đã lưu. IP vẫn đang ở chế độ ghi log, chưa cưỡng chế chặn.";
    await loadAudit();
  } catch (error) {
    message.className = "form-message error";
    message.textContent = SECURITY_ERRORS[error.message] || `Không lưu được chính sách: ${error.message}`;
  }
}

document.getElementById("addUser").addEventListener("click", () => addSecurityUserRow({
  role: "viewer",
  status: "active",
  hasPassword: false
}));
document.getElementById("addCurrentIp").addEventListener("click", () => {
  const currentIp = securityPolicy?.currentIp || currentSession?.clientIp;
  if (!currentIp) return;
  const cidr = currentIp.includes(":") ? currentIp : `${currentIp}/32`;
  const exists = ipRulesData().some((rule) => rule.cidr === cidr);
  if (exists) {
    document.getElementById("securityMessage").textContent = "IP hiện tại đã có trong danh sách.";
    return;
  }
  addIpRuleRow({
    label: "IP quản trị hiện tại",
    cidr,
    roles: ["admin"],
    enabled: true,
    notes: "Được thêm từ phiên Admin hiện tại"
  });
});
document.getElementById("saveSecurity").addEventListener("click", saveSecurity);

function auditResultLabel(result) {
  return result === "allowed" ? "Cho phép" : "Từ chối";
}

function renderAudit(entries) {
  const body = document.getElementById("auditRows");
  body.innerHTML = "";
  if (!entries.length) {
    body.innerHTML = '<tr><td colspan="8">Chưa có log truy cập.</td></tr>';
    return;
  }
  entries.forEach((entry) => {
    const row = document.createElement("tr");
    row.innerHTML = `
      <td>${esc(new Date(entry.timestamp).toLocaleString("vi-VN"))}</td>
      <td><code>${esc(entry.event)}</code></td>
      <td><span class="audit-result ${entry.result === "allowed" ? "allowed" : "denied"}">${esc(auditResultLabel(entry.result))}</span></td>
      <td><strong>${esc(entry.username || "—")}</strong><br><small>${esc(entry.role || "")}</small></td>
      <td><code>${esc(entry.ip || "—")}</code></td>
      <td>${esc([entry.city, entry.country, entry.colo].filter(Boolean).join(" · ") || "—")}</td>
      <td class="audit-device" title="${esc(entry.userAgent || "")}">${esc(entry.userAgent || "—")}</td>
      <td>${esc([entry.reason, entry.detail].filter(Boolean).join(" · ") || "—")}</td>`;
    body.appendChild(row);
  });
}

async function loadAudit() {
  const message = document.getElementById("auditMessage");
  message.textContent = "Đang tải log...";
  try {
    const result = await apiFetch(`${API_AUDIT}?limit=100`);
    renderAudit(result.entries || []);
    message.textContent = `Hiển thị ${result.entries?.length || 0} sự kiện gần nhất · lưu tối đa ${result.retentionDays} ngày.`;
  } catch {
    message.textContent = "Không tải được audit log.";
  }
}
document.getElementById("refreshAudit").addEventListener("click", loadAudit);

async function bootstrap() {
  renderState({});
  try {
    const session = await apiFetch(API_SESSION);
    openPortal(session);
    await loadCloudState();
    if (session.user.role === "admin") {
      await Promise.all([loadSecurity(), loadAudit()]);
    }
  } catch {
    showLogin();
  }
}

bootstrap();
