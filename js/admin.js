// Admin screen: every project, its status actions, invoices, delivery details and history. Talks to /api/admin/*.
import { cents, invoiceLabel, METHOD, moneySummary } from "./money.js";
import * as X from "./integrations/index.js";
const el = document.getElementById("admin");
const toastEl = document.getElementById("toast");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";
const stampAt = (iso) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "";
const stamp = (h) => h.at ? new Date(h.at).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : day(h.date);
const money = (n) => "$" + Number(n).toLocaleString("en-US");

const STATUS = {
  submitted: ["New request", "review"], review: ["Under review", "review"], approved: ["Accepted", "rel"],
  active: ["In progress", "active"], care: ["Care plan", "active"], complete: ["Complete", "done"], declined: ["Declined", "muted"], rolledback: ["Rolled back", "muted"],
};
const KIND = { proposal: ["Request", "rel"], decision: ["Decision", "sheet"], report: ["Status report", "doc"],
  milestone: ["Milestone", "graph"], meeting: ["Meeting", "muted"], file: ["Deliverable", "doc"],
  invoice: ["Invoice", "rel"], payment: ["Payment", "sheet"] };
const CLIENT_SEES = ["proposal", "decision", "invoice", "payment"]; // before acceptance
const BILLABLE = ["approved", "active", "care", "complete"];
const VIEWS = [
  ["open", "Needs a reply", (p) => ["submitted", "review"].includes(p.status)],
  ["quoted", "Quote sent", (p) => p.status === "approved"],
  ["active", "In progress", (p) => p.status === "active"],
  ["care", "Care plans", (p) => p.status === "care"],
  ["closed", "Closed", (p) => ["complete", "declined"].includes(p.status)],
  ["all", "All", () => true],
];
const DEFAULT_QUOTE = [
  { item: "Discovery", amount: "", per: "", terms: "Paid in full upfront" },
  { item: "Build", amount: "", per: "", terms: "50% at signing, 50% at launch" },
];

let meta = {}, projects = [], selected = location.hash.slice(1) || null, view = "open", quoting = false;
let planEdit = false; // the plan form is open on a sent plan (revising)
let invOpen = false, payFor = null, refundFor = null; // the new-invoice form, and which invoice's payment form is open

async function api(path, body) {
  const res = await fetch("/api/admin/" + path, body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { cache: "no-store" });
  if (res.status === 401) { location.replace("login.html?expired"); throw new Error("signed out"); }
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || "Something went wrong.");
  return out;
}

function toast(msg, bad) {
  toastEl.textContent = msg; toastEl.hidden = false; toastEl.classList.toggle("bad", !!bad);
  clearTimeout(toast.t); toast.t = setTimeout(() => (toastEl.hidden = true), bad ? 6000 : 2500);
}

async function load() {
  let res;
  try { res = await fetch("/api/admin/projects", { cache: "no-store" }); }
  catch { return message("Couldn’t reach the server. Check your connection and reload."); }
  if (res.status === 401) return location.replace("login.html?expired");
  if (res.status === 403) return message("This screen is for admins. Your client view is on the projects page.", "portal.html");
  if ([404, 405, 501].includes(res.status)) return message("Preview only: the admin screen runs on the live site, not on this preview copy.", "index.html");
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return message(out.error || "Something went wrong. Please reload.");
  ({ projects, ...meta } = out);
  if (!projects.some((p) => p.id === selected)) selected = null;
  if (selected) follow();
  else {
    if (!projects.some(VIEWS[0][2])) view = "all";
    selected = projects.find(VIEWS.find(([id]) => id === view)[2])?.id || null;
  }
  el.removeAttribute("aria-busy");
  render();
}

function message(text, href) {
  el.removeAttribute("aria-busy");
  el.innerHTML = `<div class="card portal-msg"><p>${esc(text)}</p>${href ? `<p><a class="btn ghost small" href="${href}">Continue</a></p>` : ""}</div>`;
}

const cur = () => projects.find((p) => p.id === selected);
const pill = (s) => { const [label, tone] = STATUS[s] || [s, "muted"]; return `<span class="st ${tone}">${esc(label)}</span>`; };
const accepted = (p) => ["active", "care", "complete"].includes(p.status);

// Keep the list filter on whichever group holds the open project.
function follow() {
  const p = cur();
  if (p && !VIEWS.find(([id]) => id === view)[2](p)) view = VIEWS.find(([, , f]) => f(p))[0];
}

// What integration cards get (js/integrations/index.js).
const xctx = () => ({ root: el, esc, toast, day, stampAt, meta, api: (name, op, body) => api(`x/${name}/${op}`, body),
  done: (out) => { if (out?.project) replace(out.project); render(); }, reload: load });

function replace(p) {
  const i = projects.findIndex((x) => x.id === p.id);
  if (i >= 0) projects[i] = p; else projects.unshift(p);
}

// ---------- layout ----------

function render() {
  const list = projects.filter(VIEWS.find(([id]) => id === view)[2]);
  const p = cur();
  el.innerHTML = `
    <header class="portal-head">
      <div><div class="eyebrow">Admin</div><h1>Projects</h1>${summary()}</div>
      <div class="row-btns"><button class="btn small" id="new-btn" type="button">New project</button>
        <a class="btn ghost small" href="portal.html">Client view</a>
        ${meta.outbox ? `<a class="btn ghost small" href="outbox.html">Dev outbox</a>` : ""}
        <a class="btn ghost small" href="account.html">Your account</a>
        <button class="btn ghost small" id="logout" type="button">Sign out</button></div>
    </header>
    ${toConfirm()}
    ${accountsCard()}
    ${testersCard()}
    <div class="adm-views" role="tablist" aria-label="Filter projects">${VIEWS.map(([id, label, f]) => {
      const n = projects.filter(f).length;
      return `<button role="tab" type="button" data-view="${id}" aria-selected="${id === view}"><b>${n}</b><span>${label}</span></button>`;
    }).join("")}</div>
    <div class="adm-grid">
      <nav class="adm-list" aria-label="Projects">${list.map(row).join("") || `<p class="muted small adm-empty">Nothing here.</p>`}</nav>
      <section class="adm-main" aria-live="polite">${p ? editor(p) : `<div class="card portal-msg"><p class="muted">Pick a project on the left, or add a new one.</p></div>`}</section>
    </div>`;
  wire(p);
}

function row(p) {
  const last = p.history[0];
  return `<button type="button" class="adm-row" data-id="${esc(p.id)}" aria-current="${p.id === selected}">
    <span class="ar-top"><span class="ar-title">${esc(p.title)}</span>${pill(p.status)}</span>
    <span class="ar-sub">${esc(p.business || p.owner)} · ${esc(p.id)}${p.sample ? " · sample" : ""}${p.test ? " · test data" : ""}${owed(p)}</span>
    ${last ? `<span class="ar-last">${day(last.date)} · ${esc(last.title)}</span>` : ""}</button>`;
}

