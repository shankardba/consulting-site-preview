// account.html: one page for every account step.
//   ?invite=CODE  set up an invited account (confirms the email, sets a password, signs in)
//   ?reset=CODE   choose a new password
//   ?email=CODE   confirm a new email address
//   ?forgot       ask for a reset link
//   (none)        the signed-in account page: name, password, email, sign out everywhere
// Opening a link only reads it (GET /api/account/link); nothing changes until a form is submitted.
const el = document.getElementById("acct");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const q = new URLSearchParams(location.search);
const mode = ["invite", "reset", "email"].find((k) => q.get(k)) || (q.has("forgot") ? "forgot" : "me");
const code = q.get(mode) || "";
const PREVIEW = "Preview only: accounts work on the live site, not on this preview copy.";
const MIN = 10;

async function call(path, body) {
  let res;
  try {
    res = await fetch("/api/account/" + path, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
  } catch { return { error: "Couldn’t reach the server. Check your connection and try again." }; }
  if ([404, 405, 501].includes(res.status)) return { error: PREVIEW, preview: true };
  const out = await res.json().catch(() => ({}));
  return res.ok ? out : { ...out, status: res.status, error: out.error || "Something went wrong. Please try again." };
}

const card = (inner) => { el.removeAttribute("aria-busy"); el.innerHTML = `<section class="login-card card">${inner}</section>`; };
const statusP = `<p class="status" role="alert" hidden></p>`;
function say(form, msg, bad) {
  const st = form.querySelector(".status");
  st.hidden = false; st.textContent = msg; st.style.background = bad ? "var(--bad-soft)" : "var(--warn-soft)";
}
const pwHelp = `<span class="muted small">At least ${MIN} characters. A few unrelated words make a strong, memorable password. Password managers welcome.</span>`;

// Submit helper: disables the button, shows errors on the form.
function onSubmit(form, label, fn) {
  const btn = form.querySelector("button[type=submit]");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    form.querySelector(".status").hidden = true;
    btn.disabled = true; const was = btn.textContent; btn.textContent = label;
    try { await fn(); } finally { btn.disabled = false; btn.textContent = was; }
  });
}
const checkNew = (form, pw, again) => {
  if (pw.length < MIN) { say(form, `Use at least ${MIN} characters.`, true); return false; }
  if (again !== undefined && pw !== again) { say(form, "The two passwords don’t match.", true); return false; }
  return true;
};
const home = (out) => location.replace(out.admin ? "admin.html" : "portal.html");

function expired(message) {
  const tail = mode === "invite"
    ? `<form class="form" id="resend" novalidate><label>Your email<input type="email" name="email" autocomplete="email" required></label>${statusP}
        <button class="btn" type="submit">Send me a new link</button></form>`
    : mode === "reset" ? `<p><a class="btn" href="account.html?forgot">Request a new reset link</a></p>`
    : `<p class="muted">Sign in and ask for the change again from your account page.</p><p><a class="btn" href="login.html">Sign in</a></p>`;
  card(`<div class="eyebrow">Client portal</div><h1>Link expired</h1><p>${esc(message)}</p>${tail}`);
  const f = document.getElementById("resend");
  if (f) onSubmit(f, "Sending…", async () => {
    const out = await call("resend", { email: f.email.value });
    say(f, out.message || out.error, !!out.error && !out.preview);
  });
}

async function withLink(draw) {
  const res = await fetch("/api/account/link?t=" + encodeURIComponent(code), { cache: "no-store" }).catch(() => null);
  if (!res || [404, 405, 501].includes(res.status)) return card(`<h1>Your account</h1><p>${esc(res ? PREVIEW : "Couldn’t reach the server. Check your connection and reload.")}</p>`);
  const out = await res.json().catch(() => ({}));
  if (!res.ok) return expired(out.error || "This link has expired. Request a new one.");
  draw(out);
}

