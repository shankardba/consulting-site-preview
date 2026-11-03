// Client portal: loads /api/portal (needs the session cookie) and draws the signed-in client's projects.
import { cents, invoiceLabel } from "./money.js";
const el = document.getElementById("portal");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";
const money = (n) => "$" + Number(n).toLocaleString("en-US");

const STATUS = {
  submitted: ["Request received", "review"], review: ["Under review", "review"], approved: ["Quote sent", "review"],
  active: ["In progress", "active"], care: ["Care plan", "active"], complete: ["Complete", "done"], declined: ["Not going ahead", "muted"],
};
const KIND = {
  proposal: ["Request", "rel"], decision: ["Decision", "sheet"], report: ["Progress report", "doc"],
  milestone: ["Milestone", "graph"], meeting: ["Meeting", "muted"], file: ["Deliverable", "doc"],
  invoice: ["Invoice", "rel"], payment: ["Payment", "sheet"],
};
const FILTERS = [["all", "Everything"], ["report", "Progress reports"], ["key", "Milestones and decisions"]];

let data, selected, filter = "all", claimFor = null; // claimFor: the invoice whose "I've sent payment" form is open

// POST a client action; the reply is this client's updated project.
async function act(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) throw new Error("Couldn’t reach the server. Check your connection and try again.");
  if (res.status === 401) { location.replace("login.html?expired"); throw new Error(""); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Something went wrong. Please try again.");
  const i = data.projects.findIndex((x) => x.id === out.project.id);
  data.projects[i] = out.project;
}

async function load() {
  let res;
  try { res = await fetch("/api/portal", { cache: "no-store" }); }
  catch { return message("Couldn’t reach the server. Check your connection and reload."); }
  if (res.status === 401) return location.replace("login.html?expired");
  if ([404, 405, 501].includes(res.status)) return message("Preview only: the client portal runs on the live site, not on this preview copy.", true);
  if (!res.ok) return message((await res.json().catch(() => ({}))).error || "Something went wrong. Please reload.");
  data = await res.json();
  const first = data.projects.find((p) => p.status === "active") || data.projects[0];
  const asked = decodeURIComponent(location.hash.slice(1)); // e.g. back from the test checkout
  selected = data.projects.some((p) => p.id === asked) ? asked : first?.id;
  render();
}

function message(text, withLogin) {
  el.innerHTML = `<div class="card portal-msg"><p>${esc(text)}</p>${withLogin ? `<p><a class="btn ghost small" href="index.html">Back to the site</a></p>` : ""}</div>`;
}

function render() {
  const { user, projects, stages } = data;
  const p = projects.find((x) => x.id === selected);
  const first = (user.name || "").split(" ")[0];
  el.innerHTML = `
    <header class="portal-head">
      <div><div class="eyebrow">Client portal</div><h1>${first ? `Welcome back, ${esc(first)}` : "Your projects"}</h1></div>
      <div class="row-btns">${user.admin ? `<a class="btn small" href="admin.html">Admin</a>` : ""}<a class="btn ghost small" href="account.html">Your account</a><button class="btn ghost small" id="logout" type="button">Sign out</button></div>
    </header>
    ${user.tester ? testerBar() : ""}
    ${projects.some((x) => x.test) ? `<p class="sample-note">Test data: your real projects with made-up prices, invoices and payments. Only your login can see them.</p>` : ""}
    ${projects.some((x) => x.sample) ? `<p class="sample-note">Sample projects: the business, people and figures are invented so you can see how the portal works.</p>` : ""}
    ${projects.length ? `<div class="proj-list" role="tablist" aria-label="Your projects">${projects.map(projTab).join("")}</div>` : `<div class="card portal-msg"><p>No projects yet. Once a proposal is accepted, it appears here.</p></div>`}
    ${p ? detail(p, stages) : ""}`;
  el.querySelector("#logout").onclick = logout;
  el.querySelectorAll("[data-proj]").forEach((b) => b.onclick = () => { selected = b.dataset.proj; filter = "all"; render(); });
  el.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { filter = b.dataset.filter; render(); });
  if (p) wireActions(p);
  el.querySelector("#tester-new")?.addEventListener("click", async (e) => {
    if (projects.some((x) => x.sandbox) && !confirm("Start over? Your practice project and its test payments are deleted and a fresh one is made.")) return;
    e.target.disabled = true;
    const res = await fetch("/api/tester", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { e.target.disabled = false; return alert(out.error || "Couldn’t make a practice project."); }
    location.hash = out.id; load();
  });
}