function editor(p) {
  return `
    <div class="card adm-card">
      <div class="proj-top">
        <div><span class="chip svc-chip">${esc(p.service || "No service set")}</span><h2>${esc(p.title)}</h2>
          <p class="muted small">${esc(p.id)} · client <b>${esc(p.owner)}</b>${p.business ? ` · ${esc(p.business)}` : ""}${p.sample ? ` · <span class="sample-tag">sample</span>` : ""}${p.test ? ` · <span class="test-tag">test data</span>` : ""}</p>
          ${p.acceptedBy ? `<p class="muted small">Quote accepted online by ${esc(p.acceptedBy)} on ${day(p.dates.accepted)}${p.stage === "approved" ? ". Moves into Discovery when the first payment arrives." : "."}</p>` : ""}</div>
        ${pill(p.status)}
      </div>
      ${loginLine(p)}
      ${actions(p)}
    </div>
    ${planCard(p)}
    ${X.adminCards(p, xctx())}
    ${BILLABLE.includes(p.status) || p.invoices.length ? invoicesCard(p) : ""}
    ${p.plan?.status === "signed" && ["active", "care", "rolledback"].includes(p.status) ? reportForm(p) : ""}
    ${accepted(p) && p.status !== "complete" && !p.plan ? delivery(p) : ""}
    ${p.status !== "declined" ? postForm(p) : ""}
    ${historyCard(p)}
    ${details(p)}`;
}

// Does the project's client have a login yet? Offer "Send login" when they don't (or haven't set it up).
function loginLine(p) {
  // Logins go out when a proposal is accepted, never for a request still under review.
  if (p.sandbox || ["submitted", "review", "declined", "approved"].includes(p.status)) return "";
  const u = account(p.owner);
  if (u?.status === "active") return "";
  const label = u?.status === "invited" ? "Resend login invite" : "Send login";
  return `<p class="muted small adm-login">${u ? "Invited, not set up yet." : "This client has no login yet."}
    <button type="button" class="btn ghost small" data-send-login="${esc(p.id)}">${label}</button></p>`;
}

function actions(p) {
  const s = p.status;
  if (quoting) return quoteForm(p);
  const btn = (act, label, cls = "") => `<button type="button" class="btn small ${cls}" data-act="${act}">${label}</button>`;
  const orgField = `<label class="inline">Organization <input id="acc-org" value="${esc(p.org?.name || p.business || "")}" placeholder="Business name"></label>`;
  const legacy = p.status === "approved" && p.price.length && !p.plan;
  const u = account(p.owner);
  const login = u?.status === "active" ? "Their account is set up." : u ? `Their invite is waiting (<button type="button" class="linkbtn" data-send-login="${esc(p.id)}">resend</button>).` : "No login yet.";
  const planNote = !p.plan ? "Write the plan and agreement below." : p.plan.status === "draft" ? "The plan is saved as a draft." : p.plan.status === "sent" ? `Plan and agreement sent ${stampAt(p.plan.sentAt)}, waiting for their signature.` : "";
  const parts = {
    submitted: [`<p><b>New request.</b> The client sees “Under review”. Reply within two business days.</p>`, btn("review", "Start review", "ghost"), orgField, btn("accept-request", "Accept proposal"), btn("decline", "Decline", "ghost danger")],
    review: [`<p><b>Under review.</b> Accepting it puts it in the client’s organization and emails their account invite. The plan and agreement follow once their account is set up.</p>`, orgField, btn("accept-request", "Accept proposal"), btn("decline", "Decline", "ghost danger")],
    approved: !legacy ? [`<p><b>Accepted</b>${p.org ? ` for ${esc(p.org.name)}` : ""}. ${login} ${planNote}</p>`, btn("decline", "Decline", "ghost danger")] : [`<p><b>Quote sent:</b> ${p.price.map((x) => `${esc(x.item)} ${money(x.amount)}${x.per ? "/" + esc(x.per) : ""}`).join(", ")}. Mark it accepted once the agreement is signed and the first payment is in.</p>`,
      `<label class="inline">Accepted on <input type="date" id="acc-date" value="${meta.today}"></label>`, btn("accept", "Mark accepted"), btn("quote", "Change quote", "ghost"), btn("decline", "Decline", "ghost danger")],
    active: p.plan ? [`<p><b>In progress.</b> Stages, deployment and sign-off are in the Plan card below.</p>`] : [`<p><b>In progress.</b> The client sees every update you post below.</p>`, btn("complete", "Mark complete", "ghost")],
    rolledback: [`<p><b>Rolled back.</b> Production changes were rolled back after the shakeout. Redeploy once the client is ready to sign off and pay.</p>`, btn("deploy", "Redeploy to production")],
    care: [`<p><b>On a care plan.</b></p>`, btn("complete", "Mark complete", "ghost")],
    complete: [`<p><b>Complete.</b></p>`, btn("reopen", "Reopen", "ghost")],
    declined: [`<p><b>Declined.</b> The client sees it as “Not going ahead”.</p>`, btn("reopen", "Reopen", "ghost")],
  }[s] || [];
  const steps = legacy || (!p.plan && ["active", "care", "complete"].includes(s)) ? ["Request", "Review", "Quote", "Accepted", "Delivery", "Done"] : ["Request", "Review", "Accepted", "Signed", "Stages", "Shakeout", "Done"];
  const shk = !!p.shakeout;
  const flow = `<ol class="adm-flow">${steps.map((label, i) => {
    const at = steps.length === 6 ? { submitted: 0, review: 1, approved: 2, active: 4, care: 4, complete: 5, declined: -1 }[s]
      : { submitted: 0, review: 1, approved: 2, active: shk ? 5 : 4, rolledback: 5, care: 6, complete: 6, declined: -1 }[s];
    return `<li class="${i < at ? "done" : i === at ? "now" : ""}">${label}</li>`; }).join("")}</ol>`;
  return `${flow}<div class="adm-actions">${parts.join("")}</div>
    ${["submitted", "review", "approved"].includes(s) ? `<label class="note-field">Message to the client (optional; shown in their history)<textarea id="act-note" rows="2" placeholder="Leave blank for the standard wording"></textarea></label>` : ""}`;
}

// ---------- plan, agreement, stages, shakeout (worker/plans.js) ----------

const KIND_OPTS = [["discovery", "Discovery"], ["build", "Build"], ["launch", "Launch / deploy"]];
const DEFAULT_PLAN = { summary: "", finalAmount: "", shakeoutDays: 14, careMonthly: "", stages: [
  { name: "Discovery", kind: "discovery", amount: "", deliverables: "", target: "" },
  { name: "Build", kind: "build", amount: "", deliverables: "", target: "" },
  { name: "Launch", kind: "launch", amount: "0", deliverables: "Deploy to production and hand over", target: "" }] };
const dollars = (c) => c == null ? "" : String(c / 100);
const SSTATUS = { planned: ["Planned", "muted"], due: ["Invoice sent", "review"], active: ["In progress", "active"], done: ["Done", "done"] };

