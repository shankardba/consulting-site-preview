// Printable invoice / receipt: loads /api/invoice?n=<number>. Clients see their own sent invoices; admins see any.
import { cents, invoiceLabel, METHOD, methodLabel } from "./money.js";
const el = document.getElementById("invoice");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "long", day: "numeric", year: "numeric" }) : "";
const brand = typeof BRAND !== "undefined" ? BRAND : "";

async function load() {
  const n = new URLSearchParams(location.search).get("n") || "";
  let res;
  try { res = await fetch("/api/invoice?n=" + encodeURIComponent(n), { cache: "no-store" }); }
  catch { return msg("Couldn’t reach the server. Check your connection and reload."); }
  if (res.status === 401) return location.replace("login.html?expired");
  if ([405, 501].includes(res.status)) return msg("Preview only: invoices open on the live site.");
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return msg(out.error || "Something went wrong. Please reload.");
  render(out);
}

function msg(text) {
  el.innerHTML = `<div class="card portal-msg"><p>${esc(text)}</p><p><a class="btn ghost small" href="portal.html">Your projects</a></p></div>`;
}

function render({ invoice: i, project: p, payTo }) {
  const [label, tone] = invoiceLabel(i);
  const receipt = i.state === "paid";
  document.title = `${receipt ? "Receipt" : "Invoice"} ${i.number}${brand ? " · " + brand : ""}`;
  el.innerHTML = `
    <div class="row-btns inv-tools"><a class="btn ghost small" href="portal.html">Back to your projects</a>
      <button class="btn small" type="button" id="print">Print or save as PDF</button></div>
    ${i.status === "draft" ? `<p class="sample-note">Draft: the client can’t see this until you send it.</p>` : ""}
    <article class="card inv-doc">
      <header class="inv-head">
        <div><div class="eyebrow">${receipt ? "Receipt" : "Invoice"}</div><h1>${esc(i.number)}</h1></div>
        <div class="inv-from"><b>${esc(brand)}</b><span class="st ${tone}">${esc(label)}</span></div>
      </header>
      <dl class="inv-facts">
        <div><dt>Billed to</dt><dd>${esc(p.business || p.owner)}${p.business ? `<br><span class="muted">${esc(p.owner)}</span>` : ""}</dd></div>
        <div><dt>Project</dt><dd>${esc(p.title)}<br><span class="muted">${esc(p.id)}</span></dd></div>
        <div><dt>Invoice date</dt><dd>${day(i.issued) || "Not sent yet"}</dd></div>
        <div><dt>${receipt ? "Paid on" : "Due"}</dt><dd>${day(receipt ? i.paidOn : i.due) || "15 days after sending"}</dd></div>
      </dl>
      <table class="inv-table">
        <thead><tr><th>Description</th><th class="n">Amount</th></tr></thead>
        <tbody>${i.lines.map((l) => `<tr><td>${esc(l.item)}</td><td class="n">${cents(l.amount)}</td></tr>`).join("")}</tbody>
        <tfoot>
          <tr><th>Total</th><td class="n">${cents(i.total)}</td></tr>
          ${i.payments.map((x) => `<tr class="muted"><td>Paid ${day(x.date)} by ${esc(x.via ? methodLabel(x) : methodLabel(x).toLowerCase())}${x.reference ? ` (${esc(x.reference)})` : ""}${x.provider === "simulator" ? " · test payment, no money moved" : ""}</td><td class="n">−${cents(x.amount)}</td></tr>`).join("")}
          ${i.status === "sent" ? `<tr class="inv-due"><th>${receipt ? "Balance" : "Amount due"}</th><td class="n">${cents(i.balance)}</td></tr>` : ""}
          ${(i.claims || []).map((c) => `<tr class="muted"><td>Sent ${day(c.date)} by ${esc((METHOD[c.method] || c.method).toLowerCase())}${c.reference ? ` (${esc(c.reference)})` : ""}, waiting for confirmation</td><td class="n">${cents(c.amount)}</td></tr>`).join("")}
        </tfoot>
      </table>
      ${i.note ? `<p>${esc(i.note)}</p>` : ""}
      ${i.status === "void" ? `<p class="callout">This invoice was cancelled. Nothing is owed on it.</p>`
        : !receipt ? `<section class="inv-pay"><h2>How to pay</h2>
          <p class="pay-how">${payTo ? esc(payTo) : "By bank transfer or check. Our bank details will be sent to you separately until they can be printed here."}</p>
          <p class="muted small">Please put <b>${esc(i.number)}</b> in the transfer reference or on the check.</p></section>`
        : `<p class="muted">Thank you. This invoice is paid in full.</p>`}
    </article>`;
  el.querySelector("#print").onclick = () => window.print();
}

load();
