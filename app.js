const sb = supabase.createClient(window.KLTF_CONFIG.SUPABASE_URL, window.KLTF_CONFIG.SUPABASE_ANON_KEY);

let profile = null;
let activeView = "summary";
let charts = {}; // active Chart.js instances, so we can destroy on re-render
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

// ---------- toast ----------
function toast(msg, isError = false) {
  const el = $("#toast");
  el.textContent = msg;
  el.className = "toast" + (isError ? " error" : "");
  setTimeout(() => el.classList.add("hidden"), 3000);
  el.classList.remove("hidden");
}
function fmtRM(n) { return "RM " + Number(n || 0).toLocaleString("en-MY", { minimumFractionDigits: 2 }); }
function todayStr() { return new Date().toISOString().slice(0, 10); }

// ---------- combo-select helpers ----------
// Renders a <select> + a hidden manual <input> for the same field.
// The <select> uses name "__NAME_combo" so FormData only picks up the
// real <input name="NAME"> whose display is toggled by JS.
function comboSelectHTML(name, options, placeholder = "— select —") {
  const opts = options.map(o => {
    const val = typeof o === "object" ? o.name : o;
    return `<option value="${val}">${val}</option>`;
  }).join("");
  return `<div class="combo-wrap" data-combo="${name}">
    <select name="__${name}_combo" class="combo-select">
      <option value="">${placeholder}</option>
      ${opts}
      <option value="__manual__">✏ Type manually…</option>
    </select>
    <input type="text" name="${name}" class="combo-manual" placeholder="Enter custom value…" style="display:none" />
  </div>`;
}

// Wire up toggle behaviour for every combo-wrap inside container.
function initComboSelects(container) {
  (container || document).querySelectorAll('.combo-wrap').forEach(wrap => {
    const sel = wrap.querySelector('.combo-select');
    const inp = wrap.querySelector('.combo-manual');
    if (!sel || !inp) return;
    const name = wrap.dataset.combo;
    sel.addEventListener('change', () => {
      if (sel.value === '__manual__') {
        inp.style.display = '';
        inp.required = sel.closest('label, form') ? false : false; // manual input optional unless parent required
        inp.focus();
        // Remove the select's name so FormData only reads the text input
        sel.name = `__${name}_combo_disabled`;
        inp.name = name;
      } else {
        inp.style.display = 'none';
        inp.value = '';
        sel.name = `__${name}_combo`;
        inp.name = name;
        // Mirror select value into the text input so FormData picks up correct value
        inp.value = sel.value;
      }
    });
    // Ensure initial mirror on load
    if (sel.value && sel.value !== '__manual__') inp.value = sel.value;
  });
}

// Fill-back a combo field when editing: if value matches an option use the
// select, otherwise switch to manual input.
function setComboValue(container, name, value) {
  const wrap = container.querySelector(`.combo-wrap[data-combo="${name}"]`);
  if (!wrap) {
    // Fallback for plain selects that haven't been converted
    const el = container.querySelector(`[name="${name}"]`);
    if (el) el.value = value || '';
    return;
  }
  const sel = wrap.querySelector('.combo-select');
  const inp = wrap.querySelector('.combo-manual');
  if (!sel || !inp) return;
  // Check if value is one of the preset options
  const match = [...sel.options].find(o => o.value === value && o.value !== '__manual__' && o.value !== '');
  if (match) {
    sel.value = value;
    sel.name = `__${name}_combo`;
    inp.name = name;
    inp.value = value;
    inp.style.display = 'none';
  } else {
    // Switch to manual mode
    sel.value = '__manual__';
    sel.name = `__${name}_combo_disabled`;
    inp.name = name;
    inp.value = value || '';
    inp.style.display = '';
  }
}

// ---------- stat-card icons ----------
const ICONS = {
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="3"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V7a2 2 0 0 0-2-2H5a2 2 0 0 0 0 4h15a2 2 0 0 1 2 2v3"/><path d="M20 12v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7"/><circle cx="17" cy="14" r="1.3"/></svg>',
  trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>',
  trendDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l6 6 4-4 8 8"/><path d="M15 17h6v-6"/></svg>',
  scale: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v18M5 7l-3 6a3 3 0 0 0 6 0zM19 7l-3 6a3 3 0 0 0 6 0zM5 7h14M7 21h10"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
  piggy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z"/><path d="M2 10c0-2.8 2.7-5 6-5 1 0 2 .2 2.8.6.6-.4 1.4-.6 2.2-.6 2.5 0 4.6 1.4 5.6 3.4H20a2 2 0 0 1 2 2v1l-2 1v2l-2 1v2h-3v-2H9a5 5 0 0 1-3-1l-2 1v-3.3C2.7 12.7 2 11.4 2 10z"/><path d="M7 10h.01M9 16v2"/></svg>',
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>'
};
function statCard(label, value, cls, icon, tone) {
  return `<div class="stat-card">
    <div class="stat-icon ${tone || "neutral"}">${ICONS[icon] || ""}</div>
    <div class="stat-label">${label}</div>
    <div class="stat-value ${cls || ""}">${value}</div>
  </div>`;
}

// Fire-and-forget: notify by email via the send-notification Edge Function.
// Never blocks the UI and never surfaces its own errors as a toast (email
// failures shouldn't stop a form submission, same as the old Apps Script _sendEmail).
async function notifyEntry(type, row) {
  try {
    await sb.functions.invoke("send-notification", { body: { type, row } });
  } catch (err) {
    console.warn("Notification email failed (non-blocking):", err);
  }
}

// Fire-and-forget audit trail write. Never blocks the UI or the save it followed.
async function writeAudit(action, details) {
  try {
    await sb.from("audit_log").insert({ action, details: details || null });
  } catch (err) {
    console.warn("Audit log write failed (non-blocking):", err);
  }
}

// ---------- auth ----------
$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) { $("#loginError").textContent = error.message; return; }
  await bootAfterLogin();
});

$("#logoutBtn").addEventListener("click", async () => {
  await sb.auth.signOut();
  location.reload();
});

async function bootAfterLogin() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return;
  const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).single();
  if (error) { toast("Could not load profile: " + error.message, true); return; }
  profile = data;
  $("#loginScreen").classList.add("hidden");
  $("#appShell").classList.remove("hidden");
  $("#userRoleLabel").textContent = profile.role.charAt(0).toUpperCase() + profile.role.slice(1);
  if (profile.role !== "admin") {
    $("#navSettings").classList.add("hidden");
    $("#navUsers").classList.add("hidden");
  } else {
    $("#navSettings").classList.remove("hidden");
    $("#navUsers").classList.remove("hidden");
  }
  if (profile.role === "viewer") {
    $$(".nav-item").forEach(n => {
      if (!["summary", "statement"].includes(n.dataset.view)) n.classList.add("hidden");
    });
  }
  renderView("summary");
}

(async function init() {
  const { data: { session } } = await sb.auth.getSession();
  if (session) await bootAfterLogin();

  // "My Profile" modal event listeners
  const profileBtn = $("#profileBtn");
  if (profileBtn) {
    profileBtn.addEventListener("click", async () => {
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return toast("Not signed in", true);
      $("#profileEmailVal").textContent = user.email;
      $("#profileNameVal").textContent = profile?.full_name || "—";
      $("#profileRoleVal").textContent = profile?.role ? (profile.role.charAt(0).toUpperCase() + profile.role.slice(1)) : "—";
      $("#profileNewPass").value = "";
      $("#profileConfirmPass").value = "";
      $("#profileModal").classList.remove("hidden");
    });
  }

  const closeProfileModalBtn = $("#closeProfileModalBtn");
  if (closeProfileModalBtn) {
    closeProfileModalBtn.addEventListener("click", () => {
      $("#profileModal").classList.add("hidden");
    });
  }

  const profilePasswordForm = $("#profilePasswordForm");
  if (profilePasswordForm) {
    profilePasswordForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const newPass = $("#profileNewPass").value;
      const confirmPass = $("#profileConfirmPass").value;
      if (newPass !== confirmPass) {
        return toast("Passwords do not match", true);
      }
      const { error } = await sb.auth.updateUser({ password: newPass });
      if (error) {
        return toast("Failed to update password: " + error.message, true);
      }
      toast("Password updated successfully");
      writeAudit("Password Changed Self", { email: profile?.email });
      $("#profileModal").classList.add("hidden");
    });
  }

  // Admin Add User Modal listeners
  const closeAddUserModalBtn = $("#closeAddUserModalBtn");
  if (closeAddUserModalBtn) {
    closeAddUserModalBtn.addEventListener("click", () => {
      $("#addUserModal").classList.add("hidden");
    });
  }

  const addUserForm = $("#addUserForm");
  if (addUserForm) {
    addUserForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const full_name = $("#addUserName").value.trim();
      const email = $("#addUserEmail").value.trim();
      const role = $("#addUserRole").value;
      const password = $("#addUserPassword").value;
      
      toast("Onboarding user...");
      try {
        const { data, error } = await sb.functions.invoke("user-management", {
          body: { action: "add-user", email, password, full_name, role }
        });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);

        toast("User onboarded successfully!");
        writeAudit("User Onboarded", { email, role, name: full_name });
        $("#addUserModal").classList.add("hidden");
        if (activeView === "users") renderView("users");
      } catch (err) {
        toast("Failed to onboard user: " + err.message, true);
      }
    });
  }

  // Admin Reset User Password Modal listeners
  const closeResetPassModalBtn = $("#closeResetPassModalBtn");
  if (closeResetPassModalBtn) {
    closeResetPassModalBtn.addEventListener("click", () => {
      $("#adminResetPassModal").classList.add("hidden");
    });
  }

  const adminResetPassForm = $("#adminResetPassForm");
  if (adminResetPassForm) {
    adminResetPassForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#resetPassUserId").value;
      const email = $("#resetPassUserEmail").textContent;
      const password = $("#resetPassNewPass").value;

      toast("Resetting password...");
      try {
        const { data, error } = await sb.functions.invoke("user-management", {
          body: { action: "change-password", id, password }
        });
        if (error) throw error;
        if (data && data.error) throw new Error(data.error);

        toast("Password reset successfully!");
        writeAudit("User Password Reset by Admin", { email });
        $("#adminResetPassModal").classList.add("hidden");
      } catch (err) {
        toast("Failed to reset password: " + err.message, true);
      }
    });
  }
})();

