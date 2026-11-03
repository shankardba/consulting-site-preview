// Admin card "Archive": what's filed in Paperless-ngx on the home server for this project (worker/integrations/paperless.js).
// The links open Paperless, which is only reachable on the home network. Clients see nothing.
const KINDS = { agreement: "Agreement", invoice: "Invoice", report: "Status report", signoff: "Sign-off", rollback: "Rollback" };

function adminCard(p) {
  return `<div class="card adm-card" id="pl-archive" data-id="${p.id.replace(/"/g, "")}"><h3>Archive <span class="muted small">Paperless-ngx</span></h3>
    <div class="pl-body"><p class="muted small">Loading what's filed…</p></div></div>`;
}

function body(out, ctx) {
  const { esc, stampAt } = ctx;
  const rows = out.filed.map((d) => `<li><span class="chip">${esc(KINDS[d.kind] || d.kind)}</span>
      <a href="${esc(d.link)}" target="_blank" rel="noopener">${esc(d.title)}</a>
      <span class="muted small">#${d.paperlessId} · filed ${esc(stampAt(d.filedAt))}${d.versions > 1 ? ` · ${d.versions} versions` : ""}${d.current ? "" : " · newer version waiting"}</span></li>`).join("");
  const waiting = out.waiting.length ? `<p class="muted small">Waiting for the home server to file: ${out.waiting.map((w) => esc(w.title)).join(", ")}.</p>` : "";
  return `${rows ? `<ul class="pl-list">${rows}</ul>` : `<p class="muted small">Nothing filed yet.</p>`}${waiting}
    <p class="muted small">Home-network links: they open Paperless on the home server (${esc(out.uiUrl)}) and only work from the home network.</p>`;
}

async function wireAdmin(p, ctx) {
  const card = ctx.root.querySelector("#pl-archive");
  if (!card) return;
  const box = card.querySelector(".pl-body");
  try { box.innerHTML = body(await ctx.api("paperless", "list", { id: p.id }), ctx); }
  catch (e) { box.innerHTML = `<p class="muted small">Couldn't load the archive: ${ctx.esc(e.message)}</p>`; }
}

export default { name: "paperless", adminCard, wireAdmin, clientCard: () => "", wireClient() {} };
