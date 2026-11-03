// Production watch (Uptime Kuma via the home-server bridge). Admin: edit the addresses to watch and see the latest
// numbers. Client: a calm "your live site" line while it's watched. Data comes from /api/(admin/)x/kuma/get,
// cached per project so a redraw doesn't fetch again.
const cache = {};           // project id -> { at, data } or { loading: true }
const FRESH = 5 * 60e3;
// The client portal's ctx has no stampAt, so keep the same US Eastern format here.
const stamp = (iso) => iso ? new Date(iso).toLocaleString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }) : "";
const at = (ctx) => ctx.stampAt || stamp;

const pct = (x) => (x === null || x === undefined ? "–" : `${Math.floor(x * 100) / 100}%`);
const stale = (id) => !cache[id] || (!cache[id].loading && Date.now() - cache[id].at > FRESH);

function load(p, ctx, scope) {
  if (!stale(p.id)) return;
  cache[p.id] = { loading: true };
  ctx.api("kuma", "get", { id: p.id })
    .then((out) => { cache[p.id] = { at: Date.now(), data: out.kuma }; ctx.done({}); })
    .catch((e) => { cache[p.id] = { at: Date.now(), error: e.message || "Couldn’t load the production watch." }; if (scope === "admin") ctx.done({}); });
}

const incidentsText = (list, ctx) => list.length
  ? list.map((x) => `${at(ctx)(x.start)} to ${x.end ? at(ctx)(x.end) : "now (still down)"}`).join("; ")
  : "none";

// ---------- admin ----------

const KINDS = [["new", "New site"], ["old", "Old address"]];
const row = (t, ctx) => `<div class="q-line kuma-line">
  <label>Label<input name="label" value="${ctx.esc(t.label || "")}" maxlength="60" placeholder="Main site"></label>
  <label>Address<input name="url" type="url" value="${ctx.esc(t.url || "")}" required placeholder="https://www.example.test/"></label>
  <label>Keyword (optional)<input name="keyword" value="${ctx.esc(t.keyword || "")}" maxlength="100" placeholder="Text only the new version shows"></label>
  <label>Kind<select name="kind">${KINDS.map(([k, l]) => `<option value="${k}"${k === (t.kind || "new") ? " selected" : ""}>${l}</option>`).join("")}</select></label>
  <button type="button" class="q-del" aria-label="Remove address" title="Remove address">×</button></div>`;

function numbers(k, ctx) {
  if (!k.latest.length) return `<p class="muted small">No numbers yet. The bridge on the home server picks up new addresses within a few minutes once the shakeout starts.</p>`;
  return `<div class="tbl"><table class="kuma-table"><thead><tr><th>Address</th><th class="n">Up</th><th class="n">Average</th><th class="n">Checks</th><th>Certificate</th><th>New version</th><th>Outages</th></tr></thead><tbody>
    ${k.latest.map((s) => `<tr><td>${ctx.esc(s.label)}${s.kind === "old" ? ' <span class="muted small">(old)</span>' : ""}<br><span class="muted small">${ctx.esc(s.url)}</span></td>
      <td class="n">${pct(s.uptime)}</td><td class="n">${s.avgMs ?? "–"}${s.avgMs !== null ? " ms" : ""}</td><td class="n">${s.checks}</td>
      <td>${s.certDays === null ? "–" : `<span class="${s.certDays < 14 ? "warn-text" : ""}">${s.certDays} days left</span>`}</td>
      <td>${s.keywordOk === null ? "–" : s.keywordOk ? "Yes" : '<b class="warn-text">No</b>'}</td>
      <td class="small">${incidentsText(s.incidents, ctx)}</td></tr>`).join("")}</tbody></table></div>
    <p class="muted small">Measured ${at(ctx)(k.latest.map((s) => s.measuredAt).sort().at(-1))}, over ${at(ctx)(k.latest[0].window.start)} to ${at(ctx)(k.latest[0].window.end)}.</p>`;
}

