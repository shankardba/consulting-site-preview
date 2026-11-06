// Client portal: loads /api/portal (needs the session cookie) and draws the signed-in client's projects.
import { cents, invoiceLabel } from "./money.js";
import * as X from "./integrations/index.js";
const el = document.getElementById("portal");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";
// A timeline entry's date, with the time (US Eastern) when it was recorded as it happened.
const stamp = (h) => h.at ? new Date(h.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : day(h.date);
const money = (n) => "$" + Number(n).toLocaleString("en-US");

const STATUS = {
  submitted: ["Under review", "review"], review: ["Under review", "review"], approved: ["Accepted", "review"],
  active: ["In progress", "active"], care: ["Care plan", "active"], complete: ["Complete", "done"], declined: ["Not going ahead", "muted"],
  rolledback: ["Rolled back", "muted"],
};
const KIND = {
  proposal: ["Request", "rel"], decision: ["Decision", "sheet"], report: ["Status report", "doc"],
  milestone: ["Milestone", "graph"], meeting: ["Meeting", "muted"], file: ["Deliverable", "doc"],
  invoice: ["Invoice", "rel"], payment: ["Payment", "sheet"],
};
const FILTERS = [["all", "Everything"], ["report", "Status reports"], ["key", "Milestones and decisions"]];
const stampAt = (iso) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "";
const seen = new Set(); // projects whose status reports we've marked as read this visit
let asking = false;     // the "New request" form is open

let data, selected, filter = "all", claimFor = null; // claimFor: the invoice whose "I've sent payment" form is open

// POST a client action; the reply is this client's updated project.
// What integration panels get (js/integrations/index.js).
const xctx = () => ({ root: el, esc, day, meta: { integrations: data.integrations || [] }, toast: () => {}, reload: load,
  api: async (name, op, body) => { const out = await act(`/api/x/${name}/${op}`, body); render(); return out; },
  done: () => render() });

async function act(path, body) {
  const res = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (!res) throw new Error("Couldn’t reach the server. Check your connection and try again.");
  if (res.status === 401) { location.replace("login.html?expired"); throw new Error(""); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Something went wrong. Please try again.");
  if (!out.project) return out;
  const i = data.projects.findIndex((x) => x.id === out.project.id);
  if (i >= 0) data.projects[i] = out.project;
  else { data.projects.unshift(out.project); selected = out.project.id; } // a new request
  return out;
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
      <div class="row-btns">${(data.orgs || []).length ? `<button class="btn small" id="ask-btn" type="button">New request</button>` : ""}${user.admin ? `<a class="btn small" href="admin.html">Admin</a>` : ""}<a class="btn ghost small" href="account.html">Your account</a><button class="btn ghost small" id="logout" type="button">Sign out</button></div>
    </header>
    ${user.tester ? testerBar() : ""}
    ${projects.some((x) => x.test) ? `<p class="sample-note">Test data: your real projects with made-up prices, invoices and payments. Only your login can see them.</p>` : ""}
    ${projects.some((x) => x.sample) ? `<p class="sample-note">Sample projects: the business, people and figures are invented so you can see how the portal works.</p>` : ""}
    ${asking ? askForm() : ""}
    ${projects.length ? `<div class="proj-list" role="tablist" aria-label="Your projects">${projects.map(projTab).join("")}</div>` : `<div class="card portal-msg"><p>No projects yet. Once a proposal is accepted, it appears here.</p></div>`}
    ${p ? detail(p, stages) : ""}`;
  el.querySelector("#logout").onclick = logout;
  wireAsk();
  if (p && !seen.has(p.id) && p.history.some((h) => h.kind === "report")) {
    seen.add(p.id); // read receipt for status reports: the first time the client opens this project
    fetch("/api/seen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: p.id }) }).catch(() => {});
  }
  el.querySelectorAll("[data-proj]").forEach((b) => b.onclick = () => { selected = b.dataset.proj; filter = "all"; render(); });
  el.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { filter = b.dataset.filter; render(); });
  if (p) { wireActions(p); X.wireClient(p, xctx()); }
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
  const methods = (data.payMethods || []).filter((m) => (p.pay || []).includes(m.id));
  if (i.processing?.[0]?.verify) return `<p class="small"><b>One more step:</b> confirm your bank account to finish paying ${cents(i.processing[0].amount)}. Stripe sends two small deposits within 1 to 2 business days; enter them on ${i.processing[0].verifyUrl ? `<a href="${esc(i.processing[0].verifyUrl)}" rel="noopener">Stripe's confirmation page</a>` : "the page in Stripe's email"}.</p>`;
  if (i.processing?.length) return `<p class="muted small">Your bank payment of ${cents(i.processing[0].amount)} is clearing. It usually takes 3 to 5 business days, and this invoice updates by itself.</p>`;
  if (!methods.length || i.status !== "sent" || i.balance <= i.awaiting) return "";
  const due = i.balance - i.awaiting;
  // Bank shows its discounted price; the others the full balance.
  const price = (m) => m.id === "bank_debit" && i.bank && !i.awaiting ? `${cents(i.bank.price)}, ${i.bank.pct}% off` : cents(due);
  return `<div class="inv-pay"><span class="muted">Pay online${data.stripeTest ? " (test mode: no money moves)" : ""}:</span>${methods.map((m) =>
    `<button type="button" class="btn small${m.id === "bank_debit" ? "" : " ghost"}" data-pay="${esc(i.number)}" data-method="${m.id}">${esc(m.label)}: ${price(m)}</button>`).join("")}
    ${(p.pay || []).includes("over_time") && data.payOverTime && due >= data.payOverTime.min ? overTime(i) : ""}</div>`;
}

// Affirm / Klarna kept apart from the Pay button: a closed panel the client has to open, an explanation that it's a
// loan from them, and a tick box before the button works. Their own page then shows only those two.
function overTime(i) {
  return `<details class="inv-overtime"><summary>Prefer to pay in instalments? (Affirm or Klarna)</summary>
    <div class="ot-body">
      <p>This is a separate option from Pay online. Affirm or Klarna pays us in full, and you repay them in instalments
        under their own terms, which may include interest. They decide whether to approve you and may run a credit check.</p>
      <label class="ot-ok"><input type="checkbox" data-ot-ok="${esc(i.number)}"> I understand this is a loan from Affirm or Klarna, not a card or bank payment.</label>
      <button type="button" class="btn ghost small" data-pay="${esc(i.number)}" data-method="over_time" disabled>${esc(data.payOverTime.label)}</button>
    </div></details>`;
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
  const sf = el.querySelector("#sign-form");
  if (sf) sf.onsubmit = async (e) => {
    e.preventDefault();
    sf.querySelector("button[type=submit]").disabled = true;
    try { await act("/api/plan/sign", { id: p.id, name: sf.name.value, agree: sf.agree.checked, hash: p.plan.agreementHash }); render(); }
    catch (err) { sf.querySelector("button[type=submit]").disabled = false; fail(sf, err); }
  };
  const of = el.querySelector("#signoff-form");
  if (of) of.onsubmit = async (e) => {
    e.preventDefault();
    of.querySelector("button[type=submit]").disabled = true;
    try { await act("/api/signoff", { id: p.id, name: of.name.value, agree: of.agree.checked }); render(); }
    catch (err) { of.querySelector("button[type=submit]").disabled = false; fail(of, err); }
  };
  el.querySelectorAll("[data-claim]").forEach((b) => b.onclick = () => { claimFor = b.dataset.claim; render(); el.querySelector("#claim-form [name=method]")?.focus(); });
  el.querySelectorAll("[data-ot-ok]").forEach((c) => c.onchange = () => {
    const b = c.closest(".ot-body").querySelector("[data-method=over_time]");
    b.disabled = !c.checked;
  });
  el.querySelectorAll("[data-pay]").forEach((b) => b.onclick = async () => {
    if (b.dataset.method === "over_time" && !b.closest(".ot-body")?.querySelector("[data-ot-ok]")?.checked) return;
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
  if (p.plan?.stages && p.plan.status === "signed") return planStepper(p);
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
    ${p.status === "approved" && p.plan?.status === "sent" ? planPanel(p)
      : p.status === "approved" && p.price && !p.plan ? acceptPanel(p)
      : p.status === "approved" ? `<div class="callout">${p.plan?.status === "revising" ? "We’re updating the plan and agreement. We’ll email you when the new version is ready to review." : "We’ve accepted your request. We’re preparing the plan, agreement and payment schedule, and we’ll email you when they’re ready to review and sign here."}</div>`
      : pending ? `<div class="callout">We’re reviewing this request and reply within two business days. Every step appears below with its date and time.</div>` : ""}
    ${p.status === "active" && p.stage === "approved" && !p.plan ? `<div class="callout">Thank you for accepting the quote. Work starts with discovery as soon as the first invoice is paid.</div>` : ""}
    ${p.plan?.status === "signed" ? deliveryPanel(p) : ""}
    ${X.clientCards(p, xctx())}
    ${p.next ? `<div class="next-up"><span class="eyebrow">Next</span><b>${day(p.next.date)}</b><span>${esc(p.next.text)}</span></div>` : ""}
    <div class="proj-grid">
      <div>${history(p)}</div>
      ${p.price || p.plan?.stages || p.invoices?.length ? `<aside>${pricing(p)}</aside>` : ""}
    </div>
  </section>`;
}

// ---------- plan, agreement, stages, sign-off ----------

const SST = { planned: ["Coming up", "muted"], due: ["Invoice sent", "review"], active: ["In progress", "active"], done: ["Done", "done"] };

function scheduleList(pl) {
  const total = pl.stages.reduce((t, s) => t + s.amount, 0) + pl.finalAmount;
  return `<ul class="price-list">${pl.stages.map((s) => `<li><span>${esc(s.name)}</span><b>${cents(s.amount)}</b><em>${s.amount ? "Paid at the start of the stage" : "No charge"}</em></li>`).join("")}
    <li><span>Final payment</span><b>${cents(pl.finalAmount)}</b><em>After you sign off the production deployment</em></li>
    ${pl.careMonthly ? `<li><span>Care plan (optional)</span><b>${cents(pl.careMonthly)}<small>/month</small></b><em>After launch</em></li>` : ""}
    <li><span><b>Total</b></span><b>${cents(total)}</b></li></ul>`;
}

function planPanel(p) {
  const pl = p.plan;
  const first = pl.stages.find((s) => s.amount > 0);
  return `<form class="accept card" id="sign-form">
    <h3>Your plan and agreement are ready</h3>
    ${pl.summary ? `<p>${esc(pl.summary)}</p>` : ""}
    <ol class="plan-steps">${pl.stages.map((s) => `<li><b>${esc(s.name)}</b>${s.target ? ` <span class="muted small">target ${day(s.target)}</span>` : ""}
      ${s.deliverables ? `<span>${esc(s.deliverables)}</span>` : ""}<span class="muted small">${s.amount ? `${cents(s.amount)}, invoiced when the stage starts. Work begins once it’s paid.` : "No charge."}</span></li>`).join("")}
      <li><b>Production shakeout and sign-off</b><span>You get ${pl.shakeoutDays} days to test the live system, then sign off here.</span>
      <span class="muted small">${pl.finalAmount ? `Final payment ${cents(pl.finalAmount)}, invoiced at sign-off.` : "No final payment."}</span></li></ol>
    <details open><summary><b>The agreement</b> (standard terms v1, plan version ${pl.version})</summary><pre class="agreement">${esc(pl.agreement)}</pre></details>
    ${first ? `<p>When you sign, we send the first invoice: <b>${esc(first.name)}, ${cents(first.amount)}</b>, due in ${data.dueDays || 15} days.</p>` : ""}
    <label class="acc-name">Your full name<input name="name" autocomplete="name" required maxlength="120"></label>
    <label class="acc-agree"><input type="checkbox" name="agree" required> I agree to this plan and agreement for ${esc(p.org?.name || p.business || "my business")}, including the payment schedule, sign-off and rollback terms.</label>
    <p class="form-err" role="alert" hidden></p>
    <div class="row-btns"><button class="btn" type="submit">Sign the agreement</button>
      <span class="muted small">We record the date, time and the exact text you signed. Questions first? Reply to our email.</span></div>
  </form>`;
}

function planStepper(p) {
  const st = p.plan.stages, sh = p.shakeout;
  const items = [...st.map((s) => ({ label: s.name, state: s.status === "done" ? "done" : s.status === "active" || s.status === "due" ? "now" : "next" })),
    { label: "Sign-off", state: p.status === "complete" || p.status === "care" ? "done" : sh && !sh.rolledBack ? "now" : "next" }];
  if (sh && !sh.rolledBack) items.forEach((x, i) => { if (i < items.length - 1) x.state = "done"; });
  return `<ol class="stepper" aria-label="Project stages">${items.map((x) => {
    const pct = x.state === "now" && p.progress != null && !sh ? `<span class="step-pct">${p.progress}%</span>` : "";
    return `<li class="${x.state}"${x.state === "now" ? ' aria-current="step"' : ""}><span class="dot"></span><span class="step-label">${esc(x.label)}</span>${pct}</li>`;
  }).join("")}</ol>`;
}

function deliveryPanel(p) {
  const pl = p.plan, sh = p.shakeout;
  const due = pl.stages.find((s) => s.status === "due");
  const active = pl.stages.find((s) => s.status === "active");
  if (p.status === "rolledback") return `<div class="callout bad">The production changes were rolled back on ${stampAt(sh?.rolledBack)}, because the shakeout ended without sign-off and payment, as the agreement sets out. Talk to us to pick it back up: we redeploy once it’s signed off and paid.</div>`;
  if (sh && !sh.signedOff) return `<form class="accept card" id="signoff-form">
    <h3>Your project is live. Please test it and sign off</h3>
    <p>It went into production ${stampAt(sh.started)}. You have until <b>${stampAt(sh.ends)}</b> to test it. If anything isn’t working as agreed, tell us and we’ll fix it. When you’re happy, sign off here.</p>
    ${pl.finalAmount ? `<p>Signing off sends the final invoice: <b>${cents(pl.finalAmount)}</b>.</p>` : ""}
    <p class="muted small">If the shakeout ends without sign-off and payment, the agreement says we roll the changes back.</p>
    <label class="acc-name">Your full name<input name="name" autocomplete="name" required maxlength="120"></label>
    <label class="acc-agree"><input type="checkbox" name="agree" required> The production deployment works as agreed, and I sign it off for ${esc(p.org?.name || p.business || "my business")}.</label>
    <p class="form-err" role="alert" hidden></p>
    <div class="row-btns"><button class="btn" type="submit">Sign off</button></div></form>`;
  if (sh?.signedOff && !sh.paid) return `<div class="callout">Thank you for signing off. The final invoice${sh.finalInvoice ? ` (${esc(sh.finalInvoice)})` : ""} is on the right.</div>`;
  if (due) return `<div class="callout">Next up: <b>${esc(due.name)}</b>. Its invoice (${esc(due.invoice)}) is on the right, and work on this stage begins once it’s paid.</div>`;
  if (active) return `<div class="callout">Now working on <b>${esc(active.name)}</b>${active.deliverables ? `: ${esc(active.deliverables)}` : ""}. Status reports appear in the history below.</div>`;
  return "";
}

function reportBits(h) {
  const d = h.details || {};
  const row = (k, v, cls = "") => v ? `<p class="small ${cls}"><b>${k}:</b> ${esc(v)}</p>` : "";
  return `${d.stage ? `<p class="muted small">Report ${d.n || ""} · ${esc(d.stage)}</p>` : ""}${row("Done", d.done)}${row("Next", d.next)}${row("Needed from you", d.needs, "needs")}
    ${d.progress != null ? row("Stage progress", d.progress + "%") : ""}
    ${(d.links || []).map((u) => `<a class="small tl-link" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join(" ")}`;
}

// ---------- new request (customers) ----------

function askForm() {
  const orgs = data.orgs || [];
  return `<form class="card accept" id="ask-form"><h3>New request</h3>
    <p class="muted small">It goes to us straight away and starts under review. Every step appears here with its date and time.</p>
    ${orgs.length > 1 ? `<label>For<select name="orgId">${orgs.map((o) => `<option value="${o.id}">${esc(o.name)}</option>`).join("")}</select></label>` : `<p class="small">For <b>${esc(orgs[0]?.name || "")}</b></p>`}
    <label>What do you need?<input name="title" required maxlength="120" placeholder="e.g. Stock counts app"></label>
    <label>Kind of work (optional)<input name="service" maxlength="80" list="ask-services"></label>
    <datalist id="ask-services"><option value="Spreadsheet to App"><option value="Workbook Audit"><option value="Automation"><option value="Website"><option value="Knowledge Assistant"></datalist>
    <label>Tell us more<textarea name="summary" rows="4" maxlength="2000"></textarea></label>
    <p class="form-err" role="alert" hidden></p>
    <div class="row-btns"><button class="btn" type="submit">Send request</button><button class="btn ghost" type="button" id="ask-cancel">Cancel</button></div></form>`;
}

function wireAsk() {
  const b = el.querySelector("#ask-btn"); if (b) b.onclick = () => { asking = true; render(); el.querySelector("#ask-form [name=title]")?.focus(); };
  const f = el.querySelector("#ask-form"); if (!f) return;
  f.querySelector("#ask-cancel").onclick = () => { asking = false; render(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    f.querySelector("button[type=submit]").disabled = true;
    try { await act("/api/request", Object.fromEntries(new FormData(f))); asking = false; render(); }
    catch (err) { f.querySelector("button[type=submit]").disabled = false; const m = f.querySelector(".form-err"); m.textContent = err.message; m.hidden = false; }
  };
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
        <div class="tl-meta"><time datetime="${esc(h.at || h.date)}">${stamp(h)}</time><span class="tl-kind">${label}</span></div>
        <h4>${esc(h.title)}</h4><p>${esc(h.body)}</p>${h.kind === "report" ? reportBits(h) : ""}${entryLink(p, h)}</li>`; }).join("") || `<li class="muted">Nothing in this view yet.</li>`}</ol>`;
}

function pricing(p) {
  const invs = p.invoices || [];
  const owing = invs.filter((i) => i.status === "sent" && i.balance > 0);
  const label = (i) => i.awaiting && i.state !== "paid" ? ["Payment sent, waiting for confirmation", "review"] : invoiceLabel(i);
  return `<div class="side-card"><h3>${p.price || p.plan?.stages ? "Price and payments" : "Invoices"}</h3>
    ${p.plan?.stages ? scheduleList(p.plan) : ""}
    ${p.price ? `<ul class="price-list">${p.price.map((x) => `<li><span>${esc(x.item)}</span><b>${money(x.amount)}${x.per ? `<small>/${esc(x.per)}</small>` : ""}</b><em>${esc(x.terms)}</em></li>`).join("")}</ul>` : ""}
    ${invs.length ? `<h4 class="small">Invoices</h4><ul class="inv-list">${invs.map((i) => { const [text, tone] = label(i); return `<li>
      <span class="inv-no">${esc(i.number)}</span><span class="inv-amt">${cents(i.total)}</span>
      <span class="inv-what">${esc(i.lines.map((l) => l.item).join(", "))}</span>
      <span class="st ${tone}">${esc(text)}</span><a href="invoice.html?n=${encodeURIComponent(i.number)}">View${i.state === "paid" ? " receipt" : " invoice"}</a>
      ${i.declined ? `<p class="inv-declined">Your last payment by ${esc(i.declined.via === "affirm" ? "Affirm" : i.declined.via === "klarna" ? "Klarna" : i.declined.via === "cashapp" ? "Cash App Pay" : i.declined.method === "paypal" ? "PayPal" : i.declined.method === "card" ? "card" : "bank account")} didn’t go through${i.declined.date ? ` (${day(i.declined.date)})` : ""}. Try again or use another method.</p>` : ""}
      ${payButtons(p, i)}
      ${i.status === "sent" && i.balance > i.awaiting && claimFor !== i.number ? `<button type="button" class="btn ghost small inv-sent" data-claim="${esc(i.number)}">I’ve sent payment</button>` : ""}
      ${claimFor === i.number ? claimForm(i) : ""}</li>`; }).join("")}</ul>`
      : `<p class="muted small">Invoices and payment receipts will appear here and in your project history.</p>`}
    ${owing.length ? `<p class="pay-how"><b>How to pay:</b> ${data.payTo ? esc(data.payTo) : "bank transfer or check. Our details are on each invoice once our business account is open; until then, reply to the invoice email and we’ll send them."}</p>` : ""}
  </div>`;
}

// "I've sent payment" for a bank transfer or check. Card and PayPal come with the Pay button later.
function claimForm(i) {
  const left = i.bank && !i.awaiting ? i.bank.price : i.balance - i.awaiting;
  return `<form class="claim-form" id="claim-form">
    ${i.bank && !i.awaiting ? `<p class="muted small">Paying the whole invoice by bank transfer or check takes ${i.bank.pct}% off: ${cents(i.bank.price)} instead of ${cents(i.balance)}.</p>` : ""}
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