// ---------- nav ----------
$$(".nav-item").forEach(item => {
  item.addEventListener("click", () => {
    $$(".nav-item").forEach(n => n.classList.remove("active"));
    item.classList.add("active");
    renderView(item.dataset.view);
  });
});

const VIEW_TITLES = {
  summary: ["Summary", "Current-year financial position"],
  offerings: ["Offerings", "Sunday Service & Special Offering records"],
  "offerings-records": ["All Offerings", "Full offerings history"],
  expenses: ["Expenses", "All outgoing payments"],
  "expenses-records": ["All Expenses", "Full expenses history"],
  ppf: ["Poor People Fund", "PPF collections and claims"],
  members: ["Members", "Church member directory"],
  "members-records": ["All Members", "Full member directory"],
  statement: ["Statement", "Transactions for a chosen date range — shareable & printable"],
  compare: ["Compare Years", "Side-by-side financial comparison"],
  audit: ["Audit Log", "Last 100 actions"],
  settings: ["Settings", "Fund configuration & dropdown lists"],
  users: ["User Management", "Add, delete or update user accounts and reset passwords"]
};

// Navigate to a view that isn't in the sidebar (e.g. a "View all records" page)
window.goToView = function (view) {
  $$(".nav-item").forEach(n => n.classList.remove("active"));
  const match = $(`.nav-item[data-view="${view}"]`);
  if (match) match.classList.add("active");
  renderView(view);
};

async function renderView(view) {
  activeView = view;
  Object.values(charts).forEach(c => c && c.destroy());
  charts = {};
  const [title, sub] = VIEW_TITLES[view];
  $("#viewTitle").textContent = title;
  $("#viewSubtitle").textContent = sub;
  const root = $("#viewRoot");
  root.innerHTML = "<p class='loading-text'>Loading…</p>";
  try {
    if (view === "summary") await renderSummary(root);
    else if (view === "offerings") await renderOfferings(root);
    else if (view === "offerings-records") await renderOfferingsRecords(root);
    else if (view === "expenses") await renderExpenses(root);
    else if (view === "expenses-records") await renderExpensesRecords(root);
    else if (view === "ppf") await renderPPF(root);
    else if (view === "members") await renderMembers(root);
    else if (view === "members-records") await renderMembersRecords(root);
    else if (view === "statement") await renderStatement(root);
    else if (view === "compare") await renderCompare(root);
    else if (view === "audit") await renderAudit(root);
    else if (view === "settings") await renderSettings(root);
    else if (view === "users") await renderUsers(root);
  } catch (err) {
    root.innerHTML = `<p style="color:var(--danger)">Error: ${err.message}</p>`;
  }
}

const canWrite = () => profile && (profile.role === "admin" || profile.role === "treasurer");
const isAdmin = () => profile && profile.role === "admin";

// ==================================================================
// DENOMINATION CALCULATOR (RM notes + coins)
// ==================================================================
const NOTES = [100, 50, 20, 10, 5, 1];
const COINS = [0.50, 0.20, 0.10, 0.05];

function denomCalcHTML(prefix) {
  const cell = (label, key) => `
    <div class="denom-cell">
      <label>${label}</label>
      <input type="number" min="0" step="1" data-denom="${prefix}" data-key="${key}" value="0" oninput="updateDenomTotal('${prefix}')" />
    </div>`;
  return `
    <div class="denom-box">
      <div class="denom-title">Cash Count (optional)</div>
      <div class="denom-grid">
        ${NOTES.map(n => cell("RM" + n, "N" + n)).join("")}
        ${COINS.map(c => cell((c * 100) + "c", "C" + c)).join("")}
      </div>
      <div class="denom-total">
        <span>Notes: <b id="${prefix}-notesTotal">RM 0.00</b></span>
        <span>Coins: <b id="${prefix}-coinsTotal">RM 0.00</b></span>
        <span>Total: <b id="${prefix}-grandTotal">RM 0.00</b></span>
      </div>
    </div>`;
}

window.updateDenomTotal = function (prefix) {
  let notesTotal = 0, coinsTotal = 0, tokens = [];
  NOTES.forEach(n => {
    const el = document.querySelector(`[data-denom="${prefix}"][data-key="N${n}"]`);
    const qty = Number(el?.value || 0);
    if (qty > 0) { notesTotal += qty * n; tokens.push(`RM${n}×${qty}`); }
  });
  COINS.forEach(c => {
    const el = document.querySelector(`[data-denom="${prefix}"][data-key="C${c}"]`);
    const qty = Number(el?.value || 0);
    if (qty > 0) { coinsTotal += qty * c; tokens.push(`RM${c}×${qty}`); }
  });
  const grand = notesTotal + coinsTotal;
  $(`#${prefix}-notesTotal`).textContent = fmtRM(notesTotal);
  $(`#${prefix}-coinsTotal`).textContent = fmtRM(coinsTotal);
  $(`#${prefix}-grandTotal`).textContent = fmtRM(grand);
  const amountField = document.querySelector(`[name="amount"][data-linked="${prefix}"]`);
  if (amountField && grand > 0) amountField.value = grand.toFixed(2);
  return { denomStr: tokens.join(" "), notesTotal, coinsTotal, grand };
};

function readDenom(prefix) {
  return window.updateDenomTotal(prefix);
}

function fillDenomInputs(prefix, denomStr) {
  if (!denomStr) return;
  const parts = denomStr.split(" ");
  parts.forEach(tok => {
    const m = tok.match(/^RM([\d.]+)×(\d+)$/);
    if (!m) return;
    const denom = m[1], qty = m[2];
    const key = NOTES.includes(Number(denom)) ? "N" + Number(denom) : "C" + Number(denom);
    const el = document.querySelector(`[data-denom="${prefix}"][data-key="${key}"]`);
    if (el) el.value = qty;
  });
  window.updateDenomTotal(prefix);
}

// ==================================================================
// EDIT-MODE HELPER: shared "banner" shown at top of a form when editing
// ==================================================================
function editBanner(label) {
  return `
    <div class="edit-only-block hidden">
      <div class="edit-banner">
        <span>Editing: ${label}. A reason is required — the original record is kept for audit.</span>
        <button type="button" onclick="cancelEdit()">Cancel</button>
      </div>
      <label class="full-row">Edit Reason
        <input type="text" name="edit_reason" placeholder="e.g. corrected amount" />
      </label>
    </div>
    <input type="hidden" name="group_id" />`;
}
window.cancelEdit = function () { renderView(activeView); };

function setEditTarget(form, groupId) {
  form.querySelector('[name="group_id"]').value = groupId;
  form.dataset.editing = "true";
  const block = form.querySelector(".edit-only-block");
  block.classList.remove("hidden");
  form.querySelector('[name="edit_reason"]').required = true;
}

// ================= SUMMARY (with charts + PDF export) =================
async function renderSummary(root) {
  const { data: cfg } = await sb.from("config").select("*").single();
  const defaultYear = cfg.active_financial_year;

  // Query distinct years available in database to build the year manual dropdown
  const { data: yearsList } = await sb.from("v_year_summary").select("year").order("year", { ascending: false });
  let years = (yearsList || []).map(r => Number(r.year));
  if (!years.includes(defaultYear)) {
    years.push(defaultYear);
  }
  years = Array.from(new Set(years)).sort((a, b) => b - a);

  if (!window._summarySelectedYear) {
    window._summarySelectedYear = defaultYear;
  }
  const year = window._summarySelectedYear;

  const { data: sum } = await sb.from("v_year_summary").select("*").eq("year", year).maybeSingle();
  const { data: ppf } = await sb.from("v_ppf_summary").select("*").eq("year", year).maybeSingle();
  const net = sum?.net_balance ?? (year === defaultYear ? cfg.opening_balance : 0);
  const ppfBal = ppf?.balance ?? (year === defaultYear ? cfg.ppf_opening_balance : 0);

  const { data: offRows } = await sb.from("offerings").select("date,amount").eq("is_latest", true).eq("year", year);
  const { data: expRows } = await sb.from("expenses").select("date,amount,category").eq("is_latest", true).eq("year", year);
  const { count: activeMembers } = await sb.from("members").select("*", { count: "exact", head: true }).eq("status", "Active");
  const { data: ppfColRows } = await sb.from("ppf_collections").select("date,amount").eq("is_latest", true).eq("year", year);
  const { data: ppfClaimRows } = await sb.from("ppf_claims").select("date,amount").eq("is_latest", true).eq("year", year);

  root.innerHTML = `
    <div class="form-card" style="margin-bottom:20px; max-width:320px">
      <label>Choose Summary Year
        <select id="summaryYearSelect">
          ${years.map(y => `<option value="${y}" ${y === year ? "selected" : ""}>${y}</option>`).join("")}
        </select>
      </label>
    </div>
    <div class="stat-grid">
      ${statCard("Active Year", year, "", "calendar", "blue")}
      ${statCard("Carry Forward Balance", fmtRM(year === defaultYear ? cfg.opening_balance : 0), "", "wallet", "neutral")}
      ${statCard("Total Offerings", fmtRM(sum?.total_offerings), "", "trendUp", "green")}
      ${statCard("Total Expenses", fmtRM(sum?.total_expenses), "", "trendDown", "red")}
      ${statCard("Net Balance", fmtRM(net), net >= 0 ? "positive" : "negative", "scale", net >= 0 ? "green" : "red")}
      ${statCard("DFCM Outstanding", fmtRM(sum?.dfcm_outstanding), "", "clock", "amber")}
      ${statCard("PPF Balance", fmtRM(ppfBal), ppfBal >= 0 ? "positive" : "negative", "piggy", ppfBal >= 0 ? "green" : "red")}
      ${statCard("Active Members", activeMembers ?? 0, "", "users", "blue")}
    </div>
    <div class="action-row" style="margin-bottom:16px">
      <button class="btn-secondary" id="exportPdfBtn">Export Summary PDF</button>
    </div>
    <div class="chart-grid">
      <div class="chart-card"><h3>Offerings vs Expenses by Month</h3><canvas id="monthlyChart"></canvas></div>
      <div class="chart-card"><h3>Expenses by Category</h3><canvas id="categoryChart"></canvas></div>
    </div>
    <div class="chart-grid chart-grid-single">
      <div class="chart-card"><h3>PPF Collections vs Claims by Month</h3><canvas id="ppfChart"></canvas></div>
    </div>`;

  // ---- monthly bar chart ----
  const months = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleString("en", { month: "short" }));
  const offByMonth = Array(12).fill(0), expByMonth = Array(12).fill(0);
  (offRows || []).forEach(r => offByMonth[new Date(r.date).getMonth()] += Number(r.amount));
  (expRows || []).forEach(r => expByMonth[new Date(r.date).getMonth()] += Number(r.amount));
  charts.monthly = new Chart($("#monthlyChart"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "Offerings", data: offByMonth, backgroundColor: "#22d3aa" },
        { label: "Expenses", data: expByMonth, backgroundColor: "#d1483f" }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });

  // ---- category doughnut ----
  const catTotals = {};
  (expRows || []).forEach(r => { catTotals[r.category] = (catTotals[r.category] || 0) + Number(r.amount); });
  const catLabels = Object.keys(catTotals);
  const catValues = Object.values(catTotals);
  charts.category = new Chart($("#categoryChart"), {
    type: "doughnut",
    data: {
      labels: catLabels.length ? catLabels : ["No data"],
      datasets: [{ data: catValues.length ? catValues : [1], backgroundColor: ["#22d3aa","#4d9fff","#ffb830","#b06cff","#d1483f","#159873","#8b93a1"] }]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });

  // ---- PPF collections vs claims by month ----
  const ppfColByMonth = Array(12).fill(0), ppfClaimByMonth = Array(12).fill(0);
  (ppfColRows || []).forEach(r => ppfColByMonth[new Date(r.date).getMonth()] += Number(r.amount));
  (ppfClaimRows || []).forEach(r => ppfClaimByMonth[new Date(r.date).getMonth()] += Number(r.amount));
  charts.ppf = new Chart($("#ppfChart"), {
    type: "bar",
    data: {
      labels: months,
      datasets: [
        { label: "PPF Collections", data: ppfColByMonth, backgroundColor: "#17b26a", borderRadius: 6 },
        { label: "PPF Claims", data: ppfClaimByMonth, backgroundColor: "#e0453c", borderRadius: 6 }
      ]
    },
    options: { responsive: true, plugins: { legend: { position: "bottom" } } }
  });

  $("#exportPdfBtn").addEventListener("click", () => exportSummaryPDF({ year, sum, ppfBal, catTotals }));

  $("#summaryYearSelect").addEventListener("change", (e) => {
    window._summarySelectedYear = Number(e.target.value);
    renderView("summary");
  });
}