function status(k, ctx) {
  if (k.watch) return `Watching (${k.mode === "care" ? "care plan, last 30 days" : `shakeout, since ${at(ctx)(k.window.start)}`}).`;
  if (k.reason === "not in production yet") return "Starts when you deploy to production.";
  return `Paused: ${k.reason}.${k.finalDone ? " The closing summary is in the history." : k.final ? " Waiting for the closing summary from the bridge." : ""}`;
}

function adminCard(p, ctx) {
  if (p.plan?.status !== "signed") return "";
  const c = cache[p.id];
  const head = `<h3>Production watch <span class="muted small">checked from outside by Uptime Kuma on the home server</span></h3>`;
  if (!c || c.loading) return `<div class="card adm-card" id="kuma-card">${head}<p class="muted small">Loading…</p></div>`;
  if (c.error) return `<div class="card adm-card" id="kuma-card">${head}<p class="warn-text small">${ctx.esc(c.error)}</p></div>`;
  const k = c.data;
  return `<form class="card adm-card quote" id="kuma-card">${head}
    <p class="small">${status(k, ctx)}</p>
    ${numbers(k, ctx)}
    <details${k.targets.length ? "" : " open"}><summary class="small"><b>Addresses to watch</b> (${k.targets.length})</summary>
      <p class="muted small">Up to 6. For a website move, add the old address as “Old address” too. A keyword turns the check into
        “does the page contain this text”, which confirms visitors get the new version.</p>
      <div class="q-lines" id="kuma-lines">${(k.targets.length ? k.targets : [{}]).map((t) => row(t, ctx)).join("")}</div>
      <div class="row-btns"><button type="button" class="btn small ghost" id="kuma-add">Add address</button>
        <button type="submit" class="btn small">Save addresses</button></div>
    </details></form>`;
}

function wireAdmin(p, ctx) {
  if (p.plan?.status !== "signed") return;
  load(p, ctx, "admin");
  const f = ctx.root.querySelector("#kuma-card");
  if (!f || f.tagName !== "FORM") return;
  const box = f.querySelector("#kuma-lines");
  const bindDel = () => box.querySelectorAll(".q-del").forEach((x) => x.onclick = () => x.parentElement.remove());
  bindDel();
  f.querySelector("#kuma-add").onclick = () => { box.insertAdjacentHTML("beforeend", row({}, ctx)); bindDel(); };
  f.onsubmit = async (e) => {
    e.preventDefault();
    const targets = [...box.children].map((r) => Object.fromEntries([...r.querySelectorAll("input,select")].map((i) => [i.name, i.value.trim()])))
      .filter((t) => t.url || t.label || t.keyword);
    try {
      const out = await ctx.api("kuma", "targets-save", { id: p.id, targets });
      cache[p.id] = { at: Date.now(), data: out.kuma };
      ctx.toast("Addresses saved. The bridge picks them up on its next run.");
      ctx.done(out);
    } catch (err) { ctx.toast(err.message, true); }
  };
}

// ---------- client ----------

// Only while it's watched: the shakeout running, or a care plan.
const watched = (p) => p.status === "care" || (p.status === "active" && p.shakeout && !p.shakeout.ended && !p.shakeout.signedOff);

function clientCard(p, ctx) {
  if (!watched(p)) return "";
  const k = cache[p.id]?.data;
  if (!k?.watching || !k.sites.length) return "";
  return `<div class="callout kuma-client">${k.sites.map((s) => `<p><b>${k.sites.length > 1 ? ctx.esc(s.label) : "Your live site"}:</b>
    ${pct(s.uptime)} up since ${at(ctx)(k.since)}${s.avgMs !== null ? `, average response ${s.avgMs} ms` : ""}.
    ${s.incidents.length ? `<br><span class="small">Brief outage${s.incidents.length > 1 ? "s" : ""}: ${incidentsText(s.incidents, ctx)}.</span>` : ""}</p>`).join("")}
    <p class="muted small">We check it from outside every few minutes, the way your customers reach it. Last checked ${at(ctx)(k.sites.map((s) => s.measuredAt).sort().at(-1))}.</p></div>`;
}

function wireClient(p, ctx) { if (watched(p)) load(p, ctx, "client"); }

export default { name: "kuma", adminCard, wireAdmin, clientCard, wireClient };