function testerBar() {
  const has = data.projects.some((x) => x.sandbox);
  return `<div class="tester-bar" role="note"><span><b>Tester.</b> Test projects use the payment simulator: the Pay buttons work, and no money moves.</span>
    <button class="btn ghost small" id="tester-new" type="button">${has ? "Start over with a fresh practice project" : "Make a practice project"}</button></div>`;
}

// Pay buttons: testers and admins on test projects only, until a real provider is live. The checkout page
// is the simulator's; with Stripe/PayPal it becomes theirs.
function payButtons(p, i) {
  if (!(p.test && data.user.tester) || i.status !== "sent" || i.balance <= i.awaiting) return "";
  return `<div class="inv-pay"><span class="muted">Pay ${cents(i.balance - i.awaiting)} online:</span>${(data.payMethods || []).map((m) =>
    `<button type="button" class="btn small${m.id === "bank_debit" ? "" : " ghost"}" data-pay="${esc(i.number)}" data-method="${m.id}">${esc(m.label)}</button>`).join("")}</div>`;
}

function wireActions(p) {
  const fail = (form, e) => { if (e.message) { const m = form.querySelector(".form-err"); m.textContent = e.message; m.hidden = false; } };
  const af = el.querySelector("#accept-form");
  if (af) af.onsubmit = async (e) => {
    e.preventDefault();
    af.querySelector("button[type=submit]").disabled = true;
    try { await act("/api/accept", { id: p.id, name: af.name.value, agree: af.agree.checked }); render(); }
    catch (err) { af.querySelector("button[type=submit]").disabled = false; fail(af, err); }
  };
  el.querySelectorAll("[data-claim]").forEach((b) => b.onclick = () => { claimFor = b.dataset.claim; render(); el.querySelector("#claim-form [name=method]")?.focus(); });
  el.querySelectorAll("[data-pay]").forEach((b) => b.onclick = async () => {
    b.disabled = true;
    const res = await fetch("/api/pay/start", { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ number: b.dataset.pay, method: b.dataset.method }) }).catch(() => null);
    const out = res ? await res.json().catch(() => ({})) : {};
    if (!res?.ok) { b.disabled = false; return alert(out.error || "Couldn’t start the payment."); }
    location.href = out.url;
  });
  const cf = el.querySelector("#claim-form");
  if (cf) {
    cf.querySelector("#claim-cancel").onclick = () => { claimFor = null; render(); };
    cf.onsubmit = async (e) => {
      e.preventDefault();
      try { await act("/api/payment-sent", { number: claimFor, ...Object.fromEntries(new FormData(cf)) }); claimFor = null; render(); }
      catch (err) { fail(cf, err); }
    };
  }
}

const pill = (status) => { const [label, tone] = STATUS[status] || [status, "muted"]; return `<span class="st ${tone}">${esc(label)}</span>`; };

function projTab(p) {
  return `<button role="tab" class="proj-tab" data-proj="${esc(p.id)}" aria-selected="${p.id === selected}">
    <span class="pt-title">${esc(p.title)}</span><span class="pt-sub">${esc(p.business)} · ${esc(p.id)}</span>${pill(p.status)}${owingBadge(p)}</button>`;
}

// "Overdue" or "Payment due" on a project tab, unless the client has already said it's on its way.
function owingBadge(p) {
  const open = (p.invoices || []).filter((i) => i.status === "sent" && i.balance > i.awaiting);
  if (!open.length) return "";
  return open.some((i) => i.state === "overdue") ? `<span class="st late">Overdue</span>` : `<span class="st review">Payment due</span>`;
}