const pages = {
  invite: () => withLink((link) => {
    card(`<div class="eyebrow">Client portal</div><h1>Set up your account</h1>
      <p class="muted">Welcome${link.name ? ", " + esc(link.name.split(" ")[0]) : ""}. Choose a password to finish setting up the account for <b>${esc(link.email)}</b>.</p>
      <form class="form" id="f" novalidate>
        <input type="email" name="username" value="${esc(link.email)}" autocomplete="username" hidden>
        <label>New password<input type="password" name="pw" autocomplete="new-password" minlength="${MIN}" required>${pwHelp}</label>
        <label>Type it again<input type="password" name="again" autocomplete="new-password" required></label>
        ${statusP}<button class="btn" type="submit">Set password and sign in</button></form>`);
    const f = document.getElementById("f");
    onSubmit(f, "Setting up…", async () => {
      if (!checkNew(f, f.pw.value, f.again.value)) return;
      const out = await call("invite", { token: code, password: f.pw.value });
      if (out.expired) return expired(out.error);
      if (out.error) return say(f, out.error, true);
      home(out);
    });
  }),

  reset: () => withLink((link) => {
    card(`<div class="eyebrow">Client portal</div><h1>Choose a new password</h1>
      <p class="muted">For <b>${esc(link.email)}</b>. Every other device signed in to this account will be signed out.</p>
      <form class="form" id="f" novalidate>
        <input type="email" name="username" value="${esc(link.email)}" autocomplete="username" hidden>
        <label>New password<input type="password" name="pw" autocomplete="new-password" minlength="${MIN}" required>${pwHelp}</label>
        <label>Type it again<input type="password" name="again" autocomplete="new-password" required></label>
        ${statusP}<button class="btn" type="submit">Save new password</button></form>`);
    const f = document.getElementById("f");
    onSubmit(f, "Saving…", async () => {
      if (!checkNew(f, f.pw.value, f.again.value)) return;
      const out = await call("reset", { token: code, password: f.pw.value });
      if (out.expired) return expired(out.error);
      if (out.error) return say(f, out.error, true);
      home(out);
    });
  }),

  email: () => withLink((link) => {
    card(`<div class="eyebrow">Client portal</div><h1>Confirm your new email</h1>
      <p>Use <b>${esc(link.email)}</b> to sign in from now on? Your old address gets a notice.</p>
      <form class="form" id="f" novalidate>${statusP}<button class="btn" type="submit">Confirm this email</button></form>`);
    const f = document.getElementById("f");
    onSubmit(f, "Confirming…", async () => {
      const out = await call("confirm-email", { token: code });
      if (out.expired) return expired(out.error);
      if (out.error) return say(f, out.error, true);
      home(out);
    });
  }),

  forgot: () => {
    card(`<div class="eyebrow">Client portal</div><h1>Forgot your password?</h1>
      <p class="muted">Enter the email you sign in with. We’ll send a link to choose a new password. It lasts one hour.</p>
      <form class="form" id="f" novalidate><label>Email<input type="email" name="email" autocomplete="username" required></label>
        ${statusP}<button class="btn" type="submit">Send reset link</button></form>
      <p class="small"><a href="login.html">Back to sign in</a></p>`);
    const f = document.getElementById("f");
    onSubmit(f, "Sending…", async () => {
      if (!f.email.value || !f.email.validity.valid) return say(f, "Please enter your email.", true);
      const out = await call("forgot", { email: f.email.value });
      say(f, out.message || out.error, !!out.error && !out.preview);
    });
  },

  me: async () => {
    const out = await call("me");
    if (out.status === 401) return location.replace("login.html?expired");
    if (out.error) return card(`<h1>Your account</h1><p>${esc(out.error)}</p>`);
    const u = out.user;
    el.removeAttribute("aria-busy");
    el.classList.add("acct-page");
    el.innerHTML = `<header class="portal-head"><div><div class="eyebrow">Client portal</div><h1>Your account</h1>
        <p class="muted">${esc(u.email)}</p></div>
        <div class="row-btns"><a class="btn ghost small" href="${u.admin ? "admin.html" : "portal.html"}">Back to ${u.admin ? "admin" : "your projects"}</a></div></header>
      <div class="acct-grid">
      <form class="card form" id="f-name" novalidate><h2>Name</h2>
        <label>Your name<input name="name" value="${esc(u.name)}" autocomplete="name" required></label>${statusP}
        <button class="btn small" type="submit">Save name</button></form>
      <form class="card form" id="f-pw" novalidate><h2>Password</h2>
        <input type="email" name="username" value="${esc(u.email)}" autocomplete="username" hidden>
        <label>Current password<input type="password" name="current" autocomplete="current-password" required></label>
        <label>New password<input type="password" name="pw" autocomplete="new-password" minlength="${MIN}" required>${pwHelp}</label>
        ${statusP}<button class="btn small" type="submit">Change password</button>
        <p class="muted small">Other devices are signed out when you change it.</p></form>
      <form class="card form" id="f-email" novalidate><h2>Email</h2>
        <label>New email<input type="email" name="email" autocomplete="email" required></label>
        <label>Current password<input type="password" name="current" autocomplete="current-password" required></label>
        ${statusP}<button class="btn small" type="submit">Send confirmation link</button>
        <p class="muted small">We email a link to the new address. Your email changes only after you click it.</p></form>
      <form class="card form" id="f-out" novalidate><h2>Sign out everywhere</h2>
        <p class="muted small">Signs out every browser and device using this account, including this one.</p>${statusP}
        <button class="btn ghost small" type="submit">Sign out everywhere</button></form>
      </div>`;
    const f1 = document.getElementById("f-name"), f2 = document.getElementById("f-pw"), f3 = document.getElementById("f-email"), f4 = document.getElementById("f-out");
    onSubmit(f1, "Saving…", async () => { const r = await call("name", { name: f1.name.value }); say(f1, r.error || "Saved.", !!r.error); });
    onSubmit(f2, "Saving…", async () => {
      if (!checkNew(f2, f2.pw.value)) return;
      const r = await call("password", { current: f2.current.value, password: f2.pw.value });
      if (r.error) return say(f2, r.error, true);
      f2.reset(); say(f2, "Password changed. Other devices have been signed out.");
    });
    onSubmit(f3, "Sending…", async () => {
      const r = await call("email", { email: f3.email.value, current: f3.current.value });
      if (r.error) return say(f3, r.error, true);
      f3.current.value = ""; say(f3, r.message);
    });
    onSubmit(f4, "Signing out…", async () => {
      if (!confirm("Sign out of every browser and device, including this one?")) return;
      const r = await call("signout-all", {});
      if (r.error) return say(f4, r.error, true);
      location.replace("login.html");
    });
  },
};
pages[mode]();
