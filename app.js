
const SESSION_KEY = "bbm_portal_authenticated_v5";
const API_STATE = "/api/state";
const API_LOGIN = "/api/login";

let authToken = sessionStorage.getItem("bbm_auth_token_v5") || "";
let stateVersion = 0;
let autoSaveTimer = null;
let isLoadingState = false;

const loginGate = document.getElementById("loginGate");
const app = document.getElementById("app");
const passwordInput = document.getElementById("portalPassword");
const loginMessage = document.getElementById("loginMessage");

function setSyncStatus(text, type="pending", time="") {
  const status = document.getElementById("syncStatus");
  const dot = document.getElementById("syncDot");
  const timeEl = document.getElementById("syncTime");
  if(status) status.textContent = text;
  if(dot) dot.className = "sync-dot " + type;
  if(timeEl && time) timeEl.textContent = time;
}

async function apiFetch(url, options={}) {
  const headers = new Headers(options.headers || {});
  headers.set("Content-Type", "application/json");
  if(authToken) headers.set("Authorization", "Bearer " + authToken);
  const res = await fetch(url, {...options, headers});
  if(res.status === 401) {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem("bbm_auth_token_v5");
    authToken = "";
    throw new Error("UNAUTHORIZED");
  }
  if(!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "API_ERROR");
  }
  return res.json();
}

function openPortal() {
  loginGate.classList.add("hidden");
  app.classList.remove("hidden");
  sessionStorage.setItem(SESSION_KEY, "1");
}

document.getElementById("loginButton").addEventListener("click", async () => {
  loginMessage.textContent = "Đang xác thực...";
  try {
    const result = await fetch(API_LOGIN, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({password:passwordInput.value})
    });
    const data = await result.json();
    if(!result.ok) throw new Error(data.error || "LOGIN_FAILED");
    authToken = data.token;
    sessionStorage.setItem("bbm_auth_token_v5", authToken);
    loginMessage.textContent = "";
    openPortal();
    await loadCloudState();
  } catch(err) {
    loginMessage.textContent = "Mật khẩu không đúng hoặc Cloudflare Functions chưa được cấu hình.";
  }
});

passwordInput.addEventListener("keydown", e => {
  if(e.key === "Enter") document.getElementById("loginButton").click();
});
document.getElementById("toggleLoginPassword").addEventListener("click", e => {
  passwordInput.type = passwordInput.type === "password" ? "text" : "password";
  e.target.textContent = passwordInput.type === "password" ? "Hiện" : "Ẩn";
});
document.getElementById("logoutButton").addEventListener("click", () => {
  sessionStorage.removeItem(SESSION_KEY);
  sessionStorage.removeItem("bbm_auth_token_v5");
  location.reload();
});

document.getElementById("printButton").addEventListener("click", () => window.print());
document.getElementById("themeButton").addEventListener("click", () => {
  document.body.classList.toggle("dark");
  localStorage.setItem("bbm_theme", document.body.classList.contains("dark") ? "dark" : "light");
});
if(localStorage.getItem("bbm_theme")==="dark") document.body.classList.add("dark");

const navLinks=[...document.querySelectorAll(".sidebar-nav a")];
const sections=[...document.querySelectorAll("section[id]")];
const observer=new IntersectionObserver(entries=>{
  entries.forEach(entry=>{
    if(entry.isIntersecting) navLinks.forEach(a=>a.classList.toggle("active",a.getAttribute("href")==="#"+entry.target.id));
  });
},{rootMargin:"-20% 0px -70% 0px"});
sections.forEach(s=>observer.observe(s));

document.getElementById("globalSearch").addEventListener("input",e=>{
  const q=e.target.value.trim().toLowerCase();
  document.querySelectorAll(".searchable").forEach(el=>{
    el.style.display=!q||el.innerText.toLowerCase().includes(q)?"":"none";
  });
});

