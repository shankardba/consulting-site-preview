// Spreadsheet-to-app demo UI: the workbook, the audit, the working app and the back-test.
import wb from "./data.js";
import { evaluate, audit, clean, costModel, validateLabor, rateOn, FIX_ORDER } from "./engine.js";

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const money = (n, d = 2) => (n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (x) => (x * 100).toFixed(1) + "%";
const signed = (n) => (n > 0 ? "+" : n < 0 ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const findings = audit(wb);
const asIs = evaluate(wb), fixed = evaluate(wb, FIX_ORDER);
const F = Object.fromEntries(findings.map((f) => [f.key, f]));
const rowsOf = (k) => new Set(F[k]?.rows || []);
const netCost = findings.reduce((s, f) => s + f.cost, 0);
const unbilled = F.unbilled?.revenue || 0;
const worst = wb.jobs.map((j) => ({ j, drop: asIs[j.id].margin - fixed[j.id].margin })).sort((a, b) => b.drop - a.drop)[0];

// ---------- headline ----------
$("#headline").innerHTML = `The workbook says <b>${esc(worst.j.customer)}</b>’s ${esc(worst.j.desc.toLowerCase())} is earning a <b>${pct(asIs[worst.j.id].margin)}</b> margin. It’s really <b>${pct(fixed[worst.j.id].margin)}</b>.`;
$("#stat-findings").textContent = findings.length;
$("#stat-cost").textContent = money(Math.abs(netCost), 0);
$("#stat-cost-label").textContent = netCost >= 0 ? "of job cost the workbook never counted" : "of job cost the workbook overstated";
$("#stat-unbilled").textContent = money(unbilled, 0);

// ---------- tabs ----------
const tabs = [...document.querySelectorAll("[role=tab]")];
function showTab(id, focus) {
  tabs.forEach((t) => { const on = t.dataset.tab === id; t.setAttribute("aria-selected", on); t.tabIndex = on ? 0 : -1; if (on && focus) t.focus(); });
  document.querySelectorAll("[role=tabpanel]").forEach((p) => (p.hidden = p.id !== "panel-" + id));
  try { history.replaceState(null, "", "#" + id); } catch {}
}
tabs.forEach((t, i) => {
  t.addEventListener("click", () => showTab(t.dataset.tab));
  t.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") showTab(tabs[(i + 1) % tabs.length].dataset.tab, true);
    if (e.key === "ArrowLeft") showTab(tabs[(i + tabs.length - 1) % tabs.length].dataset.tab, true);
  });
});
document.querySelectorAll("[data-goto]").forEach((b) => b.addEventListener("click", () => { showTab(b.dataset.goto); $("#demo-tabs").scrollIntoView({ block: "start" }); }));