function stepper(p, stages) {
  const at = stages.findIndex((s) => s.id === p.stage);
  return `<ol class="stepper" aria-label="Project stage">${stages.map((s, i) => {
    const state = i < at || p.status === "complete" ? "done" : i === at ? "now" : "next";
    const pct = state === "now" && p.progress != null ? `<span class="step-pct">${p.progress}%</span>` : "";
    return `<li class="${state}"${state === "now" ? ' aria-current="step"' : ""}><span class="dot"></span><span class="step-label">${esc(s.label)}</span>${pct}</li>`;
  }).join("")}</ol>`;
}

function detail(p, stages) {
  const pending = ["submitted", "review", "approved"].includes(p.status);
  const facts = [
    ["Requested", day(p.dates?.proposed)],
    p.dates?.accepted && ["Accepted", day(p.dates.accepted)],
    p.dates?.targetLaunch && ["Target launch", day(p.dates.targetLaunch)],
    p.contact && ["Your contact", esc(p.contact)],
  ].filter(Boolean);
  return `<section class="proj card" aria-label="${esc(p.title)}">
    <div class="proj-top">
      <div><span class="chip svc-chip">${esc(p.service)}</span><h2>${esc(p.title)}</h2><p class="muted">${esc(p.summary)}</p></div>
      ${pill(p.status)}
    </div>
    ${stepper(p, stages)}
    <dl class="facts">${facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join("")}</dl>
    ${p.status === "approved" && p.price ? acceptPanel(p) : pending ? `<div class="callout">We’re reviewing this request. We reply within two business days with questions or a fixed-scope quote. Once you accept the quote, progress reports and the full project history appear here.</div>` : ""}
    ${p.status === "active" && p.stage === "approved" ? `<div class="callout">Thank you for accepting the quote. Work starts with discovery as soon as the first invoice is paid.</div>` : ""}
    ${p.next ? `<div class="next-up"><span class="eyebrow">Next</span><b>${day(p.next.date)}</b><span>${esc(p.next.text)}</span></div>` : ""}
    <div class="proj-grid">
      <div>${history(p)}</div>
      ${p.price || p.invoices?.length ? `<aside>${pricing(p)}</aside>` : ""}
    </div>
  </section>`;
}

function acceptPanel(p) {
  const first = p.firstInvoice || [];
  const total = first.reduce((t, l) => t + l.amount, 0);
  return `<form class="accept card" id="accept-form">
    <h3>Your quote is ready</h3>
    <p>The fixed-scope prices are on the right. Accept here to go ahead; there’s nothing to sign or send back.</p>
    ${first.length ? `<p>We’ll send your first invoice straight away: <b>${esc(first.map((l) => l.item).join(", "))}, ${cents(total)}</b>, due in ${data.dueDays || 15} days. Work starts when it’s paid.</p>` : ""}
    <label class="acc-name">Your full name<input name="name" autocomplete="name" required maxlength="120"></label>
    <label class="acc-agree"><input type="checkbox" name="agree" required> I accept this quote, its prices and payment terms, for ${esc(p.business || "my business")}.</label>
    <p class="form-err" role="alert" hidden></p>
    <div class="row-btns"><button class="btn" type="submit">Accept quote</button>
      <span class="muted small">Questions first? Reply to the quote email and we’ll talk it through.</span></div>
  </form>`;
}

// The invoice a timeline entry is about: "View invoice", or "Receipt" once it's paid.
function entryLink(p, h) {
  if (!h.invoice) return "";
  const inv = (p.invoices || []).find((i) => i.number === h.invoice);
  if (!inv) return "";
  return `<a class="tl-link" href="invoice.html?n=${encodeURIComponent(inv.number)}">${inv.state === "paid" ? "Receipt" : "View invoice"} ${esc(inv.number)}</a>`;
}