function planCard(p) {
  const legacy = p.price.length && !p.plan;
  if (legacy || !["approved", "active", "care", "complete", "rolledback"].includes(p.status) || (!p.plan && p.status !== "approved")) return "";
  const pl = p.plan;
  if (pl?.status === "signed") return stagesCard(p);
  if (pl?.status === "sent" && !planEdit) {
    return `<div class="card adm-card"><h3>Plan and agreement <span class="st review">Sent, waiting for signature</span></h3>
      ${planSummary(pl)}
      <details><summary class="small">The agreement as sent (version ${pl.version})</summary><pre class="agreement">${esc(pl.agreement)}</pre></details>
      <div class="row-btns"><button type="button" class="btn ghost small" id="plan-revise">Revise the plan</button></div>
      <p class="muted small">Revising takes it back to a draft: the client stops seeing it until you send it again.</p></div>`;
  }
  const v = pl ? { summary: pl.summary, finalAmount: dollars(pl.finalAmount), shakeoutDays: pl.shakeoutDays, careMonthly: pl.careMonthly ? dollars(pl.careMonthly) : "",
    stages: pl.stages.map((s) => ({ name: s.name, kind: s.kind, amount: dollars(s.amount), deliverables: s.deliverables, target: s.target || "" })) } : DEFAULT_PLAN;
  const ready = account(p.owner)?.status === "active";
  return `<form class="card adm-card plan-form" id="plan-form">
    <h3>Plan and agreement ${pl ? `<span class="st muted">Draft${pl.version > 1 ? `, version ${pl.version}` : ""}</span>` : ""}</h3>
    <p class="muted small">Each stage is invoiced when it comes up and starts once paid. The final payment is invoiced when the client signs off the production deployment. If the shakeout ends without sign-off and payment, you roll back and record it here.</p>
    <label class="note-field">Scope in plain words<textarea name="summary" rows="3" placeholder="What we'll deliver, in a few sentences">${esc(v.summary)}</textarea></label>
    <div class="pl-stages" id="pl-stages">${v.stages.map(stageRow).join("")}</div>
    <button type="button" class="linkbtn" id="pl-add">+ Add a stage</button>
    <div class="adm-fields">
      <label>Final payment after sign-off ($)<input name="finalAmount" type="number" min="0" step="1" value="${esc(v.finalAmount)}" required></label>
      <label>Production shakeout (days)<input name="shakeoutDays" type="number" min="1" max="90" value="${esc(v.shakeoutDays)}" required></label>
      <label>Care plan after launch ($/month, optional)<input name="careMonthly" type="number" min="0" step="1" value="${esc(v.careMonthly)}"></label>
    </div>
    <p class="muted small">The agreement is the standard terms (v1) filled in from this plan: scope, stage payments, shakeout, sign-off, rollback, ownership on full payment. Have a lawyer review the standard terms before the first real client.</p>
    <div class="row-btns"><button class="btn small ghost" type="submit">Save draft</button>
      <button class="btn small" type="button" id="plan-send" ${pl?.status === "draft" && ready ? "" : "disabled"}>Send plan and agreement</button>
      ${planEdit ? `<button class="btn ghost small" type="button" id="plan-cancel">Cancel</button>` : ""}</div>
    <p class="muted small">${!ready ? "Sending opens once the client has set up their account." : pl?.status !== "draft" ? "Save the draft, then send it." : "The client gets an email and signs in the portal. The first stage’s invoice goes out when they sign."}</p>
  </form>`;
}

const stageRow = (s) => `<div class="pl-stage">
  <label>Stage<input name="name" value="${esc(s.name)}" required></label>
  <label>Kind<select name="kind">${KIND_OPTS.map(([k, l]) => `<option value="${k}"${k === s.kind ? " selected" : ""}>${l}</option>`).join("")}</select></label>
  <label>Paid at start ($)<input name="amount" type="number" min="0" step="1" value="${esc(s.amount)}" required></label>
  <label>Target date<input name="target" type="date" value="${esc(s.target)}"></label>
  <label class="pl-what">Delivers<input name="deliverables" value="${esc(s.deliverables)}"></label>
  <button type="button" class="q-del" aria-label="Remove stage" title="Remove stage">×</button></div>`;

function planSummary(pl) {
  const total = pl.stages.reduce((t, s) => t + s.amount, 0) + pl.finalAmount;
  return `${pl.summary ? `<p>${esc(pl.summary)}</p>` : ""}<div class="tbl"><table class="pl-table"><thead><tr><th>Stage</th><th>Delivers</th><th class="n">Paid at start</th><th>Status</th></tr></thead><tbody>
    ${pl.stages.map((s) => { const [l, t] = SSTATUS[s.status] || [s.status, "muted"];
      return `<tr><td><b>${esc(s.name)}</b>${s.target ? `<br><span class="muted small">target ${day(s.target)}</span>` : ""}</td><td>${esc(s.deliverables)}</td><td class="n">${cents(s.amount)}</td>
      <td><span class="st ${t}">${l}</span>${s.invoice ? ` <a class="small" href="invoice.html?n=${encodeURIComponent(s.invoice)}">${esc(s.invoice)}</a>` : ""}</td></tr>`; }).join("")}
    <tr><td><b>Final payment</b></td><td>After production sign-off (${pl.shakeoutDays}-day shakeout)</td><td class="n">${cents(pl.finalAmount)}</td><td>${pl.finalInvoice ? `<a class="small" href="invoice.html?n=${encodeURIComponent(pl.finalInvoice)}">${esc(pl.finalInvoice)}</a>` : ""}</td></tr>
    <tr><td colspan="2"><b>Total</b>${pl.careMonthly ? ` <span class="muted small">+ care plan ${cents(pl.careMonthly)}/month</span>` : ""}</td><td class="n"><b>${cents(total)}</b></td><td></td></tr></tbody></table></div>`;
}

function stagesCard(p) {
  const pl = p.plan, sh = p.shakeout;
  const cur = pl.stages.findIndex((s) => s.status === "active");
  const last = pl.stages.length - 1;
  const btns = [];
  if (p.status === "active" && !sh && cur >= 0 && cur < last) btns.push(`<button type="button" class="btn small" id="stage-finish">Finish “${esc(pl.stages[cur].name)}” and invoice the next stage</button>`);
  if (p.status === "active" && !sh && (cur === last || pl.stages.every((s) => s.status === "done"))) btns.push(`<button type="button" class="btn small" id="deploy">Deployed to production: start the ${pl.shakeoutDays}-day shakeout</button>`);
  if (sh?.canRollBack) btns.push(`<button type="button" class="btn small danger" id="rollback">Record rollback</button>`);
  const shk = sh ? `<div class="shk ${sh.rolledBack ? "bad" : sh.signedOff ? "ok" : sh.ended ? "bad" : ""}">
      <b>Production shakeout</b> started ${stampAt(sh.started)}, ${sh.ended ? "ended" : "ends"} ${stampAt(sh.ends)}.
      ${sh.signedOff ? `Signed off ${stampAt(sh.signedOff)} by ${esc(sh.signedOffBy)}.` : sh.ended ? "<b>Ended without sign-off.</b>" : "Waiting for the client’s sign-off."}
      ${sh.finalInvoice ? ` Final invoice ${esc(sh.finalInvoice)}: ${sh.paid ? "paid" : "not paid yet"}.` : ""}
      ${sh.rolledBack ? ` <b>Rolled back ${stampAt(sh.rolledBack)}.</b>` : sh.canRollBack ? " Per the agreement you can roll back now." : ""}</div>` : "";
  return `<div class="card adm-card"><h3>Plan <span class="muted small">signed ${stampAt(pl.signedAt)} by ${esc(pl.signedBy)} · version ${pl.version}</span></h3>
    ${planSummary(pl)}${shk}
    ${btns.length ? `<div class="row-btns">${btns.join("")}</div>` : ""}
    <details><summary class="small">The signed agreement</summary><pre class="agreement">${esc(pl.agreement)}</pre></details></div>`;
}

