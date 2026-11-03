// Front-end pieces of the integrations (worker/integrations/). Each module in this folder exports:
//   { name,
//     adminCard(p, ctx) -> html string ("" for none),  wireAdmin(p, ctx),    // a card on the admin project screen
//     clientCard(p, ctx) -> html string,               wireClient(p, ctx) }  // a panel on the client's project
// Only integrations the server lists as enabled are drawn. ctx: { root, esc, toast, day, stampAt, meta,
//   api(name, op, body) -> Promise<json>   (admin: /api/admin/x/<name>/<op>; client: /api/x/<name>/<op>),
//   done(out)  (puts out.project back into the list and redraws), reload() }.
import docuseal from "./docuseal.js";
import kuma from "./kuma.js";
import paperless from "./paperless.js";
import kimai from "./kimai.js";
import meetings from "./meetings.js";

const ALL = [docuseal, kuma, paperless, kimai, meetings];
const on = (list) => ALL.filter((m) => (list || []).includes(m.name));
const safe = (f, fallback = "") => { try { return f() ?? fallback; } catch (e) { console.error(e); return fallback; } };

export const adminCards = (p, ctx) => on(ctx.meta.integrations).map((m) => safe(() => m.adminCard?.(p, ctx))).join("");
export const wireAdmin = (p, ctx) => on(ctx.meta.integrations).forEach((m) => safe(() => m.wireAdmin?.(p, ctx)));
export const clientCards = (p, ctx) => on(ctx.meta.integrations).map((m) => safe(() => m.clientCard?.(p, ctx))).join("");
export const wireClient = (p, ctx) => on(ctx.meta.integrations).forEach((m) => safe(() => m.wireClient?.(p, ctx)));
