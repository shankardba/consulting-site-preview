// PREVIEW DEMO ONLY. tools/build_preview_demo.mjs fills in {"v":1792507768864,"stages":[{"id":"proposal","label":"Proposal"},{"id":"approved","label":"Approved"},{"id":"discovery","label":"Discovery"},{"id":"build","label":"Build"},{"id":"launch","label":"Launch"},{"id":"care","label":"Care"}],"statuses":["submitted","review","approved","active","care","complete","declined"],"kinds":["proposal","decision","report","milestone","meeting","file"],"projects":[{"id":"DIS-2026-014","owner":"client@example.com","sample":true,"business":"Harbor Light Bakery","title":"Wholesale orders app","service":"Spreadsheet to App","summary":"Replace the shared wholesale-orders spreadsheet with a small app: one customer list, one price list, orders that can't double-count, and a morning bake sheet for each location.","status":"active","stage":"build","progress":60,"contact":"Shankar Srinivasan","dates":{"proposed":"2026-09-22","accepted":"2026-09-29","targetLaunch":"2026-11-07"},"next":{"date":"2026-10-23","text":"Staff test session at the Main Street shop (45 minutes, three people)."},"price":[{"item":"Discovery","amount":1200,"per":"","terms":"Paid in full upfront"},{"item":"Build","amount":6400,"per":"","terms":"50% at signing, 50% at launch"},{"item":"Care plan","amount":250,"per":"month","terms":"Starts after launch, 3-month minimum"}],"history":[{"id":9,"date":"2026-10-17","kind":"report","title":"Weekly progress report #2","body":"Order entry, the price list and the customer list are working. Two of three locations' bake sheets match the spreadsheet exactly; the third is off by one tray of rye, which is the spreadsheet's mistake (an order counted twice). Next: delivery routes and the staff test."},{"id":8,"date":"2026-10-10","kind":"report","title":"Weekly progress report #1","body":"Database set up with your 46 wholesale customers and 31 products. First order screen is ready to try. No blockers."},{"id":7,"date":"2026-10-08","kind":"milestone","title":"Build started","body":"Scope, screens and data model signed off. Build is under way."},{"id":6,"date":"2026-10-06","kind":"file","title":"Discovery report delivered","body":"What the spreadsheet does today, the five problems found (including 3 customers entered twice), the screens we will build, and the fixed build price."},{"id":5,"date":"2026-10-01","kind":"meeting","title":"Discovery workshop","body":"Walked through a normal week of orders with the owner and the morning baker."},{"id":4,"date":"2026-09-29","kind":"decision","title":"Proposal accepted","body":"Agreement signed. Discovery paid in full; project scheduled."},{"id":3,"date":"2026-09-26","kind":"decision","title":"Proposal approved","body":"Fixed-scope quote sent: Discovery $1,200, Build $6,400, optional Care plan $250/month."},{"id":2,"date":"2026-09-24","kind":"meeting","title":"Intro call","body":"20-minute call about the orders spreadsheet and what goes wrong each week."},{"id":1,"date":"2026-09-22","kind":"proposal","title":"Project request received","body":"Sent through the website: wholesale orders keep getting lost or double-counted."}],"updated":"2026-10-20 14:49:28"},{"id":"DIS-2026-021","owner":"client@example.com","sample":true,"business":"Harbor Light Bakery","title":"Online pre-order form","service":"Add-on: Forms","summary":"Let retail customers pre-order celebration cakes from the bakery's website, feeding straight into the new orders app.","status":"review","stage":"proposal","progress":null,"contact":"","dates":{"proposed":"2026-10-16","accepted":null,"targetLaunch":null},"next":null,"price":[],"history":[{"id":10,"date":"2026-10-16","kind":"proposal","title":"Project request received","body":"Sent through the website: retail customers want to order celebration cakes online."}],"updated":"2026-10-20 14:49:28"}]} and publish_preview.sh adds this
// script to login/portal/admin pages in the public preview, where there is no server. It answers the
// portal's /api calls in the browser with invented sample data. Changes live in sessionStorage (this
// tab only) and nothing is sent anywhere. The real rules are in worker/store.js; keep these in step.
(function () {
  const SEED = __DATA__;
  const KEY = "dis-preview-demo";
  // Admins are matched by a SHA-256 of their email, so the real address never appears in this public file.
  const ADMIN_HASHES = ["309ef659272536a86ddedac02114aa70f6ee3a9039628232b997630477bd3e6b"];
  const USERS = { "client@example.com": { name: "Demo Client", admin: false } };
  const sha = async (t) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  const PENDING = ["submitted", "review", "approved", "declined"];
  const today = () => new Date().toISOString().slice(0, 10);
  const money = (n) => "$" + Number(n).toLocaleString("en-US");

  let state;
  try { state = JSON.parse(sessionStorage.getItem(KEY)); } catch {}
  if (!state || state.v !== SEED.v) state = { v: SEED.v, user: null, eid: 100000, projects: SEED.projects };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(state)); } catch {} };

  const json = (body, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));
  const bad = (msg) => json({ error: msg }, 400);
  const P = (id) => state.projects.find((p) => p.id === id);
  const ev = (p, kind, title, body, on) => p.history.unshift({ id: ++state.eid, date: on || today(), kind, title, body: body || "" });
  const sortHist = (p) => p.history.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.id - a.id));
  const forClient = (p) => {
    const { owner, updated, ...rest } = p;
    const strip = (h) => h.map(({ id, ...x }) => x);
    if (PENDING.includes(p.status)) {
      const { price, next, progress, ...pend } = rest;
      return { ...pend, history: strip(p.history.filter((h) => ["proposal", "decision"].includes(h.kind))) };
    }
    return { ...rest, history: strip(rest.history) };
  };

  function admin(op, b) {
    if (op === "projects") return json({ stages: SEED.stages, statuses: SEED.statuses, kinds: SEED.kinds, today: today(), projects: state.projects });
    if (op === "create") {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(b.owner || "")) return bad("Client email is missing or invalid.");
      if (!(b.title || "").trim()) return bad("Give the project a title.");
      const year = today().slice(0, 4);
      const n = Math.max(0, ...state.projects.filter((p) => p.id.startsWith(`DIS-${year}-`)).map((p) => +p.id.split("-")[2])) + 1;
      const p = { id: `DIS-${year}-${String(n).padStart(3, "0")}`, owner: b.owner.toLowerCase(), sample: true, business: b.business || "", title: b.title.trim(),
        service: b.service || "", summary: b.summary || "", status: "submitted", stage: "proposal", progress: null, contact: "",
        dates: { proposed: b.proposed || today(), accepted: null, targetLaunch: null }, next: null, price: [], history: [] };
      ev(p, "proposal", "Project request received", "Request received.", p.dates.proposed);
      state.projects.unshift(p);
      return json({ project: p });
    }
    const p = P(b.id);
    if (!p) return bad("No such project.");
    if (op === "delete-project") { state.projects = state.projects.filter((x) => x !== p); return json({ ok: true }); }
    if (op === "action") {
      const a = b.action, on = b.date || today(), note = (b.note || "").trim();
      if (a === "review") { if (p.status !== "submitted") return bad("Only a new request can be moved to review."); p.status = "review"; }
      else if (a === "approve") {
        if (!["submitted", "review", "approved"].includes(p.status)) return bad("Only an open request can be approved.");
        const lines = (b.price || []).map((l) => ({ item: (l.item || "").trim(), amount: Math.round(Number(l.amount)), per: l.per === "month" ? "month" : "", terms: l.terms || "" }));
        if (!lines.length) return bad("Add at least one price line.");
        const off = lines.find((l) => !l.item || !Number.isFinite(l.amount) || l.amount < 0);
        if (off) return bad(off.item ? `"${off.item}" needs an amount in whole dollars.` : "Each price line needs a name.");
        const was = p.status;
        p.price = lines; p.status = "approved"; p.stage = "approved";
        ev(p, "decision", was === "approved" ? "Quote updated" : "Proposal approved", note || `Fixed-scope quote sent: ${lines.map((l) => `${l.item} ${money(l.amount)}${l.per ? "/" + l.per : ""}`).join(", ")}.`, on);
      } else if (a === "accept") {
        if (p.status !== "approved") return bad("Approve the proposal and send a quote first.");
        Object.assign(p, { status: "active", stage: "discovery", progress: 0 }); p.dates.accepted = on;
        ev(p, "decision", "Proposal accepted", note || "Agreement signed. Project scheduled.", on);
      } else if (a === "decline") {
        if (["complete", "declined"].includes(p.status)) return bad("This project is already closed.");
        p.status = "declined"; ev(p, "decision", "Not going ahead", note || "We've closed this request.", on);
      } else if (a === "complete") {
        if (!["active", "care"].includes(p.status)) return bad("Only a project in progress can be completed.");
        p.status = "complete"; p.progress = 100; ev(p, "milestone", "Project complete", note || "Everything delivered and handed over.", on);
      } else if (a === "reopen") {
        if (!["declined", "complete"].includes(p.status)) return bad("Only a closed project can be reopened.");
        p.status = p.status === "complete" || p.dates.accepted ? "active" : "review";
      } else return bad("Unknown action.");
    }
    if (op === "update") {
      const f = b.fields || {};
      if ("title" in f && !f.title.trim()) return bad("Title can't be empty.");
      if ("progress" in f && f.progress !== "" && (f.progress < 0 || f.progress > 100)) return bad("Progress must be 0 to 100.");
      if ("stage" in f && PENDING.includes(p.status) && !["proposal", "approved"].includes(f.stage)) return bad("Accept the proposal before moving it into a delivery stage.");
      for (const k of ["title", "business", "service", "summary", "contact"]) if (k in f) p[k] = f[k];
      if ("owner" in f) p.owner = f.owner.toLowerCase();
      if ("progress" in f) p.progress = f.progress === "" ? null : Math.round(Number(f.progress));
      if ("targetLaunch" in f) p.dates.targetLaunch = f.targetLaunch || null;
      if ("nextDate" in f || "nextText" in f) p.next = { date: f.nextDate || null, text: f.nextText || "" };
      if ("stage" in f) {
        p.stage = f.stage;
        if (f.stage === "care" && p.status === "active") p.status = "care";
        if (f.stage !== "care" && p.status === "care") p.status = "active";
      }
    }
    if (op === "event") {
      if (!["proposal", "decision", "report", "milestone", "meeting", "file"].includes(b.kind)) return bad("Pick what kind of update this is.");
      if (!(b.title || "").trim()) return bad("Give the update a title.");
      ev(p, b.kind, b.title.trim(), b.body, b.date);
    }
    if (op === "delete-event") {
      if (!p.history.some((h) => h.id == b.eventId)) return bad("No such update.");
      p.history = p.history.filter((h) => h.id != b.eventId);
    }
    sortHist(p);
    p.updated = new Date().toISOString();
    return json({ project: p });
  }

  const realFetch = window.fetch.bind(window);
  window.fetch = function (input, opt = {}) {
    const url = new URL(typeof input === "string" ? input : input.url, location.href);
    const path = url.pathname.replace(/^.*\/api\//, "/api/");
    if (!path.startsWith("/api/")) return realFetch(input, opt);
    let b = {};
    try { b = opt.body ? JSON.parse(opt.body) : {}; } catch {}
    const me = state.user && (USERS[state.user] || (state.admin ? { name: "Admin", admin: true } : null));
    const done = (r) => { save(); return r; };
    if (path === "/api/login") {
      const email = String(b.email || "").trim().toLowerCase();
      return sha(email).then((h) => {
        if (ADMIN_HASHES.includes(h)) USERS[email] = { name: "Admin", admin: true };
        if (!USERS[email]) return json({ error: "In this demo, sign in as client@example.com to see the client view." }, 401);
        state.user = email; state.admin = USERS[email].admin; return done(json({ ok: true, name: USERS[email].name, admin: USERS[email].admin }));
      });
    }
    if (path === "/api/logout") { state.user = null; state.admin = false; return done(json({ ok: true })); }
    if (path === "/api/session") return json(me ? { signedIn: true, name: me.name, admin: me.admin } : { signedIn: false });
    if (path === "/api/intake") return json({ error: "Preview demo: the request form isn't connected here." }, 501);
    if (!me) return json({ error: "Please sign in." }, 401);
    if (path === "/api/portal") return json({ user: { name: me.name, email: state.user, admin: me.admin }, stages: SEED.stages,
      projects: state.projects.filter((p) => p.owner === state.user).map(forClient) });
    if (path.startsWith("/api/admin/")) {
      if (!me.admin) return json({ error: "Admins only." }, 403);
      return admin(path.slice(11), b).then(done);
    }
    return json({ error: "Not found." }, 404);
  };

  // A banner so nobody mistakes the demo for the real thing.
  document.addEventListener("DOMContentLoaded", () => {
    const bar = document.createElement("div");
    bar.className = "demo-bar";
    bar.innerHTML = `<div class="wrap"><b>Preview demo.</b> Invented data; changes stay in this browser tab only.
      For the client view, sign in as <code>client@example.com</code> with any password.
      <button type="button">Reset demo</button></div>`;
    bar.querySelector("button").onclick = () => { try { sessionStorage.removeItem(KEY); } catch {} location.reload(); };
    document.body.prepend(bar);
    const css = document.createElement("style");
    css.textContent = ".demo-bar{background:var(--warn-soft);color:var(--ink);font-size:14px;padding:8px 0;border-bottom:1px solid var(--line)}.demo-bar code{font:600 13px var(--mono)}.demo-bar button{margin-left:8px;font:600 13px var(--body);padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}";
    document.head.append(css);
  });
})();