// ---------- 1. the workbook ----------
let sheet = "Jobs", marks = false;
const colLetters = (n) => Array.from({ length: n }, (_, i) => `<th>${String.fromCharCode(65 + i)}</th>`).join("");
function cell(v, cls = "", title = "") { return `<td class="${cls}"${title ? ` title="${esc(title)}"` : ""}>${v}</td>`; }
function renderSheet() {
  const m = marks, rate = rowsOf("rate"), range = rowsOf("range"), text = rowsOf("text"), jobid = rowsOf("jobid"), dup = rowsOf("dup"), typed = rowsOf("typed"), names = rowsOf("names"), unb = rowsOf("unbilled");
  let head, body, formula;
  if (sheet === "Jobs") {
    formula = `=SUMIF(Labor!$B$2:$B$${wb.laborRangeEnd},A2,Labor!$G$2:$G$${wb.laborRangeEnd})`;
    head = ["Job #", "Customer", "Description", "Quote", "Status", "Labor", "Materials", "Total cost", "Billed", "Profit", "Margin"];
    body = wb.jobs.map((j) => `<tr><td class="rn">${j.row}</td>${cell(j.id)}${cell(esc(j.customer).replace(/  /g, "&nbsp; "), m && names.has(j.row) ? "dup" : "", "Same customer, different spelling")}${cell(esc(j.desc))}${cell(money(j.quote), "num")}${cell(j.status)}${cell(money(j.shown.labor), "num" + (m && F.range ? " dup" : ""), "Adds up only part of the labor log")}${cell(money(j.shown.materials), "num" + (m && typed.has(j.row) ? " bad" : ""), "Typed number, not a formula")}${cell(money(j.shown.total), "num")}${cell(j.billed == null ? "" : money(j.billed), "num" + (m && unb.has(j.row) ? " bad" : ""), "Complete, nothing billed")}${cell(money(j.shown.profit), "num")}${cell(pct(j.shown.margin), "num")}</tr>`).join("");
  } else if (sheet === "Labor") {
    formula = "=E2*F2";
    head = ["Date", "Job #", "Worker", "Role", "Hours", "Rate", "Cost"];
    body = wb.labor.map((r) => `<tr class="${m && range.has(r.row) ? "uncounted" : ""}"><td class="rn">${r.row}</td>${cell(r.date)}${cell(esc(r.job), m && jobid.has(r.row) ? "bad" : "", "No such job")}${cell(r.worker)}${cell(r.role)}${cell(esc(r.hours), (typeof r.hours === "number" ? "num" : "") + (m && text.has(r.row) ? " bad" : ""), "Text, not a number")}${cell(r.rate.toFixed(2), "num" + (m && rate.has(r.row) ? " bad" : ""), "Old rate")}${cell(r.shownCost == null ? "" : r.shownCost.toFixed(2), "num" + (m && text.has(r.row) ? " bad" : ""))}</tr>`).join("");
  } else if (sheet === "Materials") {
    formula = "=D2*E2";
    head = ["Date", "Job #", "Item", "Qty", "Unit cost", "Cost"];
    body = wb.materials.map((r) => `<tr><td class="rn">${r.row}</td>${[cell(r.date), cell(r.job), cell(esc(r.item)), cell(r.qty, "num"), cell(r.unit.toFixed(2), "num"), cell((r.qty * r.unit).toFixed(2), "num")].map((c) => (m && dup.has(r.row) ? c.replace('class="', 'class="bad ') : c)).join("")}</tr>`).join("");
  } else {
    formula = "";
    head = ["Role", "Cost per hour", "From"];
    body = wb.rates.map((r, i) => `<tr><td class="rn">${i + 2}</td>${cell(r.role)}${cell(r.rate.toFixed(2), "num")}${cell(r.from)}</tr>`).join("");
  }
  $("#sheet").innerHTML = `<div class="xl"><div class="xl-bar"><span class="fx">fx</span><span>${esc(formula)}</span></div>
    <div class="sheet-scroll"><table><thead><tr><th></th>${colLetters(head.length)}</tr></thead>
    <tbody><tr class="hdr"><td class="rn">1</td>${head.map((h) => `<td>${h}</td>`).join("")}</tr>${body}</tbody></table></div></div>`;
  document.querySelectorAll("#sheet-tabs button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.sheet === sheet));
  $("#marks-note").hidden = !(m && sheet === "Labor" && F.range);
}
$("#sheet-tabs").innerHTML = ["Jobs", "Labor", "Materials", "Rates"].map((s) => `<button type="button" data-sheet="${s}">${s}</button>`).join("");
$("#sheet-tabs").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) { sheet = b.dataset.sheet; renderSheet(); } });
$("#marks").addEventListener("change", (e) => { marks = e.target.checked; renderSheet(); });
$("#xlsx-link").href = wb.file;
renderSheet();

// ---------- 2. the audit ----------
const impactText = (f) => {
  if (f.key === "unbilled") return `<b class="neg">${money(f.revenue)}</b> not invoiced`;
  if (f.key === "names") return `${f.names.map((n) => n.length).reduce((a, b) => a + b, 0)} spellings of one customer`;
  if (!f.cost) return "No cost effect";
  return f.cost > 0 ? `<b class="neg">${money(f.cost)}</b> of cost never counted` : `<b class="pos">${money(-f.cost)}</b> of cost counted that wasn’t real`;
};
const order = (f) => (f.key === "unbilled" ? f.revenue : Math.abs(f.cost));
$("#findings").innerHTML = [...findings].sort((a, b) => order(b) - order(a)).map((f) => `
  <article class="finding"><div class="f-main"><h3>${esc(f.title)}</h3><p class="muted">${esc(f.plain)}</p>
    ${f.names ? `<p class="mono small">${f.names.map((n) => n.map((x) => "“" + esc(x).replace(/  /g, "&nbsp; ") + "”").join(" · ")).join("<br>")}</p>` : ""}</div>
    <div class="f-side"><div class="f-impact">${impactText(f)}</div>
    <div class="mono small muted">${esc(f.where)} · ${f.rows.length === 1 ? "row " + f.rows[0] : f.rows.length + " rows"}${Object.keys(f.costByJob).length ? " · " + Object.keys(f.costByJob).join(", ") : f.jobs ? " · " + f.jobs.join(", ") : ""}</div></div></article>`).join("");
