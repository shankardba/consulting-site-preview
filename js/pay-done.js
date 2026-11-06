// Where Stripe's payment page sends the client back (pay-done.html?s=<pay session>[&cancelled=1]).
// The server asks Stripe where the payment stands before answering, so this page never decides "paid" itself.
// A bank payment can still be clearing: the page says so, and checks again a few times.
import { cents } from "./money.js";
const el = document.getElementById("checkout");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const q = new URLSearchParams(location.search);
const sid = q.get("s") || "", cancelled = q.has("cancelled");
const back = (id) => `portal.html${id ? "#" + encodeURIComponent(id) : ""}`;
let tries = 0;

function card(title, text, s, tone = "") {
  el.innerHTML = `<section class="card checkout-card ${tone}">
    <div class="eyebrow">Payment${s ? ` · invoice ${esc(s.invoice.number)}` : ""}</div>
    <h1>${esc(title)}</h1><p>${text}</p>
    <p><a class="btn small" href="${back(s?.project.id)}">Back to your project</a></p></section>`;
}

async function load() {
  let res;
  try { res = await fetch("/api/pay/session?s=" + encodeURIComponent(sid), { cache: "no-store" }); }
  catch { return card("Couldn’t check your payment", "We couldn’t reach the server. Reload this page in a moment; your payment isn’t affected."); }
  if (res.status === 401) return location.replace("login.html?expired");
  const s = await res.json().catch(() => ({}));
  if (!res.ok) return card("Payment link not found", esc(s.error || "This payment link isn't valid."));
  const amt = `<b>${cents(s.amount)}</b>`;
  if (s.status === "paid" && s.state !== "needs_refund") return card("Thank you, payment received", `${amt} for invoice ${esc(s.invoice.number)} is recorded on your project. A receipt is on the invoice.`, s, "ok");
  if (s.state === "needs_refund") return card("Payment received", `${amt} arrived, but this invoice was already settled. We'll refund it to you and confirm on your project.`, s);
  if (s.status === "processing") return card("Bank payment on its way", `Your bank payment of ${amt} is clearing. That usually takes 3 to 5 business days. Your invoice updates by itself when it lands; there's nothing more to do.`, s);
  if (s.status === "declined") return card("Payment didn't go through", `The payment of ${amt} was declined. You can try again from your project, or pay by bank transfer or check.`, s);
  if (cancelled) return card("No payment made", `You left the payment page, so nothing was charged. You can pay from your project whenever you're ready.`, s);
  if (s.status === "open" && tries++ < 5) { card("Checking your payment…", "One moment while we confirm it with the payment provider.", s); return setTimeout(load, 2000); }
  card("Payment not finished", `We don't see a completed payment yet. If you finished paying, it will show on your project shortly. Otherwise you can pay again from your project.`, s);
}

load();