function reportForm(p) {
  const cur = p.plan.stages.find((s) => s.status === "active");
  return `<form class="card adm-card" id="report-form">
    <h3>Post a status report${cur ? ` <span class="muted small">filed under ${esc(cur.name)}</span>` : ""}</h3>
    <p class="muted small">The client gets an email saying there’s a new report; the report itself stays in the portal. You’ll see when they first open it.</p>
    <div class="adm-fields">
      <label class="wide">Title<input name="title" required placeholder="e.g. Week 3: orders screen ready to try"></label>
      <label class="wide">Summary<textarea name="summary" rows="3" required></textarea></label>
      <label>Done<textarea name="done" rows="3"></textarea></label>
      <label>Next<textarea name="next" rows="3"></textarea></label>
      <label>Needed from you (the client)<textarea name="needs" rows="2" placeholder="Leave blank if nothing"></textarea></label>
      <label>Stage progress (%)<input name="progress" type="number" min="0" max="100" value="${p.progress ?? ""}"></label>
      <label class="wide">Links (https, one per line)<textarea name="links" rows="2" placeholder="Screenshots, demo link, documents"></textarea></label>
    </div>
    <div class="row-btns"><button class="btn small" type="submit">Post report</button></div></form>`;
}

function reportBits(h) {
  const d = h.details || {};
  const row = (k, v) => v ? `<p class="small"><b>${k}:</b> ${esc(v)}</p>` : "";
  return `${row("Done", d.done)}${row("Next", d.next)}${row("Needed from the client", d.needs)}${d.progress != null ? row("Progress", d.progress + "%") : ""}
    ${(d.links || []).map((u) => `<a class="small" href="${esc(u)}" target="_blank" rel="noopener">${esc(u)}</a>`).join("<br>")}
    <p class="small ${h.read ? "muted" : "warn-text"}">${h.read ? `Opened by the client ${stampAt(h.read)}` : "Not opened by the client yet"}</p>`;
}

function wirePlan(p) {
  const f = el.querySelector("#plan-form");
  if (f) {
    const box = f.querySelector("#pl-stages");
    const bindDel = () => box.querySelectorAll(".q-del").forEach((x) => x.onclick = () => { if (box.children.length > 1) x.parentElement.remove(); });
    bindDel();
    f.querySelector("#pl-add").onclick = () => { box.insertAdjacentHTML("beforeend", stageRow({ name: "", kind: "build", amount: "", deliverables: "", target: "" })); bindDel(); };
    const collect = () => ({ id: p.id, summary: f.summary.value, finalAmount: f.finalAmount.value, shakeoutDays: f.shakeoutDays.value, careMonthly: f.careMonthly.value,
      stages: [...box.children].map((r) => Object.fromEntries([...r.querySelectorAll("input,select")].map((i) => [i.name, i.value]))) });
    f.onsubmit = (e) => { e.preventDefault(); planEdit = false; run(() => api("plan-save", collect()), "Plan saved as a draft."); };
    f.querySelector("#plan-send").onclick = () => {
      if (!confirm(`Send the plan and agreement to ${p.owner}? They'll get an email and can sign in the portal.`)) return;
      run(() => api("plan-send", { id: p.id }), `Sent. ${p.owner} can now review and sign.${sentNote()}`);
    };
    const c = f.querySelector("#plan-cancel"); if (c) c.onclick = () => { planEdit = false; render(); };
  }
  const rv = el.querySelector("#plan-revise"); if (rv) rv.onclick = () => { planEdit = true; render(); };
  const sf = el.querySelector("#stage-finish");
  if (sf) sf.onclick = () => confirm("Mark this stage finished? The next stage's invoice goes to the client.") && run(() => api("stage-finish", { id: p.id }), "Stage finished. The next stage is underway or invoiced.");
  const dp = el.querySelector("#deploy");
  if (dp) dp.onclick = () => {
    const note = prompt("Note for the client (optional), e.g. where it's live:", "");
    if (note === null) return;
    run(() => api("deploy", { id: p.id, note }), "Shakeout started. The client has been asked to test and sign off.");
  };
  const rb = el.querySelector("#rollback");
  if (rb) rb.onclick = () => {
    const note = prompt("You've rolled the production changes back. Add a note for the timeline (optional):", "");
    if (note === null) return;
    run(() => api("rollback", { id: p.id, note }), "Rollback recorded and the client told.");
  };
  const rf = el.querySelector("#report-form");
  if (rf) rf.onsubmit = (e) => { e.preventDefault(); run(() => api("report", { id: p.id, ...fields(rf) }), `Report posted. ${p.owner} has been emailed.${sentNote()}`); };
}

function quoteForm(p) {
  const lines = p.price.length ? p.price : DEFAULT_QUOTE;
  return `<form class="quote" id="quote-form">
    <h3>${p.status === "approved" ? "Change the quote" : "Approve and send a fixed-scope quote"}</h3>
    <div class="q-lines" id="q-lines">${lines.map(qLine).join("")}</div>
    <button type="button" class="linkbtn" id="q-add">+ Add a line</button>
    <label class="note-field">Message to the client (optional)<textarea name="note" rows="2" placeholder="Leave blank to list the prices"></textarea></label>
    <p class="muted small">The client sees the prices once they accept. Until then their portal shows “Quote sent” and your message.</p>
    <div class="row-btns"><button class="btn small" type="submit">${p.status === "approved" ? "Save quote" : "Approve and send"}</button><button class="btn ghost small" type="button" id="q-cancel">Cancel</button></div>
  </form>`;
}

const qLine = (l) => `<div class="q-line">
  <label>Item<input name="item" value="${esc(l.item)}" required></label>
  <label>Amount ($)<input name="amount" type="number" min="0" step="1" value="${esc(l.amount)}" required></label>
  <label>Billed<select name="per"><option value=""${!l.per ? " selected" : ""}>once</option><option value="month"${l.per === "month" ? " selected" : ""}>monthly</option></select></label>
  <label class="q-terms">Payment terms<input name="terms" value="${esc(l.terms)}"></label>
  <button type="button" class="q-del" aria-label="Remove line" title="Remove line">×</button></div>`;

function delivery(p) {
  const stages = meta.stages.filter((s) => !["proposal", "approved"].includes(s.id));
  return `<form class="card adm-card" id="delivery-form">
    <h3>Delivery</h3>
    <div class="adm-fields">
      <label>Stage<select name="stage">${stages.map((s) => `<option value="${s.id}"${s.id === p.stage ? " selected" : ""}>${s.label}</option>`).join("")}</select></label>
      <label>Progress in this stage<span class="range"><input name="progress" type="range" min="0" max="100" step="5" value="${p.progress ?? 0}"><output>${p.progress ?? 0}%</output></span></label>
      <label>Target launch<input name="targetLaunch" type="date" value="${esc(p.dates.targetLaunch || "")}"></label>
      <label>Next step date<input name="nextDate" type="date" value="${esc(p.next?.date || "")}"></label>
      <label class="wide">Next step<input name="nextText" value="${esc(p.next?.text || "")}" placeholder="e.g. Staff test session at the main shop"></label>
    </div>
    <div class="row-btns"><button class="btn small" type="submit">Save delivery</button></div>
  </form>`;
}

