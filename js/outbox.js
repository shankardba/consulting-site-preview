// outbox.html (admins, local dev only): every email the server "sent", newest first, with clickable links.
// No email service is chosen yet, so this is how invites, resets and notices are tested.
const el = document.getElementById("outbox");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const linkify = (t) => esc(t).replace(/https?:\/\/[^\s<]+/g, (u) => `<a href="${u}">${u}</a>`);
const when = (s) => new Date(s.replace(" ", "T") + "Z").toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

async function load() {
  let res;
  try { res = await fetch("/api/admin/outbox", { cache: "no-store" }); } catch { return show("Couldn’t reach the server."); }
  if (res.status === 401) return location.replace("login.html?expired");
  if (res.status === 403) return show("The outbox is for admins.");
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return show(out.error || "The dev outbox is only on in local development.");
  el.removeAttribute("aria-busy");
  el.innerHTML = `<header class="portal-head"><div><div class="eyebrow">Local development</div><h1>Dev outbox</h1>
      <p class="muted">Emails the server would have sent. No email service is set up yet, so nothing leaves this computer.</p></div>
      <div class="row-btns"><button class="btn ghost small" id="reload" type="button">Refresh</button><a class="btn ghost small" href="admin.html">Admin</a></div></header>
    ${out.emails.length ? out.emails.map((m) => `<article class="card ob-mail">
      <div class="ob-top"><b>${esc(m.subject)}</b><span class="muted small">${when(m.created_at)}</span></div>
      <p class="muted small">To ${esc(m.to)}</p>
      <pre class="ob-text">${linkify(m.text)}</pre>
      <details><summary class="small">Show as the client sees it</summary><iframe class="ob-html" sandbox title="Email preview" srcdoc="${esc(m.html)}"></iframe></details>
    </article>`).join("") : `<div class="card portal-msg"><p class="muted">No emails yet. Invite someone from the admin screen, or use “Forgot password?” on the sign-in page.</p></div>`}`;
  document.getElementById("reload").onclick = load;
}
function show(msg) { el.removeAttribute("aria-busy"); el.innerHTML = `<div class="card portal-msg"><p>${esc(msg)}</p><p><a class="btn ghost small" href="admin.html">Admin</a></p></div>`; }
load();
