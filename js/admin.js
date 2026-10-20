// Admin screen: every project, its status actions, delivery details and history. Talks to /api/admin/*.
const el = document.getElementById("admin");
const toastEl = document.getElementById("toast");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }) : "";
const money = (n) => "$" + Number(n).toLocaleString("en-US");

const STATUS = {
  submitted: ["New request", "review"], review: ["Under review", "review"], approved: ["Quote sent", "rel"],
  active: ["In progress", "active"], care: ["Care plan", "active"], complete: ["Complete", "done"], declined: ["Declined", "muted"],
};
const KIND = { proposal: ["Request", "rel"], decision: ["Decision", "sheet"], report: ["Progress report", "doc"],
  milestone: ["Milestone", "graph"], meeting: ["Meeting", "muted"], file: ["Deliverable", "doc"] };
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
      <div><div class="eyebrow">Admin</div><h1>Projects</h1></div>
      <div class="row-btns"><button class="btn small" id="new-btn" type="button">New project</button>
        <a class="btn ghost small" href="portal.html">Client view</a>
        <button class="btn ghost small" id="logout" type="button">Sign out</button></div>
    </header>
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
    <span class="ar-sub">${esc(p.business || p.owner)} · ${esc(p.id)}${p.sample ? " · sample" : ""}</span>
    ${last ? `<span class="ar-last">${day(last.date)} · ${esc(last.title)}</span>` : ""}</button>`;
}

function editor(p) {
  return `
    <div class="card adm-card">
      <div class="proj-top">
        <div><span class="chip svc-chip">${esc(p.service || "No service set")}</span><h2>${esc(p.title)}</h2>
          <p class="muted small">${esc(p.id)} · client <b>${esc(p.owner)}</b>${p.business ? ` · ${esc(p.business)}` : ""}${p.sample ? ` · <span class="sample-tag">sample</span>` : ""}</p></div>
        ${pill(p.status)}
      </div>
      ${actions(p)}
    </div>
    ${accepted(p) && p.status !== "complete" ? delivery(p) : ""}
    ${p.status !== "declined" ? postForm(p) : ""}
    ${historyCard(p)}
    ${details(p)}`;
}

function actions(p) {
  const s = p.status;
  if (quoting) return quoteForm(p);
  const btn = (act, label, cls = "") => `<button type="button" class="btn small ${cls}" data-act="${act}">${label}</button>`;
  const parts = {
    submitted: [`<p><b>New request.</b> Reply within two business days.</p>`, btn("review", "Start review", "ghost"), btn("quote", "Approve and send quote"), btn("decline", "Decline", "ghost danger")],
    review: [`<p><b>Under review.</b> When you’re ready, approve it with a fixed-scope quote.</p>`, btn("quote", "Approve and send quote"), btn("decline", "Decline", "ghost danger")],
    approved: [`<p><b>Quote sent:</b> ${p.price.map((x) => `${esc(x.item)} ${money(x.amount)}${x.per ? "/" + esc(x.per) : ""}`).join(", ")}. Mark it accepted once the agreement is signed and the first payment is in.</p>`,
      `<label class="inline">Accepted on <input type="date" id="acc-date" value="${meta.today}"></label>`, btn("accept", "Mark accepted"), btn("quote", "Change quote", "ghost"), btn("decline", "Decline", "ghost danger")],
    active: [`<p><b>In progress.</b> The client sees every update you post below.</p>`, btn("complete", "Mark complete", "ghost")],
    care: [`<p><b>On a care plan.</b></p>`, btn("complete", "Mark complete", "ghost")],
    complete: [`<p><b>Complete.</b></p>`, btn("reopen", "Reopen", "ghost")],
    declined: [`<p><b>Declined.</b> The client sees it as “Not going ahead”.</p>`, btn("reopen", "Reopen", "ghost")],
  }[s] || [];
  const flow = `<ol class="adm-flow">${["Request", "Review", "Quote", "Accepted", "Delivery", "Done"].map((label, i) => {
    const at = { submitted: 0, review: 1, approved: 2, active: 4, care: 4, complete: 5, declined: -1 }[s];
    return `<li class="${i < at ? "done" : i === at ? "now" : ""}">${label}</li>`; }).join("")}</ol>`;
  return `${flow}<div class="adm-actions">${parts.join("")}</div>
    ${["submitted", "review", "approved"].includes(s) ? `<label class="note-field">Message to the client (optional; shown in their history)<textarea id="act-note" rows="2" placeholder="Leave blank for the standard wording"></textarea></label>` : ""}`;
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
        <div class="tl-meta"><time>${day(h.date)}</time><span class="tl-kind">${label}</span>
          ${accepted(p) || ["proposal", "decision"].includes(h.kind) ? "" : `<span class="hidden-tag">hidden until accepted</span>`}
          <button type="button" class="linkbtn tl-del" data-del="${h.id}">Delete</button></div>
        <h4>${esc(h.title)}</h4>${h.body ? `<p>${esc(h.body)}</p>` : ""}</li>`; }).join("")}</ol></div>`;
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

// ---------- behaviour ----------

async function run(fn, ok) {
  try { const out = await fn(); if (out?.project) { replace(out.project); follow(); } quoting = false; render(); if (ok) toast(ok); }
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
    selected = b.dataset.id; quoting = false; history.replaceState(null, "", "#" + selected); render();
    if (matchMedia("(max-width: 900px)").matches) el.querySelector(".adm-main").scrollIntoView({ behavior: "smooth" });
  });
  if (!p) return;
  const note = () => el.querySelector("#act-note")?.value || "";

  el.querySelectorAll("[data-act]").forEach((b) => b.onclick = () => {
    const act = b.dataset.act;
    if (act === "quote") { quoting = true; render(); return; }
    if (act === "decline" && !confirm(`Decline “${p.title}”? The client will see “Not going ahead”.`)) return;
    if (act === "complete" && !confirm(`Mark “${p.title}” complete?`)) return;
    const body = { id: p.id, action: act, note: note() };
    if (act === "accept") body.date = el.querySelector("#acc-date").value;
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
