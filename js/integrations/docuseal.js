// DocuSeal e-signature for the plan and agreement (worker/integrations/docuseal.js).
// Client: "Review and sign" opens DocuSeal's signing page in a new tab; when the client comes back to this tab we
// ask the server to check with DocuSeal (the browser never says it's signed). Once signed: the signed PDF and audit
// log. While a DocuSeal request is open, the portal's typed-name form is folded away behind a link (the fallback).
// Admin: request status, send for e-signature, copy the signing link, a fresh link, and the signed copies.
const cache = new Map(); // project id → { s: state from the server } | { loading } | { error }
let watching = null;     // project id we opened the signing page for; checked when the tab gets focus back

function load(p, ctx, op = "state") {
  const prev = cache.get(p.id);
  cache.set(p.id, { ...prev, loading: true });
  return ctx.api("docuseal", op, { id: p.id })
    .then((out) => { cache.set(p.id, { s: out.docuseal }); ctx.done(out); return out; })
    .catch((e) => { cache.set(p.id, { ...prev, loading: false, error: e.message || "Couldn’t reach the server." }); ctx.done({}); });
}

const when = (iso, ctx) => (iso ? ctx.stampAt?.(iso) || new Date(iso).toLocaleString() : "");
const errLine = (c, ctx) => (c?.error ? `<p class="form-err" role="alert">${ctx.esc(c.error)}</p>` : "");
const docButtons = () => `<div class="row-btns"><button type="button" class="btn small ghost" data-ds-doc="pdf">Download signed agreement</button>
  <button type="button" class="btn small ghost" data-ds-doc="audit">Download audit log</button></div>`;

// DocuSeal's file links are signed and fetched fresh each time. The tab opens on the click (so it isn't blocked).
async function openDocs(p, ctx, which, scope) {
  const w = window.open("", "_blank");
  try {
    const out = await ctx.api("docuseal", "docs", { id: p.id });
    const url = which === "audit" ? out.auditLog : out.combined || out.documents?.[0]?.url;
    if (!url) throw new Error("DocuSeal hasn’t made that file yet. Try again in a minute.");
    if (w) { w.opener = null; w.location.href = url; } else location.href = url;
  } catch (e) { w?.close(); alert(e.message || "Couldn’t get the signed copy."); }
  if (scope === "admin") ctx.done({});
}

// ---------- client ----------

function clientCard(p, ctx) {
  const waiting = p.status === "approved" && p.plan?.status === "sent";
  if (!waiting && p.plan?.status !== "signed") return "";
  const c = cache.get(p.id), s = c?.s;
  if (!s) return waiting ? `<div class="callout" id="ds-card">${c?.error ? errLine(c, ctx) : "Getting your signing link…"}</div>` : "";
  if (s.status === "completed") {
    return `<div class="card ds-card" id="ds-card"><h3>Signed agreement</h3>
      <p class="muted small">Signed in DocuSeal${s.signerName ? ` by ${ctx.esc(s.signerName)}` : ""}${s.completedAt ? `, ${when(s.completedAt, ctx)}` : ""}. The signed PDF is sealed, and the audit log records each step.</p>
      ${docButtons()}${errLine(c, ctx)}</div>`;
  }
  if (!waiting) return "";
  if (s.status === "awaiting" && s.signUrl) {
    return `<div class="card accept ds-card" id="ds-card"><h3>Sign the agreement</h3>
      <p>Read the plan and agreement above, then sign them on our secure signing page. It opens in a new tab with your details filled in; you add your signature, full name and the date.</p>
      <div class="row-btns"><button type="button" class="btn" id="ds-sign">Review and sign</button>
        <button type="button" class="btn ghost small" id="ds-check" ${c.loading ? "disabled" : ""}>${c.loading ? "Checking…" : "Check signature"}</button></div>
      <p class="muted small">When you’ve signed, come back to this tab and we’ll pick it up. <button type="button" class="linkbtn" id="ds-typed">Sign here by typing your name instead</button></p>
      ${errLine(c, ctx)}</div>`;
  }
  return errLine(c, ctx) ? `<div class="callout" id="ds-card">${errLine(c, ctx)}</div>` : ""; // none / declined / stale: the typed form stays
}

