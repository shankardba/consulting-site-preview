// Meeting drafts (worker/integrations/meetings.js): status-report drafts the home server made from recorded meetings.
// "Use as status report" fills the normal report form; posting it closes the draft. Nothing reaches the client until then.
const OPEN = ["active", "care", "rolledback"];

// "Nov 4" from "2026-11-04" or an ISO time (US Eastern).
const shortDay = (v) => {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(v || "") ? new Date(v + "T12:00:00Z") : new Date(v);
  return isNaN(d) ? "" : d.toLocaleDateString("en-US", { timeZone: "America/New_York", month: "short", day: "numeric" });
};
export const label = (d) => `Draft from the meeting on ${shortDay(d.recordedAt || d.createdAt)}${d.minutes ? ` (${d.minutes} min)` : ""}`;

function item(d, esc) {
  const acts = d.actions.length ? `<ul class="small">${d.actions.map((a) => `<li>${esc(a.what)} <span class="muted">· ${a.owner === "client" ? "client" : "us"}${a.due ? ` · by ${esc(a.due)}` : ""}</span></li>`).join("")}</ul>` : "";
  return `<li class="mtg-item"><b>${esc(label(d))}</b> <span class="muted small">${esc(d.file)}</span>
    <p class="small">${esc(d.draft.title)}</p>${acts}
    <div class="row-btns"><button class="btn small" data-mtg-use="${d.id}">Use as status report</button>
    <button class="btn small ghost" data-mtg-discard="${d.id}">Discard</button></div></li>`;
}

export default {
  name: "meetings",
  adminCard(p) {
    if (p.plan?.status !== "signed" || !OPEN.includes(p.status)) return "";
    return `<div class="card adm-card" id="mtg-card"><h3>Meeting drafts</h3>
      <p class="muted small">Made on the home server from recorded meetings. The client sees nothing until you post the report.</p>
      <div id="mtg-list" class="muted small">Loading…</div></div>`;
  },

  async wireAdmin(p, ctx) {
    const box = ctx.root.querySelector("#mtg-list");
    if (!box) return;
    let drafts;
    try { drafts = (await ctx.api("meetings", "list", { projectId: p.id })).drafts; }
    catch (e) { box.textContent = "Couldn't load the meeting drafts."; return; }
    if (!box.isConnected) return; // redrawn meanwhile
    box.className = "";
    box.innerHTML = drafts.length ? `<ul class="mtg-list">${drafts.map((d) => item(d, ctx.esc)).join("")}</ul>` : `<p class="muted small">No new drafts.</p>`;
    box.querySelectorAll("[data-mtg-discard]").forEach((b) => b.onclick = async () => {
      if (!confirm("Discard this draft? The recording and transcript stay on the home server.")) return;
      try { await ctx.api("meetings", "discard", { id: Number(b.dataset.mtgDiscard) }); ctx.toast("Draft discarded."); ctx.done(); }
      catch (e) { ctx.toast(e.message, true); }
    });
    box.querySelectorAll("[data-mtg-use]").forEach((b) => b.onclick = async () => {
      const id = Number(b.dataset.mtgUse);
      const form = ctx.root.querySelector("#report-form");
      if (!form) { ctx.toast("The report form isn't open on this project.", true); return; }
      let out;
      try { out = await ctx.api("meetings", "use", { id }); } catch (e) { ctx.toast(e.message, true); return; }
      for (const [k, v] of Object.entries(out.report)) if (form.elements[k]) form.elements[k].value = v ?? "";
      form.querySelector(".mtg-note")?.remove();
      form.querySelector("h3").insertAdjacentHTML("afterend", `<p class="callout small mtg-note">${ctx.esc(label(out.draft))}. Check and edit it, then post.
        <button type="button" class="btn small ghost" id="mtg-cancel">Don't use it</button></p>`);
      form.querySelector("#mtg-cancel").onclick = () => ctx.done();
      // Posting goes through the draft so it's marked used (the server posts it with plans.postReport).
      form.onsubmit = async (e) => {
        e.preventDefault();
        try { const r = await ctx.api("meetings", "use", { id, report: Object.fromEntries(new FormData(form)) }); ctx.done(r); ctx.toast(`Report posted. ${p.owner} has been emailed.`); }
        catch (err) { ctx.toast(err.message, true); }
      };
      form.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  },
};
