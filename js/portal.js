// Client portal: loads /api/portal (needs the session cookie) and draws the signed-in client's projects.
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

let data, selected, filter = "all";

async function load() {
  let res;
  try { res = await fetch("/api/portal", { cache: "no-store" }); }
  catch { return message("Couldn’t reach the server. Check your connection and reload."); }
  if (res.status === 401) return location.replace("login.html?expired");
  if ([404, 405, 501].includes(res.status)) return message("Preview only: the client portal runs on the live site, not on this preview copy.", true);
  if (!res.ok) return message((await res.json().catch(() => ({}))).error || "Something went wrong. Please reload.");
  data = await res.json();
  const first = data.projects.find((p) => p.status === "active") || data.projects[0];
  selected = first?.id;
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
      <button class="btn ghost small" id="logout" type="button">Sign out</button>
    </header>
    ${projects.some((x) => x.sample) ? `<p class="sample-note">Sample projects: the business, people and figures are invented so you can see how the portal works.</p>` : ""}
    ${projects.length ? `<div class="proj-list" role="tablist" aria-label="Your projects">${projects.map(projTab).join("")}</div>` : `<div class="card portal-msg"><p>No projects yet. Once a proposal is accepted, it appears here.</p></div>`}
    ${p ? detail(p, stages) : ""}`;
  el.querySelector("#logout").onclick = logout;
  el.querySelectorAll("[data-proj]").forEach((b) => b.onclick = () => { selected = b.dataset.proj; filter = "all"; render(); });
  el.querySelectorAll("[data-filter]").forEach((b) => b.onclick = () => { filter = b.dataset.filter; render(); });
}

const pill = (status) => { const [label, tone] = STATUS[status] || [status, "muted"]; return `<span class="st ${tone}">${esc(label)}</span>`; };

function projTab(p) {
  return `<button role="tab" class="proj-tab" data-proj="${esc(p.id)}" aria-selected="${p.id === selected}">
    <span class="pt-title">${esc(p.title)}</span><span class="pt-sub">${esc(p.business)} · ${esc(p.id)}</span>${pill(p.status)}</button>`;
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
    ${pending ? `<div class="callout">We’re reviewing this request. We reply within two business days with questions or a fixed-scope quote. Once you accept the quote, progress reports and the full project history appear here.</div>` : ""}
    ${p.next ? `<div class="next-up"><span class="eyebrow">Next</span><b>${day(p.next.date)}</b><span>${esc(p.next.text)}</span></div>` : ""}
    <div class="proj-grid">
      <div>${history(p)}</div>
      ${p.price ? `<aside>${pricing(p)}</aside>` : ""}
    </div>
  </section>`;
}

function history(p) {
  const items = p.history.filter((h) => filter === "all" || (filter === "report" ? h.kind === "report" : ["milestone", "decision", "file"].includes(h.kind)));
  return `<div class="hist-head"><h3>Project history</h3>
    ${p.history.length > 3 ? `<div class="filters">${FILTERS.map(([id, label]) => `<button type="button" data-filter="${id}" aria-pressed="${filter === id}">${label}</button>`).join("")}</div>` : ""}</div>
    <ol class="timeline">${items.map((h) => { const [label, tone] = KIND[h.kind] || [h.kind, "muted"]; return `
      <li class="tl ${tone}"><span class="tl-dot"></span>
        <div class="tl-meta"><time datetime="${esc(h.date)}">${day(h.date)}</time><span class="tl-kind">${label}</span></div>
        <h4>${esc(h.title)}</h4><p>${esc(h.body)}</p></li>`; }).join("") || `<li class="muted">Nothing in this view yet.</li>`}</ol>`;
}

function pricing(p) {
  return `<div class="side-card"><h3>Price and payments</h3>
    <ul class="price-list">${p.price.map((x) => `<li><span>${esc(x.item)}</span><b>${money(x.amount)}${x.per ? `<small>/${esc(x.per)}</small>` : ""}</b><em>${esc(x.terms)}</em></li>`).join("")}</ul>
    <p class="muted small">Invoices and payment receipts will appear here and in your project history.</p></div>`;
}

async function logout() {
  await fetch("/api/logout", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" }).catch(() => {});
  location.replace("login.html");
}

load();
