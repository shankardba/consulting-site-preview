// Scene: the bakery as a web of connections: referrals, purchases, recipes, suppliers.
window.SCENES = window.SCENES || {};
(function(){
  const {h, q, qa} = S;
  const N = {
    patel:{t:"cust",x:110,y:70,l:"Mrs. Patel"}, amira:{t:"cust",x:110,y:180,l:"Amira"},
    dana:{t:"cust",x:110,y:290,l:"Dana"}, jon:{t:"cust",x:110,y:400,l:"Jon"},
    croissant:{t:"prod",x:340,y:80,l:"Croissant"}, tart:{t:"prod",x:340,y:190,l:"Almond Tart"},
    cake:{t:"prod",x:340,y:300,l:"Wedding Cake"}, rye:{t:"prod",x:340,y:400,l:"Seeded Rye"},
    butter:{t:"ingr",x:540,y:110,l:"Butter"}, almond:{t:"ingr",x:540,y:245,l:"Almond flour"}, ryeflour:{t:"ingr",x:540,y:380,l:"Rye flour"},
    dairy:{t:"supp",x:700,y:110,l:"Valley Dairy"}, mill:{t:"supp",x:700,y:312,l:"Hillside Mill"},
  };
  const E = [
    ["ref","patel","amira"],["ref","amira","dana"],["ref","dana","jon"],
    ["buy","patel","croissant"],["buy","patel","cake"],["buy","amira","tart"],["buy","amira","rye"],["buy","dana","tart"],["buy","jon","croissant"],["buy","jon","rye"],
    ["has","croissant","butter"],["has","tart","almond"],["has","tart","butter"],["has","cake","almond"],["has","cake","butter"],["has","rye","ryeflour"],
    ["sup","dairy","butter"],["sup","mill","almond"],["sup","mill","ryeflour"],
  ];
  const W2 = 60; // half width of rectangle nodes
  function edgePath([k,a,b]){
    const A = N[a], B = N[b];
    if(k === "ref") return `M ${A.x-22} ${A.y+4} Q ${A.x-75} ${(A.y+B.y)/2} ${B.x-22} ${B.y-4}`;
    if(k === "buy") return `M ${A.x+22} ${A.y} L ${B.x-W2} ${B.y}`;
    if(k === "has") return `M ${A.x+W2} ${A.y} L ${B.x-W2} ${B.y}`;
    return `M ${A.x-W2} ${A.y} L ${B.x+W2} ${B.y}`; // sup: supplier → ingredient
  }
  const id = e => `e-${e[1]}-${e[2]}`;
  function nodeSvg(k){
    const n = N[k];
    const shape = n.t === "cust" ? `<circle cx="${n.x}" cy="${n.y}" r="20"/>` : `<rect x="${n.x-W2}" y="${n.y-18}" width="${W2*2}" height="36" rx="${n.t==="prod"?6:18}"/>`;
    const text = n.t === "cust" ? `<text x="${n.x}" y="${n.y+40}" text-anchor="middle">${n.l}</text>` : `<text x="${n.x}" y="${n.y+5}" text-anchor="middle">${n.l}</text>`;
    return `<g class="node ${n.t}" data-n="${k}">${shape}${text}</g>`;
  }
  function svg(){
    return `<svg class="gsvg" viewBox="0 0 800 460" role="img" aria-label="Graph of customers, products, ingredients and suppliers">
      <text class="etext" x="20" y="235" transform="rotate(-90 20 235)" text-anchor="middle">referred</text>
      ${E.map(e => `<path class="edge ${e[0]}" id="${id(e)}" pathLength="1" d="${edgePath(e)}"/>`).join("")}
      ${Object.keys(N).map(nodeSvg).join("")}</svg>`;
  }
  const on = (v, kinds) => qa(v,".edge").forEach(p => { if(kinds.some(k => p.classList.contains(k))) p.classList.add("on"); });
  const allNodes = v => qa(v,".node").forEach(n => n.classList.add("on"));
  function path(v, nodes, edges, reco){
    const s = q(v,".gsvg"); s.classList.add("dim"); s.classList.toggle("reco", !!reco);
    nodes.forEach(n => q(v,`[data-n="${n}"]`).classList.add("path"));
    edges.forEach(e => q(v,`#e-${e}`).classList.add("path"));
  }
  function panel(v, html){ const p = q(v,".gpanel"); p.innerHTML = html; void p.offsetWidth; qa(p,".badge").forEach(b => b.classList.add("on")); }

  window.SCENES.graph = {
    build(v){
      v.append(h(`<div>
        <div class="glegend"><span style="--lc:var(--graph)">referred</span><span style="--lc:var(--rel)">bought</span><span style="--lc:var(--doc)">contains</span><span style="--lc:var(--sheet)">supplies</span></div>
        <div class="gwrap">${svg()}</div><div class="gpanel" aria-live="polite"></div></div>`));
    },
    steps: [
      { t: "Sometimes the connections are the data. Here are the bakery’s customers, products, ingredients and suppliers as dots.",
        run(v){ allNodes(v); } },
      { t: "Who referred whom? Mrs. Patel told Amira, who told Dana, who told Jon. One happy customer brought in three.",
        run(v){ allNodes(v); on(v,["ref"]); panel(v, `<span class="badge good">Referral chain: 3 deep</span>`); } },
      { t: "Add who bought what, which recipe uses which ingredient, and who supplies it. Every line is a stored relationship.",
        run(v){ allNodes(v); on(v,["ref","buy","has","sup"]); panel(v, `<span class="badge good">19 relationships, no join tables</span>`); } },
      { t: "Recall! Hillside Mill’s almond flour is bad. Follow the links: flour → tart and cake → the people who bought them.",
        run(v){ allNodes(v); on(v,["ref","buy","has","sup"]);
          path(v, ["mill","almond","tart","cake","amira","dana","patel"], ["mill-almond","tart-almond","cake-almond","amira-tart","dana-tart","patel-cake"]);
          panel(v, `<span class="badge bad">Call: Mrs. Patel, Amira, Dana</span><span class="badge warn">3 hops from the supplier</span>`); } },
      { t: "In tables, every hop is another JOIN, and deep questions get slow. A graph just walks the links, so each extra hop costs very little.",
        run(v){ allNodes(v); on(v,["ref","buy","has","sup"]);
          path(v, ["mill","almond","tart","cake","amira","dana","patel"], ["mill-almond","tart-almond","cake-almond","amira-tart","dana-tart","patel-cake"]);
          panel(v, `<span class="badge warn">SQL: 4 joins</span><span class="badge good">Graph: one path query</span>`); } },
      { t: "Recommendations work the same way. Jon and Amira both buy Seeded Rye, and Amira loves the Almond Tart, so suggest it to Jon.",
        run(v){ allNodes(v); on(v,["ref","buy","has","sup"]);
          path(v, ["jon","rye","amira","tart"], ["jon-rye","amira-rye","amira-tart"], true);
          panel(v, `<span class="badge good">“People like you also bought…”</span>`); } },
      { t: "Weak spot: totals and reports. “Revenue by month” isn’t a connection question, and a spreadsheet or SQL table does it better.",
        run(v){ allNodes(v); on(v,["ref","buy","has","sup"]); q(v,".gsvg").style.opacity = ".45";
          panel(v, `<span class="badge warn">Sums, averages, monthly reports → use tables</span><span class="badge warn">Fewer people know graph tools</span>`); } },
      { t: "Rule of thumb: when your questions are about how things connect (referrals, recalls, fraud rings, networks), use a graph.",
        run(v){ allNodes(v); on(v,["ref","buy","has","sup"]); q(v,".gwrap").style.boxShadow = "0 0 0 3px var(--graph)"; q(v,".gwrap").style.borderRadius = "8px";
          panel(v, `<span class="badge good">Networks, supply chains, fraud, recommendations</span>`); } },
    ],
  };
})();