function exportSummaryPDF({ year, sum, ppfBal, catTotals }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(13, 17, 23); doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(34, 211, 170); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("KLTF Finance Summary", 14, 12);
  doc.setTextColor(150, 160, 170); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`Financial Year ${year} · Generated ${new Date().toLocaleDateString("en-MY")}`, 14, 19);

  const rows = [
    ["Total Offerings", fmtRM(sum?.total_offerings)],
    ["Total Expenses", fmtRM(sum?.total_expenses)],
    ["Net Balance", fmtRM(sum?.net_balance)],
    ["DFCM Due", fmtRM(sum?.dfcm_due)],
    ["DFCM Remitted", fmtRM(sum?.dfcm_remitted)],
    ["DFCM Outstanding", fmtRM(sum?.dfcm_outstanding)],
    ["PPF Balance", fmtRM(ppfBal)]
  ];
  let y = 36;
  doc.setTextColor(20, 20, 20); doc.setFontSize(11); doc.setFont("helvetica", "bold");
  doc.text("Financial Summary", 14, y); y += 8;
  rows.forEach(([k, v], i) => {
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    if (i % 2 === 0) { doc.setFillColor(245, 246, 248); doc.rect(14, y - 5, 182, 7, "F"); }
    doc.text(k, 18, y);
    doc.setFont("helvetica", "bold"); doc.text(v, 140, y);
    y += 8;
  });
  y += 6;
  if (Object.keys(catTotals).length) {
    doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.text("Expenses by Category", 14, y); y += 8;
    Object.entries(catTotals).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => {
      doc.setFont("helvetica", "normal"); doc.setFontSize(10);
      doc.text(k, 18, y); doc.text(fmtRM(v), 140, y);
      y += 7;
    });
  }
  doc.save(`KLTF_Summary_FY${year}.pdf`);
}

// ================= OFFERINGS =================
async function renderOfferings(root) {
  const { data: cfg } = await sb.from("config").select("offering_types,pastors_list,counters_list").single();
  const types = cfg?.offering_types?.length ? cfg.offering_types : ["Sunday Service", "Special Offering"];
  const pastors = cfg?.pastors_list || [];
  const counters = cfg?.counters_list || [];

  root.innerHTML = `
    ${canWrite() ? `
    <div class="section-head"><h2 id="offFormTitle">Add Offering</h2></div>
    <form id="offeringForm" class="form-card">
      ${editBanner("offering")}
      <label>Date<input type="date" name="date" value="${todayStr()}" required /></label>
      <label>Type${comboSelectHTML("offering_type", types, "— select type —")}</label>
      <label>Amount (RM)<input type="number" step="0.01" name="amount" data-linked="off" required /></label>
      <label>Counted By${comboSelectHTML("counted_by", counters, "— select —")}</label>
      <label>Attendance<input type="number" name="attendance" /></label>
      <label>Pastor${comboSelectHTML("pastor_name", pastors, "— none —")}</label>
      <label>Pastor Payment (RM)<input type="number" step="0.01" name="pastor_payment" /></label>
      ${denomCalcHTML("off")}
      <div class="full-row"><button class="btn-secondary" type="submit">Save Offering</button></div>
    </form>` : ""}
    <div class="section-head">
      <h2>Recent Offerings</h2>
      <button class="btn-ghost" onclick="goToView('offerings-records')">View all records →</button>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Counted By</th><th>Pastor</th><th>Attendance</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="offeringsBody"><tr><td colspan="7" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  if (canWrite()) { attachOfferingForm(root, cfg); initComboSelects($("#offeringForm")); }

  const { data: rows, error } = await sb.from("offerings").select("*")
    .eq("is_latest", true).order("date", { ascending: false }).limit(5);
  const body = $("#offeringsBody");
  if (error) { body.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`; return; }
  body.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.date}</td><td>${r.offering_type}</td>
      <td class="amount">${fmtRM(r.amount)}</td><td>${r.counted_by || "—"}</td>
      <td>${r.pastor_name || "—"}</td><td>${r.attendance ?? "—"}</td>
      ${canWrite() ? `<td class="action-row">
        <button class="btn-ghost" onclick='editOffering(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
        ${isAdmin() ? `<button class="btn-danger" onclick="deleteRow('offerings','${r.group_id}')">Delete</button>` : ""}
      </td>` : ""}
    </tr>`).join("") : `<tr><td colspan="7">No offerings yet.</td></tr>`;
}

// Full offerings list — separate page, own search box, no form.
async function renderOfferingsRecords(root) {
  root.innerHTML = `
    <div class="action-row" style="margin-bottom:16px">
      <button class="btn-ghost" onclick="goToView('offerings')">← Back to Offerings</button>
    </div>
    <div class="form-card" style="margin-bottom:16px">
      <label class="full-row">Search (type, counted by, pastor)<input type="text" id="offRecSearch" placeholder="Search…" /></label>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Amount</th><th>Counted By</th><th>Pastor</th><th>Attendance</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="offRecBody"><tr><td colspan="7" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  const { data: rows, error } = await sb.from("offerings").select("*")
    .eq("is_latest", true).order("date", { ascending: false }).limit(1000);
  const body = $("#offRecBody");
  if (error) { body.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`; return; }

  const draw = (list) => {
    body.innerHTML = list.length ? list.map(r => `
      <tr>
        <td>${r.date}</td><td>${r.offering_type}</td>
        <td class="amount">${fmtRM(r.amount)}</td><td>${r.counted_by || "—"}</td>
        <td>${r.pastor_name || "—"}</td><td>${r.attendance ?? "—"}</td>
        ${canWrite() ? `<td class="action-row">
          <button class="btn-ghost" onclick='editOffering(${JSON.stringify(r).replace(/'/g, "&apos;")}); goToView("offerings")'>Edit</button>
          ${isAdmin() ? `<button class="btn-danger" onclick="deleteRow('offerings','${r.group_id}')">Delete</button>` : ""}
        </td>` : ""}
      </tr>`).join("") : `<tr><td colspan="7">No matching offerings.</td></tr>`;
  };
  draw(rows);
  $("#offRecSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    draw(!q ? rows : rows.filter(r =>
      (r.offering_type || "").toLowerCase().includes(q) ||
      (r.counted_by || "").toLowerCase().includes(q) ||
      (r.pastor_name || "").toLowerCase().includes(q)));
  });
}

function attachOfferingForm(root) {
  const form = $("#offeringForm");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const year = new Date(f.get("date")).getFullYear();
    const denom = readDenom("off");
    const payload = {
      date: f.get("date"), offering_type: f.get("offering_type"),
      amount: Number(f.get("amount")), counted_by: f.get("counted_by") || null,
      attendance: f.get("attendance") ? Number(f.get("attendance")) : null,
      pastor_name: f.get("pastor_name") || null,
      pastor_payment: f.get("pastor_payment") ? Number(f.get("pastor_payment")) : null,
      denominations: denom.denomStr || null,
      notes_total: denom.notesTotal || null,
      coins_total: denom.coinsTotal || null,
      year
    };
    const isEditing = form.dataset.editing === "true";
    if (isEditing) {
      payload.group_id = f.get("group_id");
      payload.source = "NEW_UPDATE";
      payload.edit_reason = f.get("edit_reason");
    } else {
      payload.source = "NEW_ENTRY";
    }
    const { data: inserted, error } = await sb.from("offerings").insert(payload).select().single();
    if (error) return toast(error.message, true);
    toast(isEditing ? "Correction saved" : "Offering saved");
    notifyEntry("offering", inserted);
    writeAudit(isEditing ? "Offering Edited" : "Offering Added", { date: inserted.date, type: inserted.offering_type, amount: inserted.amount, reason: inserted.edit_reason });
    renderOfferings(root);
  });
}

window.editOffering = function (r) {
  $("#offFormTitle").textContent = "Edit Offering";
  const form = $("#offeringForm");
  form.querySelector('[name="date"]').value = r.date;
  setComboValue(form, "offering_type", r.offering_type);
  form.querySelector('[name="amount"]').value = r.amount;
  setComboValue(form, "counted_by", r.counted_by || "");
  form.querySelector('[name="attendance"]').value = r.attendance || "";
  setComboValue(form, "pastor_name", r.pastor_name || "");
  form.querySelector('[name="pastor_payment"]').value = r.pastor_payment || "";
  fillDenomInputs("off", r.denominations);
  setEditTarget(form, r.group_id);
  form.scrollIntoView({ behavior: "smooth" });
};

// ================= EXPENSES =================
async function renderExpenses(root) {
  const { data: cfg } = await sb.from("config").select("expense_categories").single();
  const cats = cfg?.expense_categories?.length ? cfg.expense_categories : ["General", "DFCM Remittance", "Utilities", "Rental"];

  root.innerHTML = `
    ${canWrite() ? `
    <div class="section-head"><h2 id="expFormTitle">Add Expense</h2></div>
    <form id="expenseForm" class="form-card">
      ${editBanner("expense")}
      <label>Date<input type="date" name="date" value="${todayStr()}" required /></label>
      <label>Category${comboSelectHTML("category", cats, "— select category —")}</label>
      <label>Amount (RM)<input type="number" step="0.01" name="amount" required /></label>
      <label class="full-row">Description<input type="text" name="description" /></label>
      <div class="full-row"><button class="btn-secondary" type="submit">Save Expense</button></div>
    </form>` : ""}
    <div class="section-head">
      <h2>Recent Expenses</h2>
      <button class="btn-ghost" onclick="goToView('expenses-records')">View all records →</button>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="expensesBody"><tr><td colspan="5" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  if (canWrite()) {
    const form = $("#expenseForm");
    initComboSelects(form);
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const year = new Date(f.get("date")).getFullYear();
      const payload = {
        date: f.get("date"), category: f.get("category"), description: f.get("description") || null,
        amount: Number(f.get("amount")), year
      };
      const isEditing = form.dataset.editing === "true";
      if (isEditing) { payload.group_id = f.get("group_id"); payload.source = "NEW_UPDATE"; payload.edit_reason = f.get("edit_reason"); }
      else payload.source = "NEW_ENTRY";
      const { data: inserted, error } = await sb.from("expenses").insert(payload).select().single();
      if (error) return toast(error.message, true);
      toast(isEditing ? "Correction saved" : "Expense saved");
      notifyEntry("expense", inserted);
      writeAudit(isEditing ? "Expense Edited" : "Expense Added", { date: inserted.date, category: inserted.category, amount: inserted.amount, reason: inserted.edit_reason });
      renderExpenses(root);
    });
  }

  const { data: rows, error } = await sb.from("expenses").select("*")
    .eq("is_latest", true).order("date", { ascending: false }).limit(5);
  const body = $("#expensesBody");
  if (error) { body.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`; return; }
  body.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${r.date}</td><td>${r.category}</td><td>${r.description || "—"}</td>
      <td class="amount">${fmtRM(r.amount)}</td>
      ${canWrite() ? `<td class="action-row">
        <button class="btn-ghost" onclick='editExpense(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
        ${isAdmin() ? `<button class="btn-danger" onclick="deleteRow('expenses','${r.group_id}')">Delete</button>` : ""}
      </td>` : ""}
    </tr>`).join("") : `<tr><td colspan="5">No expenses yet.</td></tr>`;
}

