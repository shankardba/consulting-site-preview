// Shared header/footer and the hero "shape morph".
// BRAND is a placeholder until the LLC name is registered; change it here and in each page <title>.
const BRAND = "Data Integration Specialists";

(function chrome(){
  const root = document.body.dataset.root || "";
  const page = document.body.dataset.page || "";
  const links = [
    ["services","Services","services.html"],
    ["products","Products","products.html"],
    ["demo","Example","demo/index.html"],
    ["learn","Data Architectures","learn/index.html"],
    ["how","How we work","how.html"],
    ["about","About","about.html"],
  ];
  const head = document.createElement("header");
  head.className = "site-head";
  head.innerHTML = `<div class="wrap">
    <a class="wordmark" href="${root}index.html"><span class="glyphs" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span>${BRAND}</span></a>
    <nav class="site-nav" aria-label="Main">${links.map(([id,label,href]) =>
      `<a href="${root}${href}"${page===id?' aria-current="page"':""}>${label}</a>`).join("")}</nav>
    <a class="btn small" href="${root}start.html">Start a project</a></div>`;
  document.body.prepend(head);

  const foot = document.createElement("footer");
  foot.className = "site-foot";
  foot.innerHTML = `<div class="wrap">
    <div><strong>${BRAND}</strong> <span class="placeholder-note">working name</span><br>Fixed-scope data, cloud and web work for small businesses.</div>
    <div><a href="${root}learn/index.html">Data Architectures</a> · <a href="${root}services.html">Services</a> · <a href="${root}products.html">Products</a> · <a href="${root}start.html">Start a project</a></div>
  </div>`;
  document.body.append(foot);
})();

// ---- shape morph: 16 pieces rearrange into a sheet, tables, documents and a graph ----
function initMorph(el){
  const W = 300, H = 200, N = 16;
  const C = {sheet:"--sheet", rel:"--rel", doc:"--doc", graph:"--graph"};
  const DOC_W = 118, DOC_H = 70, DOC_CARDS = [[24,14],[158,14],[24,96],[158,96]];
  const F = {};
  F.sheet = Array.from({length:N}, (_,i) => ({x:32 + (i%4)*60, y:32 + Math.floor(i/4)*34, w:56, h:28, r:2}));
  F.rel = (() => {
    const out = [], tables = [[20,40,3],[110,40,2],[200,40,3]]; // x, y, rows (2 columns each)
    tables.forEach(([x,y,rows]) => { for(let r=0;r<rows;r++) for(let c=0;c<2;c++) out.push({x:x+c*41, y:y+r*26 + (r?8:0), w:38, h:r?22:26, r:2}); });
    return out.slice(0,N);
  })();
  F.doc = (() => {
    // Cards are DOC_W x DOC_H with 14 units of padding on every side of the bars, centred in the 300x200 box.
    const out = [], bars = [[64,0],[90,1],[50,2],[78,3]];
    DOC_CARDS.forEach(([cx,cy]) => bars.forEach(([w,j]) => out.push({x:cx+14, y:cy+8.5+j*15, w, h:8, r:4})));
    return out;
  })();
  const pts = [[40,40],[95,25],[150,55],[210,30],[262,62],[60,100],[120,110],[180,95],[245,120],[30,160],[90,170],[150,155],[205,175],[270,165],[120,60],[200,140]];
  F.graph = pts.map(([x,y]) => ({x:x-8, y:y-8, w:16, h:16, r:8}));
  const edges = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,14],[14,2],[6,7],[7,8],[8,4],[5,9],[9,10],[10,11],[11,6],[11,12],[12,15],[15,7],[12,13],[13,8],[15,8]];
  const docBg = DOC_CARDS;

  el.innerHTML = "";
  const bgs = docBg.map(() => { const d = document.createElement("div"); d.className = "pc bg"; el.append(d); return d; });
  const pcs = Array.from({length:N}, () => { const d = document.createElement("div"); d.className = "pc"; el.append(d); return d; });
  const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");
  svg.setAttribute("class","links"); svg.setAttribute("viewBox",`0 0 ${W} ${H}`); svg.setAttribute("preserveAspectRatio","none");
  svg.setAttribute("aria-hidden","true");
  edges.forEach(([a,b]) => { const l = document.createElementNS(svg.namespaceURI,"line");
    l.setAttribute("x1",pts[a][0]); l.setAttribute("y1",pts[a][1]); l.setAttribute("x2",pts[b][0]); l.setAttribute("y2",pts[b][1]); svg.append(l); });
  el.prepend(svg);
  const lbl = document.createElement("div"); lbl.className = "lbl"; el.append(lbl);
  const names = {sheet:"Spreadsheet", rel:"Relational database", doc:"Document database", graph:"Graph database"};
  const order = ["sheet","rel","doc","graph"];
  let cur = 0, timer = null;
  const keys = el.parentElement.querySelector(".morph-keys");

  function draw(){
    const k = order[cur], s = el.clientWidth / W;
    const color = getComputedStyle(document.documentElement).getPropertyValue(C[k]).trim();
    pcs.forEach((p,i) => { const f = F[k][i];
      p.style.width = f.w*s+"px"; p.style.height = f.h*s+"px"; p.style.borderRadius = f.r*s+"px";
      p.style.transform = `translate(${f.x*s}px,${f.y*s}px)`; p.style.backgroundColor = color;
      p.style.opacity = (k==="rel" && [0,1,6,7,10,11].includes(i)) ? "1" : (k==="rel" ? ".55" : "1"); });
    bgs.forEach((b,i) => { const [x,y] = docBg[i];
      b.style.width = DOC_W*s+"px"; b.style.height = DOC_H*s+"px"; b.style.borderRadius = 8*s+"px";
      b.style.transform = `translate(${x*s}px,${y*s}px)`;
      b.style.backgroundColor = "transparent"; b.style.boxShadow = `inset 0 0 0 ${Math.max(1,1.5*s)}px ${color}`;
      b.style.opacity = k==="doc" ? "1" : "0"; });
    el.classList.toggle("is-graph", k==="graph");
    lbl.textContent = names[k];
    keys && keys.querySelectorAll("button").forEach((b,i) => b.setAttribute("aria-pressed", String(i===cur)));
  }
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function start(){ if(reduce) return; stop(); timer = setInterval(() => { cur = (cur+1)%4; draw(); }, 2600); }
  function stop(){ clearInterval(timer); timer = null; }
  if(keys){
    keys.innerHTML = order.map(k => `<button type="button" aria-pressed="false">${names[k].split(" ")[0]}</button>`).join("");
    keys.querySelectorAll("button").forEach((b,i) => b.addEventListener("click", () => { stop(); cur = i; draw(); }));
  }
  new ResizeObserver(draw).observe(el);
  matchMedia("(prefers-color-scheme: dark)").addEventListener?.("change", draw);
  draw(); start();
}
document.querySelectorAll(".morph").forEach(initMorph);
