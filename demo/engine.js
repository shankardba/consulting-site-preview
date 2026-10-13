// Job-costing engine for the spreadsheet-to-app demo. Runs in the browser and in Node (tests).
//
// evaluate(wb, fixes) costs every job from the workbook rows. With no fixes it behaves exactly as
// the workbook's formulas do, mistakes included. Each fix switches one mistake off, so the audit
// can price every finding on its own and the back-test can reconcile to the cent.

const cents = (n) => Math.round(n * 100) / 100;
const isNum = (v) => typeof v === "number" && Number.isFinite(v);

export const FIX_ORDER = ["rate", "range", "typed", "text", "dup", "jobid"];

export function rateOn(wb, role, date) {
  const hits = wb.rates.filter((r) => r.role === role && r.from <= date).sort((a, b) => (a.from < b.from ? 1 : -1));
  return hits.length ? hits[0].rate : 0;
}

// "7,5" → 7.5 ; "6.5h" → 6.5 ; anything else → null
export function parseHours(v) {
  if (isNum(v)) return v;
  if (typeof v !== "string") return null;
  const m = v.trim().replace(",", ".").match(/^(\d+(?:\.\d+)?)\s*(h|hrs?|hours?)?$/i);
  return m ? Number(m[1]) : null;
}

// Map a mistyped job number to a real one when there is exactly one obvious match.
export function resolveJob(wb, id) {
  const ids = wb.jobs.map((j) => j.id);
  const raw = String(id);
  if (ids.includes(raw)) return raw;
  const norm = (s) => s.toUpperCase().replace(/\s+/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");
  const hits = ids.filter((x) => norm(x) === norm(raw));
  return hits.length === 1 ? hits[0] : null;
}

const matKey = (r) => [r.date, r.job, r.item, r.qty, r.unit].join("|");
export function duplicateMaterialRows(wb) {
  const seen = new Set(), dups = [];
  for (const r of wb.materials) { const k = matKey(r); if (seen.has(k)) dups.push(r); else seen.add(k); }
  return dups;
}

export function evaluate(wb, fixes = []) {
  const fx = new Set(fixes);
  const dupRows = new Set(fx.has("dup") ? duplicateMaterialRows(wb).map((r) => r.row) : []);
  const jobOf = (id) => (fx.has("jobid") ? resolveJob(wb, id) ?? String(id) : String(id));
  const out = {};
  for (const j of wb.jobs) {
    let labor = 0;
    for (const r of wb.labor) {
      if (!fx.has("range") && (r.row < j.laborRange[0] || r.row > j.laborRange[1])) continue;
      if (jobOf(r.job).toLowerCase() !== j.id.toLowerCase()) continue;
      const rate = fx.has("rate") ? rateOn(wb, r.role, r.date) : r.rate;
      let hours = isNum(r.hours) ? r.hours : null;
      if (hours === null && fx.has("text")) hours = parseHours(r.hours);
      if (hours !== null && (r.costFormula || fx.has("text"))) labor += cents(hours * rate);
      else if (!r.costFormula && isNum(r.costTyped)) labor += r.costTyped;
    }
    let materials = 0;
    if (isNum(j.materialsTyped) && !fx.has("typed")) materials = j.materialsTyped;
    else for (const r of wb.materials) {
      if (dupRows.has(r.row)) continue;
      if (jobOf(r.job).toLowerCase() === j.id.toLowerCase()) materials += cents(r.qty * r.unit);
    }
    labor = cents(labor); materials = cents(materials);
    const total = cents(labor + materials), profit = cents(j.quote - total);
    out[j.id] = { labor, materials, total, profit, margin: j.quote ? profit / j.quote : 0 };
  }
  return out;
}

export const normName = (s) => String(s).toLowerCase().replace(/[.,]/g, "").replace(/\b(llc|inc|co|ltd)\b/g, "").replace(/\s+/g, " ").trim();

// The audit: generic checks over the workbook rows. Each finding lists where it is and what it costs.
export function audit(wb) {
  const findings = [];
  const steps = [evaluate(wb, [])];
  FIX_ORDER.forEach((_, i) => steps.push(evaluate(wb, FIX_ORDER.slice(0, i + 1))));
  const delta = (i) => {            // cost change per job when fix i is applied on top of the earlier ones
    const byJob = {}; let sum = 0;
    for (const j of wb.jobs) { const d = cents(steps[i + 1][j.id].total - steps[i][j.id].total); if (d) { byJob[j.id] = d; sum += d; } }
    return { byJob, total: cents(sum) };
  };
  const add = (key, title, plain, where, rows) => {
    const i = FIX_ORDER.indexOf(key);
    const d = i >= 0 ? delta(i) : { byJob: {}, total: 0 };
    if (rows.length) findings.push({ key, title, plain, where, rows, costByJob: d.byJob, cost: d.total });
  };

  const stale = wb.labor.filter((r) => isNum(r.rate) && r.rate !== rateOn(wb, r.role, r.date));
  add("rate", "Old pay rate still in use", "Some labor rows use a rate that changed. The rate was typed into each row, so the old one kept getting copied down.", "Labor", stale.map((r) => r.row));

  const lastRow = Math.max(...wb.labor.map((r) => r.row));
  const shortEnd = Math.min(...wb.jobs.map((j) => j.laborRange[1]));
  add("range", "Totals stop before the last rows", `The job totals only add up the labor log through row ${shortEnd}. The log now runs to row ${lastRow}, so the newest entries are never counted.`, "Jobs → Labor", wb.labor.filter((r) => r.row > shortEnd).map((r) => r.row));

  add("typed", "A number typed over a formula", "A materials total was typed in by hand, so it no longer updates when receipts are added.", "Jobs", wb.jobs.filter((j) => isNum(j.materialsTyped)).map((j) => j.row));

  add("text", "Hours entered as text", "An entry’s hours were typed in a form the sheet can’t read, so its cost is blank and the hours were never costed.", "Labor", wb.labor.filter((r) => !isNum(r.hours)).map((r) => r.row));

  add("dup", "The same receipt entered twice", "Two material rows are identical: same day, job, item, quantity and price.", "Materials", duplicateMaterialRows(wb).map((r) => r.row));

  const ids = new Set(wb.jobs.map((j) => j.id));
  add("jobid", "Job number that matches no job", "A labor entry’s job number has a typo, so its hours belong to no job at all.", "Labor", wb.labor.filter((r) => !ids.has(String(r.job))).map((r) => r.row));

  const groups = {};
  for (const j of wb.jobs) (groups[normName(j.customer)] ||= new Set()).add(j.customer);
  const variants = Object.values(groups).filter((s) => s.size > 1);
  if (variants.length) findings.push({ key: "names", title: "One customer under several names",
    plain: "The same customer is spelled differently on different jobs, so any report by customer splits them apart.",
    where: "Jobs", rows: wb.jobs.filter((j) => variants.some((s) => s.has(j.customer))).map((j) => j.row),
    names: variants.map((s) => [...s]), costByJob: {}, cost: 0 });

  const unbilled = wb.jobs.filter((j) => j.status === "Complete" && !isNum(j.billed));
  if (unbilled.length) findings.push({ key: "unbilled", title: "Finished work never invoiced",
    plain: "A job is marked complete but nothing was ever entered as billed.",
    where: "Jobs", rows: unbilled.map((j) => j.row), costByJob: {}, cost: 0,
    revenue: cents(unbilled.reduce((s, j) => s + j.quote, 0)), jobs: unbilled.map((j) => j.id) });

  return findings;
}

// The migration: turn the workbook rows into clean, related tables.
export function clean(wb) {
  const customers = [], byNorm = {};
  for (const j of wb.jobs) {
    const k = normName(j.customer);
    if (!byNorm[k]) { byNorm[k] = { id: "C" + (customers.length + 1), name: j.customer.replace(/\s+/g, " ").replace(/\s+(LLC|Inc\.?|Co\.?)$/i, "").trim() }; customers.push(byNorm[k]); }
  }
  const dup = new Set(duplicateMaterialRows(wb).map((r) => r.row));
  return {
    rates: wb.rates.map((r) => ({ ...r })),
    workers: { ...wb.workers },
    customers,
    jobs: wb.jobs.map((j) => ({ id: j.id, customerId: byNorm[normName(j.customer)].id, desc: j.desc, quote: j.quote, status: j.status, billed: isNum(j.billed) ? j.billed : 0 })),
    labor: wb.labor.map((r) => ({ date: r.date, job: resolveJob(wb, r.job), worker: r.worker, hours: parseHours(r.hours) })).filter((r) => r.job && r.hours !== null),
    materials: wb.materials.filter((r) => !dup.has(r.row)).map((r) => ({ date: r.date, job: resolveJob(wb, r.job), item: r.item, qty: r.qty, unit: r.unit })).filter((r) => r.job),
  };
}

// Costing in the app: the rate always comes from the rate table for that worker and date.
export function costModel(m) {
  const out = {};
  for (const j of m.jobs) {
    const labor = cents(m.labor.filter((r) => r.job === j.id).reduce((s, r) => s + cents(r.hours * rateOn(m, m.workers[r.worker], r.date)), 0));
    const materials = cents(m.materials.filter((r) => r.job === j.id).reduce((s, r) => s + cents(r.qty * r.unit), 0));
    const total = cents(labor + materials), profit = cents(j.quote - total);
    out[j.id] = { labor, materials, total, profit, margin: j.quote ? profit / j.quote : 0 };
  }
  return out;
}

// What the app refuses, which the spreadsheet accepted.
export function validateLabor(m, e) {
  if (!m.jobs.some((j) => j.id === e.job)) return "Pick a job from the list.";
  if (!m.workers[e.worker]) return "Pick a worker from the list.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date || "")) return "Pick a date.";
  if (!isNum(e.hours) || e.hours <= 0 || e.hours > 16) return "Hours must be a number between 0.25 and 16.";
  return null;
}