$("#audit-sum").innerHTML = `${findings.length} findings. Net effect: the workbook ${netCost >= 0 ? "understates" : "overstates"} job costs by <b>${money(Math.abs(netCost))}</b>, and <b>${money(unbilled)}</b> of finished work was never invoiced.`;

// ---------- 3. the app ----------
let model = clean(wb), selected = worst.j.id, formMsg = "";
const custName = (id) => model.customers.find((c) => c.id === id)?.name ?? "";
function renderApp() {
  const c = costModel(model), tot = (k) => model.jobs.reduce((s, j) => s + (k === "quote" ? j.quote : c[j.id][k]), 0);
  const owed = model.jobs.filter((j) => j.status === "Complete").reduce((s, j) => s + Math.max(0, j.quote - j.billed), 0);
  $("#app-tiles").innerHTML = [["Quoted", money(tot("quote"), 0)], ["Cost to date", money(tot("total"), 0)], ["Profit", money(tot("profit"), 0)], ["Finished, not invoiced", money(owed, 0), owed > 0]]
    .map(([l, v, warn]) => `<div class="tile${warn ? " warn" : ""}"><span>${l}</span><b>${v}</b></div>`).join("");
  $("#app-jobs").innerHTML = model.jobs.map((j) => { const x = c[j.id], w = Math.max(0, Math.min(100, x.margin * 100 * 2));
    return `<tr class="${j.id === selected ? "sel" : ""}" data-job="${j.id}" tabindex="0"><td><b>${j.id}</b><br><span class="muted small">${esc(custName(j.customerId))}</span></td><td>${esc(j.desc)}<br><span class="pill ${j.status === "Complete" ? "done" : ""}">${j.status}</span>${j.status === "Complete" && j.billed < j.quote ? ' <span class="pill alert">not invoiced</span>' : ""}</td>
      <td class="num">${money(j.quote, 0)}</td><td class="num">${money(x.total)}</td><td class="num">${money(x.profit)}</td>
      <td><div class="mbar ${x.margin < 0.15 ? "low" : ""}"><i style="width:${w}%"></i></div><span class="small mono">${pct(x.margin)}</span></td></tr>`; }).join("");
  const j = model.jobs.find((x) => x.id === selected), x = c[j.id];
  const lab = model.labor.filter((r) => r.job === j.id), mat = model.materials.filter((r) => r.job === j.id);
  $("#app-detail").innerHTML = `<div class="d-head"><div><div class="eyebrow">${j.id}</div><h3>${esc(j.desc)}</h3><p class="muted">${esc(custName(j.customerId))}</p></div>
      <div class="d-nums"><span>Labor <b>${money(x.labor)}</b></span><span>Materials <b>${money(x.materials)}</b></span><span>Margin <b>${pct(x.margin)}</b></span></div></div>
    ${j.status === "Complete" && j.billed < j.quote ? `<p class="alertbar">This job is finished but ${money(j.quote - j.billed, 0)} hasn’t been invoiced. <button type="button" class="btn small" id="mark-inv">Mark as invoiced</button></p>` : ""}
    <div class="d-cols"><div><h4>Labor · ${lab.length} entries</h4><div class="mini"><table>${lab.map((r) => `<tr><td>${r.date}</td><td>${esc(r.worker)}</td><td class="num">${r.hours} h</td><td class="num">${money(r.hours * rateOn(model, model.workers[r.worker], r.date))}</td></tr>`).join("")}</table></div></div>
      <div><h4>Materials · ${mat.length} items</h4><div class="mini"><table>${mat.map((r) => `<tr><td>${esc(r.item)}</td><td class="num">${r.qty} ×</td><td class="num">${money(r.qty * r.unit)}</td></tr>`).join("")}</table></div></div></div>
    <form id="add-labor" class="addform" novalidate><h4>Add a labor entry</h4>
      <label for="al-date">Date<input type="date" id="al-date" value="2026-04-24" required></label>
      <label for="al-worker">Worker<select id="al-worker">${Object.keys(model.workers).map((w) => `<option>${w}</option>`).join("")}</select></label>
      <label for="al-hours">Hours<input id="al-hours" inputmode="decimal" placeholder="e.g. 6.5" required></label>
      <button class="btn small" type="submit">Add</button>
      <p class="formmsg" role="status">${esc(formMsg)}</p>
      <p class="muted small">The job comes from the one you selected and the rate from the rate table, so neither can be mistyped. Try entering “7,5” or “twelve”.</p></form>`;
  $("#app-customers").innerHTML = model.customers.map((cu) => { const jobs = model.jobs.filter((x) => x.customerId === cu.id);
    return `<li><label class="sr" for="cu-${cu.id}">Customer name</label><input id="cu-${cu.id}" data-cust="${cu.id}" value="${esc(cu.name)}"><span class="muted small">${jobs.length} job${jobs.length > 1 ? "s" : ""} · ${money(jobs.reduce((s, x) => s + x.quote, 0), 0)} quoted</span></li>`; }).join("");
}
$("#app-jobs").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-job]"); if (tr) { selected = tr.dataset.job; formMsg = ""; renderApp(); } });
$("#app-jobs").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { const tr = e.target.closest("tr[data-job]"); if (tr) { e.preventDefault(); selected = tr.dataset.job; formMsg = ""; renderApp(); $(`#app-jobs tr[data-job="${selected}"]`).focus(); } } });
$("#app-detail").addEventListener("submit", (e) => {
  e.preventDefault();
  const raw = $("#al-hours").value.trim(), hours = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) : NaN;
  const entry = { job: selected, worker: $("#al-worker").value, date: $("#al-date").value, hours };
  const err = validateLabor(model, entry);
  if (err) { formMsg = `Not saved: ${err}`; renderApp(); $("#al-hours").value = raw; $("#al-hours").focus(); return; }
  model.labor.push(entry); model.labor.sort((a, b) => (a.date < b.date ? -1 : 1));
  formMsg = `Saved: ${hours} h for ${entry.worker} at ${money(rateOn(model, model.workers[entry.worker], entry.date))}/h. Totals updated.`;
  renderApp();
});
$("#app-detail").addEventListener("click", (e) => { if (e.target.id === "mark-inv") { const j = model.jobs.find((x) => x.id === selected); j.billed = j.quote; renderApp(); } });
$("#app-customers").addEventListener("change", (e) => { const id = e.target.dataset.cust; if (!id) return; const v = e.target.value.trim(); if (v) model.customers.find((c) => c.id === id).name = v.slice(0, 80); renderApp(); });
$("#app-reset").addEventListener("click", () => { model = clean(wb); formMsg = ""; renderApp(); });
renderApp();

