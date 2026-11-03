// Shared by the portal, admin screen and invoice page: money in cents and invoice status pills.
export const cents = (c) => "$" + (Number(c || 0) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const day = (d) => d ? new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" }) : "";

// [label, tone] for each invoice state worked out by worker/store.js.
export function invoiceLabel(inv) {
  return {
    draft: ["Draft", "muted"], due: [`Due ${day(inv.due)}`, "review"], part: ["Part paid", "review"],
    overdue: ["Overdue", "late"], paid: ["Paid", "active"], void: ["Cancelled", "muted"],
  }[inv.state] || [inv.state, "muted"];
}

export const METHOD = { bank_transfer: "Bank transfer", check: "Check", bank_debit: "Bank debit", card: "Card", paypal: "PayPal" };

// Totals across many projects' invoices, for the admin header. Test projects (made-up money, testers'
// practice projects) are counted apart so they never mix with real money.
export function moneySummary(projects, monthPrefix) {
  const real = moneyOf(projects.filter((p) => !p.test), monthPrefix);
  return { ...real, test: moneyOf(projects.filter((p) => p.test), monthPrefix) };
}

function moneyOf(projects, monthPrefix) {
  let outstanding = 0, overdue = 0, received = 0, drafts = 0;
  for (const p of projects) for (const i of p.invoices || []) {
    if (i.status === "sent") outstanding += i.balance;
    if (i.state === "overdue") overdue += i.balance;
    if (i.status === "draft") drafts++;
    for (const x of i.payments) if (x.date.startsWith(monthPrefix)) received += x.amount;
  }
  return { outstanding, overdue, received, drafts };
}