const defaultAccounts = [
  ["n8n Production","","","","Workflow Automation","",""],
  ["OpenClaw","","","","AI Monitoring","",""],
  ["VPS Tino","","","","Server Administration","",""],
  ["SSH","","","","Technical Access","","Ưu tiên SSH Key"],
  ["Cloudflare","","","","DNS & Security","",""],
  ["Google Workspace","","","","Workspace Admin","",""],
  ["Google Drive","","","","File Storage","",""],
  ["Google Sheets - Báo cơm","","","","Input Data","",""],
  ["Google Sheets - Định mức","","","","Master Data","",""],
  ["Google Sheets - Danh mục món","","","","Master Data","",""],
  ["Google Sheets - Danh mục nguyên liệu","","","","Master Data","",""],
  ["Google Sheets - Món ngon","","","","Special Menu","",""],
  ["Google Sheets - Món thay thế","","","","Replacement Config","",""],
  ["Bảng LED","","","","Kitchen Output","",""],
  ["Đề xuất đặt hàng","","","","Accounting Output","",""],
  ["Phiếu xuất kho","","","","Warehouse Output","",""],
  ["Backup","","","","Recovery","",""]
];

function esc(v) {
  return String(v??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[s]));
}
function addAccountRow(values=["","","","","","",""]) {
  const tr=document.createElement("tr");
  tr.innerHTML=`
    <td><input data-f="system" value="${esc(values[0])}"></td>
    <td><input data-f="url" value="${esc(values[1])}" placeholder="https:// hoặc IP"></td>
    <td><input data-f="username" value="${esc(values[2])}"></td>
    <td><div class="secret-wrap"><input data-f="password" type="password" value="${esc(values[3])}"><button class="button button-secondary reveal" type="button">Hiện</button></div></td>
    <td><input data-f="role" value="${esc(values[4])}"></td>
    <td><input data-f="owner" value="${esc(values[5])}"></td>
    <td><textarea data-f="notes">${esc(values[6])}</textarea></td>
    <td><button class="delete-row" type="button">Xóa</button></td>`;
  tr.querySelector(".reveal").addEventListener("click",e=>{
    const input=tr.querySelector('[data-f="password"]');
    input.type=input.type==="password"?"text":"password";
    e.target.textContent=input.type==="password"?"Hiện":"Ẩn";
  });
  tr.querySelector(".delete-row").addEventListener("click",()=>{
    if(confirm("Xóa tài khoản này?")){tr.remove();scheduleAutoSave();}
  });
  document.getElementById("accountRows").appendChild(tr);
}
function accountData() {
  return [...document.querySelectorAll("#accountRows tr")].map(tr=>[...tr.querySelectorAll("[data-f]")].map(x=>x.value));
}
const handoverFields=["handoverFrom","handoverTo","handoverDate","workflowVersion","backupLocation","supportChannel"];
function getHandover() {
  const o={}; handoverFields.forEach(id=>o[id]=document.getElementById(id).value); return o;
}
function fillHandover(o={}) {
  handoverFields.forEach(id=>{if(o[id]!==undefined)document.getElementById(id).value=o[id];});
}
function getChecklist() {
  return [...document.querySelectorAll('.checklist-panel input[type="checkbox"], .acceptance-grid input[type="checkbox"]')].map(x=>x.checked);
}
function fillChecklist(values=[]) {
  [...document.querySelectorAll('.checklist-panel input[type="checkbox"], .acceptance-grid input[type="checkbox"]')].forEach((x,i)=>x.checked=!!values[i]);
}
function getChanges() {
  return [...document.querySelectorAll("#changeRows tr")].map(tr=>[...tr.querySelectorAll("input,textarea,select")].map(x=>x.value));
}
function addChangeRow(values=["","","","","","Draft"]) {
  const tr=document.createElement("tr");
  tr.innerHTML=`
    <td><input type="date" value="${esc(values[0])}"></td>
    <td><input value="${esc(values[1])}"></td>
    <td><input value="${esc(values[2])}"></td>
    <td><textarea>${esc(values[3])}</textarea></td>
    <td><input value="${esc(values[4])}"></td>
    <td><select><option ${values[5]==="Draft"?"selected":""}>Draft</option><option ${values[5]==="Approved"?"selected":""}>Approved</option><option ${values[5]==="Deployed"?"selected":""}>Deployed</option></select></td>
    <td><button class="delete-row">Xóa</button></td>`;
  tr.querySelector(".delete-row").addEventListener("click",()=>{tr.remove();scheduleAutoSave();});
  document.getElementById("changeRows").appendChild(tr);
}
function collectState() {
  return {
    version:stateVersion,
    accounts:accountData(),
    handover:getHandover(),
    checklist:getChecklist(),
    changes:getChanges(),
    updatedAt:new Date().toISOString()
  };
}
function renderState(state={}) {
  isLoadingState=true;
  document.getElementById("accountRows").innerHTML="";
  (state.accounts?.length?state.accounts:defaultAccounts).forEach(addAccountRow);
  fillHandover(state.handover||{workflowVersion:"5.0"});
  fillChecklist(state.checklist||[]);
  document.getElementById("changeRows").innerHTML="";
  (state.changes?.length?state.changes:[["2026-07-18","5.0","Cloud Sync","Nâng cấp lưu dữ liệu bằng Cloudflare Pages Functions và KV.","Ban AI","Approved"]]).forEach(addChangeRow);
  stateVersion=Number(state.version||0);
  isLoadingState=false;
}

