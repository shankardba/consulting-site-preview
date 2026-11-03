// status.html?t=CODE: the no-login status page emailed when a request comes in. Read-only.
const el = document.getElementById("status-page");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";
const stamp = (h) => h.at ? new Date(h.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : day(h.date);
const PREVIEW = "Preview only: request status works on the live site, not on this preview copy.";
const t = new URLSearchParams(location.search).get("t") || "";

const resendForm = `<form class="form" id="resend" novalidate>
  <label>Your email<input type="email" name="email" autocomplete="email" required></label>
  <p class="status" role="alert" hidden></p>
  <button class="btn" type="submit">Send my status link</button></form>`;

function wireResend() {
  const f = document.getElementById("resend"); if (!f) return;
  const st = f.querySelector(".status");
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!f.email.value || !f.email.validity.valid) { st.hidden = false; st.textContent = "Please enter your email."; return; }
    const btn = f.querySelector("button"); btn.disabled = true;
    let msg;
    try {
      const r = await fetch("/api/status/resend", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: f.email.value }) });
      msg = [404, 405, 501].includes(r.status) ? PREVIEW : ((await r.json().catch(() => ({}))).message || "Something went wrong. Please try again.");
    } catch { msg = "Couldn’t reach the server. Check your connection and try again."; }
    st.hidden = false; st.textContent = msg; btn.disabled = false;
  };
}

function lost(text) {
  el.removeAttribute("aria-busy");
  el.innerHTML = `<section class="login-card card status-lost"><div class="eyebrow">Request status</div><h1>Find your request</h1>
    <p class="muted">${esc(text)}</p>${resendForm}<p class="small">Already a client? <a href="login.html">Sign in to your portal</a>.</p></section>`;
  wireResend();
}

async function load() {
  if (!t) return lost("Enter the email you used for your request and we’ll send its status link again.");
  let res;
  try { res = await fetch("/api/status?t=" + encodeURIComponent(t), { cache: "no-store" }); }
  catch { return lost("Couldn’t reach the server. Check your connection and reload."); }
  if ([404, 405, 501].includes(res.status)) return lost(PREVIEW);
  const s = await res.json().catch(() => ({}));
  if (!res.ok) return lost(s.error || "This link isn’t valid. Enter your email and we’ll send a new one.");
  el.removeAttribute("aria-busy");
  const tone = s.closed ? "muted" : s.status === "Under review" ? "review" : "active";
  el.innerHTML = `
    <header class="portal-head"><div><div class="eyebrow">Request status · ${esc(s.id)}</div><h1>${esc(s.title)}</h1>
      <p class="muted">${esc([s.business, s.service].filter(Boolean).join(" · "))}${s.requested ? ` · requested ${day(s.requested)}` : ""}</p></div>
      <span class="st ${tone}">${esc(s.status)}</span></header>
    ${s.inPortal ? `<div class="card portal-msg"><p><b>Your project has moved into your client portal.</b> Sign in to see the plan, agreement, invoices and status reports.</p>
      <p><a class="btn small" href="login.html">Sign in</a></p></div>` : ""}
    ${s.status === "Under review" ? `<div class="card portal-msg"><p>We’re reviewing your request and will reply within two business days. This page updates as soon as anything changes.</p></div>` : ""}
    <div class="card"><h2 class="status-h">Timeline</h2>
      <ol class="timeline">${s.history.map((h) => `<li class="tl rel"><span class="tl-dot"></span>
        <div class="tl-meta"><time datetime="${esc(h.at || h.date)}">${stamp(h)}</time></div>
        <h4>${esc(h.title)}</h4>${h.body ? `<p>${esc(h.body)}</p>` : ""}</li>`).join("")}</ol></div>
    <p class="muted small">This page is private to you. Anyone with the link can see it, so don’t forward the email.</p>`;
}
load();