function postForm(p) {
  const kinds = ["report", "milestone", "meeting", "file", "decision"];
  return `<form class="card adm-card" id="post-form">
    <h3>Post an update</h3>
    <p class="muted small">${accepted(p) ? "The client sees this as soon as you post it." : "Only requests and decisions are visible until the client accepts; other updates appear for them after that."}</p>
    <div class="adm-fields">
      <label>Kind<select name="kind">${kinds.map((k) => `<option value="${k}">${KIND[k][0]}</option>`).join("")}</select></label>
      <label>Date<input name="date" type="date" value="${meta.today}" required></label>
      <label class="wide">Title<input name="title" required placeholder="e.g. Weekly progress report #3"></label>
      <label class="wide">Details<textarea name="body" rows="4" placeholder="What changed, what’s next, anything you need from them"></textarea></label>
    </div>
    <div class="row-btns"><button class="btn small" type="submit">Post update</button></div>
  </form>`;
}

function historyCard(p) {
  return `<div class="card adm-card"><h3>History <span class="muted small">(${p.history.length})</span></h3>
    <ol class="timeline">${p.history.map((h) => { const [label, tone] = KIND[h.kind] || [h.kind, "muted"]; return `
      <li class="tl ${tone}"><span class="tl-dot"></span>
        <div class="tl-meta"><time datetime="${esc(h.at || h.date)}">${stamp(h)}</time>${h.by ? `<span class="muted small">by ${esc(h.by)}</span>` : ""}<span class="tl-kind">${label}</span>
          ${accepted(p) || CLIENT_SEES.includes(h.kind) ? "" : `<span class="hidden-tag">hidden until accepted</span>`}
          ${h.kind === "payment" ? "" : `<button type="button" class="linkbtn tl-del" data-del="${h.id}">Delete</button>`}</div>
        <h4>${esc(h.title)}</h4>${h.body ? `<p>${esc(h.body)}</p>` : ""}${h.kind === "report" ? reportBits(h) : ""}</li>`; }).join("")}</ol></div>`;
}

function details(p) {
  return `<form class="card adm-card" id="details-form">
    <h3>Details</h3>
    <div class="adm-fields">
      <label class="wide">Title<input name="title" value="${esc(p.title)}" required></label>
      <label>Business<input name="business" value="${esc(p.business)}"></label>
      <label>Service<input name="service" value="${esc(p.service)}" list="services"></label>
      <label>Client email (their login)<input name="owner" type="email" value="${esc(p.owner)}" required></label>
      <label>Contact shown to the client<input name="contact" value="${esc(p.contact)}" placeholder="e.g. Shankar Srinivasan"></label>
      <label class="wide">Summary (shown to the client)<textarea name="summary" rows="3">${esc(p.summary)}</textarea></label>
    </div>
    <div class="row-btns"><button class="btn small" type="submit">Save details</button>
      <button type="button" class="btn ghost small danger" id="del-project">Delete project</button></div>
  </form>`;
}

// ---------- invoices ----------

function summary() {
  const m = moneySummary(projects, meta.today.slice(0, 7));
  return `<div class="adm-money" aria-label="Money">
    <span>Outstanding<b>${cents(m.outstanding)}</b></span>
    <span class="${m.overdue ? "late" : ""}">Overdue<b>${cents(m.overdue)}</b></span>
    <span>Received this month<b>${cents(m.received)}</b></span>
    ${m.drafts ? `<span>Drafts<b>${m.drafts}</b></span>` : ""}
    ${m.test.outstanding || m.test.received ? `<span class="muted">Test data: ${cents(m.test.outstanding)} outstanding, ${cents(m.test.received)} received this month (left out above)</span>` : ""}</div>`;
}

function owed(p) {
  const late = p.invoices.filter((i) => i.state === "overdue");
  if (late.length) return ` · <span class="late-text">${cents(late.reduce((t, i) => t + i.balance, 0))} overdue</span>`;
  const due = p.invoices.filter((i) => i.status === "sent" && i.balance > 0);
  return due.length ? ` · ${cents(due.reduce((t, i) => t + i.balance, 0))} due` : "";
}

// "I've sent payment" notes from clients, across all projects, newest last.
function claimsWaiting() {
  const out = [];
  for (const p of projects) for (const i of p.invoices) for (const c of i.claims || []) out.push({ p, i, c });
  return out.sort((a, b) => a.c.id - b.c.id);
}

function toConfirm() {
  const list = claimsWaiting();
  if (!list.length) return "";
  return `<section class="card adm-card adm-confirm" aria-label="Payments to confirm"><h3>Payments to confirm <span class="muted small">(${list.length})</span></h3>
    <p class="muted small">Clients say these are on their way. Confirm each one when the money is in your account; it then shows as received on their timeline.</p>
    ${list.map(({ p, i, c }) => `<form class="ac-row" data-claim="${c.id}" data-proj="${esc(p.id)}">
      <div class="ac-what"><b>${cents(c.amount)}</b> by ${esc((METHOD[c.method] || c.method).toLowerCase())}${c.reference ? ` ${esc(c.reference)}` : ""}, sent ${day(c.date)}
        <span class="muted small">${esc(p.title)} · invoice ${esc(i.number)} · ${esc(c.by)}</span></div>
      <label>Amount received ($)<input name="amount" inputmode="decimal" value="${(Math.min(c.amount, i.balance) / 100).toFixed(2)}" required></label>
      <label>Received on<input type="date" name="date" value="${meta.today}" required></label>
      <div class="row-btns"><button class="btn small" type="submit">Confirm received</button>
        <button class="btn ghost small" type="button" data-noclaim="${c.id}">Not received</button></div>
    </form>`).join("")}</section>`;
}

// Logins: invite a client or tester, resend a pending invite. Email goes to the dev outbox until a service is chosen.
const ROLE = { admin: "Admin", client: "Client", tester: "Tester" };
const USTATUS = { active: ["Active", "active"], invited: ["Invited", "review"], disabled: ["Disabled", "muted"] };
const sentNote = () => meta.outbox ? " It’s in the dev outbox." : "";
const account = (email) => (meta.users || []).find((u) => u.email === String(email || "").toLowerCase());
function accountsCard() {
  const list = meta.users || [];
  const waiting = list.filter((u) => u.status === "invited").length;
  return `<details class="card adm-card adm-testers" id="accounts"><summary><b>Accounts</b> <span class="muted small">(${list.length}${waiting ? `, ${waiting} invited` : ""}) · invite only, no public sign-up</span></summary>
    <form class="adm-invite" id="invite-form" novalidate>
      <label>Email<input name="email" type="email" required autocomplete="off"></label>
      <label>Name<input name="name" autocomplete="off"></label>
      <label>Role<select name="role"><option value="client">Client</option><option value="tester">Tester</option></select></label>
      <button class="btn small" type="submit">Send invite</button>
    </form>
    <p class="muted small">The invite link lasts 3 days. It confirms their email and lets them choose a password.${meta.outbox ? ` No email service yet: messages land in the <a href="outbox.html">dev outbox</a>.` : ""}</p>
    <ul class="at-list">${list.map((u) => {
      const [label, tone] = USTATUS[u.status] || [u.status, "muted"];
      return `<li><span><b>${esc(u.name || u.email)}</b> <span class="muted small">${esc(u.email)} · ${ROLE[u.role] || u.role}</span></span>
        <span class="st ${tone}">${label}</span>
        ${u.status === "invited" ? `<button type="button" class="btn ghost small" data-resend="${esc(u.email)}">Resend invite</button>` : ""}</li>`;
    }).join("")}</ul></details>`;
}