async function loadCloudState() {
  setSyncStatus("Đang tải dữ liệu từ Cloudflare...","pending");
  try {
    const result=await apiFetch(API_STATE);
    renderState(result.state||{});
    setSyncStatus("Đã đồng bộ Cloudflare","ok",result.state?.updatedAt?new Date(result.state.updatedAt).toLocaleString("vi-VN"):"Chưa có dữ liệu");
  } catch(err) {
    setSyncStatus("Không tải được dữ liệu Cloudflare","error","Kiểm tra Pages Functions và KV");
    console.error(err);
  }
}
async function saveCloudState(showAlert=true) {
  if(!authToken) return;
  setSyncStatus("Đang lưu lên Cloudflare...","pending");
  try {
    const result=await apiFetch(API_STATE,{method:"PUT",body:JSON.stringify(collectState())});
    stateVersion=result.version;
    setSyncStatus("Đã lưu lên Cloudflare","ok",new Date(result.updatedAt).toLocaleString("vi-VN"));
    if(showAlert) alert("Đã lưu. Mở trên máy khác sẽ thấy dữ liệu mới.");
  } catch(err) {
    setSyncStatus("Lưu thất bại","error","Kiểm tra kết nối hoặc dữ liệu đã bị người khác cập nhật");
    if(showAlert) alert(err.message==="VERSION_CONFLICT"?"Dữ liệu đã được cập nhật ở thiết bị khác. Hãy tải lại trang trước khi lưu.":"Không thể lưu lên Cloudflare.");
  }
}
function scheduleAutoSave() {
  if(isLoadingState||!authToken)return;
  clearTimeout(autoSaveTimer);
  setSyncStatus("Có thay đổi chưa lưu","dirty","Tự lưu sau 2 giây");
  autoSaveTimer=setTimeout(()=>saveCloudState(false),2000);
}

document.getElementById("addAccount").addEventListener("click",()=>{addAccountRow();scheduleAutoSave();});
document.getElementById("saveAccounts").addEventListener("click",()=>saveCloudState(true));
document.getElementById("addChange").addEventListener("click",()=>{addChangeRow();scheduleAutoSave();});
document.addEventListener("input", e => {
  if (e.target.closest("#loginGate") || e.target.id === "globalSearch") return;
  if (e.target.matches("input, textarea, select")) scheduleAutoSave();
});
document.addEventListener("change", e => {
  if (e.target.closest("#loginGate")) return;
  if (e.target.matches("input, textarea, select")) scheduleAutoSave();
});

document.getElementById("exportAccounts").addEventListener("click",()=>{
  const payload={project:"Bếp Bình Mỹ",version:"5.0",exportedAt:new Date().toISOString(),state:collectState()};
  const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="bep-binh-my-cloud-backup.json";a.click();URL.revokeObjectURL(a.href);
});
document.getElementById("importAccounts").addEventListener("change",async e=>{
  const file=e.target.files[0];if(!file)return;
  try{
    const payload=JSON.parse(await file.text());
    renderState(payload.state||payload);
    await saveCloudState(true);
  }catch(err){alert("File JSON không hợp lệ.");}
});

if(sessionStorage.getItem(SESSION_KEY)==="1"&&authToken){
  openPortal();
  loadCloudState();
} else {
  renderState({});
}
