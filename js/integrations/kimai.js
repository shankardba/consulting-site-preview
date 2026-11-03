// Kimai "Time" card on the admin project screen: hours per stage from Kimai against each stage's price, i.e. the
// effective hourly rate. Admins only; clients never see hours (no client card).
import { cents } from "../money.js";

const hrs = (sec) => (sec / 3600).toFixed(1) + " h";
const perHour = (c) => (c == null ? "–" : cents(c) + "/h");

function body(t, ctx) {
  const { esc, stampAt } = ctx;
  if (!t.mirrored) return `<p class="muted small">Not in Kimai yet. The bridge mirrors a project once its plan is sent: the organization becomes a customer, each stage an activity with its price as budget.</p>`;
  const row = (r) => `<tr><td>${esc(r.label)}</td><td class="n">${cents(r.amount)}</td><td class="n">${hrs(r.seconds)}${r.draftSeconds ? ` <span class="muted small">(${hrs(r.draftSeconds)} drafts)</span>` : ""}</td><td class="n">${perHour(r.rate)}</td></tr>`;
  const off = t.offStage.seconds ? `<tr><td class="muted">Not on a stage</td><td></td><td class="n">${hrs(t.offStage.seconds)}</td><td></td></tr>` : "";
  return `<div class="tbl"><table class="pl-table"><thead><tr><th>Stage</th><th class="n">Price</th><th class="n">Hours</th><th class="n">Effective rate</th></tr></thead><tbody>
    ${t.stages.map(row).join("")}${off}
    <tr><th>Whole project (with final payment)</th><th class="n">${cents(t.total.price)}</th><th class="n">${hrs(t.total.seconds)}</th><th class="n">${perHour(t.total.rate)}</th></tr>
    </tbody></table></div>
    ${t.total.draftSeconds ? `<p class="muted small">Includes ${hrs(t.total.draftSeconds)} of auto-drafts not reviewed yet (tag auto-draft in Kimai).</p>` : ""}
    <p class="muted small">Hours measured ${t.measuredAt ? esc(stampAt(t.measuredAt)) : "not yet"}; last sync ${t.syncedAt ? esc(stampAt(t.syncedAt)) : "never"}.</p>`;
}

export default {
  name: "kimai",
  adminCard(p) {
    if (!p.plan?.stages?.length) return "";
    return `<div class="card adm-card" id="kimai-time"><h3>Time</h3><div class="kimai-body"><p class="muted small">Loading hours…</p></div></div>`;
  },
  wireAdmin(p, ctx) {
    const card = ctx.root.querySelector("#kimai-time");
    if (!card) return;
    ctx.api("kimai", "get", { id: p.id }).then((out) => {
      const t = out.time;
      card.querySelector(".kimai-body").innerHTML = body(t, ctx) + (t.kimaiUrl
        ? `<p class="small"><a href="${ctx.esc(t.kimaiUrl)}" target="_blank" rel="noopener">Open in Kimai</a> <span class="muted">(home network only)</span></p>` : "");
    }).catch((e) => { card.querySelector(".kimai-body").innerHTML = `<p class="muted small">Couldn’t load hours: ${ctx.esc(e.message || String(e))}</p>`; });
  },
  clientCard: () => "",
  wireClient() {},
};