// ---------- 4. the back-test ----------
const match = wb.jobs.filter((j) => Math.abs(asIs[j.id].total - j.shown.total) < 0.005 && Math.abs(asIs[j.id].profit - j.shown.profit) < 0.005).length;
$("#bt-same").innerHTML = wb.jobs.map((j) => { const ok = Math.abs(asIs[j.id].total - j.shown.total) < 0.005;
  return `<tr><td><b>${j.id}</b></td><td class="num">${money(j.shown.total)}</td><td class="num">${money(asIs[j.id].total)}</td><td class="num">${money(asIs[j.id].total - j.shown.total)}</td><td><span class="pill ${ok ? "done" : "alert"}">${ok ? "match" : "differs"}</span></td></tr>`; }).join("");
$("#bt-same-sum").innerHTML = `<b>${match} of ${wb.jobs.length}</b> jobs match to the cent.`;
const short = { rate: "old rate", range: "rows not counted", typed: "typed total", text: "text hours", dup: "duplicate", jobid: "job typo" };
$("#bt-fixed").innerHTML = wb.jobs.map((j) => { const a = asIs[j.id], b = fixed[j.id], d = b.total - a.total;
  const why = findings.filter((f) => f.costByJob[j.id]).map((f) => `<span class="pill">${short[f.key]} ${signed(f.costByJob[j.id])}</span>`).join(" ");
  return `<tr><td><b>${j.id}</b><br><span class="muted small">${esc(j.customer.replace(/\s+/g, " "))}</span></td><td class="num">${money(a.total)}<br><span class="small mono">${pct(a.margin)}</span></td><td class="num">${money(b.total)}<br><span class="small mono ${b.margin < a.margin - 0.0005 ? "neg" : b.margin > a.margin + 0.0005 ? "pos" : ""}">${pct(b.margin)}</span></td><td class="num">${Math.abs(d) < 0.005 ? "—" : signed(d)}</td><td>${why || '<span class="muted small">no change</span>'}</td></tr>`; }).join("");
const changed = wb.jobs.filter((j) => Math.abs(fixed[j.id].total - asIs[j.id].total) >= 0.005).length;
$("#bt-fixed-sum").innerHTML = `<b>${changed} of ${wb.jobs.length}</b> jobs change, and every dollar of difference traces to a named finding.`;

showTab(["workbook", "audit", "app", "backtest"].includes(location.hash.slice(1)) ? location.hash.slice(1) : "workbook");