// Full expenses list — separate page, own search box, no form.
async function renderExpensesRecords(root) {
  root.innerHTML = `
    <div class="action-row" style="margin-bottom:16px">
      <button class="btn-ghost" onclick="goToView('expenses')">← Back to Expenses</button>
    </div>
    <div class="form-card" style="margin-bottom:16px">
      <label class="full-row">Search (category, description)<input type="text" id="expRecSearch" placeholder="Search…" /></label>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="expRecBody"><tr><td colspan="5" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  const { data: rows, error } = await sb.from("expenses").select("*")
    .eq("is_latest", true).order("date", { ascending: false }).limit(1000);
  const body = $("#expRecBody");
  if (error) { body.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`; return; }

  const draw = (list) => {
    body.innerHTML = list.length ? list.map(r => `
      <tr>
        <td>${r.date}</td><td>${r.category}</td><td>${r.description || "—"}</td>
        <td class="amount">${fmtRM(r.amount)}</td>
        ${canWrite() ? `<td class="action-row">
          <button class="btn-ghost" onclick='editExpense(${JSON.stringify(r).replace(/'/g, "&apos;")}); goToView("expenses")'>Edit</button>
          ${isAdmin() ? `<button class="btn-danger" onclick="deleteRow('expenses','${r.group_id}')">Delete</button>` : ""}
        </td>` : ""}
      </tr>`).join("") : `<tr><td colspan="5">No matching expenses.</td></tr>`;
  };
  draw(rows);
  $("#expRecSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    draw(!q ? rows : rows.filter(r =>
      (r.category || "").toLowerCase().includes(q) ||
      (r.description || "").toLowerCase().includes(q)));
  });
}

window.editExpense = function (r) {
  $("#expFormTitle").textContent = "Edit Expense";
  const form = $("#expenseForm");
  form.querySelector('[name="date"]').value = r.date;
  setComboValue(form, "category", r.category);
  form.querySelector('[name="amount"]').value = r.amount;
  form.querySelector('[name="description"]').value = r.description || "";
  setEditTarget(form, r.group_id);
  form.scrollIntoView({ behavior: "smooth" });
};