function history(p) {
  const items = p.history.filter((h) => filter === "all" || (filter === "report" ? h.kind === "report" : ["milestone", "decision", "file"].includes(h.kind)));
  return `<div class="hist-head"><h3>Project history</h3>
    ${p.history.length > 3 ? `<div class="filters">${FILTERS.map(([id, label]) => `<button type="button" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join("")}</div>` : ""}</div>
    <ol class="timeline">${items.map((h) => { const [label, tone] = KIND[h.kind] || [h.kind, "muted"]; return `
      <li class="tl ${tone}"><span class="tl-dot"></span>
        <div class="tl-meta"><time datetime="${esc(h.date)}">${day(h.date)}</time><span class="tl-kind">${label}</span></div>
        <h4>${esc(h.title)}</h4><p>${esc(h.body)}</p>${entryLink(p, h)}</li>`; }).join("") || `<li class="muted">Nothing in this view yet.</li>`}</ol>`;
}

function pricing(p) {
  const invs = p.invoices || [];
  const owing = invs.filter((i) => i.status === "sent" && i.balance > 0);
  const label = (i) => i.awaiting && i.state !== "paid" ? ["Payment sent, waiting for confirmation", "review"] : invoiceLabel(i);
  return `<div class="side-card"><h3>${p.price ? "Price and payments" : "Invoices"}</h3>
    ${p.price ? `<ul class="price-list">${p.price.map((x) => `<li><span>${esc(x.item)}</span><b>${money(x.amount)}${x.per ? `<small>/${esc(x.per)}</small>` : ""}</b><em>${esc(x.terms)}</em></li>`).join("")}</ul>` : ""}
    ${invs.length ? `<h4 class="small">Invoices</h4><ul class="inv-list">${invs.map((i) => { const [text, tone] = label(i); return `<li>
      <span class="inv-no">${esc(i.number)}</span><span class="inv-amt">${cents(i.total)}</span>
      <span class="inv-what">${esc(i.lines.map((l) => l.item).join(", "))}</span>
      <span class="st ${tone}">${esc(text)}</span><a href="invoice.html?n=${encodeURIComponent(i.number)}">View${i.state === "paid" ? " receipt" : " invoice"}</a>
      ${i.declined ? `<p class="inv-declined">Your last payment by ${esc(i.declined.method === "paypal" ? "PayPal" : i.declined.method === "card" ? "card" : "bank account")} didn’t go through${i.declined.date ? ` (${day(i.declined.date)})` : ""}. Try again or use another method.</p>` : ""}
      ${payButtons(p, i)}
      ${i.status === "sent" && i.balance > i.awaiting && claimFor !== i.number ? `<button type="button" class="btn ghost small inv-sent" data-claim="${esc(i.number)}">I’ve sent payment</button>` : ""}
      ${claimFor === i.number ? claimForm(i) : ""}</li>`; }).join("")}</ul>`
      : `<p class="muted small">Invoices and payment receipts will appear here and in your project history.</p>`}
    ${owing.length ? `<p class="pay-how"><b>How to pay:</b> ${data.payTo ? esc(data.payTo) : "bank transfer or check. Our details are on each invoice once our business account is open; until then, reply to the invoice email and we’ll send them."}</p>` : ""}
  </div>`;
}

// "I've sent payment" for a bank transfer or check. Card and PayPal come with the Pay button later.
function claimForm(i) {
  const left = i.balance - i.awaiting;
  return `<form class="claim-form" id="claim-form">
    <label>How<select name="method"><option value="bank_transfer">Bank transfer</option><option value="check">Check</option></select></label>
    <label>Amount ($)<input name="amount" inputmode="decimal" value="${(left / 100).toFixed(2)}" required></label>
    <label>Date sent<input type="date" name="date" value="${new Date().toLocaleDateString("en-CA")}" required></label>
    <label>Check number or transfer reference (optional)<input name="reference" maxlength="80"></label>
    <p class="form-err" role="alert" hidden></p>
    <div class="row-btns"><button class="btn small" type="submit">Let us know</button><button class="btn ghost small" type="button" id="claim-cancel">Cancel</button></div>
    <p class="muted small">We confirm it when it reaches our account, usually within two business days.</p>
  </form>`;
}

async function logout() {
  await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  location.replace("login.html");
}

load();