function wireAccounts() {
  const f = el.querySelector("#invite-form");
  if (f) f.onsubmit = (e) => {
    e.preventDefault();
    run(async () => { await api("invite", fields(f)); await load(); el.querySelector("#accounts").open = true; }, `Invite sent to ${f.email.value}.${sentNote()}`);
  };
  el.querySelectorAll("[data-resend]").forEach((b) => b.onclick = () =>
    run(async () => { await api("invite-resend", { email: b.dataset.resend }); await load(); el.querySelector("#accounts").open = true; }, `New invite sent to ${b.dataset.resend}.${sentNote()}`));
  el.querySelectorAll("[data-send-login]").forEach((sl) => sl.onclick = () => run(async () => { await api("send-login", { id: sl.dataset.sendLogin }); await load(); }, `Login invite sent to ${cur()?.owner}.${sentNote()}`));
}

// The tester list (logins with role "tester") and their practice projects.
function testersCard() {
  const list = meta.testers || [];
  if (!list.length) return "";
  return `<details class="card adm-card adm-testers"><summary><b>Testers</b> <span class="muted small">(${list.length}) · practice projects use the payment simulator</span></summary>
    <p class="muted small">Invite a tester from <b>Accounts</b> above. They set a password, accept a practice quote and try the Pay buttons; no money moves.</p>
    <ul class="at-list">${list.map((t) => {
      const mine = projects.filter((p) => p.sandbox && p.owner === t.email);
      return `<li><span><b>${esc(t.name || t.email)}</b> <span class="muted small">${esc(t.email)}</span></span>
        <span class="muted small">${mine.length ? mine.map((p) => `<a href="#${esc(p.id)}" data-id="${esc(p.id)}">${esc(p.id)}</a> ${esc(STATUS[p.status]?.[0] || p.status)}`).join(", ") : "no practice project"}</span>
        <button type="button" class="btn ghost small" data-sandbox="${esc(t.email)}" data-has="${mine.length ? 1 : 0}">${mine.length ? "Start over" : "Make practice project"}</button></li>`;
    }).join("")}</ul></details>`;
}

function wireClaims() {
  el.querySelectorAll("[data-sandbox]").forEach((b) => b.onclick = () => {
    const reset = b.dataset.has === "1";
    if (reset && !confirm(`Start over for ${b.dataset.sandbox}? Their practice projects and test payments are deleted and a fresh one is made.`)) return;
    run(async () => { const out = await api(reset ? "sandbox-reset" : "sandbox-create", { email: b.dataset.sandbox }); await load(); return out; }, "Practice project ready.");
  });
  el.querySelectorAll("form[data-claim]").forEach((f) => {
    f.onsubmit = (e) => { e.preventDefault(); run(() => api("claim-confirm", { claimId: f.dataset.claim, ...fields(f) }), "Payment confirmed. The client sees it as received."); };
    f.querySelector("[data-noclaim]").onclick = () => {
      const note = prompt("Not received yet. Add a note for the client (optional):", "");
      if (note !== null) run(() => api("claim-reject", { claimId: f.dataset.claim, note }), "Marked not received. The client sees your note.");
    };
  });
}

const invPill = (i) => { const [label, tone] = invoiceLabel(i); return `<span class="st ${tone}">${esc(label)}</span>`; };