// ================= PPF =================
async function renderPPF(root) {
  const { data: cfg } = await sb.from("config").select("ppf_purposes,counters_list").single();
  const purposes = cfg?.ppf_purposes?.length ? cfg.ppf_purposes : ["Medical", "Education", "Emergency"];
  const counters = cfg?.counters_list || [];

  root.innerHTML = `
    ${canWrite() ? `
    <div class="section-head"><h2 id="ppfColFormTitle">Add PPF Collection</h2></div>
    <form id="ppfColForm" class="form-card">
      ${editBanner("PPF collection")}
      <label>Date<input type="date" name="date" value="${todayStr()}" required /></label>
      <label>Amount (RM)<input type="number" step="0.01" name="amount" data-linked="ppfcol" required /></label>
      <label>Counted By${comboSelectHTML("counted_by", counters, "— select —")}</label>
      ${denomCalcHTML("ppfcol")}
      <div class="full-row"><button class="btn-secondary" type="submit">Save Collection</button></div>
    </form>
    <div class="section-head"><h2 id="ppfClaimFormTitle">Add PPF Claim</h2></div>
    <form id="ppfClaimForm" class="form-card">
      ${editBanner("PPF claim")}
      <label>Date<input type="date" name="date" value="${todayStr()}" required /></label>
      <label>Beneficiary<input type="text" name="beneficiary" required /></label>
      <label>Purpose${comboSelectHTML("purpose", purposes, "— select purpose —")}</label>
      <label>Amount (RM)<input type="number" step="0.01" name="amount" required /></label>
      <label class="full-row">Description<input type="text" name="description" /></label>
      <div class="full-row"><button class="btn-secondary" type="submit">Save Claim</button></div>
    </form>` : ""}
    <div class="section-head"><h2>Recent Collections</h2></div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Amount</th><th>Counted By</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="ppfColBody"><tr><td colspan="4" class="loading-text">Loading…</td></tr></tbody>
    </table></div>
    <div class="section-head"><h2>Recent Claims</h2></div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Beneficiary</th><th>Purpose</th><th>Amount</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="ppfClaimBody"><tr><td colspan="5" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  if (canWrite()) {
    const colForm = $("#ppfColForm");
    initComboSelects(colForm);
    const claimFormEl = $("#ppfClaimForm");
    initComboSelects(claimFormEl);
    colForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const year = new Date(f.get("date")).getFullYear();
      const denom = readDenom("ppfcol");
      const payload = {
        date: f.get("date"), amount: Number(f.get("amount")), year, counted_by: f.get("counted_by") || null,
        denominations: denom.denomStr || null, notes_total: denom.notesTotal || null, coins_total: denom.coinsTotal || null
      };
      const isEditing = colForm.dataset.editing === "true";
      if (isEditing) { payload.group_id = f.get("group_id"); payload.source = "NEW_UPDATE"; payload.edit_reason = f.get("edit_reason"); }
      else payload.source = "NEW_ENTRY";
      const { data: inserted, error } = await sb.from("ppf_collections").insert(payload).select().single();
      if (error) return toast(error.message, true);
      toast(isEditing ? "Correction saved" : "PPF collection saved");
      notifyEntry("ppf_collection", inserted);
      writeAudit(isEditing ? "PPF Collection Edited" : "PPF Collection Added", { date: inserted.date, amount: inserted.amount, reason: inserted.edit_reason });
      renderPPF(root);
    });

    const claimForm = $("#ppfClaimForm");
    claimForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const year = new Date(f.get("date")).getFullYear();
      const payload = {
        date: f.get("date"), beneficiary: f.get("beneficiary"), purpose: f.get("purpose"),
        description: f.get("description") || null, amount: Number(f.get("amount")), year
      };
      const isEditing = claimForm.dataset.editing === "true";
      if (isEditing) { payload.group_id = f.get("group_id"); payload.source = "NEW_UPDATE"; payload.edit_reason = f.get("edit_reason"); }
      else payload.source = "NEW_ENTRY";
      const { data: inserted, error } = await sb.from("ppf_claims").insert(payload).select().single();
      if (error) return toast(error.message, true);
      toast(isEditing ? "Correction saved" : "PPF claim saved");
      notifyEntry("ppf_claim", inserted);
      writeAudit(isEditing ? "PPF Claim Edited" : "PPF Claim Added", { date: inserted.date, beneficiary: inserted.beneficiary, amount: inserted.amount, reason: inserted.edit_reason });
      renderPPF(root);
    });
  }

  const [{ data: cols, error: e1 }, { data: claims, error: e2 }] = await Promise.all([
    sb.from("ppf_collections").select("*").eq("is_latest", true).order("date", { ascending: false }).limit(15),
    sb.from("ppf_claims").select("*").eq("is_latest", true).order("date", { ascending: false }).limit(15)
  ]);
  $("#ppfColBody").innerHTML = (!e1 && cols.length)
    ? cols.map(r => `<tr><td>${r.date}</td><td class="amount">${fmtRM(r.amount)}</td><td>${r.counted_by || "—"}</td>
        ${canWrite() ? `<td class="action-row">
          <button class="btn-ghost" onclick='editPPFCol(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
          ${isAdmin() ? `<button class="btn-danger" onclick="deleteRow('ppf_collections','${r.group_id}')">Delete</button>` : ""}
        </td>` : ""}</tr>`).join("")
    : `<tr><td colspan="4">${e1 ? e1.message : "No collections yet."}</td></tr>`;
  $("#ppfClaimBody").innerHTML = (!e2 && claims.length)
    ? claims.map(r => `<tr><td>${r.date}</td><td>${r.beneficiary}</td><td>${r.purpose}</td><td class="amount">${fmtRM(r.amount)}</td>
        ${canWrite() ? `<td class="action-row">
          <button class="btn-ghost" onclick='editPPFClaim(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
          ${isAdmin() ? `<button class="btn-danger" onclick="deleteRow('ppf_claims','${r.group_id}')">Delete</button>` : ""}
        </td>` : ""}</tr>`).join("")
    : `<tr><td colspan="5">${e2 ? e2.message : "No claims yet."}</td></tr>`;
}

window.editPPFCol = function (r) {
  $("#ppfColFormTitle").textContent = "Edit PPF Collection";
  const form = $("#ppfColForm");
  form.querySelector('[name="date"]').value = r.date;
  form.querySelector('[name="amount"]').value = r.amount;
  setComboValue(form, "counted_by", r.counted_by || "");
  fillDenomInputs("ppfcol", r.denominations);
  setEditTarget(form, r.group_id);
  form.scrollIntoView({ behavior: "smooth" });
};
window.editPPFClaim = function (r) {
  $("#ppfClaimFormTitle").textContent = "Edit PPF Claim";
  const form = $("#ppfClaimForm");
  form.querySelector('[name="date"]').value = r.date;
  form.querySelector('[name="beneficiary"]').value = r.beneficiary;
  setComboValue(form, "purpose", r.purpose);
  form.querySelector('[name="amount"]').value = r.amount;
  form.querySelector('[name="description"]').value = r.description || "";
  setEditTarget(form, r.group_id);
  form.scrollIntoView({ behavior: "smooth" });
};

// ================= MEMBERS (full form) =================
async function renderMembers(root) {
  root.innerHTML = `
    ${canWrite() ? `
    <div class="section-head"><h2 id="memberFormTitle">Add Member</h2></div>
    <form id="memberForm" class="form-card">
      <input type="hidden" name="sno" />
      <label>Name<input type="text" name="name" required /></label>
      <label>DOB<input type="date" name="dob" /></label>
      <label>Phone<input type="text" name="phone" /></label>
      <label>Email<input type="email" name="email" /></label>
      <label>Baptism<select name="baptism"><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select></label>
      <label>Status<select name="status"><option>Active</option><option>Inactive</option></select></label>
      <label class="full-row">Skills<input type="text" name="skills" placeholder="e.g. Music, Teaching, IT" /></label>

      <label class="full-row" style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px">Spouse Name<input type="text" name="spouse_name" /></label>
      <label>Spouse DOB<input type="date" name="spouse_dob" /></label>
      <label>Spouse Phone<input type="text" name="spouse_phone" /></label>
      <label>Spouse Email<input type="email" name="spouse_email" /></label>
      <label>Spouse Baptism<select name="spouse_baptism"><option value="">—</option><option value="true">Yes</option><option value="false">No</option></select></label>
      <label class="full-row">Spouse Skills<input type="text" name="spouse_skills" placeholder="e.g. Music, Teaching, IT" /></label>

      <label style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px">Child 1 Name<input type="text" name="child1_name" /></label>
      <label style="padding-top:10px;margin-top:4px">Child 1 DOB<input type="date" name="child1_dob" /></label>
      <label>Child 2 Name<input type="text" name="child2_name" /></label>
      <label>Child 2 DOB<input type="date" name="child2_dob" /></label>
      <label>Child 3 Name<input type="text" name="child3_name" /></label>
      <label>Child 3 DOB<input type="date" name="child3_dob" /></label>

      <label class="full-row" style="border-top:1px solid var(--line);padding-top:10px;margin-top:4px">Address<input type="text" name="address" /></label>
      <label>Joined Year<input type="number" name="joined_year" /></label>
      <label class="full-row">Notes<input type="text" name="notes" /></label>
      <div class="full-row"><button class="btn-secondary" type="submit">Save Member</button></div>
    </form>` : ""}
    <div class="section-head">
      <h2>Directory</h2>
      <button class="btn-ghost" onclick="goToView('members-records')">View all records →</button>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Status</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="membersBody"><tr><td colspan="5" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  if (canWrite()) {
    const form = $("#memberForm");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const bool = v => v === "" ? null : v === "true";
      const payload = {
        name: f.get("name"), dob: f.get("dob") || null, phone: f.get("phone") || null,
        email: f.get("email") || null, baptism: bool(f.get("baptism")), status: f.get("status"),
        skills: f.get("skills") || null,
        spouse_name: f.get("spouse_name") || null, spouse_dob: f.get("spouse_dob") || null,
        spouse_phone: f.get("spouse_phone") || null, spouse_email: f.get("spouse_email") || null,
        spouse_baptism: bool(f.get("spouse_baptism")), spouse_skills: f.get("spouse_skills") || null,
        child1_name: f.get("child1_name") || null, child1_dob: f.get("child1_dob") || null,
        child2_name: f.get("child2_name") || null, child2_dob: f.get("child2_dob") || null,
        child3_name: f.get("child3_name") || null, child3_dob: f.get("child3_dob") || null,
        address: f.get("address") || null, joined_year: f.get("joined_year") ? Number(f.get("joined_year")) : null,
        notes: f.get("notes") || null, updated_at: new Date().toISOString()
      };
      const sno = f.get("sno");
      const { error } = sno
        ? await sb.from("members").update(payload).eq("sno", sno)
        : await sb.from("members").insert(payload);
      if (error) return toast(error.message, true);
      toast(sno ? "Member updated" : "Member saved");
      writeAudit(sno ? "Member Edited" : "Member Added", { name: payload.name, status: payload.status });
      renderMembers(root);
    });
  }

  const { data: rows, error } = await sb.from("members").select("*").order("name").limit(5);
  const body = $("#membersBody");
  if (error) { body.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`; return; }
  body.innerHTML = rows.length ? rows.map(r => `
    <tr><td>${r.name}</td><td>${r.phone || "—"}</td><td>${r.email || "—"}</td><td>${r.status}</td>
    ${canWrite() ? `<td class="action-row">
      <button class="btn-ghost" onclick='editMember(${JSON.stringify(r).replace(/'/g, "&apos;")})'>Edit</button>
      ${isAdmin() ? `<button class="btn-danger" onclick="deleteMember(${r.sno})">Delete</button>` : ""}
    </td>` : ""}</tr>
  `).join("") : `<tr><td colspan="5">No members yet.</td></tr>`;
}

// Full member directory — separate page, own search box, no form.
async function renderMembersRecords(root) {
  root.innerHTML = `
    <div class="action-row" style="margin-bottom:16px">
      <button class="btn-ghost" onclick="goToView('members')">← Back to Members</button>
    </div>
    <div class="form-card" style="margin-bottom:16px">
      <label class="full-row">Search (name, phone, email)<input type="text" id="memRecSearch" placeholder="Search…" /></label>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Status</th>${canWrite() ? "<th></th>" : ""}</tr></thead>
      <tbody id="memRecBody"><tr><td colspan="5" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;

  const { data: rows, error } = await sb.from("members").select("*").order("name").limit(1000);
  const body = $("#memRecBody");
  if (error) { body.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`; return; }

  const draw = (list) => {
    body.innerHTML = list.length ? list.map(r => `
      <tr><td>${r.name}</td><td>${r.phone || "—"}</td><td>${r.email || "—"}</td><td>${r.status}</td>
      ${canWrite() ? `<td class="action-row">
        <button class="btn-ghost" onclick='editMember(${JSON.stringify(r).replace(/'/g, "&apos;")}); goToView("members")'>Edit</button>
        ${isAdmin() ? `<button class="btn-danger" onclick="deleteMember(${r.sno})">Delete</button>` : ""}
      </td>` : ""}</tr>
    `).join("") : `<tr><td colspan="5">No matching members.</td></tr>`;
  };
  draw(rows);
  $("#memRecSearch").addEventListener("input", (e) => {
    const q = e.target.value.trim().toLowerCase();
    draw(!q ? rows : rows.filter(r =>
      (r.name || "").toLowerCase().includes(q) ||
      (r.phone || "").toLowerCase().includes(q) ||
      (r.email || "").toLowerCase().includes(q)));
  });
}

window.editMember = function (r) {
  $("#memberFormTitle").textContent = "Edit Member";
  const form = $("#memberForm");
  const set = (name, val) => { const el = form.querySelector(`[name="${name}"]`); if (el) el.value = val ?? ""; };
  set("sno", r.sno); set("name", r.name); set("dob", r.dob); set("phone", r.phone); set("email", r.email);
  set("baptism", r.baptism === null ? "" : String(r.baptism)); set("status", r.status);
  set("skills", r.skills);
  set("spouse_name", r.spouse_name); set("spouse_dob", r.spouse_dob); set("spouse_phone", r.spouse_phone);
  set("spouse_email", r.spouse_email); set("spouse_baptism", r.spouse_baptism === null ? "" : String(r.spouse_baptism));
  set("spouse_skills", r.spouse_skills);
  set("child1_name", r.child1_name); set("child1_dob", r.child1_dob);
  set("child2_name", r.child2_name); set("child2_dob", r.child2_dob);
  set("child3_name", r.child3_name); set("child3_dob", r.child3_dob);
  set("address", r.address); set("joined_year", r.joined_year); set("notes", r.notes);
  form.scrollIntoView({ behavior: "smooth" });
};

window.deleteMember = async function (sno) {
  if (!confirm("Delete this member?")) return;
  const { data: member } = await sb.from("members").select("name").eq("sno", sno).single();
  const { error } = await sb.from("members").delete().eq("sno", sno);
  if (error) return toast(error.message, true);
  toast("Member deleted");
  writeAudit("Member Deleted", { name: member?.name, sno });
  renderView("members");
};

// ================= AUDIT =================
async function renderAudit(root) {
  root.innerHTML = `
    <div class="table-card"><table>
      <thead><tr><th>When</th><th>Action</th><th>Details</th></tr></thead>
      <tbody id="auditBody"><tr><td colspan="3" class="loading-text">Loading…</td></tr></tbody>
    </table></div>`;
  const { data: rows, error } = await sb.from("audit_log").select("*").order("created_at", { ascending: false }).limit(100);
  const body = $("#auditBody");
  if (error) { body.innerHTML = `<tr><td colspan="3">${error.message}</td></tr>`; return; }
  body.innerHTML = rows.length ? rows.map(r => `
    <tr><td>${new Date(r.created_at).toLocaleString()}</td><td>${r.action}</td><td>${r.details ? JSON.stringify(r.details) : "—"}</td></tr>
  `).join("") : `<tr><td colspan="3">No audit entries yet.</td></tr>`;
}

// ================= SETTINGS (admin only): balances + dropdown-list editor =================
async function renderSettings(root) {
  if (!isAdmin()) { root.innerHTML = "<p>Admins only.</p>"; return; }
  const { data: cfg, error } = await sb.from("config").select("*").single();
  if (error) { root.innerHTML = `<p style="color:var(--danger)">${error.message}</p>`; return; }

  root.innerHTML = `
    <div class="section-head"><h2>Fund Configuration</h2></div>
    <form id="settingsForm" class="form-card">
      <label>Active Financial Year<input type="number" name="active_financial_year" value="${cfg.active_financial_year}" /></label>
      <label>DFCM Percentage<input type="number" step="0.1" name="dfcm_percentage" value="${cfg.dfcm_percentage}" /></label>
      <label>Opening Balance (RM)<input type="number" step="0.01" name="opening_balance" value="${cfg.opening_balance}" /></label>
      <label>PPF Opening Balance (RM)<input type="number" step="0.01" name="ppf_opening_balance" value="${cfg.ppf_opening_balance}" /></label>
      <label class="full-row">Notification Emails (comma-separated)<input type="text" name="notification_emails" value="${(cfg.notification_emails || []).join(", ")}" /></label>
      <div class="full-row"><button class="btn-secondary" type="submit">Save Settings</button></div>
    </form>

    <div class="section-head"><h2>Dropdown Lists</h2></div>
    <div id="tagEditors">
      ${tagEditorHTML("expense_categories", "Expense Categories", cfg.expense_categories)}
      ${tagEditorHTML("ppf_purposes", "PPF Purposes", cfg.ppf_purposes)}
      ${tagEditorHTML("offering_types", "Offering Types", cfg.offering_types)}
      ${tagEditorHTML("counters_list", "Counters", cfg.counters_list)}
      ${pastorEditorHTML(cfg.pastors_list)}
    </div>`;

  $("#settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const payload = {
      active_financial_year: Number(f.get("active_financial_year")),
      dfcm_percentage: Number(f.get("dfcm_percentage")),
      opening_balance: Number(f.get("opening_balance")),
      ppf_opening_balance: Number(f.get("ppf_opening_balance")),
      notification_emails: f.get("notification_emails").split(",").map(s => s.trim()).filter(Boolean),
      updated_at: new Date().toISOString()
    };
    const { error } = await sb.from("config").update(payload).eq("id", 1);
    if (error) return toast(error.message, true);
    toast("Settings saved");
    writeAudit("Settings Updated", { year: payload.active_financial_year, dfcm_percentage: payload.dfcm_percentage });
  });

  attachTagEditor("expense_categories");
  attachTagEditor("ppf_purposes");
  attachTagEditor("offering_types");
  attachTagEditor("counters_list");
  attachPastorEditor();
}

// ================= USER MANAGEMENT (admin only) =================
async function renderUsers(root) {
  if (!isAdmin()) { root.innerHTML = "<p>Admins only.</p>"; return; }

  root.innerHTML = `
    <div class="section-head">
      <h2>User Directory</h2>
      <button class="btn-primary" id="onboardUserBtn">Onboard New User</button>
    </div>
    <div class="table-card">
      <table style="width:100%">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Last Logged In</th>
            <th style="text-align:right">Actions</th>
          </tr>
        </thead>
        <tbody id="usersTableBody">
          <tr><td colspan="5" class="loading-text">Loading users…</td></tr>
        </tbody>
      </table>
    </div>
  `;

  const loadAndRenderUsersList = async () => {
    const tbody = $("#usersTableBody");
    tbody.innerHTML = `<tr><td colspan="5" class="loading-text">Loading users…</td></tr>`;
    try {
      const { data, error } = await sb.functions.invoke("user-management", {
        body: { action: "list-users" }
      });
      if (error) throw error;
      if (data && data.error) throw new Error(data.error);

      const users = data.users || [];
      if (!users.length) {
        tbody.innerHTML = `<tr><td colspan="5">No users found.</td></tr>`;
        return;
      }

      tbody.innerHTML = users.map(u => {
        const lastSignIn = u.last_sign_in_at
          ? new Date(u.last_sign_in_at).toLocaleString("en-MY", { dateStyle: "short", timeStyle: "short" })
          : "<span style='color:var(--text-dim)'>Never</span>";
        
        const roleClass = u.role === "admin" ? "tag admin-tag" : (u.role === "treasurer" ? "tag treasurer-tag" : "tag tag-viewer");
        const isSelf = profile && profile.id === u.id;

        return `
          <tr>
            <td><strong>${u.full_name || "—"}</strong></td>
            <td>${u.email}</td>
            <td><span class="${roleClass}" style="text-transform: capitalize">${u.role}</span></td>
            <td>${lastSignIn}</td>
            <td style="text-align:right; white-space:nowrap">
              <button class="btn-ghost" onclick="resetUserPassword('${u.id}', '${u.email}')" style="margin-right:5px; padding:4px 8px; font-size:12px;">Reset Password</button>
              ${isSelf ? `<span style="font-size:12px; color:var(--text-dim); margin-left:10px;">(Current)</span>` : `
                <button class="btn-danger-ghost" onclick="deleteUserAccount('${u.id}', '${u.email}')" style="padding:4px 8px; font-size:12px;">Delete</button>
              `}
            </td>
          </tr>
        `;
      }).join("");
    } catch (err) {
      tbody.innerHTML = `<tr><td colspan="5" style="color:var(--danger)">Error loading users: ${err.message}</td></tr>`;
    }
  };

  // Onboard User Button click
  $("#onboardUserBtn").addEventListener("click", () => {
    $("#addUserName").value = "";
    $("#addUserEmail").value = "";
    $("#addUserRole").value = "viewer";
    $("#addUserPassword").value = "";
    $("#addUserModal").classList.remove("hidden");
  });

  await loadAndRenderUsersList();
}

window.resetUserPassword = function (id, email) {
  $("#resetPassUserId").value = id;
  $("#resetPassUserEmail").textContent = email;
  $("#resetPassNewPass").value = "";
  $("#adminResetPassModal").classList.remove("hidden");
};

window.deleteUserAccount = async function (id, email) {
  if (!confirm(`Are you absolutely sure you want to delete the user account for ${email}? This action CANNOT be undone and will immediately revoke their access.`)) {
    return;
  }
  toast("Deleting user...");
  try {
    const { data, error } = await sb.functions.invoke("user-management", {
      body: { action: "delete-user", id }
    });
    if (error) throw error;
    if (data && data.error) throw new Error(data.error);

    toast("User deleted successfully");
    writeAudit("User Deleted", { email });
    renderView("users"); // re-render the view
  } catch (err) {
    toast("Failed to delete user: " + err.message, true);
  }
};

function tagEditorHTML(key, label, list) {
  list = list || [];
  return `
    <div class="tag-editor" data-key="${key}">
      <h3>${label}</h3>
      <div class="tag-list">
        ${list.map((v, i) => `<span class="tag">${v}<button data-idx="${i}" class="tag-remove">×</button></span>`).join("") || "<span style='color:var(--text-dim);font-size:12px'>None yet</span>"}
      </div>
      <div class="tag-add">
        <input type="text" placeholder="Add ${label.toLowerCase().slice(0, -1)}…" class="tag-input" />
        <button class="btn-ghost tag-add-btn" type="button">Add</button>
      </div>
    </div>`;
}

function attachTagEditor(key) {
  const box = document.querySelector(`.tag-editor[data-key="${key}"]`);
  if (!box) return;
  box.querySelectorAll(".tag-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { data: cfg } = await sb.from("config").select(key).single();
      const list = cfg[key] || [];
      list.splice(Number(btn.dataset.idx), 1);
      await saveListField(key, list);
    });
  });
  box.querySelector(".tag-add-btn").addEventListener("click", async () => {
    const input = box.querySelector(".tag-input");
    const val = input.value.trim();
    if (!val) return;
    const { data: cfg } = await sb.from("config").select(key).single();
    const list = cfg[key] || [];
    list.push(val);
    await saveListField(key, list);
  });
}

async function saveListField(key, list) {
  const { error } = await sb.from("config").update({ [key]: list, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return toast(error.message, true);
  toast("Updated");
  writeAudit("Settings List Updated", { field: key });
  renderSettings($("#viewRoot"));
}

function pastorEditorHTML(list) {
  list = list || [];
  return `
    <div class="tag-editor" data-key="pastors_list">
      <h3>Pastors</h3>
      <div class="tag-list">
        ${list.map((p, i) => `<span class="tag">${p.name} (${p.type})<button data-idx="${i}" class="pastor-remove">×</button></span>`).join("") || "<span style='color:var(--text-dim);font-size:12px'>None yet</span>"}
      </div>
      <div class="tag-add">
        <input type="text" placeholder="Pastor name…" class="pastor-name-input" />
        <select class="pastor-type-input">
          <option>Senior Pastor</option><option>Associate Pastor</option><option>Guest</option>
        </select>
        <button class="btn-ghost" id="pastorAddBtn" type="button">Add</button>
      </div>
    </div>`;
}

function attachPastorEditor() {
  const box = document.querySelector('.tag-editor[data-key="pastors_list"]');
  if (!box) return;
  box.querySelectorAll(".pastor-remove").forEach(btn => {
    btn.addEventListener("click", async () => {
      const { data: cfg } = await sb.from("config").select("pastors_list").single();
      const list = cfg.pastors_list || [];
      list.splice(Number(btn.dataset.idx), 1);
      await saveListField("pastors_list", list);
    });
  });
  box.querySelector("#pastorAddBtn").addEventListener("click", async () => {
    const name = box.querySelector(".pastor-name-input").value.trim();
    const type = box.querySelector(".pastor-type-input").value;
    if (!name) return;
    const { data: cfg } = await sb.from("config").select("pastors_list").single();
    const list = cfg.pastors_list || [];
    list.push({ name, type });
    await saveListField("pastors_list", list);
  });
}

// ================= DELETE (admin only, whole group) =================
window.deleteRow = async function (table, groupId) {
  if (!confirm("Delete this entry? This removes the full edit history for it.")) return;
  const { error } = await sb.rpc("delete_group", { p_table: table, p_group_id: groupId });
  if (error) return toast(error.message, true);
  toast("Deleted");
  writeAudit("Record Deleted", { table, groupId });
  renderView(activeView);
};

// ================= STATEMENT (date-range, shareable/printable) =================
function presetRange(months) {
  const to = new Date();
  const from = new Date();
  from.setMonth(from.getMonth() - months);
  return [from.toISOString().slice(0, 10), to.toISOString().slice(0, 10)];
}

async function renderStatement(root, from, to) {
  const [defFrom, defTo] = presetRange(1);
  from = from || defFrom;
  to = to || defTo;
  const { data: cfg } = await sb.from("config").select("active_financial_year").single();
  const defYear = cfg?.active_financial_year || new Date().getFullYear();

  root.innerHTML = `
    <div class="section-head"><h2>Statement of Comprehensive Income</h2></div>
    <div class="form-card" style="margin-bottom:20px">
      <label>Year<input type="number" id="mstYear" value="${defYear}" /></label>
      <label>Up to date (optional)<input type="date" id="mstAsOf" /></label>
      <div class="full-row action-row">
        <button class="btn-secondary" id="mstGenerate">Generate Monthly Statement</button>
        <button class="btn-ghost" id="mstExportPdf">Export / Share as PDF</button>
      </div>
    </div>
    <div id="mstResults"><p style="color:var(--text-dim)">Choose a year and click Generate.</p></div>

    <div class="section-head" style="margin-top:32px"><h2>Transaction Statement</h2></div>
    <div class="form-card" style="margin-bottom:20px">
      <label>From<input type="date" id="stmtFrom" value="${from}" /></label>
      <label>To<input type="date" id="stmtTo" value="${to}" /></label>
      <div>
        <label>&nbsp;</label>
        <div class="action-row">
          <button class="btn-ghost" data-months="1">1 Month</button>
          <button class="btn-ghost" data-months="6">6 Months</button>
          <button class="btn-ghost" data-months="12">1 Year</button>
        </div>
      </div>
      <div class="full-row action-row">
        <button class="btn-secondary" id="stmtGenerate">Generate Statement</button>
        <button class="btn-ghost" id="stmtExportPdf">Export / Share as PDF</button>
      </div>
    </div>
    <div id="stmtResults"><p style="color:var(--text-dim)">Choose a range and click Generate.</p></div>`;

  $("#mstGenerate").addEventListener("click", () => loadMonthlyStatement(Number($("#mstYear").value), $("#mstAsOf").value || null));
  $("#mstExportPdf").addEventListener("click", () => {
    if (!window._lastMonthlyStatement) { toast("Generate the monthly statement first.", true); return; }
    exportMonthlyStatementPDF(window._lastMonthlyStatement);
  });
  await loadMonthlyStatement(defYear, null);

  $$("[data-months]").forEach(btn => {
    btn.addEventListener("click", () => {
      const [f, t] = presetRange(Number(btn.dataset.months));
      $("#stmtFrom").value = f; $("#stmtTo").value = t;
      loadStatement(f, t);
    });
  });
  $("#stmtGenerate").addEventListener("click", () => loadStatement($("#stmtFrom").value, $("#stmtTo").value));
  $("#stmtExportPdf").addEventListener("click", () => {
    if (!window._lastStatement) { toast("Generate a statement first.", true); return; }
    exportStatementPDF(window._lastStatement);
  });

  await loadStatement(from, to);
}

// ---- Monthly comprehensive-income statement (pivot: months x revenue/expense lines) ----
async function loadMonthlyStatement(year, asOfDate) {
  const resultsEl = $("#mstResults");
  resultsEl.innerHTML = "<p class='loading-text'>Loading…</p>";

  const jan1 = `${year}-01-01`, dec31 = `${year}-12-31`;
  const [{ data: cfg }, { data: off }, { data: exp }] = await Promise.all([
    sb.from("config").select("opening_balance,active_financial_year").eq("id", 1).single(),
    sb.from("offerings").select("date,offering_type,amount").eq("is_latest", true).gte("date", jan1).lte("date", dec31).order("date"),
    sb.from("expenses").select("date,category,amount").eq("is_latest", true).gte("date", jan1).lte("date", dec31).order("date")
  ]);

  const openingBalance = Number(cfg?.opening_balance || 0);
  const isOpeningYear = year === cfg?.active_financial_year; // only show B/F if this is the configured starting year context isn't tracked per-year, so we show it on the earliest month with data

  // Build month keys present in data (always show all 12 up to current/asOf month if it's the current year, else all 12)
  const now = new Date();
  const lastMonth = (year === now.getFullYear() && !asOfDate) ? now.getMonth() : 11; // 0-indexed
  const monthKeys = []; // ascending Jan..lastMonth
  for (let m = 0; m <= lastMonth; m++) monthKeys.push(m);

  const monthLabel = m => new Date(year, m, 1).toLocaleDateString("en-MY", { month: "short", year: "2-digit" });

  const revenueTypes = [...new Set((off || []).map(r => r.offering_type))];
  const expenseCats = [...new Set((exp || []).map(r => r.category))];

  const sumFor = (rows, keyField, keyVal, m) => (rows || [])
    .filter(r => r[keyField] === keyVal && new Date(r.date).getMonth() === m)
    .reduce((s, r) => s + Number(r.amount), 0);

  const monthRevTotal = m => (off || []).filter(r => new Date(r.date).getMonth() === m).reduce((s, r) => s + Number(r.amount), 0);
  const monthExpTotal = m => (exp || []).filter(r => new Date(r.date).getMonth() === m).reduce((s, r) => s + Number(r.amount), 0);

  const yearRevTotal = (off || []).reduce((s, r) => s + Number(r.amount), 0);
  const yearExpTotal = (exp || []).reduce((s, r) => s + Number(r.amount), 0);

  // as-of-date column (custom period within the year), optional
  let asOfCol = null;
  if (asOfDate) {
    const asOfRev = (off || []).filter(r => r.date <= asOfDate).reduce((s, r) => s + Number(r.amount), 0);
    const asOfExp = (exp || []).filter(r => r.date <= asOfDate).reduce((s, r) => s + Number(r.amount), 0);
    asOfCol = { label: asOfDate, rev: asOfRev, exp: asOfExp, revBy: t => (off || []).filter(r => r.offering_type === t && r.date <= asOfDate).reduce((s, r) => s + Number(r.amount), 0), expBy: c => (exp || []).filter(r => r.category === c && r.date <= asOfDate).reduce((s, r) => s + Number(r.amount), 0) };
  }

  // columns: Year total, [as-of], months descending (latest first)
  const monthsDesc = [...monthKeys].reverse();
  const firstMonth = monthKeys[0]; // earliest month with a column, gets the Brought Forward row

  const colHeader = ["Year " + year];
  if (asOfCol) colHeader.push(asOfCol.label);
  monthsDesc.forEach(m => colHeader.push(monthLabel(m)));

  const revRows = revenueTypes.map(t => {
    const cells = [(off || []).filter(r => r.offering_type === t).reduce((s, r) => s + Number(r.amount), 0)];
    if (asOfCol) cells.push(asOfCol.revBy(t));
    monthsDesc.forEach(m => cells.push(sumFor(off, "offering_type", t, m)));
    return { label: t, cells };
  });
  const revTotalRow = (() => {
    const cells = [yearRevTotal];
    if (asOfCol) cells.push(asOfCol.rev);
    monthsDesc.forEach(m => cells.push(monthRevTotal(m)));
    return cells;
  })();

  const expRows = expenseCats.map(c => {
    const cells = [(exp || []).filter(r => r.category === c).reduce((s, r) => s + Number(r.amount), 0)];
    if (asOfCol) cells.push(asOfCol.expBy(c));
    monthsDesc.forEach(m => cells.push(sumFor(exp, "category", c, m)));
    return { label: c, cells };
  });
  // net row = revenue total - expense total, per column
  const netRow = revTotalRow.map((v, i) => {
    const expCell = [yearExpTotal, ...(asOfCol ? [asOfCol.exp] : []), ...monthsDesc.map(m => monthExpTotal(m))][i];
    return v - expCell;
  });

  const bfCells = colHeader.map((_, i) => {
    // show opening balance only in the column matching the first/earliest month, and in the Year column
    if (i === 0) return openingBalance;
    if (!asOfCol && i === colHeader.length - 1 && monthsDesc[monthsDesc.length - 1] === firstMonth) return openingBalance;
    return null;
  });

  const cfTotal = openingBalance + yearRevTotal - yearExpTotal;

  window._lastMonthlyStatement = { year, colHeader, bfCells, revRows, revTotalRow, expRows, netRow, openingBalance, yearRevTotal, yearExpTotal, cfTotal };

  const fmtCell = v => v === null || v === undefined ? "" : fmtRM(v);
  resultsEl.innerHTML = `
    <div class="table-card" style="overflow-x:auto"><table style="min-width:900px">
      <thead><tr><th></th>${colHeader.map(h => `<th>${h}</th>`).join("")}</tr></thead>
      <tbody>
        <tr><td><strong>Brought Forward Balance</strong></td>${bfCells.map(v => `<td class="amount">${fmtCell(v)}</td>`).join("")}</tr>
        <tr><td colspan="${colHeader.length + 1}"><strong>REVENUE</strong></td></tr>
        ${revRows.map(r => `<tr><td>${r.label}</td>${r.cells.map(v => `<td class="amount">${fmtCell(v)}</td>`).join("")}</tr>`).join("")}
        <tr style="border-top:1px solid var(--line)"><td><strong>TOTAL</strong></td>${revTotalRow.map(v => `<td class="amount"><strong>${fmtCell(v)}</strong></td>`).join("")}</tr>
        <tr><td colspan="${colHeader.length + 1}"><strong>EXPENSES</strong></td></tr>
        ${expRows.map(r => `<tr><td>${r.label}</td>${r.cells.map(v => `<td class="amount">${fmtCell(v)}</td>`).join("")}</tr>`).join("")}
        <tr style="border-top:1px solid var(--line)"><td><strong>TOTAL (Net)</strong></td>${netRow.map(v => `<td class="amount" style="color:${v >= 0 ? "var(--accent-dark)" : "var(--danger)"}"><strong>${fmtCell(v)}</strong></td>`).join("")}</tr>
      </tbody>
    </table></div>
    <div class="table-card" style="max-width:320px;margin-top:16px">
      <table>
        <tbody>
          <tr><td><em>B/F - ${year - 1}</em></td><td class="amount">${fmtRM(openingBalance)}</td></tr>
          <tr><td>TOTAL INCOME - ${year}</td><td class="amount">${fmtRM(yearRevTotal)}</td></tr>
          <tr><td>TOTAL EXPENSE - ${year}</td><td class="amount">${fmtRM(yearExpTotal)}</td></tr>
          <tr style="border-top:2px solid var(--line)"><td><em>C/F - ${year}</em></td><td class="amount"><strong>${fmtRM(cfTotal)}</strong></td></tr>
        </tbody>
      </table>
    </div>`;
}

function exportMonthlyStatementPDF(st) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  doc.setFontSize(14); doc.setFont("helvetica", "bold");
  doc.text("KLTF Statement of Comprehensive Income", 14, 14);
  doc.setFontSize(10); doc.setFont("helvetica", "normal");
  doc.text(`Year ${st.year}`, 14, 20);

  const colCount = st.colHeader.length;
  const startX = 45, colW = Math.min(28, (280 - startX) / colCount);
  let y = 30;
  doc.setFont("helvetica", "bold"); doc.setFontSize(8);
  doc.text("", 14, y);
  st.colHeader.forEach((h, i) => doc.text(String(h), startX + i * colW, y));
  y += 6;

  const printRow = (label, cells, bold) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.text(String(label).slice(0, 24), 14, y);
    cells.forEach((v, i) => doc.text(v === null || v === undefined ? "" : fmtRM(v), startX + i * colW, y));
    y += 5.5;
  };

  printRow("Brought Forward", st.bfCells, true);
  doc.setFont("helvetica", "bold"); doc.text("REVENUE", 14, y); y += 5.5;
  st.revRows.forEach(r => printRow(r.label, r.cells, false));
  printRow("TOTAL", st.revTotalRow, true);
  doc.setFont("helvetica", "bold"); doc.text("EXPENSES", 14, y); y += 5.5;
  st.expRows.forEach(r => printRow(r.label, r.cells, false));
  printRow("TOTAL (Net)", st.netRow, true);

  y += 8;
  doc.setFontSize(10);
  printRow(`B/F - ${st.year - 1}`, [st.openingBalance], false);
  printRow(`TOTAL INCOME - ${st.year}`, [st.yearRevTotal], false);
  printRow(`TOTAL EXPENSE - ${st.year}`, [st.yearExpTotal], false);
  printRow(`C/F - ${st.year}`, [st.cfTotal], true);

  doc.save(`KLTF_Monthly_Statement_${st.year}.pdf`);
  toast("Monthly statement PDF ready to share.");
}

async function loadStatement(from, to) {
  const resultsEl = $("#stmtResults");
  resultsEl.innerHTML = "<p class='loading-text'>Loading…</p>";

  const [{ data: off }, { data: exp }, { data: ppfCol }, { data: ppfClaim }] = await Promise.all([
    sb.from("offerings").select("*").eq("is_latest", true).gte("date", from).lte("date", to).order("date"),
    sb.from("expenses").select("*").eq("is_latest", true).gte("date", from).lte("date", to).order("date"),
    sb.from("ppf_collections").select("*").eq("is_latest", true).gte("date", from).lte("date", to).order("date"),
    sb.from("ppf_claims").select("*").eq("is_latest", true).gte("date", from).lte("date", to).order("date")
  ]);

  const rows = [
    ...(off || []).map(r => ({ date: r.date, type: "Offering", detail: r.offering_type, amount: r.amount, dir: 1 })),
    ...(exp || []).map(r => ({ date: r.date, type: "Expense", detail: r.category, amount: r.amount, dir: -1 })),
    ...(ppfCol || []).map(r => ({ date: r.date, type: "PPF Collection", detail: "—", amount: r.amount, dir: 1 })),
    ...(ppfClaim || []).map(r => ({ date: r.date, type: "PPF Claim", detail: r.beneficiary, amount: r.amount, dir: -1 }))
  ].sort((a, b) => a.date.localeCompare(b.date));

  const totalIn = rows.filter(r => r.dir === 1).reduce((s, r) => s + Number(r.amount), 0);
  const totalOut = rows.filter(r => r.dir === -1).reduce((s, r) => s + Number(r.amount), 0);

  window._lastStatement = { from, to, rows, totalIn, totalOut };

  resultsEl.innerHTML = `
    <div class="stat-grid" style="margin-bottom:18px">
      <div class="stat-card"><div class="stat-label">Money In</div><div class="stat-value positive">${fmtRM(totalIn)}</div></div>
      <div class="stat-card"><div class="stat-label">Money Out</div><div class="stat-value negative">${fmtRM(totalOut)}</div></div>
      <div class="stat-card"><div class="stat-label">Net for Period</div><div class="stat-value ${totalIn - totalOut >= 0 ? "positive" : "negative"}">${fmtRM(totalIn - totalOut)}</div></div>
    </div>
    <div class="table-card"><table>
      <thead><tr><th>Date</th><th>Type</th><th>Detail</th><th>Amount</th></tr></thead>
      <tbody>
        ${rows.length ? rows.map(r => `
          <tr><td>${r.date}</td><td>${r.type}</td><td>${r.detail}</td>
          <td class="amount" style="color:${r.dir === 1 ? "var(--accent-dark)" : "var(--danger)"}">${r.dir === 1 ? "+" : "-"}${fmtRM(r.amount)}</td></tr>
        `).join("") : `<tr><td colspan="4">No transactions in this range.</td></tr>`}
      </tbody>
    </table></div>`;
}

function exportStatementPDF({ from, to, rows, totalIn, totalOut }) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  doc.setFillColor(13, 17, 23); doc.rect(0, 0, 210, 24, "F");
  doc.setTextColor(34, 211, 170); doc.setFontSize(16); doc.setFont("helvetica", "bold");
  doc.text("KLTF Finance Statement", 14, 12);
  doc.setTextColor(150, 160, 170); doc.setFontSize(9); doc.setFont("helvetica", "normal");
  doc.text(`${from} to ${to} · Generated ${new Date().toLocaleDateString("en-MY")}`, 14, 19);

  let y = 34;
  doc.setTextColor(20, 20, 20); doc.setFontSize(10); doc.setFont("helvetica", "bold");
  doc.text(`Money In: ${fmtRM(totalIn)}   Money Out: ${fmtRM(totalOut)}   Net: ${fmtRM(totalIn - totalOut)}`, 14, y);
  y += 10;

  doc.setFontSize(9);
  ["Date", "Type", "Detail", "Amount"].forEach((h, i) => doc.text(h, 14 + i * 45, y));
  y += 5;
  doc.setFont("helvetica", "normal");
  rows.forEach((r, i) => {
    if (y > 280) { doc.addPage(); y = 20; }
    if (i % 2 === 0) { doc.setFillColor(245, 246, 248); doc.rect(14, y - 4, 182, 6, "F"); }
    doc.text(String(r.date), 14, y);
    doc.text(String(r.type), 59, y);
    doc.text(String(r.detail).slice(0, 20), 104, y);
    doc.text((r.dir === 1 ? "+" : "-") + fmtRM(r.amount), 149, y);
    y += 6;
  });
  doc.save(`KLTF_Statement_${from}_to_${to}.pdf`);
  toast("Statement PDF ready to share.");
}

// ================= COMPARE YEARS =================
async function renderCompare(root) {
  const { data: cfg } = await sb.from("config").select("active_financial_year").single();
  const currentYear = cfg.active_financial_year;
  root.innerHTML = `
    <div class="form-card" style="margin-bottom:20px">
      <label>Year A<input type="number" id="cmpYearA" value="${currentYear - 1}" /></label>
      <label>Year B<input type="number" id="cmpYearB" value="${currentYear}" /></label>
      <div class="full-row"><button class="btn-secondary" id="cmpGo">Compare</button></div>
    </div>
    <div id="cmpResults"></div>`;
  $("#cmpGo").addEventListener("click", () => loadCompare($("#cmpYearA").value, $("#cmpYearB").value));
  await loadCompare(currentYear - 1, currentYear);
}

async function loadCompare(yearA, yearB) {
  yearA = Number(yearA); yearB = Number(yearB);
  const [{ data: a }, { data: b }, { data: ppfA }, { data: ppfB }] = await Promise.all([
    sb.from("v_year_summary").select("*").eq("year", yearA).maybeSingle(),
    sb.from("v_year_summary").select("*").eq("year", yearB).maybeSingle(),
    sb.from("v_ppf_summary").select("*").eq("year", yearA).maybeSingle(),
    sb.from("v_ppf_summary").select("*").eq("year", yearB).maybeSingle()
  ]);
  const growth = (x, y) => (x && y && x !== 0) ? (((y - x) / Math.abs(x)) * 100).toFixed(1) + "%" : "—";

  const rows = [
    ["Total Offerings", a?.total_offerings, b?.total_offerings],
    ["Total Expenses", a?.total_expenses, b?.total_expenses],
    ["Net Balance", a?.net_balance, b?.net_balance],
    ["DFCM Due", a?.dfcm_due, b?.dfcm_due],
    ["PPF Balance", ppfA?.balance, ppfB?.balance]
  ];

  $("#cmpResults").innerHTML = `
    <div class="table-card"><table>
      <thead><tr><th>Metric</th><th>${yearA}</th><th>${yearB}</th><th>Growth</th></tr></thead>
      <tbody>
        ${rows.map(([label, x, y]) => `
          <tr><td>${label}</td><td class="amount">${fmtRM(x)}</td><td class="amount">${fmtRM(y)}</td><td>${growth(x, y)}</td></tr>
        `).join("")}
      </tbody>
    </table></div>`;
}
