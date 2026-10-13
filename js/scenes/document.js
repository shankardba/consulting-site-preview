// Scene: custom cake orders as JSON documents. Each one has its own shape.
window.SCENES = window.SCENES || {};
(function(){
  const {h, q, qa, fx} = S;
  // Tiny JSON-ish renderer with colour spans. Values: string → green, number → blue.
  function render(obj, ind = ""){
    const pad = ind + "  ";
    if(Array.isArray(obj)) return "[" + obj.map(x => fmt(x, pad)).join(", ") + "]";
    return "{\n" + Object.entries(obj).map(([k,x]) => `${pad}<span class="k" data-k="${k}">${k}</span>: ${fmt(x, pad)}`).join(",\n") + `\n${ind}}`;
  }
  function fmt(x, pad){
    if(typeof x === "number") return `<span class="n">${x}</span>`;
    if(typeof x === "string") return `<span class="s">"${x}"</span>`;
    return render(x, pad);
  }
  const DOCS = [
    {id:"1041", r:"-2deg", srv:"server A", d:{_id:"order_1041", customer:{name:"Mrs. Patel"}, type:"wedding", tiers:3, flavours:["lemon","raspberry","vanilla"], topper:"photo-1041.jpg", allergies:["tree nuts"]}},
    {id:"1042", r:"1.5deg", srv:"server B", d:{_id:"order_1042", customer:{name:"Dana Brooks"}, type:"birthday", age:7, theme:"dinosaurs", message:"Happy 7th, Leo!"}},
    {id:"1043", r:"-1deg", srv:"server C", d:{_id:"order_1043", customer:{name:"Hillside Dental"}, type:"corporate", boxes:200, logo:"logo.svg", delivery:{window:"8–9am", dock:"B"}}},
  ];
  const NEW = {id:"1044", r:"2deg", srv:"server A", d:{_id:"order_1044", customer:{name:"Jon Okafor"}, type:"pickup", items:["croissant × 6"], locker:"L-12"}};
  const card = (x, i) => `<div class="jdoc" data-id="${x.id}" style="--r:${x.r};--i:${i}"><span class="srv">${x.srv}</span>${render(x.d)}</div>`;

  function side(v, html){ const s = q(v,".doc-side"); s.innerHTML = html; void s.offsetWidth; qa(s,".badge").forEach(b => b.classList.add("on")); }
  function addNew(v){ if(!q(v,'[data-id="1044"]')){ const el = h(card(NEW, 0)); q(v,".docs").append(el); void el.offsetWidth; el.classList.add("on"); } }
  function showAll(v){ q(v,".docs").classList.add("collected"); q(v,".docs-label").classList.add("on"); qa(v,".jdoc").forEach(d => d.classList.add("on")); }

  window.SCENES.document = {
    build(v){
      v.append(h(`<div><div class="docs-label">orders collection</div>
        <div class="docs">${DOCS.map(card).join("")}</div>
        <div class="doc-side" aria-live="polite"></div></div>`));
    },
    steps: [
      { t: "Some data doesn’t come in neat rows. Every custom cake order is different: tiers here, a dinosaur theme there, a loading dock for the office order.",
        run(v){ qa(v,".jdoc").forEach(d => d.classList.add("on")); } },
      { t: "A document database stores each order whole, in whatever shape it has, side by side in one collection.",
        run(v){ showAll(v); side(v, `<span class="badge good">No columns to plan first</span>`); } },
      { t: "Tomorrow you add pickup lockers. New orders just include a “locker” field. No migration, and old orders keep working.",
        run(v){ showAll(v); addNew(v);
          const k = q(v,'[data-id="1044"] [data-k="locker"]'); k.classList.add("new");
          side(v, `<span class="badge good">New field, zero downtime</span>`); } },
      { t: "One read gets everything about an order: the cake, the customer, the delivery. That’s why apps and websites love this shape.",
        run(v){ showAll(v); addNew(v); q(v,'[data-id="1041"]').classList.add("lift");
          side(v, `<span class="badge good">1 read → the whole order</span>`); } },
      { t: "Growing fast? Spread the documents across several servers. Each order lives on one, so adding servers adds capacity.",
        run(v){ showAll(v); addNew(v); q(v,".docs").classList.add("sharded");
          side(v, `<span class="badge good">Scales out across servers</span>`); } },
      { t: "Weak spot: questions across documents. “How much has Mrs. Patel spent all year?” means opening every order to look.",
        run(v,{instant}){ showAll(v); addNew(v); q(v,".docs").classList.add("sharded");
          qa(v,".jdoc").forEach((d,i) => { d.style.setProperty("--i", i); fx(d,"scan",instant); });
          side(v, `<span class="badge warn">4 of 4 documents opened</span><span class="badge warn">On a million orders, that’s slow</span>`); } },
      { t: "Weak spot: copies drift. Her name was copied into each order. She changes it, and the old orders still show the old name.",
        run(v){ showAll(v); addNew(v);
          side(v, `<span class="badge good">customers: “Mrs. Patel-Rao” ✓</span><span class="badge bad">order_1041 still says “Mrs. Patel”</span>`);
          q(v,'[data-id="1041"] [data-k="name"] + .s').classList.add("stale"); } },
      { t: "Rule of thumb: when every record has a different shape, or the shape keeps changing, and you mostly read one record at a time, use documents.",
        run(v){ showAll(v); addNew(v); q(v,".docs").style.boxShadow = "0 0 0 3px var(--doc)";
          side(v, `<span class="badge good">Catalogs, profiles, content, forms, logs</span>`); } },
    ],
  };
})();
