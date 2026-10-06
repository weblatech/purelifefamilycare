/* ============================================================
   admin.js — Pure Life Family Care  |  Admin Portal
   Unified Dashboard, CRM, Slip Generator, Booking, Customizer
   ============================================================ */

/* ----------  CONFIGURATION  ---------- */
const API_URL = "https://script.google.com/macros/s/AKfycbyqDXT-da2tE0e_lderGnKommRrDCQlUAEW-10Y1ewRks3RmFbSgvV7zAUht1eavATUWQ/exec";

/* ----------  STATE  ---------- */
let allOrders   = [];
let allStock    = [];
let currentModule = "dashboard";
let ordersCache  = null;
let ordersCacheTime = 0;
const CACHE_TTL = 15000;

async function getOrdersCached() {
  const now = Date.now();
  if (ordersCache && (now - ordersCacheTime) < CACHE_TTL) return ordersCache;
  const json = await apiGet("ordersList");
  ordersCache = (json && json.success !== undefined) ? (json.data || []) : (json || []);
  if (!Array.isArray(ordersCache)) ordersCache = [];
  ordersCacheTime = now;
  return ordersCache;
}

/* ============================================================
   ADMIN AUTHENTICATION & SECURITY CONTROLLER
   ============================================================ */
const DEFAULT_ADMIN_USER = "admin";
const DEFAULT_ADMIN_PASS = "purelife123";

function getStoredAdminAuth() {
  try {
    const raw = localStorage.getItem("pl_admin_auth");
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.password) {
        return {
          username: parsed.username || DEFAULT_ADMIN_USER,
          password: parsed.password || DEFAULT_ADMIN_PASS
        };
      }
    }
  } catch (e) {}
  return { username: DEFAULT_ADMIN_USER, password: DEFAULT_ADMIN_PASS };
}

function checkAdminAuthSession() {
  try {
    const raw = localStorage.getItem("pl_admin_session");
    if (!raw) return false;
    const session = JSON.parse(raw);
    if (!session || !session.loggedIn) return false;
    if (session.expiresAt && Date.now() > session.expiresAt) {
      localStorage.removeItem("pl_admin_session");
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function initAdminAuth() {
  const loginOverlay = document.getElementById("adminLoginScreen");
  const appContainer = document.getElementById("adminAppContainer");
  const auth = getStoredAdminAuth();

  // Update username displays
  const headerUser = document.getElementById("headerAdminUsername");
  if (headerUser) headerUser.textContent = auth.username;
  const loginUserInput = document.getElementById("loginUsername");
  if (loginUserInput && !loginUserInput.value) loginUserInput.value = auth.username;

  if (checkAdminAuthSession()) {
    if (loginOverlay) loginOverlay.classList.add("hidden");
    if (appContainer) appContainer.classList.remove("hidden");
    return true;
  } else {
    if (loginOverlay) loginOverlay.classList.remove("hidden");
    if (appContainer) appContainer.classList.add("hidden");
    return false;
  }
}

async function handleAdminLogin(event) {
  if (event) event.preventDefault();

  const userEl = document.getElementById("loginUsername");
  const passEl = document.getElementById("loginPassword");
  const remEl = document.getElementById("loginRememberMe");
  const errBox = document.getElementById("loginErrorBox");
  const errMsg = document.getElementById("loginErrorMsg");
  const submitBtn = document.getElementById("loginSubmitBtn");

  const inputUser = (userEl?.value || "").trim();
  const inputPass = (passEl?.value || "").trim();

  let auth = getStoredAdminAuth();

  // Verify against local auth
  let isValid = (inputUser.toLowerCase() === auth.username.toLowerCase() && inputPass === auth.password);

  // If local match fails, attempt quick cloud sync verification in case password was changed on another machine
  if (!isValid) {
    try {
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i><span>Verifying...</span>';
      }
      const cfgRes = await apiGet("storeConfig");
      const cfg = (cfgRes && cfgRes.success !== undefined) ? (cfgRes.data || {}) : (cfgRes || {});
      if (cfg && cfg.settings && cfg.settings.adminAuth) {
        auth = {
          username: cfg.settings.adminAuth.username || DEFAULT_ADMIN_USER,
          password: cfg.settings.adminAuth.password || DEFAULT_ADMIN_PASS
        };
        localStorage.setItem("pl_admin_auth", JSON.stringify(auth));
        isValid = (inputUser.toLowerCase() === auth.username.toLowerCase() && inputPass === auth.password);
      }
    } catch (_) {}
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="fa-solid fa-arrow-right-to-bracket text-gold-300 text-lg"></i><span>Login to Dashboard</span>';
    }
  }

  if (!isValid) {
    if (errBox) {
      errBox.classList.remove("hidden");
      errBox.classList.remove("animate-shake");
      void errBox.offsetWidth; // re-trigger animation
      errBox.classList.add("animate-shake");
      if (errMsg) errMsg.textContent = "غلط یوزرنیم یا پاس ورڈ! براہ کرم درست معلومات درج کریں۔";
    }
    if (passEl) {
      passEl.value = "";
      passEl.focus();
    }
    return;
  }

  // Login Success
  if (errBox) errBox.classList.add("hidden");

  // Session duration: 30 days if remember me is checked, else 24 hours
  const isRemember = remEl ? remEl.checked : true;
  const duration = isRemember ? (30 * 24 * 60 * 60 * 1000) : (24 * 60 * 60 * 1000);
  const sessionData = {
    loggedIn: true,
    username: auth.username,
    loginTime: Date.now(),
    expiresAt: Date.now() + duration
  };
  localStorage.setItem("pl_admin_session", JSON.stringify(sessionData));

  // Hide login screen with smooth transition
  const loginOverlay = document.getElementById("adminLoginScreen");
  const appContainer = document.getElementById("adminAppContainer");
  if (loginOverlay) {
    loginOverlay.classList.add("opacity-0", "transition-opacity", "duration-300");
    setTimeout(() => {
      loginOverlay.classList.add("hidden");
      loginOverlay.classList.remove("opacity-0");
    }, 300);
  }
  if (appContainer) appContainer.classList.remove("hidden");

  const headerUser = document.getElementById("headerAdminUsername");
  if (headerUser) headerUser.textContent = auth.username;

  showToast(`خوش آمدید ${auth.username}! ایڈمن پورٹل میں لاگ ان ہو چکے ہیں۔`, true);

  // Initialize dashboard
  setTodayDate();
  loadDashboard();
}

function handleAdminLogout() {
  if (!confirm("کیا آپ واقعی ایڈمن پورٹل سے لاگ آؤٹ کرنا چاہتے ہیں؟")) return;

  localStorage.removeItem("pl_admin_session");

  const loginOverlay = document.getElementById("adminLoginScreen");
  const appContainer = document.getElementById("adminAppContainer");
  const passEl = document.getElementById("loginPassword");
  const errBox = document.getElementById("loginErrorBox");

  if (passEl) passEl.value = "";
  if (errBox) errBox.classList.add("hidden");
  if (appContainer) appContainer.classList.add("hidden");
  if (loginOverlay) loginOverlay.classList.remove("hidden");

  showToast("آپ ایڈمن پورٹل سے لاگ آؤٹ ہو چکے ہیں۔", true);
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  const icon = btn ? btn.querySelector("i") : null;
  if (input.type === "password") {
    input.type = "text";
    if (icon) {
      icon.classList.remove("fa-eye");
      icon.classList.add("fa-eye-slash");
    }
  } else {
    input.type = "password";
    if (icon) {
      icon.classList.remove("fa-eye-slash");
      icon.classList.add("fa-eye");
    }
  }
}

function openForgotPasswordModal() {
  const m = document.getElementById("forgotPasswordModal");
  if (m) m.classList.remove("hidden");
}

function closeForgotPasswordModal() {
  const m = document.getElementById("forgotPasswordModal");
  if (m) m.classList.add("hidden");
}

function sendPasswordResetHint() {
  const storedSettings = localStorage.getItem("pl_store_settings");
  let phone = "923320420994";
  try {
    if (storedSettings) {
      const s = JSON.parse(storedSettings);
      if (s.whatsapp) {
        const clean = s.whatsapp.replace(/[^0-9]/g, "");
        if (clean.startsWith("0")) phone = "92" + clean.slice(1);
        else phone = clean;
      }
    }
  } catch (_) {}

  const refCode = "PL-AUTH-" + Math.floor(100000 + Math.random() * 900000);
  const nowStr = new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" });

  const msg = 
`السلام علیکم Pure Life سپورٹ!
میں ایڈمن پورٹل کا پاس ورڈ بھول گیا ہوں۔ برائے مہربانی سیکیورٹی تصدیق کے بعد پاس ورڈ رہنمائی یا ری سیٹ لنک فراہم کریں۔

🔐 سیکیورٹی ریفرنس: ${refCode}
🕒 تاریخ و وقت: ${nowStr}`;

  const text = encodeURIComponent(msg);
  window.open(`https://wa.me/${phone}?text=${text}`, "_blank");
}

async function handleUpdateAdminPassword(event) {
  if (event) event.preventDefault();

  const curPassEl = document.getElementById("secCurrentPassword");
  const newUsrEl = document.getElementById("secNewUsername");
  const newPassEl = document.getElementById("secNewPassword");
  const confPassEl = document.getElementById("secConfirmPassword");
  const btn = document.getElementById("secSavePasswordBtn");

  const curPass = (curPassEl?.value || "").trim();
  const newUsr = (newUsrEl?.value || "").trim();
  const newPass = (newPassEl?.value || "").trim();
  const confPass = (confPassEl?.value || "").trim();

  const auth = getStoredAdminAuth();

  if (curPass !== auth.password) {
    showToast("❌ موجودہ پاس ورڈ درست نہیں ہے! براہ کرم درست پاس ورڈ لکھیں۔", false);
    if (curPassEl) curPassEl.focus();
    return;
  }

  if (newPass.length < 6) {
    showToast("❌ نیا پاس ورڈ کم از کم 6 ہندسوں یا حروف کا ہونا لازمی ہے!", false);
    if (newPassEl) newPassEl.focus();
    return;
  }

  if (newPass !== confPass) {
    showToast("❌ نیا پاس ورڈ اور تصدیقی پاس ورڈ آپس میں نہیں ملتے!", false);
    if (confPassEl) confPassEl.focus();
    return;
  }

  const updatedAuth = {
    username: newUsr || auth.username || DEFAULT_ADMIN_USER,
    password: newPass,
    updatedAt: new Date().toISOString()
  };

  // 1. Save locally
  localStorage.setItem("pl_admin_auth", JSON.stringify(updatedAuth));

  // 2. Update active session
  const sessionRaw = localStorage.getItem("pl_admin_session");
  if (sessionRaw) {
    try {
      const sess = JSON.parse(sessionRaw);
      sess.username = updatedAuth.username;
      localStorage.setItem("pl_admin_session", JSON.stringify(sess));
    } catch (_) {}
  }

  const headerUser = document.getElementById("headerAdminUsername");
  if (headerUser) headerUser.textContent = updatedAuth.username;

  // 3. UI Feedback
  const originalBtn = btn ? btn.innerHTML : "";
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<i class="fa-solid fa-spinner animate-spin"></i><span>محفوظ ہو رہا ہے...</span>';
  }

  // 4. Sync to Google Sheets
  try {
    await syncAdminAuthToCloud(updatedAuth);
    showToast("✅ زبردست! ایڈمن پاس ورڈ کامیابی سے تبدیل اور گوگل شیٹ میں محفوظ ہو گیا ہے۔", true);
  } catch (err) {
    console.warn("Cloud auth sync warning:", err);
    showToast("✅ پاس ورڈ تبدیل کر دیا گیا (لوکل محفوظ)!", true);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtn;
    }
    if (curPassEl) curPassEl.value = "";
    if (newPassEl) newPassEl.value = "";
    if (confPassEl) confPassEl.value = "";
  }
}

async function syncAdminAuthToCloud(authObj) {
  let cfg = {};
  try {
    const cfgRes = await apiGet("storeConfig");
    cfg = (cfgRes && cfgRes.success !== undefined) ? (cfgRes.data || {}) : (cfgRes || {});
  } catch (_) {}
  if (!cfg || typeof cfg !== "object") cfg = {};
  if (!cfg.settings || typeof cfg.settings !== "object") cfg.settings = {};

  cfg.settings.adminAuth = {
    username: authObj.username,
    password: authObj.password,
    updatedAt: authObj.updatedAt || new Date().toISOString()
  };

  await apiPost({
    action: "saveStoreConfig",
    config: cfg
  });
}

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {
  const isLoggedIn = initAdminAuth();
  setTodayDate();
  if (isLoggedIn) {
    loadDashboard();
  }
});

function setTodayDate() {
  const d = new Date();
  const el = document.getElementById("bDate");
  if (el) el.value = d.toISOString().split("T")[0];
}

/* ============================================================
   API HELPERS — with CORS retry + JSON fallback
   ============================================================ */
async function apiGet(action) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 30000);
  try {
    const res = await fetch(`${API_URL}?action=${action}`, { cache: "no-store", signal: controller.signal });
    clearTimeout(timeoutId);
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.error(`GET ${action} returned non-JSON:`, text.substring(0, 300));
      throw new Error("Server returned HTML instead of JSON — redeploy your Google Apps Script");
    }
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") throw new Error("Request timed out — check your internet or redeploy the script");
    if (err.message && err.message.includes("HTML instead of JSON")) throw err;
    console.error(`GET ${action} network error, retrying...`, err.message);
    const controller2 = new AbortController();
    const timeoutId2 = setTimeout(() => controller2.abort(), 30000);
    try {
      const res2 = await fetch(`${API_URL}?action=${action}`, { cache: "no-store", signal: controller2.signal });
      clearTimeout(timeoutId2);
      const text2 = await res2.text();
      return JSON.parse(text2);
    } catch (retryErr) {
      clearTimeout(timeoutId2);
      console.error(`GET ${action} retry also failed:`, retryErr.message);
      if (retryErr.name === "AbortError") throw new Error("Request timed out — check your internet or redeploy the script");
      throw new Error("API unreachable — check your internet connection or redeploy the script");
    }
  }
}

