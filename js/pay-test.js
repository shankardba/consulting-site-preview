// Test checkout (payment simulator): what a Pay button opens for testers on test projects. It stands where
// Stripe's or PayPal's own checkout page will be, and lets the tester pick what the provider reports back.
// No money moves. Loads /api/pay/session?s= and posts the outcome to /api/pay/simulate.
import { cents } from "./money.js";
const el = document.getElementById("checkout");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const sid = new URLSearchParams(location.search).get("s") || "";
const PROVIDER = { bank_debit: "Stripe", card: "Stripe", paypal: "PayPal" };
const back = (id) => `portal.html${id ? "#" + encodeURIComponent(id) : ""}`;

async function load() {
  let res;
  try { res = await fetch("/api/pay/session?s=" + encodeURIComponent(sid), { cache: "no-store" }); }
  catch { return msg("Couldn’t reach the server. Check your connection and reload."); }
  if (res.status === 401) return location.replace("login.html?expired");
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return msg(out.error || "This checkout link isn't valid.");
  render(out);
}

function msg(text, id) {
  el.innerHTML = `<div class="card portal-msg"><p>${esc(text)}</p><p><a class="btn ghost small" href="${back(id)}">Back to your project</a></p></div>`;
}

function render(s) {
  if (s.status !== "open") return msg(s.status === "paid" ? "This payment is already done." : s.status === "expired" ? "This checkout link has expired. Go back and click Pay again." : "This checkout is closed. Go back and click Pay again.", s.project.id);
  el.innerHTML = `
    <div class="sim-banner" role="note"><b>Test checkout.</b> This is the payment simulator: no money moves. When payments go live, ${esc(PROVIDER[s.method.id])}’s own secure page opens here instead.</div>
    <section class="card checkout-card">
      <div class="eyebrow">Paying Data Integration Specialists${s.project.business ? ` · from ${esc(s.project.business)}` : ""}</div>
      <h1>${cents(s.amount)}</h1>
      <p class="muted">Invoice ${esc(s.invoice.number)} · ${esc(s.project.title)}</p>
      <ul class="price-list">${s.invoice.lines.map((l) => `<li><span>${esc(l.item)}</span><b>${cents(l.amount)}</b></li>`).join("")}</ul>
      <p>Paying by <b>${esc(s.method.label)}</b></p>
      <h2 class="small">What should the provider report?</h2>
      <div class="sim-outcomes">
        <button class="btn" type="button" data-outcome="paid">Payment succeeds</button>
        <button class="btn ghost" type="button" data-outcome="declined">${s.method.id === "bank_debit" ? "Bank payment fails" : "Payment is declined"}</button>
        <button class="btn ghost" type="button" data-outcome="cancelled">Cancel and go back</button>
      </div>
      <p class="form-err" role="alert" hidden></p>
    </section>`;
  el.querySelectorAll("[data-outcome]").forEach((b) => b.onclick = async () => {
    el.querySelectorAll("[data-outcome]").forEach((x) => (x.disabled = true));
    const res = await fetch("/api/pay/simulate", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: s.id, outcome: b.dataset.outcome }) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res || !res.ok) {
      const m = el.querySelector(".form-err"); m.textContent = out.error || "Something went wrong. Please try again."; m.hidden = false;
      el.querySelectorAll("[data-outcome]").forEach((x) => (x.disabled = false));
      return;
    }
    location.replace(back(out.project));
  });
}

load();