// Ready-made lines from the quote: 50/50 terms split in two, monthly lines billed for this month.
function suggestions(p) {
  const billed = new Set(p.invoices.filter((i) => i.status !== "void").flatMap((i) => i.lines.map((l) => l.item)));
  const month = new Date(meta.today + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" });
  const out = [];
  for (const l of p.price) {
    if (l.per === "month") out.push({ item: `${l.item}: ${month}`, amount: l.amount });
    else if (/50\s*%|50\/50/.test(l.terms)) {
      const half = Math.round(l.amount * 50) / 100;
      out.push({ item: `${l.item} deposit (50%)`, amount: half }, { item: `${l.item} final (50%)`, amount: l.amount - half });
    } else out.push({ item: l.item, amount: l.amount });
  }
  return out.map((x) => ({ ...x, used: billed.has(x.item) }));
}

function invoicesCard(p) {
  const sugg = BILLABLE.includes(p.status) ? suggestions(p) : [];
  return `<div class="card adm-card" id="inv-card">
    <div class="proj-top"><h3>Invoices <span class="muted small">(${p.invoices.length})</span></h3>
      ${BILLABLE.includes(p.status) && !invOpen ? `<button type="button" class="btn small" id="inv-new">New invoice</button>` : ""}</div>
    ${invOpen ? invForm(sugg) : ""}
    ${p.invoices.map(invRow).join("") || (invOpen ? "" : `<p class="muted small">No invoices yet.${sugg.length ? " Start one from the quote." : ""}</p>`)}
    <p class="muted small">${meta.payTo ? "Invoices show your bank transfer and check details." : "Bank transfer and check details aren’t set yet (PAY_TO), so invoices say they will follow."} ${meta.stripe ? "Clients can pay by card or bank account through Stripe." : "Card and bank payments go through Stripe once its key is set (docs/integrations/stripe.md); PayPal comes later."}</p>
  </div>`;
}

function invForm(sugg) {
  return `<form class="ai-form" id="inv-form">
    ${sugg.length ? `<div><span class="muted small">From the quote:</span><div class="ai-suggest">${sugg.map((x, i) =>
      `<button type="button" class="chip-btn${x.used ? " used" : ""}" data-sugg="${i}" title="${x.used ? "Already on an invoice" : "Add this line"}">${esc(x.item)} · ${cents(x.amount * 100)}</button>`).join("")}</div></div>` : ""}
    <div class="q-lines" id="inv-lines">${invLine({ item: "", amount: "" })}</div>
    <button type="button" class="linkbtn" id="inv-add">+ Add a line</button>
    <div class="adm-fields">
      <label>Due date (optional)<input type="date" name="due"></label>
      <label class="wide">Note on the invoice (optional)<input name="note" maxlength="500" placeholder="e.g. Thank you for your business."></label>
    </div>
    <p class="muted small">Saved as a draft. The client sees it once you send it; it’s due ${meta.dueDays} days after sending unless you set a date.</p>
    <div class="row-btns"><button class="btn small" type="submit">Save draft</button><button class="btn ghost small" type="button" id="inv-cancel">Cancel</button></div>
  </form>`;
}

const invLine = (l) => `<div class="q-line">
  <label class="q-terms">Description<input name="item" value="${esc(l.item)}" required></label>
  <label>Amount ($)<input name="amount" inputmode="decimal" value="${esc(l.amount)}" required></label>
  <button type="button" class="q-del" aria-label="Remove line" title="Remove line">×</button></div>`;

function invRow(i) {
  const open = i.status === "sent" && i.balance > 0;
  const btn = (act, label, cls = "ghost") => `<button type="button" class="btn small ${cls}" data-inv="${act}" data-n="${esc(i.number)}">${label}</button>`;
  return `<div class="ai-row">
    <div class="ai-top"><span class="inv-no">${esc(i.number)}</span>${invPill(i)}
      ${i.issued ? `<span class="muted small">sent ${day(i.issued)}${i.due ? ` · due ${day(i.due)}` : ""}</span>` : i.due ? `<span class="muted small">due ${day(i.due)}</span>` : ""}
      <span class="inv-amt">${cents(i.total)}</span></div>
    <ul class="ai-lines">${i.lines.map((l) => `<li><span>${esc(l.item)}</span><span>${cents(l.amount)}</span></li>`).join("")}</ul>
    ${i.payments.length ? `<ul class="ai-pays">${i.payments.map((x) => `<li><span>${day(x.date)} · ${esc(METHOD[x.method] || x.method)}${x.reference ? ` ${esc(x.reference)}` : ""}</span>
      <span>${x.provider === "simulator" ? `<span class="test-tag">simulator</span> ` : x.provider === "stripe" ? `<span class="muted small">Stripe</span> ` : ""}<b>${cents(x.amount)}</b>${x.refunded ? ` <span class="muted small">(${cents(x.refunded)} refunded)</span>` : ""}
        ${x.amount > x.refunded && x.provider !== "simulator" ? `<button type="button" class="linkbtn" data-refund="${x.id}">Refund</button>` : ""}
        ${["manual", "simulator"].includes(x.provider) && !x.refunded ? `<button type="button" class="linkbtn tl-del" data-unpay="${x.id}">Remove</button>` : ""}</span></li>
      ${refundFor === x.id ? refundForm(x) : ""}`).join("")}
      ${(i.refunds || []).map((r) => `<li><span>${day(r.date)} · Refund${r.status === "pending" ? " (on its way)" : r.status === "failed" ? " (failed)" : ""}${r.reason ? ` · ${esc(r.reason)}` : ""}</span><b>&minus;${cents(r.amount)}</b></li>`).join("")}
      ${i.balance > 0 && i.status === "sent" ? `<li><span>Still due</span><b>${cents(i.balance)}</b></li>` : ""}</ul>` : ""}
    ${(i.processing || []).map((x) => `<p class="muted small">Bank payment of ${cents(x.amount)} clearing at Stripe since ${day(x.since)}. It’s recorded when the bank confirms (usually 3–5 business days).</p>`).join("")}
    ${(i.needsRefund || []).map((x) => `<p class="callout">Stripe collected ${cents(x.amount)} that couldn’t go on this invoice (already paid or cancelled). <button type="button" class="btn small" data-unapplied="${esc(x.session)}">Refund it in full</button></p>`).join("")}
    ${i.claims.length ? `<ul class="ai-claims">${i.claims.map((c) => `<li>Client says ${cents(c.amount)} by ${esc((METHOD[c.method] || c.method).toLowerCase())}${c.reference ? ` ${esc(c.reference)}` : ""} was sent ${day(c.date)}. Confirm it above, under Payments to confirm.</li>`).join("")}</ul>` : ""}
    ${payFor === i.number ? payForm(i) : ""}
    <div class="row-btns">
      ${i.status === "draft" ? btn("send", "Send to client", "") : ""}
      ${open && payFor !== i.number ? btn("pay", "Record payment", "") : ""}
      <a class="btn ghost small" href="invoice.html?n=${encodeURIComponent(i.number)}" target="_blank" rel="noopener">View${i.status === "draft" ? " draft" : ""}</a>
      ${i.status !== "void" && !i.payments.length && !i.claims.length ? btn("void", i.status === "draft" ? "Delete draft" : "Cancel invoice", "ghost danger") : ""}
    </div></div>`;
}

function refundForm(x) {
  const left = x.amount - (x.refunded || 0);
  return `<li><form class="ai-form" id="refund-form" data-pid="${x.id}">
    <div class="adm-fields">
      <label>Refund ($)<input name="amount" inputmode="decimal" value="${(left / 100).toFixed(2)}" required></label>
      <label>Reason (the client sees it)<input name="reason" maxlength="300" placeholder="e.g. Stage cancelled by agreement"></label>
    </div>
    <p class="muted small">${x.provider === "stripe" ? "Stripe sends it back to the card or bank account it came from." : "Send the money yourself (bank transfer or check); this records it."} Up to ${cents(left)}.</p>
    <div class="row-btns"><button class="btn small" type="submit">Refund</button><button class="btn ghost small" type="button" id="refund-cancel">Cancel</button></div>
  </form></li>`;
}

function payForm(i) {
  return `<form class="ai-form" id="pay-form" data-n="${esc(i.number)}">
    <div class="adm-fields">
      <label>Amount ($)<input name="amount" inputmode="decimal" value="${(i.balance / 100).toFixed(2)}" required></label>
      <label>How<select name="method">${meta.methods.filter((m) => ["bank_transfer", "check"].includes(m.id)).map((m) => `<option value="${m.id}">${esc(m.label)}</option>`).join("")}</select></label>
      <label>Received on<input type="date" name="date" value="${meta.today}" required></label>
      <label>Reference (optional)<input name="reference" maxlength="80" placeholder="Check # or transfer ref"></label>
    </div>
    <div class="row-btns"><button class="btn small" type="submit">Record payment</button><button class="btn ghost small" type="button" id="pay-cancel">Cancel</button></div>
  </form>`;
}

function wireInvoices(p) {
  const card = el.querySelector("#inv-card");
  if (!card) return;
  card.querySelector("#inv-new")?.addEventListener("click", () => { invOpen = true; render(); el.querySelector("#inv-lines input")?.focus(); });
  const f = card.querySelector("#inv-form");
  if (f) {
    const lines = f.querySelector("#inv-lines");
    const bindDel = () => lines.querySelectorAll(".q-del").forEach((x) => x.onclick = () => { if (lines.children.length > 1) x.parentElement.remove(); });
    const add = (l) => {
      const blank = [...lines.children].find((r) => !r.querySelector("[name=item]").value && !r.querySelector("[name=amount]").value);
      if (blank) { blank.querySelector("[name=item]").value = l.item; blank.querySelector("[name=amount]").value = l.amount; }
      else { lines.insertAdjacentHTML("beforeend", invLine(l)); bindDel(); }
    };
    bindDel();
    const sugg = suggestions(p);
    f.querySelectorAll("[data-sugg]").forEach((b) => b.onclick = () => { const x = sugg[+b.dataset.sugg]; add({ item: x.item, amount: x.amount }); b.classList.add("used"); });
    f.querySelector("#inv-add").onclick = () => { lines.insertAdjacentHTML("beforeend", invLine({ item: "", amount: "" })); bindDel(); lines.lastElementChild.querySelector("input").focus(); };
    f.querySelector("#inv-cancel").onclick = () => { invOpen = false; render(); };
    f.onsubmit = (e) => {
      e.preventDefault();
      const ls = [...lines.children].map((r) => ({ item: r.querySelector("[name=item]").value, amount: r.querySelector("[name=amount]").value }));
      run(() => api("invoice-create", { id: p.id, lines: ls, due: f.due.value, note: f.note.value }), "Draft saved. Send it when it’s ready.");
    };
  }
  card.querySelectorAll("[data-inv]").forEach((b) => b.onclick = () => {
    const n = b.dataset.n, act = b.dataset.inv;
    if (act === "pay") { payFor = n; render(); return; }
    if (act === "send" && !confirm(`Send invoice ${n}? The client will see it in their portal.`)) return;
    if (act === "void" && !confirm(b.textContent.startsWith("Delete") ? `Delete draft ${n}?` : `Cancel invoice ${n}? The client will see it as cancelled.`)) return;
    run(() => api(act === "send" ? "invoice-send" : "invoice-void", { number: n }), act === "send" ? "Invoice sent." : "Done.");
  });
  const pf = card.querySelector("#pay-form");
  if (pf) {
    pf.querySelector("#pay-cancel").onclick = () => { payFor = null; render(); };
    pf.onsubmit = (e) => { e.preventDefault(); run(() => api("payment-record", { number: pf.dataset.n, ...fields(pf) }), "Payment recorded."); };
  }
  card.querySelectorAll("[data-refund]").forEach((b) => b.onclick = () => { refundFor = Number(b.dataset.refund); render(); el.querySelector("#refund-form [name=amount]")?.focus(); });
  const rf = card.querySelector("#refund-form");
  if (rf) {
    rf.querySelector("#refund-cancel").onclick = () => { refundFor = null; render(); };
    rf.onsubmit = (e) => {
      e.preventDefault();
      if (!confirm(`Refund $${rf.amount.value}? The client sees it on their timeline.`)) return;
      run(() => api("refund", { paymentId: rf.dataset.pid, amount: rf.amount.value, reason: rf.reason.value }), "Refund recorded.");
    };
  }
  card.querySelectorAll("[data-unapplied]").forEach((b) => b.onclick = () => {
    if (confirm("Refund this payment in full through Stripe?")) run(() => api("refund-unapplied", { session: b.dataset.unapplied }), "Refund sent.");
  });
  card.querySelectorAll("[data-unpay]").forEach((b) => b.onclick = () => {
    if (confirm("Remove this payment? Its entry in the client’s history goes too.")) run(() => api("payment-remove", { paymentId: b.dataset.unpay }), "Payment removed.");
  });
}

// ---------- behaviour ----------

async function run(fn, ok) {
  try { const out = await fn(); if (out?.project) { replace(out.project); follow(); } quoting = false; invOpen = false; payFor = null; refundFor = null; render(); if (ok) toast(ok); }
  catch (e) { if (e.message !== "signed out") toast(e.message, true); }
}

const fields = (form) => Object.fromEntries(new FormData(form));

function wire(p) {
  el.querySelector("#logout").onclick = async () => {
    await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
    location.replace("login.html");
  };
  el.querySelector("#new-btn").onclick = openNew;
  el.querySelectorAll("[data-view]").forEach((b) => b.onclick = () => { view = b.dataset.view; render(); });
  el.querySelectorAll("[data-id]").forEach((b) => b.onclick = () => {
    selected = b.dataset.id; quoting = false; invOpen = false; payFor = null; history.replaceState(null, "", "#" + selected); render();
    if (matchMedia("(max-width: 900px)").matches) el.querySelector(".adm-main").scrollIntoView({ behavior: "smooth" });
  });
  wireClaims();
  wireAccounts();
  if (!p) return;
  wireInvoices(p);
  wirePlan(p);
  X.wireAdmin(p, xctx());
  const note = () => el.querySelector("#act-note")?.value || "";

  el.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => {
    const act = b.dataset.act;
    if (act === "quote") { quoting = true; render(); return; }
    if (act === "decline" && !confirm(`Decline “${p.title}”? The client will see “Not going ahead”.`)) return;
    if (act === "complete" && !confirm(`Mark “${p.title}” complete?`)) return;
    const body = { id: p.id, action: act, note: note() };
    if (act === "accept") body.date = el.querySelector("#acc-date").value;
    if (act === "accept-request") return run(async () => { const out = await api("accept-request", { id: p.id, orgName: el.querySelector("#acc-org")?.value || "", note: note() }); await load(); return out; },
      `Accepted. ${p.owner} has been emailed${account(p.owner)?.status === "active" ? "" : " an account invite"}.${sentNote()}`);
    if (act === "deploy") return run(() => api("deploy", { id: p.id, note: prompt("Note for the client (optional), e.g. where it's live:", "") || "" }), "Redeployed. The shakeout has restarted.");
    run(() => api("action", body), { review: "Moved to review.", accept: "Accepted. The client now sees the full project.", decline: "Declined.", complete: "Marked complete.", reopen: "Reopened." }[act]);
  });

  const qf = el.querySelector("#quote-form");
  if (qf) {
    const lines = qf.querySelector("#q-lines");
    const bindDel = () => lines.querySelectorAll(".q-del").forEach((x) => x.onclick = () => { if (lines.children.length > 1) x.parentElement.remove(); });
    bindDel();
    qf.querySelector("#q-add").onclick = () => { lines.insertAdjacentHTML("beforeend", qLine({ item: "", amount: "", per: "", terms: "" })); bindDel(); lines.lastElementChild.querySelector("input").focus(); };
    qf.querySelector("#q-cancel").onclick = () => { quoting = false; render(); };
    qf.onsubmit = (e) => {
      e.preventDefault();
      const price = [...lines.children].map((l) => ({ item: l.querySelector("[name=item]").value, amount: l.querySelector("[name=amount]").value,
        per: l.querySelector("[name=per]").value, terms: l.querySelector("[name=terms]").value }));
      run(() => api("action", { id: p.id, action: "approve", price, note: qf.note.value }), "Quote sent.");
    };
  }

  const df = el.querySelector("#delivery-form");
  if (df) {
    const out = df.querySelector("output");
    df.progress.oninput = () => (out.textContent = df.progress.value + "%");
    df.onsubmit = (e) => { e.preventDefault(); run(() => api("update", { id: p.id, fields: fields(df) }), "Delivery saved."); };
  }
  const pf = el.querySelector("#post-form");
  if (pf) pf.onsubmit = (e) => { e.preventDefault(); run(() => api("event", { id: p.id, ...fields(pf) }), "Update posted."); };
  const tf = el.querySelector("#details-form");
  tf.onsubmit = (e) => { e.preventDefault(); run(() => api("update", { id: p.id, fields: fields(tf) }), "Details saved."); };
  el.querySelectorAll("[data-del]").forEach((b) => b.onclick = () => {
    if (confirm("Delete this update? The client will no longer see it.")) run(() => api("delete-event", { id: p.id, eventId: b.dataset.del }), "Update deleted.");
  });
  el.querySelector("#del-project").onclick = async () => {
    if (!confirm(`Delete “${p.title}” and all its history? This can’t be undone.`)) return;
    try { await api("delete-project", { id: p.id }); projects = projects.filter((x) => x.id !== p.id); selected = null; history.replaceState(null, "", location.pathname); render(); toast("Project deleted."); }
    catch (e) { toast(e.message, true); }
  };
}

const dlg = document.getElementById("new-dialog"), nf = document.getElementById("new-form"), ns = document.getElementById("new-status");
function openNew() { nf.reset(); nf.proposed.value = meta.today; ns.hidden = true; dlg.showModal(); nf.owner.focus(); }
nf.addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "create") return;
  e.preventDefault();
  try {
    const { project } = await api("create", fields(nf));
    replace(project); selected = project.id; view = "open"; history.replaceState(null, "", "#" + selected);
    dlg.close(); render(); toast("Project added.");
  } catch (err) { ns.hidden = false; ns.textContent = err.message; ns.style.background = "var(--bad-soft)"; }
});

load();