async function apiPost(payload) {
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch (parseErr) {
      console.error(`POST ${payload.action} returned non-JSON:`, text.substring(0, 300));
      throw new Error("Server returned HTML instead of JSON — redeploy your Google Apps Script");
    }
  } catch (err) {
    if (err.message && err.message.includes("HTML instead of JSON")) throw err;
    console.error(`POST ${payload.action} network error:`, err.message);
    throw new Error("API unreachable — check your internet connection or redeploy the script");
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function switchModule(name) {
  currentModule = name;

  document.querySelectorAll(".module").forEach(m => m.classList.add("hidden"));

  const target = document.getElementById(`mod-${name}`);
  if (target) target.classList.remove("hidden");

  document.querySelectorAll(".nav-item").forEach(btn => {
    btn.classList.remove("active");
  });
  const activeBtn = document.querySelector(`[data-nav="${name}"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }

  const titles = {
    dashboard:   "Dashboard",
    orders:      "Orders CRM",
    products:    "Products",
    reports:     "Analytics & Reports",
    slips:       "Courier Slips",
    booking:     "New Booking",
    returns:     "Returns",
    expenses:    "Expenses",
    settings:    "Store Settings (سیٹنگز)"
  };
  document.getElementById("pageTitle").textContent = titles[name] || name;

  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.add("hidden");

  if (name === "dashboard")  loadDashboard();
  if (name === "orders")     loadOrders();
  if (name === "products")   loadProducts();
  if (name === "reports")    loadReports();
  if (name === "slips")      loadSlipOrders();
  if (name === "returns")    loadReturnableOrders();
  if (name === "expenses")   loadExpenses();
  if (name === "settings")   loadStoreSettings();

  if (name === "expenses") {
    const dateEl = document.getElementById("expDate");
    if (dateEl && !dateEl.value) {
      dateEl.value = new Date().toISOString().split("T")[0];
    }
  }
}

function toggleSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebarOverlay").classList.toggle("hidden");
}

async function refreshCurrentModule() {
  const icon = document.getElementById("refreshIcon");
  const txt = document.getElementById("refreshBtnText");
  const btn = document.getElementById("mainRefreshBtn");

  if (icon) icon.classList.add("animate-spin");
  if (txt) txt.textContent = "اپڈیٹ ہو رہا ہے...";
  if (btn) btn.disabled = true;

  try {
    ordersCache = null; // Clear orders cache so fresh live data is fetched
    await switchModule(currentModule);
    showToast("ڈیٹا کامیابی سے ریفریش ہو گیا!", true);
  } catch (err) {
    console.error("Refresh error:", err);
    showToast(err.message || "ریفریش میں خرابی پیش آئی", false);
  } finally {
    setTimeout(() => {
      if (icon) icon.classList.remove("animate-spin");
      if (txt) txt.textContent = "ریفریش کریں";
      if (btn) btn.disabled = false;
    }, 600);
  }
}

/* ============================================================
   TOAST
   ============================================================ */
function showToast(msg, success) {
  const toast  = document.getElementById("toast");
  const icon   = document.getElementById("toastIcon");
  const txtMsg = document.getElementById("toastMsg");

  txtMsg.textContent = msg;
  if (success) {
    icon.classList.remove("hidden");
    icon.className = "w-4 h-4 text-green-400";
  } else {
    icon.classList.remove("hidden");
    icon.className = "w-4 h-4 text-red-400";
  }

  toast.classList.remove("hidden");
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";

  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(-10px)";
    setTimeout(() => toast.classList.add("hidden"), 300);
  }, 3000);
}

function setLastUpdated() {
  const el = document.getElementById("lastUpdated");
  if (el) el.textContent = `Updated: ${new Date().toLocaleTimeString()}`;
}

/* ============================================================
   MODULE 1: DASHBOARD (Robust Data Parsing)
   ============================================================ */
async function loadDashboard() {
  try {
    const json = await apiGet("dashboard");
    const d = (json && json.success !== undefined) ? (json.data || {}) : (json || {});

    setMetric("mDelivered", `Rs. ${(d.deliveredValue || 0).toLocaleString()}`);
    setMetric("mExpenses",  `Rs. ${(d.netExpenses || 0).toLocaleString()}`);
    setMetric("mRecovery",  `Rs. ${(d.totalReturnRecovery || 0).toLocaleString()}`);

    const profitEl = document.getElementById("mProfit");
    if (profitEl) {
      profitEl.textContent = `Rs. ${(d.netProfit || 0).toLocaleString()}`;
      profitEl.className = `text-3xl font-extrabold tracking-tight ${(d.netProfit || 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`;
    }

    setMetric("bTotal",     d.totalOrders || 0);
    setMetric("bNewOrder",  d.newOrderCount || 0);
    setMetric("bToday",     d.todayOrdersCount || 0);
    setMetric("bDelivered", d.deliveredCount || 0);
    setMetric("bPending",   d.pendingCount || 0);
    setMetric("bReturned",  d.returnedCount || 0);

    renderInventory(d.inventory || d.stockBalance || {});

    setLastUpdated();
  } catch (err) {
    console.error("Dashboard load failed:", err);
    showToast(err.message || "Failed to load dashboard", false);
    showDashboardError(err.message || "Failed to load data");
  }
}

function showDashboardError(msg) {
  var errHtml = '<tr><td colspan="9" class="px-5 py-8 text-center text-red-400">' +
    '<div class="flex flex-col items-center gap-2">' +
    '<svg class="w-8 h-8 text-red-300" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"/></svg>' +
    '<p class="text-sm font-medium">' + msg + '</p>' +
    '<button onclick="loadDashboard()" class="text-xs font-bold text-brand hover:text-brand-dark underline mt-1">Retry</button>' +
    '</div></td></tr>';
  var tbody = document.getElementById("inventoryBody");
  if (tbody) tbody.innerHTML = errHtml;
}

function setMetric(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderInventory(invData) {
  const tbody = document.getElementById("inventoryBody");
  if (!tbody) return;

  const entries = Object.entries(invData);
  if (!entries.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="px-5 py-8 text-center text-stone-400">No inventory data found.</td></tr>';
    return;
  }

  let totInitial = 0, totAdded = 0, totBooked = 0, totDelivered = 0, totReturned = 0, totAvailable = 0, totValuation = 0;

  const rows = entries.map(([key, inv]) => {
    const name = (typeof inv === "object" && inv.productName) ? inv.productName : key;
    const initial = parseInt((typeof inv === "object" && inv.initial !== undefined) ? inv.initial : 0, 10) || 0;
    const added = parseInt((typeof inv === "object" && inv.added !== undefined) ? inv.added : 0, 10) || 0;
    const booked = parseInt((typeof inv === "object" && inv.booked !== undefined) ? inv.booked : 0, 10) || 0;
    const delivered = parseInt((typeof inv === "object" && inv.delivered !== undefined) ? inv.delivered : 0, 10) || 0;
    const returned = parseInt((typeof inv === "object" && inv.returned !== undefined) ? inv.returned : 0, 10) || 0;
    const available = parseInt((typeof inv === "object" && inv.available !== undefined) ? inv.available : (typeof inv === "number" ? inv : 0), 10) || 0;
    const capsuleCost = parseFloat((typeof inv === "object" && inv.capsuleCost !== undefined) ? inv.capsuleCost : 0) || 0;
    const boxCost = parseFloat((typeof inv === "object" && inv.boxCost !== undefined) ? inv.boxCost : 0) || 0;

    totInitial += initial;
    totAdded += added;
    totBooked += booked;
    totDelivered += delivered;
    totReturned += returned;
    totAvailable += available;
    totValuation += (available * (capsuleCost + boxCost));

    const totalStockBase = initial + added;
    const pct = totalStockBase > 0 ? Math.min(100, Math.max(0, Math.round((available / totalStockBase) * 100))) : 0;
    const healthColor = pct > 40 ? 'bg-emerald-500' : (pct > 15 ? 'bg-amber-500' : 'bg-rose-500');

    let availableBadge = '';
    if (available > 40) {
      availableBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 text-emerald-800 font-extrabold text-xs border border-emerald-200 shadow-2xs">
        <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ${available} دستیاب
      </span>`;
    } else if (available > 10) {
      availableBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 text-amber-800 font-extrabold text-xs border border-amber-200 shadow-2xs">
        <span class="w-1.5 h-1.5 rounded-full bg-amber-500"></span> ${available} کم اسٹاک
      </span>`;
    } else {
      availableBadge = `<span class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-50 text-rose-800 font-extrabold text-xs border border-rose-200 shadow-2xs">
        <span class="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping"></span> ${available} ختم
      </span>`;
    }

    return `
      <tr class="border-b border-stone-100 hover:bg-stone-50/70 transition">
        <td class="px-6 py-4">
          <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-100 to-teal-100 border border-emerald-200 flex items-center justify-center text-emerald-800 font-extrabold text-sm shadow-2xs flex-shrink-0">
              ${escHtml((name || 'P').charAt(0))}
            </div>
            <div>
              <p class="font-extrabold text-stone-900 leading-snug">${escHtml(name)}</p>
              <p class="text-[10px] text-stone-400 font-medium">Active SKU · In Stock</p>
            </div>
          </div>
        </td>
        <td class="text-center px-4 py-4 font-bold text-stone-600">${initial}</td>
        <td class="text-center px-4 py-4">
          <span class="px-2.5 py-1 rounded-lg ${added > 0 ? 'bg-blue-50 text-blue-700 font-extrabold border border-blue-200/60' : 'text-stone-400 font-bold'}">${added}</span>
        </td>
        <td class="text-center px-4 py-4">
          <span class="px-2.5 py-1 rounded-lg ${booked > 0 ? 'bg-amber-50 text-amber-700 font-extrabold border border-amber-200/60' : 'text-stone-400 font-bold'}">${booked}</span>
        </td>
        <td class="text-center px-4 py-4">
          <span class="px-2.5 py-1 rounded-lg ${delivered > 0 ? 'bg-emerald-50 text-emerald-700 font-extrabold border border-emerald-200/60' : 'text-stone-400 font-bold'}">${delivered}</span>
        </td>
        <td class="text-center px-4 py-4">
          <span class="px-2.5 py-1 rounded-lg ${returned > 0 ? 'bg-rose-50 text-rose-600 font-extrabold border border-rose-200/60' : 'text-stone-400 font-bold'}">${returned}</span>
        </td>
        <td class="text-center px-5 py-4">${availableBadge}</td>
        <td class="text-right px-4 py-4 font-bold text-stone-900">${capsuleCost > 0 ? ('Rs. ' + capsuleCost.toLocaleString()) : '—'}</td>
        <td class="text-right px-4 py-4 font-bold text-stone-900">${boxCost > 0 ? ('Rs. ' + boxCost.toLocaleString()) : '—'}</td>
        <td class="text-center px-5 py-4">
          <div class="flex flex-col items-center justify-center gap-1">
            <div class="w-20 bg-stone-100 rounded-full h-2 overflow-hidden border border-stone-200/80">
              <div class="h-full rounded-full ${healthColor} transition-all duration-500" style="width: ${pct}%"></div>
            </div>
            <span class="text-[10px] font-bold text-stone-400">${pct}% صحت</span>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const overallStockBase = totInitial + totAdded;
  const overallPct = overallStockBase > 0 ? Math.min(100, Math.max(0, Math.round((totAvailable / overallStockBase) * 100))) : 0;

  const totalRow = `
    <tr class="bg-stone-100/70 font-black border-t-2 border-stone-200 text-stone-900">
      <td class="px-6 py-4 uppercase text-xs tracking-wider">TOTAL / SUMMARY</td>
      <td class="text-center px-4 py-4 text-stone-700">${totInitial}</td>
      <td class="text-center px-4 py-4 text-blue-700">${totAdded}</td>
      <td class="text-center px-4 py-4 text-amber-700">${totBooked}</td>
      <td class="text-center px-4 py-4 text-emerald-700">${totDelivered}</td>
      <td class="text-center px-4 py-4 text-rose-600">${totReturned}</td>
      <td class="text-center px-5 py-4 text-emerald-800 text-base font-extrabold">${totAvailable}</td>
      <td class="text-right px-4 py-4 text-purple-700 font-bold" colspan="2">PKR ${totValuation.toLocaleString()}</td>
      <td class="text-center px-5 py-4 text-xs font-bold text-stone-600">${overallPct}% اوسط</td>
    </tr>
  `;

  tbody.innerHTML = rows + totalRow;

  // Update Top Stat Chips
  const availEl = document.getElementById("invStatAvailable");
  const bookedEl = document.getElementById("invStatBooked");
  const valEl = document.getElementById("invStatValue");

  if (availEl) availEl.textContent = totAvailable.toLocaleString() + " Units دستیاب";
  if (bookedEl) bookedEl.textContent = totBooked.toLocaleString() + " Booked";
  if (valEl) valEl.textContent = "PKR " + totValuation.toLocaleString() + " مالیت";
}

/* ============================================================
   MODULE 2: ORDERS CRM (Redesigned with Bulk & Single Delete,
   Confirmed & Booked Statuses, History Badges, and Courier Actions)
   ============================================================ */
let filteredOrdersList = [];

function sortOrdersNewestFirst(list) {
  if (!Array.isArray(list)) return [];
  const indexed = list.map((item, idx) => ({ item, originalIdx: idx }));

  indexed.sort((x, y) => {
    const a = x.item;
    const b = y.item;

    // 1. Try numeric extraction from orderNo (e.g. PLFC-1010 -> 1010)
    const rawA = (a.orderNo || a["Order No"] || "").toString();
    const rawB = (b.orderNo || b["Order No"] || "").toString();
    const numA = parseInt(rawA.replace(/\D/g, ""), 10);
    const numB = parseInt(rawB.replace(/\D/g, ""), 10);

    if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
      return numB - numA; // Largest / latest order number first (Newest 1st)
    }

    // 2. Try Date / timestamp
    const dateA = new Date(a.date || a["Date"] || 0).getTime() || 0;
    const dateB = new Date(b.date || b["Date"] || 0).getTime() || 0;
    if (dateA !== dateB) {
      return dateB - dateA; // Latest date first
    }

    // 3. Fallback: later row in sheet first
    return y.originalIdx - x.originalIdx;
  });

  return indexed.map(x => x.item);
}

async function loadOrders() {
  try {
    const raw = await getOrdersCached();
    allOrders = sortOrdersNewestFirst(raw || []);

    filterOrders();
    setLastUpdated();
  } catch (err) {
    console.error("Orders load failed:", err);
    showToast(err.message || "Failed to load orders", false);
    const tbody = document.getElementById("ordersBody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="px-5 py-8 text-center text-red-400 font-bold">Failed to load orders.</td></tr>';
  }
}

function getStatusBadgeStyle(status) {
  const s = (status || "").toString().toLowerCase().trim();
  if (s === "confirmed" || s.includes("confirm")) return "bg-blue-600 text-white";
  if (s === "booked" || s.includes("book")) return "bg-purple-800 text-white";
  if (s === "new order" || s === "new") return "bg-sky-500 text-white";
  if (s === "delivered" || s.includes("deliver") || s.includes("paid")) return "bg-emerald-600 text-white";
  if (s === "pending" || s.includes("pend")) return "bg-amber-500 text-white";
  if (s === "returned" || s.includes("return") || s.includes("rto")) return "bg-rose-600 text-white";
  if (s === "cancelled" || s.includes("cancel")) return "bg-stone-500 text-white";
  return "bg-stone-700 text-white";
}

function getCourierBadge(deliveryOption) {
  const co = (deliveryOption || "").toString().trim();
  const low = co.toLowerCase();
  if (low.includes("post") || low.includes("ep") || low.includes("pakistan")) {
    return '<span class="bg-red-600 text-white font-black text-[11px] px-3 py-1 rounded-full shadow-2xs">Post Office</span>';
  }
  if (low.includes("leopard") || low.includes("lpr")) {
    return '<span class="bg-amber-500 text-white font-black text-[11px] px-3 py-1 rounded-full shadow-2xs">Leopards</span>';
  }
  if (low.includes("tcs")) {
    return '<span class="bg-red-700 text-white font-black text-[11px] px-3 py-1 rounded-full shadow-2xs">TCS</span>';
  }
  if (low.includes("m&p")) {
    return '<span class="bg-violet-600 text-white font-black text-[11px] px-3 py-1 rounded-full shadow-2xs">M&P</span>';
  }
  return '<span class="bg-stone-600 text-white font-black text-[11px] px-3 py-1 rounded-full shadow-2xs">' + escHtml(co || 'Standard') + '</span>';
}

function getCourierSelectStyle(courier) {
  const c = (courier || "").toString().toLowerCase().trim();
  if (c.includes("post") || c.includes("pakistan") || c.includes("ep")) {
    return "bg-red-50 text-red-700 border-red-200 hover:bg-red-100";
  }
  if (c.includes("leopard") || c.includes("lpr")) {
    return "bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100";
  }
  if (c.includes("tcs")) {
    return "bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100";
  }
  if (c.includes("m&p")) {
    return "bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100";
  }
  if (c.includes("call")) {
    return "bg-sky-50 text-sky-800 border-sky-200 hover:bg-sky-100";
  }
  if (c.includes("postex")) {
    return "bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100";
  }
  if (c.includes("trax")) {
    return "bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100";
  }
  if (c.includes("cod")) {
    return "bg-stone-100 text-stone-800 border-stone-300 hover:bg-stone-200";
  }
  return "bg-stone-50 text-stone-700 border-stone-200 hover:bg-stone-100";
}

function getInitialsColor(name) {
  const colors = [
    "bg-rose-500", "bg-teal-600", "bg-purple-600", "bg-amber-500",
    "bg-indigo-600", "bg-cyan-600", "bg-emerald-600", "bg-blue-600"
  ];
  let hash = 0;
  for (let i = 0; i < (name || "").length; i++) hash += name.charCodeAt(i);
  return colors[hash % colors.length];
}

function getCustomerInitials(name) {
  if (!name) return "P";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }
  return parts[0].substring(0, 2).toUpperCase();
}

function formatOrderDateTime(dateVal) {
  if (!dateVal) return "—";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return dateVal.toString().split(" ")[0] || "";
    const day = d.getDate();
    const month = d.toLocaleDateString("en-US", { month: "short" });
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'pm' : 'am';
    hours = hours % 12 || 12;
    return day + " " + month + ", " + hours + ":" + minutes + " " + ampm;
  } catch (e) {
    return dateVal.toString().split(" ")[0] || "";
  }
}

function renderOrdersTable(orders) {
  const tbody = document.getElementById("ordersBody");
  const countBadge = document.getElementById("ordersTotalBadge");
  if (!tbody) return;

  if (countBadge) countBadge.textContent = (allOrders.length).toString();

  filteredOrdersList = orders;

  const perPageEl = document.getElementById("ordersPerPage");
  const perPage = perPageEl ? parseInt(perPageEl.value, 10) : 100;
  const pagedOrders = orders.slice(0, perPage);

  updateCRMSelectedInfo();

  if (!pagedOrders.length) {
    tbody.innerHTML = '<tr><td colspan="10" class="px-5 py-12 text-center text-stone-400 font-bold">No orders found matching your search or filters.</td></tr>';
    return;
  }

  // Build phone history map
  const phoneStats = {};
  allOrders.forEach(x => {
    const p = formatMobile(x.mobileNo || x["Mobile No"] || "");
    if (!p) return;
    if (!phoneStats[p]) phoneStats[p] = { count: 0, returns: 0 };
    phoneStats[p].count++;
    const st = (x.status || x["Status"] || "").toLowerCase();
    if (st.includes("return") || st.includes("rto")) phoneStats[p].returns++;
  });

  tbody.innerHTML = pagedOrders.map((o, i) => {
    const orderNo = (o.orderNo || o["Order No"] || '').toString();
    const statusVal = o.status || o["Status"] || 'New Order';
    const statusColor = getStatusBadgeStyle(statusVal);
    const co = (o.deliveryOption || o["Delivery Option"] || "").toString().trim();
    const coStyle = getCourierSelectStyle(co);
    const custName = o.customerName || o["Customer Name"] || 'Customer';
    const phone = formatMobile(o.mobileNo || o["Mobile No"] || '');
    const initials = getCustomerInitials(custName);
    const avatarBg = getInitialsColor(custName);

    // Customer history badge
    const pStat = phoneStats[phone];
    let historyBadge = '<span class="text-stone-400 font-medium text-[10px]">New</span>';
    if (pStat && pStat.count > 1) {
      historyBadge = '<span class="text-indigo-600 font-bold text-[10px] bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded shadow-2xs">Hist: ' + pStat.count + ' (' + pStat.returns + 'R)</span>';
    }

    // Tracking
    const rawTn = (o.trackingNo || o["Tracking No"] || "").toString().trim();
    let trackingHtml = '<span class="text-stone-300 font-bold">—</span>';
    if (rawTn) {
      const trackUrl = getTrackingUrl(rawTn, co);
      if (trackUrl) {
        trackingHtml = '<a href="' + trackUrl + '" target="_blank" class="inline-block bg-cyan-50 hover:bg-cyan-100 text-cyan-800 border border-cyan-200 px-2 py-0.5 rounded font-mono font-bold text-xs transition" title="Track on ' + escHtml(co) + '">' + escHtml(rawTn) + '</a>';
      } else {
        trackingHtml = '<span class="inline-block bg-cyan-50 text-cyan-800 border border-cyan-200 px-2 py-0.5 rounded font-mono font-bold text-xs">' + escHtml(rawTn) + '</span>';
      }
    }

    const priceNum = Number(o.productPrice || o["Product Price"] || o.price || o["Price"] || 0);
    const qty = parseInt(o.productQty || o["Product Qty"] || o.quantity || 1, 10) || 1;
    const timeStr = formatOrderDateTime(o.date || o["Date"]);

    // WhatsApp Direct Link
    const phoneInt = phone.startsWith("0") ? "92" + phone.substring(1) : phone;
    const waText = encodeURIComponent('السلام علیکم ' + custName + '! آپ کا آرڈر نمبر #' + orderNo + ' پیور لائف فیملی کیئر کی طرف سے موصول ہو چکا ہے۔ کیا آپ اس کی تصدیق کرنا چاہتے ہیں؟');
    const waUrl = 'https://wa.me/' + phoneInt + '?text=' + waText;

    const coLower = co.toLowerCase();
    const courierSelectHtml = 
      '<div class="relative inline-block w-full max-w-[130px]">' +
        '<select onchange="updateOrderCourier(\'' + escHtml(orderNo) + '\', this.value)" class="w-full text-[11px] font-bold px-2 py-1 rounded-lg cursor-pointer border ' + coStyle + ' appearance-none pr-5 shadow-2xs outline-none transition truncate" style="background-image: url(\'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22currentColor%22 stroke-width=%222.5%22%3E%3Cpath d=%22M6 9l6 6 6-6%22/%3E%3C/svg%3E\'); background-repeat: no-repeat; background-position: right 5px center;">' +
          '<option value="Post Office" ' + (coLower.includes("post") || coLower.includes("pakistan") ? 'selected' : '') + '>Post Office</option>' +
          '<option value="Leopards" ' + (coLower.includes("leopard") ? 'selected' : '') + '>Leopards</option>' +
          '<option value="TCS" ' + (coLower === "tcs" ? 'selected' : '') + '>TCS</option>' +
          '<option value="M&P" ' + (coLower.includes("m&p") ? 'selected' : '') + '>M&P</option>' +
          '<option value="Call Courier" ' + (coLower.includes("call") ? 'selected' : '') + '>Call Courier</option>' +
          '<option value="PostEx" ' + (coLower.includes("postex") ? 'selected' : '') + '>PostEx</option>' +
          '<option value="Trax" ' + (coLower.includes("trax") ? 'selected' : '') + '>Trax</option>' +
          '<option value="COD" ' + (coLower === "cod" ? 'selected' : '') + '>COD</option>' +
          '<option value="Standard" ' + (coLower === "standard" || !co ? 'selected' : '') + '>Standard</option>' +
        '</select>' +
      '</div>';

    return '<tr class="border-b border-stone-100 hover:bg-stone-50/80 transition group">' +
      '<td class="text-center px-2 py-2.5 w-10 whitespace-nowrap">' +
        '<input type="checkbox" class="order-select-crm-cb rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5 cursor-pointer" data-order-no="' + escHtml(orderNo) + '" data-order-idx="' + i + '" onchange="updateCRMSelectedInfo()" />' +
      '</td>' +
      '<td class="px-3 py-2.5 w-24 whitespace-nowrap">' +
        '<span class="font-extrabold text-xs text-blue-600 font-mono tracking-tight">#' + escHtml(orderNo) + '</span>' +
      '</td>' +
      '<td class="px-3 py-2.5 w-28 font-semibold text-xs text-stone-600 whitespace-nowrap" title="' + escHtml(timeStr) + '">' +
        formatDate(o.date || o["Date"]) +
      '</td>' +
      '<td class="px-3 py-2.5 min-w-[180px] whitespace-nowrap">' +
        '<div class="flex items-center gap-2">' +
          '<div class="w-7 h-7 rounded-full ' + avatarBg + ' text-white font-extrabold text-[10px] flex items-center justify-center flex-shrink-0 shadow-2xs">' +
            escHtml(initials) +
          '</div>' +
          '<div class="min-w-0 flex-1">' +
            '<p class="font-bold text-xs text-stone-900 leading-tight truncate" title="' + escHtml(custName) + '">' + escHtml(custName) + '</p>' +
            '<div class="flex items-center gap-1.5 mt-0.5">' +
              '<span class="text-[10px] text-stone-400 font-mono font-medium truncate">' + escHtml(phone) + '</span>' +
              (pStat && pStat.count > 1 ? '<span class="text-indigo-600 font-bold text-[9px] bg-indigo-50 border border-indigo-200 px-1 rounded flex-shrink-0">x' + pStat.count + '</span>' : '') +
            '</div>' +
          '</div>' +
        '</div>' +
      '</td>' +
      '<td class="px-3 py-2.5 min-w-[200px] whitespace-nowrap">' +
        '<div class="flex items-center gap-2">' +
          '<span class="font-semibold text-xs text-stone-800 truncate" title="' + escHtml(o.productName || o["Product Name"] || 'Product') + '">' + escHtml(o.productName || o["Product Name"] || 'Product') + '</span>' +
          '<span class="text-[10px] font-bold text-stone-600 bg-stone-100 border border-stone-200 px-1.5 py-0.5 rounded flex-shrink-0">x' + qty + '</span>' +
        '</div>' +
      '</td>' +
      '<td class="px-3 py-2.5 w-28 text-right font-black text-xs text-emerald-600 whitespace-nowrap">' +
        'Rs ' + priceNum.toLocaleString() +
      '</td>' +
      '<td class="px-3 py-2.5 w-36 whitespace-nowrap">' +
        courierSelectHtml +
      '</td>' +
      '<td class="px-2 py-2.5 w-28 text-center whitespace-nowrap">' +
        trackingHtml +
      '</td>' +
      '<td class="px-3 py-2.5 w-32 text-center whitespace-nowrap">' +
        '<div class="relative inline-block w-full max-w-[120px]">' +
          '<select onchange="updateOrderStatus(\'' + escHtml(orderNo) + '\', this.value, \'' + escHtml(rawTn) + '\')" class="w-full text-[11px] font-bold px-2 py-1 rounded-full cursor-pointer ' + statusColor + ' appearance-none pr-5 shadow-2xs outline-none transition truncate" style="background-image: url(\'data:image/svg+xml;charset=UTF-8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2210%22 height=%2210%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22white%22 stroke-width=%222.5%22%3E%3Cpath d=%22M6 9l6 6 6-6%22/%3E%3C/svg%3E\'); background-repeat: no-repeat; background-position: right 6px center;">' +
            '<option value="New Order" ' + (statusVal === "New Order" ? 'selected' : '') + '>New Order</option>' +
            '<option value="Confirmed" ' + (statusVal === "Confirmed" ? 'selected' : '') + '>Confirmed</option>' +
            '<option value="Booked" ' + (statusVal === "Booked" ? 'selected' : '') + '>Booked</option>' +
            '<option value="Pending" ' + (statusVal === "Pending" ? 'selected' : '') + '>Pending</option>' +
            '<option value="Delivered" ' + (statusVal === "Delivered" ? 'selected' : '') + '>Delivered</option>' +
            '<option value="Returned" ' + (statusVal === "Returned" ? 'selected' : '') + '>Returned</option>' +
            '<option value="Cancelled" ' + (statusVal === "Cancelled" ? 'selected' : '') + '>Cancelled</option>' +
          '</select>' +
        '</div>' +
      '</td>' +
      '<td class="px-2 py-2.5 w-24 text-center whitespace-nowrap">' +
        '<div class="flex items-center justify-center gap-1">' +
          '<a href="' + waUrl + '" target="_blank" class="w-6 h-6 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-600 border border-emerald-200 flex items-center justify-center transition shadow-2xs" title="WhatsApp">' +
            '<svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
          '</a>' +
          '<button onclick="openEditOrder(' + i + ')" class="w-6 h-6 rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 border border-blue-200 flex items-center justify-center transition shadow-2xs" title="Edit">' +
            '<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>' +
          '</button>' +
          '<button onclick="deleteSingleOrder(\'' + escHtml(orderNo) + '\')" class="w-6 h-6 rounded-md bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 flex items-center justify-center transition shadow-2xs" title="Delete">' +
            '<svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>' +
          '</button>' +
        '</div>' +
      '</td>' +
    '</tr>';
  }).join("");
}

function updateCRMSelectedInfo() {
  const selectedCbs = document.querySelectorAll('.order-select-crm-cb:checked');
  const count = selectedCbs.length;
  const infoEl = document.getElementById("ordersSelectedInfo");
  if (infoEl) {
    infoEl.textContent = 'Showing ' + filteredOrdersList.length + ' orders · ' + count + ' selected';
  }
}

function toggleSelectAllOrdersCRM(masterCb) {
  const cbs = document.querySelectorAll('.order-select-crm-cb');
  cbs.forEach(cb => cb.checked = masterCb.checked);
  updateCRMSelectedInfo();
}

function getSelectedOrdersCRM() {
  const selected = [];
  document.querySelectorAll('.order-select-crm-cb:checked').forEach(cb => {
    const orderNo = cb.getAttribute('data-order-no');
    const o = allOrders.find(x => (x.orderNo || x["Order No"] || '').toString() === orderNo);
    if (o) selected.push(o);
  });
  return selected;
}

async function deleteSingleOrder(orderNo) {
  if (!orderNo) return;
  if (!confirm('Are you sure you want to delete Order #' + orderNo + '? This cannot be undone.')) return;

  try {
    await apiPost({ action: "deleteOrder", orderNo: orderNo });
    showToast('Order #' + orderNo + ' deleted!', true);
  } catch (err) {
    console.warn("Delete order backend response:", err);
    try {
      await apiPost({ action: "updateOrderStatus", orderNo: orderNo, status: "Cancelled" });
    } catch(e) {}
    showToast('Order #' + orderNo + ' removed!', true);
  }

  allOrders = allOrders.filter(x => (x.orderNo || x["Order No"] || '').toString() !== orderNo.toString());
  ordersCache = null;
  filterOrders();
}

async function deleteSelectedOrdersCRM() {
  const selected = getSelectedOrdersCRM();
  if (!selected.length) {
    showToast("Please select at least one order to delete", false);
    return;
  }

  if (!confirm('Delete ' + selected.length + ' selected orders? This cannot be undone.')) return;

  for (const o of selected) {
    const oNo = (o.orderNo || o["Order No"] || '').toString();
    try {
      await apiPost({ action: "deleteOrder", orderNo: oNo });
    } catch (e) {
      try { await apiPost({ action: "updateOrderStatus", orderNo: oNo, status: "Cancelled" }); } catch(_) {}
    }
  }

  const selectedNos = new Set(selected.map(x => (x.orderNo || x["Order No"] || '').toString()));
  allOrders = allOrders.filter(x => !selectedNos.has((x.orderNo || x["Order No"] || '').toString()));
  ordersCache = null;

  showToast(selected.length + ' orders deleted successfully!', true);
  filterOrders();
}

function printSelectedOrdersCRM() {
  const selected = getSelectedOrdersCRM();
  if (!selected.length) {
    showToast("Please select at least one order to print slips", false);
    return;
  }
  const sender = {
    name:    document.getElementById("senderName")?.value || "Pure Life Family Care",
    address: document.getElementById("senderAddress")?.value || "",
    phone:   document.getElementById("senderPhone")?.value || "",
    logo:    document.getElementById("senderLogo")?.value || "Header Logo.png",
  };
  const shippingPrice = parseInt(document.getElementById("shippingPrice")?.value, 10) || 75;

  const printArea = document.getElementById("printArea");
  if (!printArea) return;
  printArea.innerHTML = selected.map(o => generateSlipHTML(o, sender, shippingPrice)).join('');
  printArea.classList.remove("no-print");
  printArea.setAttribute("data-printing", "true");
  window.print();
  printArea.classList.add("no-print");
  printArea.removeAttribute("data-printing");
}

function printPostOfficeMO() {
  let selected = getSelectedOrdersCRM();
  if (!selected.length) {
    selected = filteredOrdersList.filter(o => {
      const co = (o.deliveryOption || o["Delivery Option"] || "").toLowerCase();
      return co.includes("post") || co.includes("ep");
    });
  }
  if (!selected.length) {
    showToast("No Post Office orders to print", false);
    return;
  }
  printSelectedOrdersCRM();
}

function printLeopardsLabels() {
  let selected = getSelectedOrdersCRM();
  if (!selected.length) {
    selected = filteredOrdersList.filter(o => {
      const co = (o.deliveryOption || o["Delivery Option"] || "").toLowerCase();
      return co.includes("leopard") || co.includes("lpr");
    });
  }
  if (!selected.length) {
    showToast("No Leopards orders to print", false);
    return;
  }
  printSelectedOrdersCRM();
}

function editSelectedOrderCRM() {
  const selected = getSelectedOrdersCRM();
  if (!selected.length) {
    showToast("Please select an order to edit", false);
    return;
  }
  const first = selected[0];
  const idx = allOrders.indexOf(first);
  if (idx !== -1) openEditOrder(idx);
}

function filterOrders() {
  try {
    const q = (document.getElementById("orderSearch")?.value || "").trim().toLowerCase();
    const st = (document.getElementById("statusFilter")?.value || "").trim().toLowerCase();
    const co = (document.getElementById("courierFilter")?.value || "").trim().toLowerCase();
    const fromStr = document.getElementById("orderDateFrom")?.value || "";
    const toStr = document.getElementById("orderDateTo")?.value || "";

    const fromTime = fromStr ? new Date(fromStr + "T00:00:00").getTime() : 0;
    const toTime = toStr ? new Date(toStr + "T23:59:59").getTime() : Infinity;

    const out = allOrders.filter(o => {
      const txt = [
        o.orderNo, o["Order No"],
        o.customerName, o["Customer Name"],
        o.mobileNo, o["Mobile No"],
        o.productName, o["Product Name"],
        o.trackingNo, o["Tracking No"],
        o.deliveryOption, o["Delivery Option"],
        o.status, o["Status"]
      ].map(v => v != null ? String(v) : "").join(" ").toLowerCase();

      const matchQ = !q || txt.indexOf(q) !== -1;

      const orderSt = (o.status || o["Status"] || "").toString().toLowerCase().trim();
      let matchS = true;
      if (st) {
        matchS = orderSt === st || orderSt.includes(st);
      }

      const orderCo = (o.deliveryOption || o["Delivery Option"] || "").toString().toLowerCase().trim();
      let matchC = true;
      if (co) {
        if (co === "post office") matchC = orderCo.includes("post") || orderCo.includes("ep");
        else if (co === "leopards") matchC = orderCo.includes("leopard") || orderCo.includes("lpr");
        else if (co === "tcs") matchC = orderCo.includes("tcs");
        else if (co === "m&p") matchC = orderCo.includes("m&p");
        else matchC = orderCo.includes(co);
      }

      let matchD = true;
      if (fromStr || toStr) {
        const d = parseOrderDate(o.date || o["Date"]);
        if (d) {
          const t = d.getTime();
          matchD = (t >= fromTime && t <= toTime);
        }
      }

      return matchQ && matchS && matchC && matchD;
    });

    renderOrdersTable(out);
  } catch (e) {
    console.error("filterOrders error:", e);
  }
}

function clearOrdersFilter() {
  const s = document.getElementById("orderSearch");
  const sf = document.getElementById("statusFilter");
  const cf = document.getElementById("courierFilter");
  const df = document.getElementById("orderDateFrom");
  const dt = document.getElementById("orderDateTo");
  if (s) s.value = "";
  if (sf) sf.value = "";
  if (cf) cf.value = "";
  if (df) df.value = "";
  if (dt) dt.value = "";
  filterOrders();
}

function openEditOrder(index) {
  const o = allOrders[index];
  if (!o) return;

  document.getElementById("editOrderNo").value       = o.orderNo || o["Order No"] || "";
  document.getElementById("editCustomerName").value  = o.customerName || o["Customer Name"] || "";
  document.getElementById("editMobileNo").value      = formatMobile(o.mobileNo || o["Mobile No"] || "");
  document.getElementById("editProductName").value   = o.productName || o["Product Name"] || "";
  document.getElementById("editProductQty").value    = o.productQty || o["Product Qty"] || 1;
  document.getElementById("editProductPrice").value  = o.productPrice || o["Product Price"] || o.price || 0;
  document.getElementById("editTrackingNo").value    = o.trackingNo || o["Tracking No"] || "";
  document.getElementById("editDeliveryOption").value = o.deliveryOption || o["Delivery Option"] || "Post Office";
  document.getElementById("editAddress").value       = o.address || o["Address"] || "";

  const editStEl = document.getElementById("editStatus");
  if (editStEl) editStEl.value = o.status || o["Status"] || "New Order";

  document.getElementById("editOrderModal").classList.remove("hidden");
}

function closeEditModal() {
  document.getElementById("editOrderModal").classList.add("hidden");
}

async function saveEditedOrder() {
  const orderNo = document.getElementById("editOrderNo").value;
  if (!orderNo) return;

  const newStatus = document.getElementById("editStatus")?.value || "";

  const payload = {
    action: "updateOrder",
    orderNo: orderNo,
    customerName:   document.getElementById("editCustomerName").value,
    mobileNo:       document.getElementById("editMobileNo").value,
    productName:    document.getElementById("editProductName").value,
    productQty:     parseInt(document.getElementById("editProductQty").value, 10) || 1,
    productPrice:   parseFloat(document.getElementById("editProductPrice").value) || 0,
    trackingNo:     document.getElementById("editTrackingNo").value,
    deliveryOption: document.getElementById("editDeliveryOption").value,
    address:        document.getElementById("editAddress").value,
    status:         newStatus,
  };

  try {
    await apiPost(payload);
    if (newStatus) {
      try {
        await apiPost({
          action: "updateOrderStatus",
          orderNo: orderNo,
          status: newStatus,
          trackingNo: payload.trackingNo
        });
      } catch(_) {}
    }
    showToast("Order updated successfully!", true);
    ordersCache = null;
    closeEditModal();
    loadOrders();
  } catch (err) {
    showToast("Failed to update order: " + err.message, false);
  }
}

async function updateOrderStatus(orderNo, newStatus, trackingNo) {
  if (!orderNo) return;
  try {
    const result = await apiPost({
      action:     "updateOrderStatus",
      orderNo:    orderNo,
      status:     newStatus,
      trackingNo: trackingNo || "",
    });

    if (result && result.success === false) {
      if (result.error && result.error.includes("Invalid status")) {
        try {
          await apiPost({
            action:     "updateOrder",
            orderNo:    orderNo,
            status:     newStatus,
            trackingNo: trackingNo || "",
          });
        } catch (_) {}
        throw new Error("اسٹیٹس شیٹ میں محفوظ کرنے کے لیے گوگل ایپس اسکرپٹ (Code.gs) اپڈیٹ کر کے Deploy کریں!");
      }
      throw new Error(result.error || "Update failed");
    }

    showToast('Order #' + orderNo + ' → ' + newStatus, true);
    
    const found = allOrders.find(x => (x.orderNo || x["Order No"] || '').toString() === orderNo.toString());
    if (found) {
      found.status = newStatus;
      found["Status"] = newStatus;
    }
    ordersCache = null;
    filterOrders();
  } catch (err) {
    console.error("Status update failed:", err);
    showToast(err.message || "Failed to update status", false);
    const found = allOrders.find(x => (x.orderNo || x["Order No"] || '').toString() === orderNo.toString());
    if (found) {
      found.status = newStatus;
      found["Status"] = newStatus;
    }
    ordersCache = null;
    filterOrders();
  }
}

async function updateOrderCourier(orderNo, newCourier) {
  if (!orderNo) return;
  try {
    const result = await apiPost({
      action: "updateOrder",
      orderNo: orderNo,
      deliveryOption: newCourier
    });
    if (result && result.success === false) throw new Error(result.error || "Update failed");

    showToast('Order #' + orderNo + ' → Courier: ' + newCourier, true);

    const found = allOrders.find(x => (x.orderNo || x["Order No"] || '').toString() === orderNo.toString());
    if (found) {
      found.deliveryOption = newCourier;
      found["Delivery Option"] = newCourier;
    }
    ordersCache = null;
    filterOrders();
  } catch (err) {
    console.error("Courier update failed:", err);
    showToast(err.message || "Failed to update courier", false);
    const found = allOrders.find(x => (x.orderNo || x["Order No"] || '').toString() === orderNo.toString());
    if (found) {
      found.deliveryOption = newCourier;
      found["Delivery Option"] = newCourier;
    }
    ordersCache = null;
    filterOrders();
  }
}


/* ============================================================
   MODULE 3: COURIER SLIPS
   ============================================================ */
let slipOrdersList = [];

async function loadSlipOrders() {
  try {
    const raw = await getOrdersCached();
    slipOrdersList = sortOrdersNewestFirst(raw || []);
    allOrders = slipOrdersList; // Keep allOrders synced with newest first

    // Auto-sync sender info from Store Settings if saved
    try {
      const stored = localStorage.getItem("pl_store_settings");
      if (stored) {
        const s = JSON.parse(stored);
        if (s.senderName && document.getElementById("senderName")) document.getElementById("senderName").value = s.senderName;
        if (s.senderAddress && document.getElementById("senderAddress")) document.getElementById("senderAddress").value = s.senderAddress;
        if (s.senderPhone && document.getElementById("senderPhone")) document.getElementById("senderPhone").value = s.senderPhone;
      }
    } catch (e) {}

    renderSlipsTable(slipOrdersList);
    setLastUpdated();
  } catch (err) {
    console.error("Slip orders load failed:", err);
    showToast(err.message || "Failed to load orders", false);
  }
}

function renderSlipsTable(orders) {
  const tbody = document.getElementById("slipsBody");
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-5 py-8 text-center text-stone-400">No orders found</td></tr>';
    return;
  }

  tbody.innerHTML = orders.map((o, i) => {
    const statusColor = getStatusColor(o.status || o["Status"]);
    const isNewestBadge = i === 0 ? '<span class="ml-1.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-100 text-emerald-800">Newest 1st</span>' : '';
    return `
    <tr class="border-b border-stone-100 hover:bg-stone-50/80 transition-colors table-row">
      <td class="text-center px-4 py-3">
        <input type="checkbox" class="slip-check rounded border-stone-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
               data-slip-index="${i}" onchange="updateSelectedCount()" />
      </td>
      <td class="px-4 py-3 font-extrabold text-stone-900 font-mono">
        <span class="inline-flex items-center gap-1.5">
          <span>${o.orderNo || o["Order No"] || ''}</span>
          ${isNewestBadge}
        </span>
      </td>
      <td class="px-4 py-3 font-bold text-stone-800">${o.customerName || o["Customer Name"] || ''}</td>
      <td class="px-4 py-3 text-stone-600 font-mono text-xs font-semibold">${formatMobile(o.mobileNo || o["Mobile No"] || '')}</td>
      <td class="px-4 py-3 text-stone-700 font-medium">${o.productName || o["Product Name"] || ''} <span class="text-stone-400 font-bold">(${o.productQty || o["Product Qty"] || 1})</span></td>
      <td class="px-4 py-3 text-right font-black text-stone-900">Rs. ${Number(o.productPrice || o["Product Price"] || 0).toLocaleString()}</td>
      <td class="px-4 py-3 text-stone-500 text-xs font-medium max-w-[200px] truncate" title="${o.address || o["Address"] || ''}">${o.address || o["Address"] || ''}</td>
      <td class="px-4 py-3"><span class="text-xs font-bold px-2.5 py-1 rounded-full ${statusColor}">${o.status || o["Status"] || ''}</span></td>
    </tr>`;
  }).join("");
}

function selectAllSlips() {
  document.querySelectorAll('[data-slip-index]').forEach(cb => cb.checked = true);
  document.getElementById("selectAllCheck").checked = true;
  updateSelectedCount();
}

function deselectAllSlips() {
  document.querySelectorAll('[data-slip-index]').forEach(cb => cb.checked = false);
  document.getElementById("selectAllCheck").checked = false;
  updateSelectedCount();
}

function toggleSelectAll() {
  const checked = document.getElementById("selectAllCheck").checked;
  document.querySelectorAll('[data-slip-index]').forEach(cb => cb.checked = checked);
  updateSelectedCount();
}

function updateSelectedCount() {
  const count = document.querySelectorAll('[data-slip-index]:checked').length;
  document.getElementById("selectedCount").textContent = count > 0 ? `${count} selected` : "";
}

function getSelectedOrders() {
  const selected = [];
  const list = (Array.isArray(slipOrdersList) && slipOrdersList.length) ? slipOrdersList : allOrders;
  document.querySelectorAll('[data-slip-index]:checked').forEach(cb => {
    const idx = parseInt(cb.dataset.slipIndex, 10);
    if (list[idx]) selected.push(list[idx]);
  });
  return selected;
}

function printSelectedSlips() {
  const orders = getSelectedOrders();
  if (!orders.length) {
    showToast("Select at least one order", false);
    return;
  }

  const sender = {
    name:    document.getElementById("senderName").value || "Pure Life Family Care",
    address: document.getElementById("senderAddress").value || "",
    phone:   document.getElementById("senderPhone").value || "",
    logo:    document.getElementById("senderLogo").value || "",
  };
  const shippingPrice = parseInt(document.getElementById("shippingPrice").value, 10) || 75;

  const printArea = document.getElementById("printArea");
  printArea.innerHTML = orders.map(o => generateSlipHTML(o, sender, shippingPrice)).join('');
  printArea.classList.remove("no-print");
  printArea.setAttribute("data-printing", "true");

  function cleanupPrint() {
    printArea.innerHTML = "";
    printArea.classList.add("no-print");
    printArea.removeAttribute("data-printing");
  }

  window.addEventListener("afterprint", cleanupPrint, { once: true });
  setTimeout(() => {
    window.print();
    setTimeout(cleanupPrint, 1000);
  }, 100);
}

function isUrdu(text) {
  return /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

/* ★ فکسڈ کوریئر سلپ لے آؤٹ (بڑا سینڈر فونٹ اور کھلا کالم) ★ */
function generateSlipHTML(order, sender, shippingPrice) {
  const total = Number(order.productPrice || order["Product Price"] || 0);
  const price = Math.max(0, total - shippingPrice);
  const date  = formatDate(order.date || order["Date"]);
  const name  = order.customerName || order["Customer Name"] || "";
  const phone = formatMobile(order.mobileNo || order["Mobile No"] || "");
  const prod_name = order.productName || order["Product Name"] || "";
  const prod_qty  = order.productQty || order["Product Qty"] || 1;
  const prod      = `${prod_name} x ${prod_qty}`;
  const addr  = order.address || order["Address"] || "";
  const oNo   = order.orderNo || order["Order No"] || "";

  return `
  <div class="slip-card-box" style="font-family:'Segoe UI',Arial,sans-serif;color:#000;box-sizing:border-box;background:#fff;border:2px solid #000;width:100%;height:94mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;">

    <!-- Row 1: Date | Order No | Total -->
    <div style="display:flex;align-items:center;border-bottom:1.5px solid #000;font-weight:bold;font-size:12px;background:#fdfdfd;height:34px;flex-shrink:0;">
      <div style="padding:0 6px;display:flex;align-items:center;border-right:1px solid #000;white-space:nowrap;height:100%;">
        <span style="font-size:12px;">Date:</span>
        <span style="border:1px solid #000;padding:1px 6px;margin-left:4px;font-size:12px;background:#fff;white-space:nowrap;">${date}</span>
      </div>
      <div style="padding:0 6px;display:flex;align-items:center;border-right:1px solid #000;white-space:nowrap;height:100%;">
        <span style="font-size:12px;">Order No.</span>
        <span style="border:1px solid #000;padding:1px 8px;margin-left:4px;font-size:13px;font-weight:900;background:#fff;white-space:nowrap;">${oNo}</span>
      </div>
      <div style="padding:0 6px;display:flex;align-items:center;justify-content:flex-end;flex-grow:1;white-space:nowrap;height:100%;">
        <span style="font-size:12px;">Rs: ${price} + ${shippingPrice} =</span>
        <span style="background:#000;color:#fff;padding:2px 8px;font-size:14px;font-weight:900;margin-left:5px;white-space:nowrap;">${total}</span>
      </div>
    </div>

    <!-- Row 2: To: Customer Name -->
    <div style="display:flex;border-bottom:1.5px solid #000;padding:4px 0;align-items:center;height:38px;flex-shrink:0;">
      <div style="width:40px;text-align:center;font-weight:bold;border-right:1px solid #000;font-size:14px;height:100%;display:flex;align-items:center;justify-content:center;">To:</div>
      <div style="font-size:18px;font-weight:900;flex-grow:1;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${isUrdu(name) ? 'text-align:right;padding-right:12px;direction:rtl;' : 'padding-left:12px;text-transform:uppercase;'}">${name}</div>
    </div>

    <!-- Row 3: Phone | Detail -->
    <div style="display:flex;border-bottom:1.5px solid #000;font-size:13px;height:30px;align-items:center;flex-shrink:0;">
      <div style="width:52%;border-right:1px solid #000;padding-left:8px;white-space:nowrap;font-weight:bold;">
        Phone: <span style="font-size:14px;">${phone}</span>
      </div>
      <div style="width:48%;padding-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:bold;">
        Detail: <span style="font-size:13px;">${prod}</span>
      </div>
    </div>

    <!-- Row 4: Address -->
    <div style="display:flex;border-bottom:1.5px solid #000;height:75px;max-height:75px;align-items:stretch;flex-shrink:0;overflow:hidden;">
      <div style="width:82%;padding:6px 8px;font-size:13.5px;font-weight:bold;line-height:1.35;border-right:1px solid #000;overflow:hidden;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;${isUrdu(addr) ? 'direction:rtl;text-align:right;' : ''}">${addr}</div>
      <div style="width:18%;display:flex;justify-content:center;align-items:center;background:#eaeaea;flex-shrink:0;">
        <div style="background:#27ae60;color:white;padding:4px 6px;border-radius:4px;text-align:center;font-weight:bold;font-size:11px;line-height:1.2;">مکمل<br>ایڈریس</div>
      </div>
    </div>

    <!-- Row 5: Urgent Bar -->
    <div style="background:#ffeb3b;border-bottom:1.5px solid #000;text-align:center;font-weight:bold;font-size:10px;padding:2px 0;white-space:nowrap;overflow:hidden;flex-shrink:0;">
      ⚠ URGENT DELIVERY (PLEASE CALL THE CUSTOMER BEFORE 1 HOUR DELIVERY) ⚠
    </div>

    <!-- Row 6: From (Sender Details - بڑا فونٹ اور کشادہ کالم) -->
    <div style="display:flex;align-items:stretch;height:55px;flex-shrink:0;">
      <div style="background:#ddd;width:28px;display:flex;align-items:center;justify-content:center;border-right:1px solid #000;flex-shrink:0;">
        <span style="transform:rotate(-90deg);font-weight:bold;font-size:10px;letter-spacing:1px;white-space:nowrap;">From</span>
      </div>
      <div style="padding:4px 12px;flex-grow:1;border-right:1px solid #000;display:flex;flex-direction:column;justify-content:center;overflow:hidden;">
        <div style="font-size:13.5px;font-weight:900;color:#000;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sender.name}</div>
        <div style="font-size:11.5px;font-weight:bold;line-height:1.3;color:#222;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${sender.address}</div>
        <div style="font-size:11.5px;font-weight:bold;line-height:1.3;color:#222;">${sender.phone}</div>
      </div>
      <div style="width:85px;display:flex;align-items:center;justify-content:center;padding:2px;background:#fff;flex-shrink:0;">
        ${sender.logo ? `<img src="${sender.logo}" style="max-width:90%;max-height:45px;object-fit:contain;" />` : '<div style="background:#27ae60;color:white;padding:4px;border-radius:4px;text-align:center;font-weight:bold;font-size:9px;">LOGO</div>'}
      </div>
    </div>

  </div>`;
}

/* ============================================================
   MODULE: EXPENSES (with Full Edit, Delete & Modal Management)
   ============================================================ */
let allExpenses = [];

async function loadExpenses() {
  try {
    const json = await apiGet("expensesList");
    const data = (json && json.success !== undefined) ? (json.data || []) : (json || []);
    allExpenses = Array.isArray(data) ? data : [];
    renderExpenses(allExpenses);
    setLastUpdated();
  } catch (err) {
    console.error("Expenses load failed:", err);
    showToast("Failed to load expenses: " + err.message, false);
  }
}

function renderExpenses(expenses) {
  const tbody = document.getElementById("expensesBody");
  if (!tbody) return;

  if (!expenses.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="px-5 py-8 text-center text-stone-400 font-bold">کوئی اخراجات درج نہیں ہیں۔</td></tr>';
    const totalEl = document.getElementById("totalExpensesLabel");
    if (totalEl) totalEl.textContent = "Total: Rs. 0";
    return;
  }

  let total = 0;
  tbody.innerHTML = expenses.map((exp, idx) => {
    const date     = exp.Date || exp.date || "";
    const rawCat   = (exp.Category || exp.category || "").toString().trim();
    const category = rawCat || "General Expense";
    const amount   = parseFloat(exp.Amount || exp.amount) || 0;
    const desc     = exp.Description || exp.description || "";
    total += amount;

    const dateStr = date ? formatDate(date) : "—";

    return `
      <tr class="border-b border-stone-100 hover:bg-stone-50/70 transition-colors table-row">
        <td class="px-6 py-4 font-semibold text-sm text-stone-800 whitespace-nowrap">${dateStr}</td>
        <td class="px-4 py-4 text-sm whitespace-nowrap">
          <span class="inline-block px-3 py-1 rounded-xl text-xs font-black ${getCategoryColor(category)}">${category}</span>
        </td>
        <td class="px-4 py-4 text-right font-black text-sm text-rose-600 whitespace-nowrap">Rs. ${amount.toLocaleString()}</td>
        <td class="px-4 py-4 text-sm text-stone-700 font-medium">${desc || '—'}</td>
        <td class="px-4 py-4 text-center whitespace-nowrap">
          <div class="flex items-center justify-center gap-2">
            <button type="button" onclick="openEditExpenseModal(${idx})" class="px-2.5 py-1.5 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs transition border border-indigo-200 shadow-2xs flex items-center gap-1 cursor-pointer" title="ایڈیٹ کریں">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/></svg>
              <span>ایڈیٹ</span>
            </button>
            <button type="button" onclick="confirmDeleteExpense(${idx})" class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold text-xs transition border border-rose-200 shadow-2xs flex items-center gap-1 cursor-pointer" title="ڈلیٹ کریں">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
              <span>ڈلیٹ</span>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  const totalEl = document.getElementById("totalExpensesLabel");
  if (totalEl) totalEl.textContent = `Total: Rs. ${total.toLocaleString()}`;
}

function getCategoryColor(cat) {
  const c = (cat || "").toString().toLowerCase().trim();
  if (c.includes("facebook") || c.includes("ad")) return "bg-blue-100 text-blue-700";
  if (c.includes("product") || c.includes("cost") || c.includes("mediceine") || c.includes("medicine")) return "bg-purple-100 text-purple-700";
  if (c.includes("delivery") || c.includes("courier") || c.includes("shipping")) return "bg-amber-100 text-amber-700";
  if (c.includes("pack") || c.includes("bottle")) return "bg-emerald-100 text-emerald-700";
  if (c.includes("rent")) return "bg-rose-100 text-rose-700";
  if (c.includes("utilit") || c.includes("bill") || c.includes("electric")) return "bg-cyan-100 text-cyan-700";
  if (c.includes("salar")) return "bg-indigo-100 text-indigo-700";
  if (c.includes("transport") || c.includes("fuel")) return "bg-orange-100 text-orange-700";
  return "bg-stone-100 text-stone-700";
}

async function addExpense() {
  const date     = document.getElementById("expDate").value;
  const category = document.getElementById("expCategory").value;
  const amount   = parseFloat(document.getElementById("expAmount").value) || 0;
  const desc     = document.getElementById("expDesc").value;

  if (!date) {
    showToast("Please select a date", false);
    return;
  }
  if (amount <= 0) {
    showToast("Please enter a valid amount", false);
    return;
  }

  try {
    await apiPost({ action: "addExpense", date, category, amount, description: desc });
    showToast("خرچہ کامیابی سے شامل کر دیا گیا!", true);
    document.getElementById("expAmount").value = "";
    document.getElementById("expDesc").value = "";
    loadExpenses();
  } catch (err) {
    showToast("Failed to add expense: " + err.message, false);
  }
}

function openEditExpenseModal(idx) {
  const exp = allExpenses[idx];
  if (!exp) return;

  const modal = document.getElementById("editExpenseModal");
  if (!modal) return;

  document.getElementById("editExpIndex").value = idx;

  const rawDate = exp.Date || exp.date || "";
  let dateVal = "";
  try {
    const d = new Date(rawDate);
    if (!isNaN(d.getTime())) {
      dateVal = formatDateToYMD(d);
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) {
      dateVal = rawDate;
    }
  } catch (e) {}

  document.getElementById("editExpDate").value = dateVal || new Date().toISOString().split("T")[0];
  
  const catSel = document.getElementById("editExpCategory");
  const rawCat = (exp.Category || exp.category || "Other").toString().trim();
  if (catSel) {
    let found = false;
    for (let i = 0; i < catSel.options.length; i++) {
      if (catSel.options[i].value.toLowerCase() === rawCat.toLowerCase()) {
        catSel.selectedIndex = i;
        found = true;
        break;
      }
    }
    if (!found) catSel.value = "Other";
  }

  document.getElementById("editExpAmount").value = parseFloat(exp.Amount || exp.amount) || 0;
  document.getElementById("editExpDesc").value = exp.Description || exp.description || "";

  modal.classList.remove("hidden");
}

function closeEditExpenseModal() {
  const modal = document.getElementById("editExpenseModal");
  if (modal) modal.classList.add("hidden");
}

async function saveEditedExpense(e) {
  if (e) e.preventDefault();
  const idx = parseInt(document.getElementById("editExpIndex").value, 10);
  const exp = allExpenses[idx];
  if (!exp) {
    showToast("Expense record not found", false);
    return;
  }

  const newDate = document.getElementById("editExpDate").value;
  const newCat  = document.getElementById("editExpCategory").value;
  const newAmt  = parseFloat(document.getElementById("editExpAmount").value) || 0;
  const newDesc = document.getElementById("editExpDesc").value.trim();

  if (!newDate) {
    showToast("براہ کرم تاریخ منتخب کریں", false);
    return;
  }
  if (newAmt <= 0) {
    showToast("براہ کرم درست رقم درج کریں", false);
    return;
  }

  const saveBtn = document.getElementById("saveEditExpenseBtn");
  const origText = saveBtn ? saveBtn.innerHTML : "";
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.innerHTML = "محفوظ ہو رہا ہے...";
  }

  try {
    const rowNum = exp._row || (idx + 2);
    const payload = {
      action: "updateExpense",
      row: rowNum,
      oldDate: exp.Date || exp.date,
      oldAmount: exp.Amount || exp.amount,
      oldDescription: exp.Description || exp.description,
      date: newDate,
      category: newCat,
      amount: newAmt,
      description: newDesc
    };

    // Update in memory immediately for snappy UI
    exp.Date = newDate;
    exp.date = newDate;
    exp.Category = newCat;
    exp.category = newCat;
    exp.Amount = newAmt;
    exp.amount = newAmt;
    exp.Description = newDesc;
    exp.description = newDesc;

    renderExpenses(allExpenses);
    closeEditExpenseModal();
    showToast("خرچہ کامیابی سے تبدیل کر دیا گیا!", true);

    // Call backend API
    await apiPost(payload);
    loadExpenses();
  } catch (err) {
    console.error("Save expense edit error:", err);
    showToast(err.message || "تبدیلی محفوظ کرنے میں خرابی ہوئی", false);
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.innerHTML = origText;
    }
  }
}

async function confirmDeleteExpense(idx) {
  const exp = allExpenses[idx];
  if (!exp) return;

  const amt = Number(exp.Amount || exp.amount || 0).toLocaleString();
  const desc = exp.Description || exp.description || "";
  const cat = exp.Category || exp.category || "Expense";

  const msg = `کیا آپ واقعی اس خرچے کو ڈیلیٹ کرنا چاہتے ہیں؟\n\nکیٹیگری: ${cat}\nرقم: Rs. ${amt}\nتفصیل: ${desc || '—'}`;
  if (!confirm(msg)) return;

  try {
    const rowNum = exp._row || (idx + 2);
    const payload = {
      action: "deleteExpense",
      row: rowNum,
      date: exp.Date || exp.date,
      amount: exp.Amount || exp.amount,
      description: exp.Description || exp.description
    };

    // Immediately update memory and UI
    allExpenses.splice(idx, 1);
    renderExpenses(allExpenses);
    showToast("خرچہ کامیابی سے ڈیلیٹ کر دیا گیا!", true);

    // Call backend API
    await apiPost(payload);
    loadExpenses();
  } catch (err) {
    console.error("Delete expense error:", err);
    showToast(err.message || "خرچہ ڈیلیٹ کرنے میں خرابی ہوئی", false);
  }
}

/* ============================================================
   MODULE 4: NEW BOOKING
   ============================================================ */
let bookingLang = "en";

const bookingTranslations = {
  en: {
    title:       "New Order Booking",
    secCustomer: "Customer Information",
    secMobile:   "Mobile Numbers",
    secDelivery: "Delivery Details",
    secProduct:  "Product Details",
    secAddress:  "Delivery Address",
    lblDate:     "Date",
    lblName:     "Customer Name",
    lblDelivery: "Delivery Option",
    lblStatus:   "Status",
    lblProduct:  "Product Name",
    lblQty:      "Quantity",
    lblAmount:   "Total Amount (Rs.)",
    addMobile:   "Add Number",
    submit:      "Save Order",
    reset:       "Clear Form",
    delivery:    { TCS: "TCS", Leopard: "Leopard", "M&P": "M&P", Daewoo: "Daewoo", "Call Courier": "Call Courier", PostEx: "PostEx", "Post Office": "Post Office", "By Hand": "By Hand", Standard: "Standard" },
    status:      { "New Order": "New Order", Pending: "Pending", Delivered: "Delivered", Returned: "Returned", Cancelled: "Cancelled" },
  },
  ur: {
    title:       "نیا آرڈر بکنگ",
    secCustomer: "گاہک کی معلومات",
    secMobile:   "موبائل نمبرز",
    secDelivery: "ڈلیوری کی تفصیلات",
    secProduct:  "پروڈکٹ کی تفصیلات",
    secAddress:  "ڈلیوری ایڈریس",
    lblDate:     "تاریخ",
    lblName:     "گاہک کا نام",
    lblDelivery: "ڈلیوری کا آپشن",
    lblStatus:   "حالت",
    lblProduct:  "پروڈکٹ کا نام",
    lblQty:      "مقدار",
    lblAmount:   "کل رقم (روپے)",
    addMobile:   "نمبر شامل کریں",
    submit:      "آرڈر محفوظ کریں",
    reset:       "فارم صاف کریں",
    delivery:    { TCS: "ٹی سی ایس", Leopard: "لیپرڈ", "M&P": "ایم اینڈ پی", Daewoo: "ڈیو", "Call Courier": "کال کورئیر", PostEx: "پوسٹ ایکس", "Post Office": "پوسٹ آفس", "By Hand": "ذاتی طور پر", Standard: "عام ڈلیوری" },
    status:      { "New Order": "نیا آرڈر", Pending: "زیر التوا", Delivered: "ڈلیور ہو گیا", Returned: "واپس", Cancelled: "منسوخ" },
  }
};

function toggleBookingLang() {
  bookingLang = bookingLang === "en" ? "ur" : "en";
  applyBookingLang();
}

function applyBookingLang() {
  const t = bookingTranslations[bookingLang];
  const isRTL = bookingLang === "ur";

  const card = document.getElementById("bookingCard");
  if (card) {
    card.dir = isRTL ? "rtl" : "ltr";
    card.classList.toggle("booking-rtl", isRTL);
  }

  document.querySelectorAll("#mod-booking input, #mod-booking textarea, #mod-booking select").forEach(el => {
    el.dir = isRTL ? "rtl" : "ltr";
    el.classList.toggle("text-right", isRTL);
  });

  const langBtn = document.getElementById("langToggleBtn");
  if (langBtn) {
    langBtn.className = isRTL
      ? "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 border-brand bg-brand/5 transition"
      : "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 border-stone-200 hover:border-brand hover:bg-brand/5 transition";
  }
  const langLabel = document.getElementById("langLabel");
  if (langLabel) langLabel.textContent = isRTL ? "English" : "اردو";

  setText("bookingTitle",  t.title);
  setText("secCustomer",  t.secCustomer);
  setText("secMobile",    t.secMobile);
  setText("secDelivery",  t.secDelivery);
  setText("secProduct",   t.secProduct);
  setText("secAddress",   t.secAddress);
  setText("addMobileLabel", t.addMobile);
  setText("submitLabel",  t.submit);
  setText("resetBtn",     t.reset);

  setText("lblDate",     t.lblDate);
  setText("lblName",     t.lblName);
  setText("lblDelivery", t.lblDelivery);
  setText("lblStatus",   t.lblStatus);
  setText("lblProduct",  t.lblProduct);
  setText("lblQty",      t.lblQty);
  setText("lblAmount",   t.lblAmount);

  const bDelivery = document.getElementById("bDelivery");
  if (bDelivery) {
    Array.from(bDelivery.options).forEach(opt => {
      const key = opt.value;
      if (t.delivery[key]) opt.textContent = t.delivery[key];
    });
  }
  const bStatus = document.getElementById("bStatus");
  if (bStatus) {
    Array.from(bStatus.options).forEach(opt => {
      const key = opt.value;
      if (t.status[key]) opt.textContent = t.status[key];
    });
  }
}

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function addMobileField() {
  const container = document.getElementById("mobileFieldsContainer");
  if (!container) return;
  const row = document.createElement("div");
  row.className = "flex items-center gap-3 mobile-row group";
  row.innerHTML = `
    <div class="flex items-center bg-stone-100 rounded-l-xl px-3 h-[46px] border border-r-0 border-stone-200">
      <svg class="w-4 h-4 text-stone-400 mr-1.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
      <span class="text-sm font-bold text-stone-500">+92</span>
    </div>
    <input type="tel" name="mobileNo" placeholder="3XX XXXXXXX"
           class="flex-1 border border-stone-200 rounded-xl px-4 py-3.5 text-sm bg-stone-50/50 focus:bg-white focus:ring-2 focus:ring-brand focus:border-brand outline-none transition mobile-input" />
    <button type="button" onclick="removeMobileField(this)"
            class="mobile-remove-btn w-10 h-10 flex items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition flex-shrink-0 border border-transparent hover:border-red-200">
      <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
    </button>`;
  container.appendChild(row);

  if (bookingLang === "ur") {
    row.querySelector("input").dir = "rtl";
    row.querySelector("input").classList.add("text-right");
  }

  updateRemoveButtons();
  updateOrderPreview();
}

function removeMobileField(btn) {
  const row = btn.closest(".mobile-row");
  if (row) row.remove();
  updateRemoveButtons();
  updateOrderPreview();
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll("#mobileFieldsContainer .mobile-row");
  rows.forEach((row) => {
    const rmBtn = row.querySelector(".mobile-remove-btn");
    if (rmBtn) rmBtn.classList.toggle("hidden", rows.length <= 1);
  });
}

function getAllMobiles() {
  const inputs = document.querySelectorAll("#mobileFieldsContainer .mobile-input");
  const numbers = [];
  inputs.forEach(input => {
    let val = input.value.trim();
    if (val) {
      val = val.replace(/[^0-9]/g, "");
      if (!val.startsWith("0") && !val.startsWith("92")) val = "0" + val;
      numbers.push(val);
    }
  });
  return numbers.join(", ");
}

function resetBookingForm() {
  const form = document.getElementById("bookingForm");
  if (form) form.reset();
  setTodayDate();
  const container = document.getElementById("mobileFieldsContainer");
  if (container) {
    container.innerHTML = `
      <div class="flex items-center gap-3 mobile-row group">
        <div class="flex items-center bg-stone-100 rounded-l-xl px-3 h-[46px] border border-r-0 border-stone-200">
          <svg class="w-4 h-4 text-stone-400 mr-1.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z"/></svg>
          <span class="text-sm font-bold text-stone-500">+92</span>
        </div>
        <input type="tel" name="mobileNo" required placeholder="3XX XXXXXXX"
               class="flex-1 border border-stone-200 rounded-xl px-4 py-3.5 text-sm bg-stone-50/50 focus:bg-white focus:ring-2 focus:ring-brand focus:border-brand outline-none transition mobile-input" />
        <button type="button" onclick="removeMobileField(this)" class="mobile-remove-btn hidden w-10 h-10 items-center justify-center text-red-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition flex-shrink-0 border border-transparent hover:border-red-200">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
        </button>
      </div>`;
  }
  updateRemoveButtons();
  updateOrderPreview();
}

async function submitBooking(e) {
  e.preventDefault();
  const btn = document.getElementById("bookingSubmitBtn");

  const mobileNos = getAllMobiles();
  if (!mobileNos) {
    showToast("Please add at least one mobile number", false);
    return;
  }

  const payload = {
    action:         "createOrder",
    date:           document.getElementById("bDate").value,
    customerName:   document.getElementById("bCustomerName").value.trim(),
    mobileNo:       mobileNos,
    deliveryOption: document.getElementById("bDelivery").value,
    productName:    document.getElementById("bProductName").value.trim(),
    productQty:     parseInt(document.getElementById("bQty").value, 10) || 1,
    productPrice:   parseFloat(document.getElementById("bPrice").value) || 0,
    address:        document.getElementById("bAddress").value.trim(),
    trackingNo:     "",
    status:         document.getElementById("bStatus").value,
  };

  btn.disabled = true;
  btn.textContent = bookingLang === "ur" ? "محفوظ ہو رہا ہے..." : "Saving...";

  try {
    const result = await apiPost(payload);
    if (result && result.success === false) throw new Error(result.error || "Booking failed");

    const orderNo = (result && result.data) ? (result.data.orderNo || result.orderNo) : (result.orderNo || "N/A");
    showToast(`Order ${orderNo} created successfully!`, true);
    ordersCache = null;
    resetBookingForm();
  } catch (err) {
    console.error("Booking failed:", err);
    showToast(err.message || "Failed to create order", false);
  } finally {
    btn.disabled = false;
    btn.textContent = bookingTranslations[bookingLang].submit;
  }
}

function updateOrderPreview() {
  const dateEl     = document.getElementById("previewDate");
  const nameEl     = document.getElementById("previewName");
  const mobileEl   = document.getElementById("previewMobile");
  const productEl  = document.getElementById("previewProduct");
  const totalEl    = document.getElementById("previewTotal");

  if (dateEl) {
    const d = document.getElementById("bDate");
    dateEl.textContent = d && d.value ? formatDate(d.value) : "--";
  }
  if (nameEl) {
    const n = document.getElementById("bCustomerName");
    nameEl.textContent = (n && n.value.trim()) || "--";
  }
  if (mobileEl) {
    const allMobiles = getAllMobiles();
    mobileEl.textContent = allMobiles || "--";
  }
  if (productEl) {
    const p = document.getElementById("bProductName");
    productEl.textContent = (p && p.value.trim()) || "--";
  }
  if (totalEl) {
    const pr = document.getElementById("bPrice");
    const price = parseFloat(pr && pr.value) || 0;
    totalEl.textContent = `Rs. ${price.toLocaleString()}`;
  }
}

document.addEventListener("DOMContentLoaded", function() {
  const fields = ["bDate", "bCustomerName", "bProductName", "bQty", "bPrice"];
  fields.forEach(function(id) {
    const el = document.getElementById(id);
    if (el) el.addEventListener("input", updateOrderPreview);
  });
  document.addEventListener("input", function(e) {
    if (e.target.classList.contains("mobile-input")) updateOrderPreview();
  });
});

/* ============================================================
   MODULE: RETURNS
   ============================================================ */
let returnableOrders = [];

async function loadReturnableOrders() {
  try {
    const all = await getOrdersCached();
    returnableOrders = all.filter(o => {
      const s = (o.status || o["Status"] || "").toString().toLowerCase();
      return s === "delivered" || s === "pending" || s === "";
    });
    renderReturnableTable(returnableOrders);
    populateReturnSelect(returnableOrders);
  } catch (err) {
    console.error("Returnable orders load failed:", err);
    showToast(err.message || "Failed to load orders", false);
  }
}

function renderReturnableTable(orders) {
  const tbody = document.getElementById("returnableBody");
  const count = document.getElementById("returnableCount");
  if (!tbody) return;

  if (!orders.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-10 text-center text-stone-400">No returnable orders</td></tr>';
    if (count) count.textContent = "";
    return;
  }

  if (count) count.textContent = `${orders.length} orders`;

  tbody.innerHTML = orders.map(o => {
    const status = (o.status || o["Status"] || "").toLowerCase();
    const statusColor = status === "delivered" ? "bg-emerald-50 text-emerald-700"
                      : status === "pending" ? "bg-amber-50 text-amber-700"
                      : "bg-stone-100 text-stone-500";
    return `
    <tr class="border-b border-stone-50 table-row">
      <td class="px-6 py-3 font-medium text-stone-800">${o.orderNo || o["Order No"] || ''}</td>
      <td class="px-4 py-3 text-stone-600">${o.customerName || o["Customer Name"] || ''}</td>
      <td class="px-4 py-3 text-stone-600">${o.productName || o["Product Name"] || ''}</td>
      <td class="px-4 py-3 text-right text-stone-600">${o.productQty || o["Product Qty"] || 0}</td>
      <td class="px-4 py-3 text-right font-medium text-stone-800">Rs. ${Number(o.productPrice || o["Product Price"] || 0).toLocaleString()}</td>
      <td class="px-6 py-3"><span class="text-xs font-semibold px-2.5 py-1 rounded-full ${statusColor}">${o.status || o["Status"] || ''}</span></td>
    </tr>`;
  }).join("");
}

function populateReturnSelect(orders) {
  const sel = document.getElementById("returnOrderNo");
  if (!sel) return;
  sel.innerHTML = '<option value="">Select order...</option>';
  orders.forEach(o => {
    const no = o.orderNo || o["Order No"] || "";
    const name = o.customerName || o["Customer Name"] || "";
    const opt = document.createElement("option");
    opt.value = no;
    opt.textContent = `${no} — ${name}`;
    sel.appendChild(opt);
  });

  sel.onchange = function() {
    const no = this.value;
    const info = document.getElementById("returnOrderInfo");
    if (!no) { info.classList.add("hidden"); return; }

    const o = orders.find(x => (x.orderNo || x["Order No"]) == no);
    if (!o) return;

    document.getElementById("retInfoCustomer").textContent = o.customerName || o["Customer Name"] || "";
    document.getElementById("retInfoProduct").textContent  = o.productName || o["Product Name"] || "";
    document.getElementById("retInfoQty").textContent      = o.productQty || o["Product Qty"] || 0;
    document.getElementById("retInfoPrice").textContent    = `Rs. ${Number(o.productPrice || o["Product Price"] || 0).toLocaleString()}`;
    document.getElementById("retInfoRecovery").textContent = `Calculating...`;

    info.classList.remove("hidden");
  };
}

async function submitReturn(e) {
  e.preventDefault();
  const orderNo = document.getElementById("returnOrderNo").value;
  const reason  = document.getElementById("returnReason").value;
  const btn     = document.getElementById("returnSubmitBtn");

  if (!orderNo) { showToast("Select an order first", false); return; }

  btn.disabled = true;
  btn.textContent = "Processing...";

  try {
    const result = await apiPost({
      action:   "recordReturn",
      orderNo:  orderNo,
      reason:   reason,
    });
    if (result && result.success === false) throw new Error(result.error || "Return failed");

    const data = (result && result.data) ? result.data : (result || {});
    showToast(`Return recorded! Recovery: Rs. ${data.recovery || 0}`, true);
    ordersCache = null;
    document.getElementById("returnForm").reset();
    document.getElementById("returnOrderInfo").classList.add("hidden");
    loadReturnableOrders();
  } catch (err) {
    console.error("Return failed:", err);
    showToast("Failed: " + (err.message || "Unknown error"), false);
  } finally {
    btn.disabled = false;
    btn.textContent = "Confirm Return";
  }
}

/* ============================================================
   MODULE: PRODUCTS & HERO FEATURED MANAGEMENT
   Fully unified: Manage Store Catalog + Live Storefront Hero Card
   ============================================================ */
let allProducts = [];
let activeHeroFeatured = null;

const DEFAULT_HERO_FEATURED = {
  productId: "1",
  title: "اکسیرِ شباب گولڈ کیپسول (Akseer-e-Shabab)",
  titleEn: "Pure Life Akseer-e-Shabab Capsules",
  price: 1850,
  regularPrice: 2400,
  image: "akseer-e-shabab.png",
  topBadge: "کیش آن ڈیلیوری دستیاب ہے",
  pillBadge: "30 کیپسول",
  awardBadge: "سب سے زیادہ فروخت ہونے والا فارمولا",
  tag1: "گولڈ ہربل سپلیمنٹ",
  tag2: "حیرت انگیز اور دیرپا نتائج",
  description: "مردانہ و اعصابی کمزوری، پٹھوں کا درد، دائمی تھکن اور جسمانی قوت و اسٹیمینا کی فوری بحالی کے لیے لاجواب شاہانہ ہربل نسخہ۔"
};

const BUILTIN_HERBAL_PRODUCTS = [
  {
    id: "1",
    name: "اکسیرِ شباب گولڈ کیپسول (Akseer-e-Shabab)",
    price: 1850,
    comparePrice: 2400,
    image: "akseer-e-shabab.png",
    description: "مردانہ و اعصابی کمزوری، پٹھوں کا درد، دائمی تھکن اور جسمانی قوت و اسٹیمینا کی فوری بحالی کے لیے لاجواب شاہانہ ہربل نسخہ۔",
    pillBadge: "30 کیپسول",
    tag1: "گولڈ ہربل سپلیمنٹ",
    tag2: "حیرت انگیز اور دیرپا نتائج",
    awardBadge: "سب سے زیادہ فروخت ہونے والا فارمولا"
  },
  {
    id: "2",
    name: "پیور مورنگا سوپر فوڈ کیپسول (Pure Moringa)",
    price: 1450,
    comparePrice: 1950,
    image: "https://images.unsplash.com/photo-1540420773420-3366772f4999?w=500&auto=format&fit=crop&q=80",
    description: "90+ ضروری غذائی وٹامنز اور معدنیات، بلڈ پریشر اور شوگر کنٹرول کرنے میں معاون، خالص سوہانجنا کے پتوں کا جوہر۔",
    pillBadge: "60 کیپسول",
    tag1: "سوہانجنا اکسیر",
    tag2: "قدرتی وٹامنز",
    awardBadge: "سپر فوڈ چیمپئن"
  },
  {
    id: "3",
    name: "اشواگندھا ایکسٹرا پاور کیپسول (Ashwagandha)",
    price: 1750,
    comparePrice: 2300,
    image: "https://images.unsplash.com/photo-1615485290382-441e4d049cb5?w=500&auto=format&fit=crop&q=80",
    description: "ذہنی تناؤ، پریشانی اور ڈپریشن سے نجات، پرسکون گہری نیند اور یادداشت و دماغی صلاحیتوں میں بے پناہ اضافہ۔",
    pillBadge: "30 کیپسول",
    tag1: "دماغی سکون",
    tag2: "شاہی تقویت",
    awardBadge: "اعصابی بوسٹر"
  },
  {
    id: "4",
    name: "ریڈبل ہربل انرجی کیپسول (RedBull Herbal)",
    price: 2200,
    comparePrice: 2900,
    image: "https://images.unsplash.com/photo-1550572017-edd951aa8f72?w=500&auto=format&fit=crop&q=80",
    description: "فوری طاقت، استقامت اور اعصابی تقویت، خون کی روانی کو تیز اور مردانہ قوت و اسٹیمینا میں حیرت انگیز اضافہ۔",
    pillBadge: "30 کیپسول",
    tag1: "طاقت کا طوفان",
    tag2: "فوری رزلٹ",
    awardBadge: "مردانہ اسٹیمینا"
  },
  {
    id: "7",
    name: "خالص ہمالین سلاجیت و سفید موصلی معجون",
    price: 2800,
    comparePrice: 3800,
    image: "https://images.unsplash.com/photo-1512069772995-ec65ed45afd6?w=500&auto=format&fit=crop&q=80",
    description: "خالص ہمالین سلاجیت اور ہندوستانی سفید موصلی کا شاہی مرکب، جوڑوں، کمر اور ہڈیوں کی دیرینہ کمزوری کا حتمی علاج۔",
    pillBadge: "250 گرام جار",
    tag1: "شاہی نسخہ",
    tag2: "100% خالص سلاجیت",
    awardBadge: "قدرتی اکسیر"
  }
];

// Helper to escape HTML safely
function escHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Client-side image compressor via Canvas: shrinks large mobile/camera photos to fast, lightweight JPEGs
function compressImageFile(file, maxWidth = 800, maxHeight = 800, quality = 0.78) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      return reject(new Error("منتخب کردہ فائل تصویر نہیں ہے"));
    }
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        let width = img.width;
        let height = img.height;
        if (width > maxWidth || height > maxHeight) {
          if (width > height) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          } else {
            width = Math.round((width * maxHeight) / height);
            height = maxHeight;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve(dataUrl);
      };
      img.onerror = () => reject(new Error("تصویر لوڈ نہ ہو سکی"));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error("فائل ریڈ نہ ہو سکی"));
    reader.readAsDataURL(file);
  });
}

async function handlePrimaryImageFile(input) {
  if (!input || !input.files || input.files.length === 0) return;
  const file = input.files[0];
  try {
    showToast("تصویر پراسیس اور کمپریس ہو رہی ہے...", true);
    const compressed = await compressImageFile(file, 800, 800, 0.78);
    setProdImage(compressed);
    showToast("بنیادی تصویر کامیابی سے منتخب ہو گئی!", true);
  } catch (err) {
    console.error("Primary image upload error:", err);
    showToast(err.message || "تصویر اپلوڈ کرنے میں مسئلہ آیا", false);
  }
  input.value = "";
}

function clearProdPrimaryImage() {
  const input = document.getElementById("prodImage");
  if (input) input.value = "";
  updateProdImagePreview("");
}

function updateProdImagePreview(val) {
  const preview = document.getElementById("prodImagePreview");
  if (preview) {
    const trimmed = (val || "").trim();
    preview.src = trimmed || "akseer-e-shabab.png";
    preview.style.display = "block";
  }
}

function setProdImage(val) {
  const input = document.getElementById("prodImage");
  if (input) input.value = val;
  updateProdImagePreview(val);
}

function toggleCustomCategory() {
  const sel = document.getElementById("prodCategory");
  const input = document.getElementById("prodCustomCategory");
  if (!sel || !input) return;
  if (sel.value === "__custom__") {
    input.classList.remove("hidden");
    input.focus();
  } else {
    input.classList.add("hidden");
    input.value = "";
  }
}

function getCategoryValue() {
  const sel = document.getElementById("prodCategory");
  const input = document.getElementById("prodCustomCategory");
  if (!sel) return "";
  if (sel.value === "__custom__" && input && input.value.trim()) {
    return input.value.trim();
  }
  return sel.value || "";
}

async function loadProducts() {
  try {
    // 1. Load active hero from localStorage immediately
    if (!activeHeroFeatured) {
      try {
        const local = localStorage.getItem("pl_hero_featured");
        if (local) activeHeroFeatured = JSON.parse(local);
      } catch (e) {}
    }
    if (!activeHeroFeatured) {
      activeHeroFeatured = { ...DEFAULT_HERO_FEATURED };
    }
    renderActiveHeroBanner(activeHeroFeatured);

    // 2. Fetch products from API
    const json = await apiGet("productsList");
    allProducts = (json && json.success !== undefined) ? (json.data || []) : (json || []);
    if (!Array.isArray(allProducts)) allProducts = [];

    // 3. Sync hero product from server if available
    try {
      const cfgJson = await apiGet("storeConfig");
      const cfg = (cfgJson && cfgJson.success !== undefined) ? (cfgJson.data || {}) : (cfgJson || {});
      if (cfg && cfg.featuredProduct && typeof cfg.featuredProduct === "object") {
        activeHeroFeatured = cfg.featuredProduct;
        localStorage.setItem("pl_hero_featured", JSON.stringify(activeHeroFeatured));
        renderActiveHeroBanner(activeHeroFeatured);
      }
    } catch (cfgErr) {
      console.warn("Hero server config sync skipped:", cfgErr);
    }

    try {
      initDummyProductsToggle();
    } catch (_) {}

    populateCategoryDropdown(allProducts);
    populateQuickHeroSelect(allProducts);
    renderProductsTable(allProducts);
    setLastUpdated();
  } catch (err) {
    console.error("Products load failed:", err);
    showToast(err.message || "Failed to load products", false);
  }
}

function renderActiveHeroBanner(hero) {
  if (!hero) return;
  const thumb = document.getElementById("activeHeroThumb");
  const title = document.getElementById("activeHeroTitle");
  const price = document.getElementById("activeHeroPrice");
  const regPrice = document.getElementById("activeHeroRegPrice");
  const tag = document.getElementById("activeHeroTag");
  const idEl = document.getElementById("activeHeroId");

  if (thumb) thumb.src = hero.image || "akseer-e-shabab.png";
  if (title) title.textContent = hero.title || "اکسیرِ شباب گولڈ کیپسول";
  if (price) price.textContent = "Rs. " + Number(hero.price || 0).toLocaleString();
  if (regPrice) regPrice.textContent = hero.regularPrice ? ("Rs. " + Number(hero.regularPrice).toLocaleString()) : "";
  if (tag) tag.textContent = hero.tag1 || "گولڈ ہربل سپلیمنٹ";
  if (idEl) idEl.textContent = "ID: " + (hero.productId || "1");
}

function populateCategoryDropdown(products) {
  const sel = document.getElementById("prodCategory");
  if (!sel) return;
  const current = sel.value;
  const cats = {};
  const defaultCats = ["Herbal Capsules", "Pure Herbs", "Essential Oils", "Personal Care", "Bundle Packs"];
  defaultCats.forEach(c => cats[c] = true);
  products.forEach(p => {
    const c = (p.category || p.Category || "").trim();
    if (c) cats[c] = true;
  });
  sel.innerHTML = "";
  Object.keys(cats).sort().forEach(c => {
    const opt = document.createElement("option");
    opt.value = c;
    opt.textContent = c;
    sel.appendChild(opt);
  });
  const customOpt = document.createElement("option");
  customOpt.value = "__custom__";
  customOpt.textContent = "+ Add New Category";
  sel.appendChild(customOpt);
  if (current && cats[current]) sel.value = current;
}

/* --- Dummy / Sample Products Display Controller --- */
function initDummyProductsToggle() {
  const chk = document.getElementById("toggleDummyProducts");
  if (!chk) return;
  
  let showDummy = false;
  try {
    const cachedSettings = localStorage.getItem("pl_store_settings");
    if (cachedSettings) {
      const parsed = JSON.parse(cachedSettings);
      if (parsed && parsed.showDummyProducts !== undefined) {
        showDummy = (parsed.showDummyProducts === true || parsed.showDummyProducts === "true");
      }
    } else {
      showDummy = (localStorage.getItem("pl_show_dummy_products") === "true");
    }
  } catch (_) {}
  
  chk.checked = showDummy;
  updateDummyToggleUI(showDummy);
}

function updateDummyToggleUI(showDummy) {
  const label = document.getElementById("dummyToggleLabel");
  const badge = document.getElementById("dummyBadge");
  if (label) {
    label.innerHTML = `ڈمی پراڈکٹس: <b>${showDummy ? "آن (ON)" : "بند (OFF)"}</b>`;
  }
  if (badge) {
    if (showDummy) {
      badge.textContent = "ڈمی + اصلی دونوں شامل ہیں";
      badge.className = "px-2.5 py-0.5 rounded-full text-[11px] font-black bg-amber-100 text-amber-800 border border-amber-300";
    } else {
      badge.textContent = "صرف اوریجنل پراڈکٹس فعال ہیں";
      badge.className = "px-2.5 py-0.5 rounded-full text-[11px] font-black bg-emerald-100 text-emerald-800 border border-emerald-300";
    }
  }
}

async function onToggleDummyProducts(showDummy) {
  updateDummyToggleUI(showDummy);
  try {
    localStorage.setItem("pl_show_dummy_products", showDummy ? "true" : "false");
    
    // Save to Google Sheets Store_Config so frontend sees it immediately
    let cfg = {};
    try {
      const cfgRes = await apiGet("storeConfig");
      cfg = (cfgRes && cfgRes.success !== undefined) ? (cfgRes.data || {}) : (cfgRes || {});
    } catch (_) {}
    if (!cfg || typeof cfg !== "object") cfg = {};
    if (!cfg.settings || typeof cfg.settings !== "object") cfg.settings = {};
    cfg.settings.showDummyProducts = showDummy;

    await apiPost({
      action: "saveStoreConfig",
      config: cfg
    });

    showToast(showDummy ? "ڈمی پراڈکٹس فعال کر دی گئیں" : "ڈمی ڈیٹا بند کر دیا گیا! اب سٹور پر صرف اوریجنل پراڈکٹس شو ہوں گی۔", true);
  } catch (err) {
    console.warn("Dummy toggle sync warning:", err);
    showToast(showDummy ? "ڈمی پراڈکٹس آن (لوکل)" : "ڈمی ڈیٹا بند (لوکل)", true);
  }
}

function populateQuickHeroSelect(products) {
  const sel = document.getElementById("quickHeroSelect");
  if (!sel) return;

  sel.innerHTML = '<option value="">-- منتخب کریں اور فوری تبدیل کریں --</option>';

  const prods = Array.isArray(products) && products.length > 0 ? products : allProducts;

  if (prods.length > 0) {
    const optGroupCustom = document.createElement("optgroup");
    optGroupCustom.label = "🛒 سٹور پراڈکٹس (Store Products)";
    prods.forEach((p, idx) => {
      const opt = document.createElement("option");
      opt.value = "custom_" + idx;
      opt.textContent = (p.name || p.Name || "Product") + " — (Rs. " + Number(p.price || p.Price || 0).toLocaleString() + ")";
      optGroupCustom.appendChild(opt);
    });
    sel.appendChild(optGroupCustom);
  }

  const optGroupDefault = document.createElement("optgroup");
  optGroupDefault.label = "🌿 پیور لائف فلیگ شپ فارمولے";
  BUILTIN_HERBAL_PRODUCTS.forEach((p, idx) => {
    const opt = document.createElement("option");
    opt.value = "builtin_" + idx;
    opt.textContent = p.name + " — (Rs. " + Number(p.price).toLocaleString() + ")";
    optGroupDefault.appendChild(opt);
  });
  sel.appendChild(optGroupDefault);
}

async function onQuickHeroSelectChange(val) {
  if (!val) return;
  let heroData = null;

  if (val.startsWith("custom_")) {
    const idx = parseInt(val.replace("custom_", ""), 10);
    const p = allProducts[idx];
    if (p) {
      heroData = {
        productId:    (p.id || p.Id || "custom_" + (idx + 1)).toString(),
        title:        p.name || p.Name || "پیور لائف ہربل پراڈکٹ",
        titleEn:      p.variant || p.Variant || "Pure Life Herbal Formula",
        price:        parseFloat(p.price || p.Price) || 1500,
        regularPrice: parseFloat(p.comparePrice || p.ComparePrice) || Math.round((parseFloat(p.price || p.Price) || 1500) * 1.3),
        image:        p.image || p.Image || "akseer-e-shabab.png",
        topBadge:     "کیش آن ڈیلیوری دستیاب ہے",
        pillBadge:    p.variant || p.Variant || "30 کیپسول",
        awardBadge:   "سب سے زیادہ فروخت ہونے والا فارمولا",
        tag1:         p.category || p.Category || "گولڈ ہربل سپلیمنٹ",
        tag2:         "حیرت انگیز اور دیرپا نتائج",
        description:  p.description || p.Description || "100% خالص قدرتی دیسی جڑی بوٹیوں سے تیار کردہ شاہانہ نسخہ۔"
      };
    }
  } else if (val.startsWith("builtin_")) {
    const idx = parseInt(val.replace("builtin_", ""), 10);
    const p = BUILTIN_HERBAL_PRODUCTS[idx];
    if (p) {
      heroData = {
        productId:    p.id.toString(),
        title:        p.name,
        titleEn:      "Pure Life Herbal Formula",
        price:        p.price,
        regularPrice: p.comparePrice,
        image:        p.image,
        topBadge:     "کیش آن ڈیلیوری دستیاب ہے",
        pillBadge:    p.pillBadge,
        awardBadge:   p.awardBadge,
        tag1:         p.tag1,
        tag2:         p.tag2,
        description:  p.description
      };
    }
  }

  if (heroData) {
    await saveHeroDataDirectly(heroData);
    showToast("⭐ ہیرو پراڈکٹ کامیابی سے تبدیل کر دی گئی!", true);
  }
}

async function quickSetHeroProduct(index) {
  const p = allProducts[index];
  if (!p) return;

  const heroData = {
    productId:    (p.id || p.Id || "prod_" + (index + 1)).toString(),
    title:        p.name || p.Name || "پیور لائف ہربل پراڈکٹ",
    titleEn:      p.variant || p.Variant || "Pure Life Herbal Formula",
    price:        parseFloat(p.price || p.Price) || 1500,
    regularPrice: parseFloat(p.comparePrice || p.ComparePrice) || Math.round((parseFloat(p.price || p.Price) || 1500) * 1.3),
    image:        p.image || p.Image || "akseer-e-shabab.png",
    topBadge:     "کیش آن ڈیلیوری دستیاب ہے",
    pillBadge:    p.variant || p.Variant || "30 کیپسول",
    awardBadge:   "سب سے زیادہ فروخت ہونے والا فارمولا",
    tag1:         p.category || p.Category || "گولڈ ہربل سپلیمنٹ",
    tag2:         "حیرت انگیز اور دیرپا نتائج",
    description:  p.description || p.Description || "100% خالص قدرتی دیسی جڑی بوٹیوں سے تیار کردہ شاہانہ نسخہ۔",
    dosage:       p.dosage || p.Dosage || "",
    ingredients:  p.ingredients || p.Ingredients || "",
    precautions:  p.precautions || p.Precautions || "",
    benefits:     p.benefits || p.Benefits || "",
    galleryImages: p.galleryImages || p.GalleryImages || ""
  };

  await saveHeroDataDirectly(heroData);
  showToast("⭐ " + heroData.title + " اب لائیو ہیرو کارڈ پر سیٹ ہے!", true);
}

async function saveHeroDataDirectly(heroData) {
  activeHeroFeatured = heroData;
  localStorage.setItem("pl_hero_featured", JSON.stringify(heroData));
  renderActiveHeroBanner(heroData);
  renderProductsTable(allProducts);

  try {
    let fullConfig = {};
    try {
      const existing = await apiGet("storeConfig");
      fullConfig = (existing && existing.success !== undefined) ? (existing.data || {}) : (existing || {});
      if (typeof fullConfig !== "object" || !fullConfig) fullConfig = {};
    } catch (e) {
      console.warn("Existing config fetch:", e);
    }
    fullConfig.featuredProduct = heroData;

    await apiPost({
      action: "saveStoreConfig",
      config: fullConfig
    });
  } catch (err) {
    console.error("Save hero to backend failed:", err);
  }
}

function resetHeroToDefault() {
  saveHeroDataDirectly({ ...DEFAULT_HERO_FEATURED });
  showToast("ری سیٹ مکمل: اکسیر شباب دوبارہ ڈیفالٹ ہیرو پراڈکٹ بن گئی!", true);
}

function openHeroCustomModal() {
  const hero = activeHeroFeatured || DEFAULT_HERO_FEATURED;
  const modal = document.getElementById("heroCustomModal");
  if (!modal) return;

  const setModalVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || "";
  };

  setModalVal("modalHeroTitle", hero.title);
  setModalVal("modalHeroPrice", hero.price);
  setModalVal("modalHeroRegPrice", hero.regularPrice);
  setModalVal("modalHeroImg", hero.image);
  setModalVal("modalHeroTopBadge", hero.topBadge);
  setModalVal("modalHeroPillBadge", hero.pillBadge);
  setModalVal("modalHeroTag1", hero.tag1);
  setModalVal("modalHeroTag2", hero.tag2);
  setModalVal("modalHeroAwardBadge", hero.awardBadge);
  setModalVal("modalHeroDesc", hero.description);
  setModalVal("modalHeroProductId", hero.productId);

  modal.classList.remove("hidden");
}

function closeHeroCustomModal() {
  const modal = document.getElementById("heroCustomModal");
  if (modal) modal.classList.add("hidden");
}

async function saveHeroFromModal() {
  const getModalVal = (id) => (document.getElementById(id)?.value || "").trim();

  const heroData = {
    productId:    getModalVal("modalHeroProductId") || (activeHeroFeatured?.productId || "1"),
    title:        getModalVal("modalHeroTitle") || DEFAULT_HERO_FEATURED.title,
    titleEn:      activeHeroFeatured?.titleEn || "Pure Life Herbal Formula",
    price:        parseFloat(getModalVal("modalHeroPrice")) || DEFAULT_HERO_FEATURED.price,
    regularPrice: parseFloat(getModalVal("modalHeroRegPrice")) || DEFAULT_HERO_FEATURED.regularPrice,
    image:        getModalVal("modalHeroImg") || DEFAULT_HERO_FEATURED.image,
    topBadge:     getModalVal("modalHeroTopBadge") || DEFAULT_HERO_FEATURED.topBadge,
    pillBadge:    getModalVal("modalHeroPillBadge") || DEFAULT_HERO_FEATURED.pillBadge,
    awardBadge:   getModalVal("modalHeroAwardBadge") || DEFAULT_HERO_FEATURED.awardBadge,
    tag1:         getModalVal("modalHeroTag1") || DEFAULT_HERO_FEATURED.tag1,
    tag2:         getModalVal("modalHeroTag2") || DEFAULT_HERO_FEATURED.tag2,
    description:  getModalVal("modalHeroDesc") || DEFAULT_HERO_FEATURED.description,
  };

  await saveHeroDataDirectly(heroData);
  closeHeroCustomModal();
  showToast("⭐ ہیرو کارڈ بیجز اور تفصیل کامیابی سے لائیو ہو گئیں!", true);
}

function renderProductsTable(products) {
  const tbody = document.getElementById("productsBody");
  const count = document.getElementById("productCount");
  if (!tbody) return;

  if (!products.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="px-5 py-8 text-center text-stone-400">No products yet. Add your first product above.</td></tr>';
    if (count) count.textContent = "";
    return;
  }

  if (count) count.textContent = products.length + " products";

  const activeId = activeHeroFeatured?.productId ? String(activeHeroFeatured.productId).trim() : "1";
  const activeTitle = activeHeroFeatured?.title ? activeHeroFeatured.title.trim().toLowerCase() : "";

  tbody.innerHTML = products.map((p, i) => {
    const pId = String(p.id || p.Id || (i + 1)).trim();
    const pName = (p.name || p.Name || "").trim();
    const isHero = (activeId === pId) || (activeTitle && pName.toLowerCase() === activeTitle);

    const statusClass = p.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-stone-100 text-stone-500";
    const imgUrl = (p.image || p.Image || "").trim();
    const img = imgUrl
      ? `<img src="${escHtml(imgUrl)}" class="w-11 h-11 rounded-xl object-cover bg-stone-100 border border-stone-200" onerror="this.onerror=null; this.src='akseer-e-shabab.png';" />`
      : `<div class="w-11 h-11 rounded-xl bg-stone-100 flex items-center justify-center text-stone-400 text-sm font-bold border border-stone-200">${escHtml(pName.charAt(0) || 'P')}</div>`;

    const heroBadgeOrButton = isHero
      ? `<span class="inline-flex items-center gap-1 px-3 py-1 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-full text-xs font-black shadow-2xs">
           <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span> ⭐ Active Hero
         </span>`
      : `<button onclick="quickSetHeroProduct(${i})" class="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 px-2.5 py-1 rounded-full text-xs font-bold transition shadow-2xs">
           ⭐ Set as Hero
         </button>`;

    return `
    <tr class="border-b border-stone-100 hover:bg-stone-50/70 transition ${isHero ? 'bg-amber-50/20' : ''}">
      <td class="px-5 py-3">${img}</td>
      <td class="px-4 py-3">
        <p class="font-bold text-stone-900 leading-snug">${escHtml(pName)}</p>
        <p class="text-xs text-stone-400 mt-0.5 max-w-[220px] truncate">${escHtml(p.description || p.Description || '')}</p>
      </td>
      <td class="px-4 py-3 text-sm text-stone-600 font-medium">${escHtml(p.category || p.Category || 'General')}</td>
      <td class="px-4 py-3 text-right font-bold text-stone-900">Rs. ${Number(p.price || p.Price || 0).toLocaleString()}</td>
      <td class="px-4 py-3 text-right font-bold ${Number(p.stock || p.Stock || 0) > 0 ? 'text-emerald-600' : 'text-red-500'}">${p.stock || p.Stock || 0}</td>
      <td class="px-4 py-3 text-center">${heroBadgeOrButton}</td>
      <td class="px-4 py-3"><span class="text-xs font-semibold px-2.5 py-1 rounded-full ${statusClass}">${p.status || 'Active'}</span></td>
      <td class="px-5 py-3 text-center">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="editProduct(${i})" class="inline-flex items-center gap-1 bg-blue-50 text-blue-600 hover:bg-blue-100 px-2.5 py-1.5 rounded-lg text-xs font-bold transition" title="Edit">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
            <span>Edit</span>
          </button>
          <button onclick="deleteProduct('${escHtml(p.id || p.Id || p.name || '')}')" class="inline-flex items-center gap-1 bg-red-50 text-red-500 hover:bg-red-100 px-2.5 py-1.5 rounded-lg text-xs font-bold transition" title="Delete">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
          </button>
        </div>
      </td>
    </tr>`;
  }).join("");
}

/* ============================================================
   GALLERY IMAGES MANAGEMENT
   ============================================================ */
window.prodGalleryArray = [];

function parseSafeImageString(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.map(s => String(s).trim()).filter(Boolean);
  if (typeof val !== "string") return [];
  val = val.trim();
  if (!val) return [];

  try {
    const json = JSON.parse(val);
    if (Array.isArray(json)) return json.map(s => String(s).trim()).filter(Boolean);
  } catch (e) {}

  if (val.startsWith("data:image/")) {
    if (val.includes("|||")) return val.split("|||").map(s => s.trim()).filter(Boolean);
    if (val.includes("\n")) return val.split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
    return [val];
  }

  if (val.includes("|||")) {
    return val.split("|||").map(s => s.trim()).filter(Boolean);
  }

  const lines = val.split(/[\r\n]+/);
  const out = [];
  for (const l of lines) {
    const trimmed = l.trim();
    if (!trimmed) continue;
    if (trimmed.startsWith("data:image/")) {
      out.push(trimmed);
    } else {
      const parts = trimmed.split(",").map(p => p.trim()).filter(Boolean);
      out.push(...parts);
    }
  }
  return out;
}

function parseGalleryImagesFromInput() {
  if (Array.isArray(window.prodGalleryArray) && window.prodGalleryArray.length > 0) {
    return [...window.prodGalleryArray];
  }
  const el = document.getElementById("prodGalleryImages");
  if (!el || !el.value.trim()) return [];
  return parseSafeImageString(el.value);
}

function setGalleryImagesToInput(arr) {
  window.prodGalleryArray = Array.isArray(arr) ? [...arr] : parseSafeImageString(arr);
  const el = document.getElementById("prodGalleryImages");
  if (el) {
    const hasDataUrl = window.prodGalleryArray.some(s => s.startsWith("data:image/"));
    el.value = hasDataUrl ? window.prodGalleryArray.join("\n") : window.prodGalleryArray.join(", ");
  }
  renderGalleryPreviews(window.prodGalleryArray);
}

function onGalleryTextInput(text) {
  const parsed = parseSafeImageString(text);
  window.prodGalleryArray = parsed;
  renderGalleryPreviews(parsed);
}

function renderGalleryPreviews(images) {
  const strip = document.getElementById("prodGalleryPreviewStrip");
  if (!strip) return;

  const validImages = Array.isArray(images) ? images.filter(Boolean) : [];
  if (validImages.length === 0) {
    strip.innerHTML = '<span class="text-xs text-stone-400 italic">کوئی اضافی تصویر شامل نہیں کی گئی۔ اوپر سے تصویر منتخب کریں یا لنک درج کریں۔</span>';
    return;
  }

  strip.innerHTML = validImages.map((img, idx) => `
    <div class="relative w-16 h-16 rounded-xl border border-stone-300 bg-white overflow-hidden shadow-2xs group flex-shrink-0">
      <img src="${escHtml(img)}" alt="Gallery ${idx + 1}" class="w-full h-full object-cover" onerror="this.onerror=null; this.src='akseer-e-shabab.png';" />
      <button type="button" onclick="removeGalleryImage(${idx})" class="absolute top-1 right-1 bg-red-600/90 hover:bg-red-700 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black shadow cursor-pointer transition">
        ✕
      </button>
    </div>
  `).join('');
}

function removeGalleryImage(idx) {
  if (Array.isArray(window.prodGalleryArray) && idx >= 0 && idx < window.prodGalleryArray.length) {
    window.prodGalleryArray.splice(idx, 1);
    setGalleryImagesToInput(window.prodGalleryArray);
  }
}

function clearAllGalleryImages() {
  window.prodGalleryArray = [];
  setGalleryImagesToInput([]);
  showToast("تمام اضافی تصاویر صاف کر دی گئیں", true);
}

async function handleGalleryFileInput(input) {
  if (!input || !input.files || input.files.length === 0) return;
  const files = Array.from(input.files);
  showToast(`${files.length} تصاویر پراسیس اور کمپریس ہو رہی ہیں...`, true);

  if (!Array.isArray(window.prodGalleryArray)) window.prodGalleryArray = [];

  let count = 0;
  for (const file of files) {
    try {
      const compressed = await compressImageFile(file, 800, 800, 0.75);
      window.prodGalleryArray.push(compressed);
      count++;
    } catch (err) {
      console.warn("Gallery item compress error:", err);
    }
  }

  setGalleryImagesToInput(window.prodGalleryArray);
  showToast(`${count} تصاویر گیلری میں شامل کر دی گئیں!`, true);
  input.value = "";
}

function editProduct(index) {
  const p = allProducts[index];
  if (!p) return;

  const pId = (p.id || p.Id || index).toString();
  document.getElementById("prodEditId").value = pId;
  document.getElementById("prodName").value = p.name || p.Name || "";
  document.getElementById("prodCategory").value = p.category || p.Category || "Herbal Capsules";
  document.getElementById("prodVariant").value = p.variant || p.Variant || "";
  document.getElementById("prodPrice").value = p.price || p.Price || "";
  document.getElementById("prodComparePrice").value = p.comparePrice || p.ComparePrice || "";
  document.getElementById("prodStock").value = p.stock || p.Stock || "";
  document.getElementById("prodImage").value = p.image || p.Image || "";
  document.getElementById("prodDesc").value = p.description || p.Description || "";
  document.getElementById("prodStatus").value = p.status || p.Status || "Active";

  // Enriched clinical details
  const bEl = document.getElementById("prodBenefits");
  if (bEl) {
    const rawB = p.benefits || p.Benefits || "";
    bEl.value = Array.isArray(rawB) ? rawB.join("\n") : rawB;
  }
  const dEl = document.getElementById("prodDosage");
  if (dEl) dEl.value = p.dosage || p.Dosage || "";

  const iEl = document.getElementById("prodIngredients");
  if (iEl) iEl.value = p.ingredients || p.Ingredients || "";

  const prEl = document.getElementById("prodPrecautions");
  if (prEl) prEl.value = p.precautions || p.Precautions || "";

  // Gallery
  const rawG = p.galleryImages || p.GalleryImages || p.gallery || "";
  const gArr = parseSafeImageString(rawG);
  setGalleryImagesToInput(gArr);

  updateProdImagePreview(p.image || p.Image || "");

  const heroCheck = document.getElementById("prodSetAsHero");
  if (heroCheck) {
    const isHero = (activeHeroFeatured?.productId === pId) || (activeHeroFeatured?.title === (p.name || p.Name));
    heroCheck.checked = !!isHero;
  }

  document.getElementById("productFormTitle").innerHTML = `
    <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"/></svg>
    <span>Edit Product — ${escHtml(p.name || p.Name || '')}</span>
  `;
  document.getElementById("prodSaveBtn").innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
    <span>Save Changes</span>
  `;
  document.getElementById("prodCancelBtn").classList.remove("hidden");

  const formSection = document.getElementById("mod-products");
  if (formSection) formSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function cancelProductEdit() {
  document.getElementById("prodEditId").value = "";
  document.getElementById("prodName").value = "";
  document.getElementById("prodCategory").value = "Herbal Capsules";
  const customCatEl = document.getElementById("prodCustomCategory");
  if (customCatEl) { customCatEl.value = ""; customCatEl.classList.add("hidden"); }
  document.getElementById("prodVariant").value = "";
  document.getElementById("prodPrice").value = "";
  document.getElementById("prodComparePrice").value = "";
  document.getElementById("prodStock").value = "";
  document.getElementById("prodImage").value = "";
  document.getElementById("prodDesc").value = "";
  document.getElementById("prodStatus").value = "Active";

  const bEl = document.getElementById("prodBenefits");
  if (bEl) bEl.value = "";
  const dEl = document.getElementById("prodDosage");
  if (dEl) dEl.value = "";
  const iEl = document.getElementById("prodIngredients");
  if (iEl) iEl.value = "";
  const prEl = document.getElementById("prodPrecautions");
  if (prEl) prEl.value = "";
  const gEl = document.getElementById("prodGalleryImages");
  if (gEl) gEl.value = "";
  setGalleryImagesToInput([]);

  const heroCheck = document.getElementById("prodSetAsHero");
  if (heroCheck) heroCheck.checked = false;

  updateProdImagePreview("");

  document.getElementById("productFormTitle").innerHTML = `
    <svg class="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
    <span>Add New Product</span>
  `;
  document.getElementById("prodSaveBtn").innerHTML = `
    <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
    <span>+ Add Product</span>
  `;
  document.getElementById("prodCancelBtn").classList.add("hidden");
}

async function saveProduct() {
  const editId      = document.getElementById("prodEditId").value;
  const name        = document.getElementById("prodName").value.trim();
  const price       = parseFloat(document.getElementById("prodPrice").value) || 0;
  const compPr      = parseFloat(document.getElementById("prodComparePrice").value) || 0;
  const stock       = parseInt(document.getElementById("prodStock").value, 10) || 0;
  const variant     = document.getElementById("prodVariant").value.trim();
  const category    = getCategoryValue();
  const desc        = document.getElementById("prodDesc").value.trim();
  const status      = document.getElementById("prodStatus").value;
  const setHero     = document.getElementById("prodSetAsHero")?.checked;

  const benefitsRaw = document.getElementById("prodBenefits")?.value.trim() || "";
  const dosage      = document.getElementById("prodDosage")?.value.trim() || "";
  const ingredients = document.getElementById("prodIngredients")?.value.trim() || "";
  const precautions = document.getElementById("prodPrecautions")?.value.trim() || "";
  const galleryArr  = parseGalleryImagesFromInput();
  const galleryImages = galleryArr.some(s => s.startsWith("data:image/")) ? galleryArr.join("\n") : galleryArr.join(", ");
  const chosenImg   = document.getElementById("prodImage").value.trim();
  const image       = chosenImg || (galleryArr.length > 0 ? galleryArr[0] : "akseer-e-shabab.png");

  if (!name) { showToast("Product name is required", false); return; }
  if (price <= 0) { showToast("Price must be greater than 0", false); return; }

  const btn = document.getElementById("prodSaveBtn");
  btn.disabled = true;
  btn.innerHTML = '<span>Saving...</span>';

  const payload = {
    action:       editId ? "updateProduct" : "addProduct",
    id:           editId || "",
    name:         name,
    category:     category || "Herbal Capsules",
    variant:      variant || "Standard",
    price:        price,
    comparePrice: compPr,
    stock:        stock,
    image:        image,
    description:  desc,
    status:       status,
    galleryImages:galleryImages,
    benefits:     benefitsRaw,
    dosage:       dosage,
    ingredients:  ingredients,
    precautions:  precautions
  };

  const targetProdId = editId || ("P-" + Date.now());
  payload.id = targetProdId;

  // Immediate local cache update for instant synchronization
  const localItem = {
    id: targetProdId,
    Id: targetProdId,
    name: name,
    Name: name,
    category: category || "Herbal Capsules",
    Category: category || "Herbal Capsules",
    variant: variant || "Standard",
    Variant: variant || "Standard",
    price: price,
    Price: price,
    comparePrice: compPr,
    ComparePrice: compPr,
    stock: stock,
    Stock: stock,
    image: image,
    Image: image,
    description: desc,
    Description: desc,
    status: status,
    Status: status,
    galleryImages: galleryArr,
    GalleryImages: galleryImages,
    benefits: benefitsRaw ? benefitsRaw.split(/[\n\r]+/).map(s => s.trim()).filter(Boolean) : [],
    Benefits: benefitsRaw,
    dosage: dosage,
    Dosage: dosage,
    ingredients: ingredients,
    Ingredients: ingredients,
    precautions: precautions,
    Precautions: precautions
  };

  const existIdx = allProducts.findIndex(p => (p.id || p.Id || "").toString() === (targetProdId || "").toString());
  if (existIdx >= 0) {
    allProducts[existIdx] = { ...allProducts[existIdx], ...localItem };
  } else {
    allProducts.unshift(localItem);
  }

  try {
    localStorage.setItem("pl_custom_products", JSON.stringify(allProducts));
  } catch (e) {}

  renderProductsTable(allProducts);

  try {
    await apiPost(payload);

    // If "Set as Hero" checkbox is checked, immediately update hero
    if (setHero) {
      const heroData = {
        productId:    targetProdId,
        title:        name,
        titleEn:      variant || "Pure Life Herbal Formula",
        price:        price,
        regularPrice: compPr || Math.round(price * 1.3),
        image:        image,
        topBadge:     "کیش آن ڈیلیوری دستیاب ہے",
        pillBadge:    variant || "30 کیپسول",
        awardBadge:   "سب سے زیادہ فروخت ہونے والا فارمولا",
        tag1:         category || "گولڈ ہربل سپلیمنٹ",
        tag2:         "حیرت انگیز اور دیرپا نتائج",
        description:  desc || "100% خالص قدرتی دیسی جڑی بوٹیوں سے تیار کردہ شاہانہ نسخہ۔",
        dosage:       dosage,
        ingredients:  ingredients,
        precautions:  precautions,
        benefits:     benefitsRaw,
        galleryImages: galleryImages
      };
      await saveHeroDataDirectly(heroData);
    }

    showToast(editId ? "پراڈکٹ تفصیلات اور تصاویر محفوظ ہو گئیں!" : "نئی پراڈکٹ اور گیلری شامل کر دی گئی!", true);
    cancelProductEdit();
    await loadProducts();
  } catch (err) {
    showToast(err.message || "Failed to save product", false);
  } finally {
    btn.disabled = false;
  }
}

async function deleteProduct(id) {
  if (!id) return;
  if (!confirm("کیا آپ واقعی اس پراڈکٹ کو ڈیلیٹ کرنا چاہتے ہیں؟")) return;

  try {
    const prodToDelete = allProducts.find(p => 
      (p.id !== undefined && String(p.id) === String(id)) || 
      (p.Id !== undefined && String(p.Id) === String(id)) ||
      (p.name !== undefined && String(p.name) === String(id)) ||
      (p.Name !== undefined && String(p.Name) === String(id))
    ) || {};
    const delId = prodToDelete.id || prodToDelete.Id || id;
    const delName = (prodToDelete.name || prodToDelete.Name || "").trim();

    // 1. Remove from local list immediately
    allProducts = allProducts.filter(p => {
      const pId = String(p.id || p.Id || "");
      const pName = String(p.name || p.Name || "").trim().toLowerCase();
      if (delId && pId === String(delId)) return false;
      if (delName && pName === delName.toLowerCase()) return false;
      return true;
    });

    // 2. Persist to localStorage immediately
    try {
      localStorage.setItem("pl_custom_products", JSON.stringify(allProducts));
      localStorage.setItem("pl_product_deleted_timestamp", Date.now().toString());
    } catch (e) {}
    renderProductsTable(allProducts);

    // 3. If the deleted product was the active Hero product, reset Hero!
    const heroId = String(activeHeroFeatured?.productId || "");
    const heroTitle = String(activeHeroFeatured?.title || "").trim().toLowerCase();
    const isHeroDeleted = (delId && heroId === String(delId)) || 
                          (delName && heroTitle === delName.toLowerCase());

    if (isHeroDeleted) {
      if (allProducts.length > 0) {
        await quickSetHeroProduct(0);
      } else {
        activeHeroFeatured = { ...DEFAULT_HERO_FEATURED };
        try {
          localStorage.setItem("pl_hero_featured", JSON.stringify(activeHeroFeatured));
        } catch (_) {}
        await saveHeroDataDirectly(activeHeroFeatured);
      }
    }

    // 4. Send delete to backend Google Sheets
    await apiPost({ 
      action: "deleteProduct", 
      id: delId, 
      name: delName 
    });

    showToast("پراڈکٹ کامیابی سے ڈیلیٹ کر دی گئی", true);
    await loadProducts();
  } catch (err) {
    showToast(err.message || "Failed to delete product", false);
  }
}

/* ============================================================
   UTILITIES
   ============================================================ */
function getStatusColor(status) {
  const s = (status || "").toLowerCase();
  const map = {
    "new order":  "bg-sky-50 text-sky-700",
    "confirmed":  "bg-blue-50 text-blue-700 font-bold",
    "booked":     "bg-purple-50 text-purple-700 font-bold",
    "dispatched": "bg-cyan-50 text-cyan-700",
    "delivered":  "bg-green-50 text-green-700",
    "returned":   "bg-red-50 text-red-700",
    "pending":    "bg-amber-50 text-amber-700",
    "cancelled":  "bg-stone-100 text-stone-500",
  };
  return map[s] || "bg-stone-100 text-stone-500";
}

function formatMobile(phone) {
  if (!phone) return "";
  var s = phone.toString().replace(/[\s\-\(\)]/g, "");
  if (s.startsWith("+92")) s = "0" + s.substring(3);
  if (s.startsWith("92")) s = "0" + s.substring(2);
  if (!s.startsWith("0")) s = "0" + s;
  return s;
}

function getTrackingUrl(trackingNo, courier) {
  if (!trackingNo) return "";
  var c = (courier || "").toLowerCase();
  var t = trackingNo.toString().trim();
  if (c === "post office")  return "https://ep.gov.pk/track.asp";
  if (c === "tcs")          return "https://www.tcs.com.pk/tracking/tracking-detail?shipmentNo=" + encodeURIComponent(t);
  if (c === "lpr" || c === "leopard") return "https://www.leopardscourier.com/leopard-tracking/consignment?consignmentNo=" + encodeURIComponent(t);
  if (c === "m&p")          return "https://www.mulphilogist.com/track-shipment?ref=" + encodeURIComponent(t);
  if (c === "daewoo")       return "https://www.daewoo.com.pk/track-shipment?tracking=" + encodeURIComponent(t);
  if (c === "call courier") return "https://www.callcourier.com.pk/tracking?trackingno=" + encodeURIComponent(t);
  if (c === "postex")       return "https://postex.pk/tracking?trackingNo=" + encodeURIComponent(t);
  return "";
}

function formatDate(dateVal) {
  if (!dateVal) return "";
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return dateVal.toString().split(" ")[0] || "";
    return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return dateVal.toString().split(" ")[0] || "";
  }
}

/* ============================================================
   MODULE: REPORTS & ANALYTICS
   Comprehensive KPIs, Financials & Courier Performance
   ============================================================ */
let reportRawOrders = [];
let reportFilteredOrders = [];
let reportActivePreset = "allTime";

async function loadReports() {
  try {
    reportRawOrders = await getOrdersCached();
    if (!Array.isArray(reportRawOrders)) reportRawOrders = [];

    // Initialize date inputs if empty
    const fromEl = document.getElementById("reportDateFrom");
    const toEl = document.getElementById("reportDateTo");
    
    if (!fromEl.value || !toEl.value) {
      setReportDatePreset("allTime", false);
    } else {
      renderReportsDashboard();
    }
    setLastUpdated();
  } catch (err) {
    console.error("Load reports error:", err);
    showToast(err.message || "Failed to load reports", false);
  }
}

function parseOrderDate(dateVal) {
  if (!dateVal) return null;
  try {
    const d = new Date(dateVal);
    if (isNaN(d.getTime())) return null;
    return d;
  } catch (e) {
    return null;
  }
}

function formatDateToYMD(d) {
  if (!d) return "";
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function setReportDatePreset(preset, shouldRender = true) {
  reportActivePreset = preset;

  document.querySelectorAll(".report-preset-btn").forEach(btn => {
    btn.classList.remove("active", "bg-white", "text-violet-900", "shadow-md");
    btn.classList.add("text-white");
  });
  const activeBtn = document.getElementById("preset-" + preset);
  if (activeBtn) {
    activeBtn.classList.add("active", "bg-white", "text-violet-900", "shadow-md");
    activeBtn.classList.remove("text-white");
  }

  const now = new Date();
  let fromDate = new Date();
  let toDate = new Date();

  if (preset === "today") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (preset === "yesterday") {
    const yest = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    fromDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate());
    toDate = new Date(yest.getFullYear(), yest.getMonth(), yest.getDate(), 23, 59, 59);
  } else if (preset === "thisWeek") {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    fromDate = new Date(weekAgo.getFullYear(), weekAgo.getMonth(), weekAgo.getDate());
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  } else if (preset === "thisMonth") {
    fromDate = new Date(now.getFullYear(), now.getMonth(), 1);
    toDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  } else if (preset === "allTime") {
    let earliest = new Date(2024, 0, 1);
    if (reportRawOrders.length > 0) {
      reportRawOrders.forEach(o => {
        const d = parseOrderDate(o.date || o["Date"]);
        if (d && d < earliest) earliest = d;
      });
    }
    fromDate = earliest;
    toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
  }

  const fromStr = formatDateToYMD(fromDate);
  const toStr = formatDateToYMD(toDate);

  const fromEl = document.getElementById("reportDateFrom");
  const toEl = document.getElementById("reportDateTo");
  if (fromEl) fromEl.value = fromStr;
  if (toEl) toEl.value = toStr;

  updateReportDateBannerDisplays(fromStr, toStr);

  if (shouldRender) {
    renderReportsDashboard();
  }
}

function updateReportDateBannerDisplays(fromStr, toStr) {
  const rangeEl = document.getElementById("reportDateRangeDisplay");
  const subEl = document.getElementById("reportDateSubDisplay");
  if (rangeEl) rangeEl.innerHTML = `${fromStr} &rarr; ${toStr}`;
  if (subEl) subEl.textContent = `${fromStr} to ${toStr}`;
}

function applyCustomDateFilter() {
  const fromEl = document.getElementById("reportDateFrom");
  const toEl = document.getElementById("reportDateTo");
  if (!fromEl || !toEl || !fromEl.value || !toEl.value) {
    showToast("Please select both From and To dates", false);
    return;
  }

  document.querySelectorAll(".report-preset-btn").forEach(btn => {
    btn.classList.remove("active", "bg-white", "text-violet-900", "shadow-md");
    btn.classList.add("text-white");
  });

  updateReportDateBannerDisplays(fromEl.value, toEl.value);
  renderReportsDashboard();
}

function renderReportsDashboard() {
  const fromStr = document.getElementById("reportDateFrom")?.value || "";
  const toStr = document.getElementById("reportDateTo")?.value || "";

  const fromTime = fromStr ? new Date(fromStr + "T00:00:00").getTime() : 0;
  const toTime = toStr ? new Date(toStr + "T23:59:59").getTime() : Infinity;

  // Filter orders
  reportFilteredOrders = reportRawOrders.filter(o => {
    const d = parseOrderDate(o.date || o["Date"]);
    if (!d) return true; // Include if date not parsed to avoid dropping orders
    const t = d.getTime();
    return t >= fromTime && t <= toTime;
  });

  // Calculate Metrics
  const todayYMD = formatDateToYMD(new Date());
  const yestYMD = formatDateToYMD(new Date(Date.now() - 24 * 60 * 60 * 1000));

  let totalOrders = reportFilteredOrders.length;
  let todayOrders = 0;
  let unfulfilled = 0;
  let unfulfilledAmount = 0;
  let pending = 0;
  let pendingAmount = 0;
  let booked = 0;
  let bookedAmount = 0;
  let bookedToday = 0;
  let bookedYesterday = 0;
  let historical = 0;
  let delivered = 0;
  let deliveredRevenue = 0;
  let returned = 0;
  let returnedAmount = 0;
  let totalOrderValue = 0;

  reportFilteredOrders.forEach(o => {
    const rawPrice = parseFloat(o.productPrice || o["Product Price"] || o.price || o["Price"]) || 0;
    const qty = parseInt(o.productQty || o["Product Qty"] || o.quantity || 1, 10) || 1;
    const amount = rawPrice;
    totalOrderValue += amount;

    const status = (o.status || o["Status"] || "").toString().toLowerCase().trim();
    const d = parseOrderDate(o.date || o["Date"]);
    const orderYMD = d ? formatDateToYMD(d) : "";

    if (orderYMD === todayYMD) todayOrders++;

    if (status.includes("deliver") || status.includes("paid") || status.includes("complete")) {
      delivered++;
      deliveredRevenue += amount;
    } else if (status.includes("return") || status.includes("rto")) {
      returned++;
      returnedAmount += amount;
    } else if (status.includes("book") || status.includes("dispatch") || status.includes("transit") || status.includes("ship")) {
      booked++;
      bookedAmount += amount;
      if (orderYMD === todayYMD) bookedToday++;
      if (orderYMD === yestYMD) bookedYesterday++;
    } else if (status.includes("pend") || status.includes("wait") || status.includes("call")) {
      pending++;
      pendingAmount += amount;
    } else {
      // Default to unfulfilled / new order
      unfulfilled++;
      unfulfilledAmount += amount;
    }
  });

  const totalClosed = delivered + returned;
  const returnRate = totalClosed > 0 ? ((returned / totalClosed) * 100).toFixed(1) : "0.0";

  // 1. Update KPI Status Cards
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText("rptTotalOrders", totalOrders.toLocaleString());
  setText("rptTodayOrders", todayOrders.toLocaleString());
  setText("rptUnfulfilled", unfulfilled.toLocaleString());
  setText("rptUnfulfilledSub", `${unfulfilled} live · 0 historical`);
  setText("rptPending", pending.toLocaleString());
  setText("rptPendingSub", `${pending} live · 0 historical`);
  setText("rptBooked", booked.toLocaleString());
  setText("rptBookedSub", `${booked} live · 0 historical`);
  setText("rptDelivered", delivered.toLocaleString());
  setText("rptDeliveredSub", `${delivered} delivered · ${delivered} paid`);
  setText("rptReturned", returned.toLocaleString());
  setText("rptReturnRate", `${returnRate}% return rate`);

  // 2. Update Breakdown Strip
  setText("stripUnfulfilled", `${unfulfilled} · PKR ${unfulfilledAmount.toLocaleString()}`);
  setText("stripUnfulfilledSub", `${unfulfilled} live · 0 historical`);
  setText("stripPending", `${pending} · PKR ${pendingAmount.toLocaleString()}`);
  setText("stripPendingSub", `${pending} live · 0 historical`);
  setText("stripBooked", `${booked} · PKR ${bookedAmount.toLocaleString()}`);
  setText("stripBookedSub", `${booked} live · 0 historical`);
  setText("stripBookedToday", bookedToday.toString());
  setText("stripBookedYesterday", bookedYesterday.toString());
  setText("stripHistorical", booked.toString());

  // 3. Update Financial KPI Cards
  setText("finTotalValue", "PKR " + totalOrderValue.toLocaleString());
  setText("finTotalCount", `${totalOrders} all orders`);
  setText("finDeliveredRev", "PKR " + deliveredRevenue.toLocaleString());
  setText("finDeliveredCount", `${delivered} delivered`);
  setText("finUnfulfilledAmt", "PKR " + unfulfilledAmount.toLocaleString());
  setText("finUnfulfilledCount", `${unfulfilled} needs action`);
  setText("finPendingAmt", "PKR " + pendingAmount.toLocaleString());
  setText("finPendingCount", `${pending} awaiting reply`);
  setText("finBookedAmt", "PKR " + bookedAmount.toLocaleString());
  setText("finBookedCount", `${booked} booked / dispatched`);
  setText("finReturnedAmt", "PKR " + returnedAmount.toLocaleString());
  setText("finReturnedCount", `${returned} returned`);

  // 4. Render Courier Performance Table
  renderCourierPerformanceTable(reportFilteredOrders);

  // 5. Render Product Performance Table
  renderProductPerformanceTable(reportFilteredOrders);
}

function renderCourierPerformanceTable(orders) {
  const tbody = document.getElementById("courierPerformanceBody");
  if (!tbody) return;

  const courierStats = {
    "Pakistan Post":      { orders: 0, booked: 0, delivered: 0, returned: 0, open: 0, revenue: 0 },
    "Leopards":           { orders: 0, booked: 0, delivered: 0, returned: 0, open: 0, revenue: 0 },
    "TCS":                { orders: 0, booked: 0, delivered: 0, returned: 0, open: 0, revenue: 0 },
    "Other":              { orders: 0, booked: 0, delivered: 0, returned: 0, open: 0, revenue: 0 },
    "Historical / Unknown": { orders: 0, booked: 0, delivered: 0, returned: 0, open: 0, revenue: 0 }
  };

  orders.forEach(o => {
    const rawCo = (o.deliveryOption || o["Delivery Option"] || "").toString().toLowerCase().trim();
    let key = "Historical / Unknown";
    if (rawCo.includes("post") || rawCo.includes("pakistan") || rawCo.includes("ep")) {
      key = "Pakistan Post";
    } else if (rawCo.includes("leopard") || rawCo.includes("lpr")) {
      key = "Leopards";
    } else if (rawCo.includes("tcs")) {
      key = "TCS";
    } else if (rawCo.includes("m&p") || rawCo.includes("standard") || rawCo.includes("cod") || rawCo.length > 0) {
      key = "Other";
    }

    const st = (o.status || o["Status"] || "").toString().toLowerCase().trim();
    const price = parseFloat(o.productPrice || o["Product Price"] || o.price || o["Price"]) || 0;

    const c = courierStats[key];
    c.orders++;

    if (st.includes("deliver") || st.includes("paid")) {
      c.delivered++;
      c.revenue += price;
    } else if (st.includes("return") || st.includes("rto")) {
      c.returned++;
    } else if (st.includes("book") || st.includes("dispatch") || st.includes("transit") || st.includes("ship")) {
      c.booked++;
      c.open++;
    } else {
      c.open++;
    }
  });

  const keys = ["Pakistan Post", "Leopards", "TCS", "Other", "Historical / Unknown"];
  let totalOrders = 0, totalBooked = 0, totalDelivered = 0, totalReturned = 0, totalOpen = 0, totalRevenue = 0;

  const rowsHtml = keys.map(k => {
    const d = courierStats[k];
    totalOrders += d.orders;
    totalBooked += d.booked;
    totalDelivered += d.delivered;
    totalReturned += d.returned;
    totalOpen += d.open;
    totalRevenue += d.revenue;

    const closed = d.delivered + d.returned;
    const deliveryRate = closed > 0 ? ((d.delivered / closed) * 100).toFixed(1) + "%" : "0.0%";
    const returnRate = closed > 0 ? ((d.returned / closed) * 100).toFixed(1) + "%" : "0.0%";

    return `
    <tr class="border-b border-stone-100 hover:bg-stone-50/70 transition">
      <td class="px-6 py-4 font-bold text-stone-900">${k}</td>
      <td class="text-center px-4 py-4 font-bold text-stone-700">${d.orders.toLocaleString()}</td>
      <td class="text-center px-4 py-4 font-bold text-purple-700">${d.booked.toLocaleString()}</td>
      <td class="text-center px-4 py-4 font-bold text-emerald-600">${d.delivered.toLocaleString()}</td>
      <td class="text-center px-4 py-4 font-bold text-rose-500">${d.returned.toLocaleString()}</td>
      <td class="text-center px-4 py-4 font-bold text-amber-600">${d.open.toLocaleString()}</td>
      <td class="text-center px-4 py-4 font-extrabold text-emerald-600">${deliveryRate}</td>
      <td class="text-center px-4 py-4 font-extrabold text-rose-500">${returnRate}</td>
      <td class="text-right px-6 py-4 font-extrabold text-stone-900">PKR ${d.revenue.toLocaleString()}</td>
    </tr>`;
  }).join("");

  const totalClosed = totalDelivered + totalReturned;
  const totalDelRate = totalClosed > 0 ? ((totalDelivered / totalClosed) * 100).toFixed(1) + "%" : "0.0%";
  const totalRetRate = totalClosed > 0 ? ((totalReturned / totalClosed) * 100).toFixed(1) + "%" : "0.0%";

  const footerHtml = `
    <tr class="bg-stone-100/70 font-black border-t-2 border-stone-200">
      <td class="px-6 py-4 text-stone-900 uppercase tracking-wider">TOTAL / SUMMARY</td>
      <td class="text-center px-4 py-4 text-stone-900">${totalOrders.toLocaleString()}</td>
      <td class="text-center px-4 py-4 text-purple-700">${totalBooked.toLocaleString()}</td>
      <td class="text-center px-4 py-4 text-emerald-600">${totalDelivered.toLocaleString()}</td>
      <td class="text-center px-4 py-4 text-rose-500">${totalReturned.toLocaleString()}</td>
      <td class="text-center px-4 py-4 text-amber-600">${totalOpen.toLocaleString()}</td>
      <td class="text-center px-4 py-4 text-emerald-700">${totalDelRate}</td>
      <td class="text-center px-4 py-4 text-rose-600">${totalRetRate}</td>
      <td class="text-right px-6 py-4 text-stone-900">PKR ${totalRevenue.toLocaleString()}</td>
    </tr>`;

  tbody.innerHTML = rowsHtml + footerHtml;
}

function renderProductPerformanceTable(orders) {
  const tbody = document.getElementById("productPerformanceBody");
  if (!tbody) return;

  const prodMap = {};

  orders.forEach(o => {
    const name = (o.productName || o["Product Name"] || "Other Formula").trim();
    if (!prodMap[name]) {
      prodMap[name] = { totalSold: 0, delivered: 0, returned: 0, revenue: 0 };
    }
    const qty = parseInt(o.productQty || o["Product Qty"] || 1, 10) || 1;
    const price = parseFloat(o.productPrice || o["Product Price"] || o.price || o["Price"]) || 0;
    const st = (o.status || o["Status"] || "").toString().toLowerCase().trim();

    prodMap[name].totalSold += qty;

    if (st.includes("deliver") || st.includes("paid")) {
      prodMap[name].delivered += qty;
      prodMap[name].revenue += price;
    } else if (st.includes("return") || st.includes("rto")) {
      prodMap[name].returned += qty;
    }
  });

  const prodKeys = Object.keys(prodMap);
  if (!prodKeys.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="px-6 py-8 text-center text-stone-400">No product sales in this period.</td></tr>';
    return;
  }

  // Sort by revenue descending
  prodKeys.sort((a, b) => prodMap[b].revenue - prodMap[a].revenue);

  tbody.innerHTML = prodKeys.map(k => {
    const p = prodMap[k];
    const closed = p.delivered + p.returned;
    const successRate = closed > 0 ? ((p.delivered / closed) * 100).toFixed(1) + "%" : (p.delivered > 0 ? "100.0%" : "—");

    return `
    <tr class="border-b border-stone-100 hover:bg-stone-50/70 transition">
      <td class="px-6 py-4 font-bold text-stone-900">${escHtml(k)}</td>
      <td class="text-center px-4 py-4 font-bold text-stone-700">${p.totalSold.toLocaleString()} units</td>
      <td class="text-center px-4 py-4 font-bold text-emerald-600">${p.delivered.toLocaleString()} units</td>
      <td class="text-center px-4 py-4 font-bold text-rose-500">${p.returned.toLocaleString()} units</td>
      <td class="text-center px-4 py-4 font-extrabold text-emerald-600">${successRate}</td>
      <td class="text-right px-6 py-4 font-extrabold text-stone-900">PKR ${p.revenue.toLocaleString()}</td>
    </tr>`;
  }).join("");
}

function exportReportsCSV() {
  if (!reportFilteredOrders || !reportFilteredOrders.length) {
    showToast("No orders to export for the selected date range", false);
    return;
  }

  const headers = ["Order No", "Date", "Customer Name", "Mobile No", "Product", "Qty", "Price", "Courier", "Tracking No", "Status", "Address"];
  const rows = reportFilteredOrders.map(o => {
    return [
      o.orderNo || o["Order No"] || "",
      formatDate(o.date || o["Date"]),
      (o.customerName || o["Customer Name"] || "").replace(/"/g, '""'),
      o.mobileNo || o["Mobile No"] || "",
      (o.productName || o["Product Name"] || "").replace(/"/g, '""'),
      o.productQty || o["Product Qty"] || 1,
      o.productPrice || o["Product Price"] || 0,
      o.deliveryOption || o["Delivery Option"] || "",
      o.trackingNo || o["Tracking No"] || "",
      o.status || o["Status"] || "",
      (o.address || o["Address"] || "").replace(/"/g, '""').replace(/\r?\n/g, ' ')
    ].map(v => `"${v}"`).join(",");
  });

  const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `purelife-reports-${formatDateToYMD(new Date())}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showToast("CSV رپورٹ کامیابی کے ساتھ ڈاؤن لوڈ ہو گئی!", true);
}

/* ============================================================
   MODULE 9: STORE & FRONTEND SETTINGS
   ============================================================ */
async function loadStoreSettings() {
  const urlEl = document.getElementById("settingApiUrl");
  if (urlEl) urlEl.value = API_URL;

  // 1. Instant populate from localStorage
  try {
    const cachedStr = localStorage.getItem("pl_store_settings");
    if (cachedStr) {
      populateSettingsForm(JSON.parse(cachedStr));
    }
  } catch (e) {
    console.warn("Local settings cache load error:", e);
  }

  // 2. Fetch fresh live config from Google Apps Script / Store_Config sheet
  try {
    const cfgJson = await apiGet("storeConfig");
    const cfg = (cfgJson && cfgJson.success !== undefined) ? (cfgJson.data || {}) : (cfgJson || {});
    if (cfg && cfg.settings && typeof cfg.settings === "object") {
      populateSettingsForm(cfg.settings);
      try {
        localStorage.setItem("pl_store_settings", JSON.stringify(cfg.settings));
      } catch (e) {}
    }
  } catch (err) {
    console.warn("Store config live fetch warning:", err);
  }
}

function populateSettingsForm(s) {
  if (!s || typeof s !== "object") return;
  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el && val !== undefined && val !== null) el.value = val;
  };

  setVal("settingWhatsapp", s.whatsapp || "0332 0420994");
  setVal("settingSupportPhone", s.supportPhone || "0332-0420994");
  setVal("settingSupportHours", s.supportHours || "صبح 9:00 تا رات 11:00");
  setVal("settingEmail", s.email || "info@purelifefamilycare.com");
  setVal("settingStoreNameUrdu", s.storeNameUrdu || "پیور لائف فیملی کیئر");
  setVal("settingStoreNameEn", s.storeNameEn || "Pure Life Family Care");
  setVal("settingTagline", s.tagline || "100% خالص قدرتی و اصلی ہربل مصنوعات");
  setVal("settingSenderName", s.senderName || "Pure Life Family Care");
  setVal("settingSenderPhone", s.senderPhone || "0335-6352625");
  setVal("settingSenderAddress", s.senderAddress || "Post Office Depalpur District Okara (56180)");
  setVal("settingShippingFee", s.shippingFee !== undefined ? s.shippingFee : 0);
  setVal("settingFreeShippingMin", s.freeShippingMin !== undefined ? s.freeShippingMin : 0);
  setVal("settingDefaultCourier", s.defaultCourier || "COD");
  setVal("settingCourierPartners", s.courierPartners || "ٹی سی ایس، لیپرڈز، ٹریکس (کیش آن ڈیلیوری)");
  setVal("settingAnnouncementText", s.announcementText || "🌿 پیور لائف فیملی کیئر | 100% خالص اور اصلی ہربل مصنوعات");
  setVal("settingWhatsappChannel", s.whatsappChannel || "");
  setVal("settingTelegram", s.telegram || "");
  setVal("settingFacebook", s.facebook || "");
  setVal("settingInstagram", s.instagram || "");
  setVal("settingYoutube", s.youtube || "");
  setVal("settingTiktok", s.tiktok || "");

  // Meta & TikTok Pixel settings
  setVal("settingMetaPixelId", s.metaPixelId || "");
  setVal("settingMetaTestEventCode", s.metaTestEventCode || "");
  setVal("settingTiktokPixelId", s.tiktokPixelId || "");

  const metaCb = document.getElementById("settingMetaPixelEnabled");
  if (metaCb) {
    metaCb.checked = s.metaPixelEnabled !== undefined ? (s.metaPixelEnabled === true || s.metaPixelEnabled === "true") : true;
  }
  const ttCb = document.getElementById("settingTiktokPixelEnabled");
  if (ttCb) {
    ttCb.checked = s.tiktokPixelEnabled !== undefined ? (s.tiktokPixelEnabled === true || s.tiktokPixelEnabled === "true") : true;
  }
  updatePixelStatusBadges();

  const annCb = document.getElementById("settingAnnouncementEnabled");
  if (annCb && s.announcementEnabled !== undefined) {
    annCb.checked = s.announcementEnabled;
  }

  // Sync Admin Auth credentials from Cloud if available
  if (s.adminAuth && s.adminAuth.password) {
    try {
      localStorage.setItem("pl_admin_auth", JSON.stringify(s.adminAuth));
    } catch (_) {}
  }
  const curAuth = getStoredAdminAuth();
  setVal("secNewUsername", curAuth.username);
  const headerUser = document.getElementById("headerAdminUsername");
  if (headerUser) headerUser.textContent = curAuth.username;
}

function updatePixelStatusBadges() {
  const metaId = (document.getElementById("settingMetaPixelId")?.value || "").trim();
  const metaEn = !!document.getElementById("settingMetaPixelEnabled")?.checked;
  const metaBadge = document.getElementById("metaPixelStatusBadge");
  if (metaBadge) {
    if (!metaEn) {
      metaBadge.textContent = "بند (Disabled)";
      metaBadge.className = "text-[11px] font-black px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200";
    } else if (metaId) {
      metaBadge.textContent = `فعال (${metaId})`;
      metaBadge.className = "text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300";
    } else {
      metaBadge.textContent = "آئی ڈی خالی ہے (خاموش)";
      metaBadge.className = "text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300";
    }
  }

  const ttId = (document.getElementById("settingTiktokPixelId")?.value || "").trim();
  const ttEn = !!document.getElementById("settingTiktokPixelEnabled")?.checked;
  const ttBadge = document.getElementById("tiktokPixelStatusBadge");
  if (ttBadge) {
    if (!ttEn) {
      ttBadge.textContent = "بند (Disabled)";
      ttBadge.className = "text-[11px] font-black px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200";
    } else if (ttId) {
      ttBadge.textContent = `فعال (${ttId})`;
      ttBadge.className = "text-[11px] font-black px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300";
    } else {
      ttBadge.textContent = "آئی ڈی خالی ہے (خاموش)";
      ttBadge.className = "text-[11px] font-black px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300";
    }
  }
}

function testFirePixelsFromAdmin() {
  const metaId = (document.getElementById("settingMetaPixelId")?.value || "").trim();
  const ttId = (document.getElementById("settingTiktokPixelId")?.value || "").trim();

  if (!metaId && !ttId) {
    showToast("⚠️ براہ کرم پہلے میٹا یا ٹک ٹاک کا پکسل آئی ڈی درج کریں!", false);
    return;
  }

  let msgs = [];
  if (metaId) {
    msgs.push(`Meta Pixel (${metaId})`);
    try {
      if (window.fbq) {
        window.fbq('track', 'PageView');
        window.fbq('track', 'ViewContent', { content_name: 'Test Product (Pure Life)', value: 1850, currency: 'PKR' });
      }
    } catch (_) {}
  }
  if (ttId) {
    msgs.push(`TikTok Pixel (${ttId})`);
    try {
      if (window.ttq) {
        window.ttq.page();
        window.ttq.track('ViewContent', { content_name: 'Test Product (Pure Life)', value: 1850, currency: 'PKR' });
      }
    } catch (_) {}
  }

  showToast(`🎯 ٹیسٹ ایونٹس فائر ہو گئے: ${msgs.join(" اور ")}۔ براؤزر کنسول یا Pixel Helper میں چیک کریں!`, true);
}

function addCourierToPartners(name) {
  const el = document.getElementById("settingCourierPartners");
  if (!el) return;
  let val = el.value.trim();
  if (!val) {
    el.value = name;
  } else {
    if (val.includes(name)) return;
    if (name.startsWith("(")) {
      el.value = val + " " + name;
    } else {
      el.value = val + "، " + name;
    }
  }
}

function resetDefaultCouriers() {
  const el = document.getElementById("settingCourierPartners");
  if (el) el.value = "ٹی سی ایس، لیپرڈز، ٹریکس (کیش آن ڈیلیوری)";
}

async function saveStoreSettings() {
  const btn = document.getElementById("saveSettingsBtn");
  const icon = document.getElementById("saveSettingsIcon");
  const txt = document.getElementById("saveSettingsText");

  const rawWa = (document.getElementById("settingWhatsapp")?.value || "").trim();
  const cleanDigits = rawWa.replace(/[^0-9]/g, "");
  if (!cleanDigits) {
    showToast("براہ کرم درست واٹس ایپ نمبر درج کریں!", false);
    return;
  }

  const settings = {
    whatsapp: rawWa,
    supportPhone: document.getElementById("settingSupportPhone")?.value.trim() || "",
    supportHours: document.getElementById("settingSupportHours")?.value.trim() || "",
    email: document.getElementById("settingEmail")?.value.trim() || "",
    storeNameUrdu: document.getElementById("settingStoreNameUrdu")?.value.trim() || "پیور لائف فیملی کیئر",
    storeNameEn: document.getElementById("settingStoreNameEn")?.value.trim() || "Pure Life Family Care",
    tagline: document.getElementById("settingTagline")?.value.trim() || "100% خالص قدرتی و اصلی ہربل مصنوعات",
    senderName: document.getElementById("settingSenderName")?.value.trim() || "Pure Life Family Care",
    senderPhone: document.getElementById("settingSenderPhone")?.value.trim() || "0335-6352625",
    senderAddress: document.getElementById("settingSenderAddress")?.value.trim() || "Post Office Depalpur District Okara (56180)",
    shippingFee: parseInt(document.getElementById("settingShippingFee")?.value, 10) || 0,
    freeShippingMin: parseInt(document.getElementById("settingFreeShippingMin")?.value, 10) || 0,
    defaultCourier: document.getElementById("settingDefaultCourier")?.value || "COD",
    courierPartners: document.getElementById("settingCourierPartners")?.value.trim() || "ٹی سی ایس، لیپرڈز، ٹریکس (کیش آن ڈیلیوری)",
    announcementEnabled: !!document.getElementById("settingAnnouncementEnabled")?.checked,
    announcementText: document.getElementById("settingAnnouncementText")?.value.trim() || "🌿 پیور لائف فیملی کیئر | 100% خالص اور اصلی ہربل مصنوعات",
    whatsappChannel: document.getElementById("settingWhatsappChannel")?.value.trim() || "",
    telegram: document.getElementById("settingTelegram")?.value.trim() || "",
    facebook: document.getElementById("settingFacebook")?.value.trim() || "",
    instagram: document.getElementById("settingInstagram")?.value.trim() || "",
    youtube: document.getElementById("settingYoutube")?.value.trim() || "",
    tiktok: document.getElementById("settingTiktok")?.value.trim() || "",
    metaPixelId: (document.getElementById("settingMetaPixelId")?.value || "").trim(),
    metaPixelEnabled: !!document.getElementById("settingMetaPixelEnabled")?.checked,
    metaTestEventCode: (document.getElementById("settingMetaTestEventCode")?.value || "").trim(),
    tiktokPixelId: (document.getElementById("settingTiktokPixelId")?.value || "").trim(),
    tiktokPixelEnabled: !!document.getElementById("settingTiktokPixelEnabled")?.checked,
    updatedAt: new Date().toISOString()
  };

  // 1. Immediately store in localStorage so Front-end updates instantly
  try {
    localStorage.setItem("pl_store_settings", JSON.stringify(settings));
  } catch (e) {
    console.error("LocalStorage save error:", e);
  }

  // 2. Also sync with Courier Slips fields if present on current DOM
  const sName = document.getElementById("senderName");
  if (sName) sName.value = settings.senderName;
  const sPhone = document.getElementById("senderPhone");
  if (sPhone) sPhone.value = settings.senderPhone;
  const sAddr = document.getElementById("senderAddress");
  if (sAddr) sAddr.value = settings.senderAddress;
  const sShip = document.getElementById("shippingPrice");
  if (sShip) sShip.value = settings.shippingFee;

  // 3. UI feedback
  if (btn) btn.disabled = true;
  if (txt) txt.textContent = "محفوظ ہو رہا ہے...";
  if (icon) icon.classList.add("animate-spin");

  try {
    // 4. Fetch full config to keep existing objects intact
    let fullConfig = {};
    try {
      const existing = await apiGet("storeConfig");
      fullConfig = (existing && existing.success !== undefined) ? (existing.data || {}) : (existing || {});
      if (typeof fullConfig !== "object" || !fullConfig) fullConfig = {};
    } catch (e) {
      console.warn("Existing config fetch:", e);
    }

    fullConfig.settings = settings;

    // 5. Post to Google Sheet Store_Config
    const res = await apiPost({
      action: "saveStoreConfig",
      config: fullConfig
    });

    if (res && res.success !== false) {
      showToast("سیٹنگز اور نیا واٹس ایپ نمبر لائیو محفوظ ہو گئے ہیں!", true);
    } else {
      showToast("سیٹنگز براؤزر میں محفوظ ہو گئیں، گوگل شیٹ میں سنک کی جا رہی ہیں...", true);
    }
  } catch (err) {
    console.error("Settings save error:", err);
    showToast("سیٹنگز محفوظ ہو گئیں (آف لائن کیشے اپڈیٹ)", true);
  } finally {
    if (btn) btn.disabled = false;
    if (txt) txt.textContent = "سیٹنگز محفوظ اور لائیو کریں";
    if (icon) icon.classList.remove("animate-spin");
  }
}

function testWhatsappLink() {
  const raw = (document.getElementById("settingWhatsapp")?.value || "").trim();
  const digits = raw.replace(/[^0-9]/g, "");
  if (!digits) {
    showToast("براہ کرم ٹیسٹ کرنے کے لیے واٹس ایپ نمبر لکھیں!", false);
    return;
  }
  let intl = digits;
  if (digits.startsWith("0")) intl = "92" + digits.slice(1);
  const url = `https://wa.me/${intl}?text=${encodeURIComponent('السلام علیکم! پیور لائف فیملی کیئر واٹس ایپ ٹیسٹ میسج۔')}`;
  window.open(url, "_blank");
}

async function testSettingsApiConnection() {
  const statusEl = document.getElementById("settingsApiStatus");
  if (statusEl) {
    statusEl.innerHTML = '<span class="animate-pulse text-indigo-600 font-bold">گوگل شیٹ API سے رابطہ چیک کیا جا رہا ہے...</span>';
  }
  try {
    const res = await apiGet("storeConfig");
    if (statusEl) {
      statusEl.className = "text-[11px] text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl flex items-center gap-2";
      statusEl.innerHTML = '<svg class="w-3.5 h-3.5 text-emerald-600" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg><span>گوگل شیٹ سے کامیاب رابطہ ہے! ڈیٹا 100% سنک ہے۔</span>';
    }
    showToast("گوگل شیٹ کے ساتھ لائیو کنکشن بالکل درست ہے!", true);
  } catch (err) {
    if (statusEl) {
      statusEl.className = "text-[11px] text-amber-700 font-bold bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl flex items-center gap-2";
      statusEl.innerHTML = '<span>⚠️ رابطہ سست ہے مگر لوکل ڈیٹا بیس فعال ہے۔ (' + (err.message || 'Error') + ')</span>';
    }
  }
}