function wireClient(p, ctx) {
  const c = cache.get(p.id);
  const waiting = p.status === "approved" && p.plan?.status === "sent";
  if (!c && (waiting || p.plan?.status === "signed")) { load(p, ctx); return; }
  const root = ctx.root, s = c?.s;
  // The typed-name form is the fallback: folded away while a DocuSeal request is open.
  const form = root.querySelector("#sign-form");
  if (form && waiting && s?.status === "awaiting" && s.signUrl && !c.typed) {
    form.querySelectorAll(".acc-name, .acc-agree, .row-btns, .form-err").forEach((n) => { n.hidden = true; n.style.display = "none"; });
    form.querySelectorAll("input").forEach((i) => { i.required = false; });
  }
  root.querySelector("#ds-typed")?.addEventListener("click", () => { cache.set(p.id, { ...c, typed: true }); ctx.done({}); });
  root.querySelector("#ds-sign")?.addEventListener("click", () => { watching = p.id; window.open(s.signUrl, "_blank", "noopener"); });
  root.querySelector("#ds-check")?.addEventListener("click", () => load(p, ctx, "check"));
  root.querySelectorAll("[data-ds-doc]").forEach((b) => b.addEventListener("click", () => openDocs(p, ctx, b.dataset.dsDoc, "client")));
  // Back from the signing tab: check once.
  window.onfocus = () => {
    if (watching !== p.id || cache.get(p.id)?.loading) return;
    watching = null;
    load(p, ctx, "check");
  };
}

// ---------- admin ----------

const ST = { awaiting: ["Waiting for signature", "review"], completed: ["Signed", "done"], declined: ["Declined", "bad"], stale: ["Doesn’t match the plan", "bad"], archived: ["Archived", "muted"], none: ["No request", "muted"] };

function adminCard(p, ctx) {
  const pl = p.plan, c = cache.get(p.id), s = c?.s;
  if (!pl || p.status === "declined") return "";
  if (pl.status === "signed" && s && s.status !== "completed") return ""; // signed by typed name
  if (!s) return `<div class="card adm-card" id="ds-admin"><h3>E-signature (DocuSeal)</h3>${c?.error ? errLine(c, ctx) : `<p class="muted small">Loading…</p>`}</div>`;
  const [label, cls] = ST[s.status] || [s.status, "muted"];
  const sent = p.status === "approved" && pl.status === "sent";
  const btns = [];
  if (pl.status === "draft" && p.status === "approved") btns.push(`<button type="button" class="btn small" data-ds="send">Send the saved plan for e-signature</button>`);
  if (sent && s.status === "awaiting" && s.current) {
    btns.push(`<button type="button" class="btn small ghost" data-ds="copy">Copy signing link</button>`,
      `<button type="button" class="btn small ghost" data-ds="check">Check now</button>`,
      `<button type="button" class="btn small ghost" data-ds="resend">New signing link</button>`);
  } else if (sent) btns.push(`<button type="button" class="btn small" data-ds="resend">Create signing request</button>`);
  if (s.status === "completed") btns.push(`<button type="button" class="btn small ghost" data-ds-doc="pdf">Signed PDF</button>`, `<button type="button" class="btn small ghost" data-ds-doc="audit">Audit log</button>`);
  return `<div class="card adm-card" id="ds-admin"><h3>E-signature (DocuSeal) <span class="st ${cls}">${label}</span></h3>
    <p class="muted small">${s.status === "none" ? "The client signs by typed name in the portal unless a DocuSeal request is made."
      : `Request ${s.submissionId} for plan version ${s.version}${s.current ? "" : " (an older version)"}, made ${when(s.createdAt, ctx)}${s.completedAt ? `; signed ${when(s.completedAt, ctx)}${s.signerName ? ` by ${ctx.esc(s.signerName)}` : ""}` : ""}.`}
      DocuSeal sends no emails; the client signs from the portal. The typed-name signature still works as a fallback.</p>
    ${btns.length ? `<div class="row-btns">${btns.join("")}</div>` : ""}${errLine(c, ctx)}</div>`;
}

function wireAdmin(p, ctx) {
  if (!p.plan || p.status === "declined") return;
  const c = cache.get(p.id);
  if (!c) { load(p, ctx); return; }
  const root = ctx.root;
  root.querySelectorAll("#ds-admin [data-ds]").forEach((b) => b.addEventListener("click", async () => {
    const op = b.dataset.ds;
    if (op === "copy") {
      try { await navigator.clipboard.writeText(c.s.signUrl); ctx.toast?.("Signing link copied."); } catch { prompt("Signing link:", c.s.signUrl); }
      return;
    }
    if (op === "resend" && c.s.status === "awaiting" && !confirm("Make a new signing link? The current one stops working.")) return;
    if (op === "send" && !confirm(`Send the saved plan to ${p.owner} for e-signature?`)) return;
    b.disabled = true;
    const out = await load(p, ctx, op);
    if (out?.error) ctx.toast?.(out.error, true);
    else if (out) ctx.toast?.(op === "check" ? `DocuSeal: ${(ST[out.docuseal.status] || [out.docuseal.status])[0]}.` : "Done.");
  }));
  root.querySelectorAll("#ds-admin [data-ds-doc]").forEach((b) => b.addEventListener("click", () => openDocs(p, ctx, b.dataset.dsDoc, "admin")));
}

export default { name: "docuseal", clientCard, wireClient, adminCard, wireAdmin };
