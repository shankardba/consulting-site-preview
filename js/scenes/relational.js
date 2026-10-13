// Scene: the same bakery data split into related tables, with a SQL console underneath.
window.SCENES = window.SCENES || {};
(function(){
  const {h, q, qa, fx} = S;
  const CUST = [["C1","Mrs. Patel","555-0142"],["C2","Jon Okafor","555-0187"],["C3","Amira Haddad","555-0110"]];
  const PROD = [["P1","Croissant","3.50",40],["P2","Seeded Rye","7.00",12],["P3","Baguette","4.00",2]];
  const ORD = [["O1","Mon","C1","P1",6],["O2","Mon","C2","P2",2],["O3","Tue","C1","P2",1],["O4","Wed","C3","P1",12],["O5","Thu","C2","P1",4],["O6","Fri","C1","P3",3]];
  const key = k => `<span class="key k-${k}">${k}</span>`;

  function consoleLines(v, lines, instant){
    const c = q(v,".console"); c.innerHTML = lines.map((l,i) => `<div class="ln" style="--i:${i}">${l}</div>`).join("");
    void c.offsetWidth; qa(c,".ln").forEach(l => l.classList.add("on"));
    return c;
  }

  window.SCENES.relational = {
    build(v){
      v.append(h(`<div><div class="rel-tables">
        <div class="rtable appear" style="--i:0"><h4><span>customers</span><span>${CUST.length} rows</span></h4><table>
          <tr><th>id</th><th>name</th><th>phone</th></tr>
          ${CUST.map(c => `<tr class="r-${c[0]}"><td>${key(c[0])}</td><td>${c[1]}</td><td data-ph="${c[0]}">${c[2]}</td></tr>`).join("")}</table></div>
        <div class="rtable appear" style="--i:1"><h4><span>products</span><span>${PROD.length} rows</span></h4><table>
          <tr><th>id</th><th>item</th><th>price</th><th>stock</th></tr>
          ${PROD.map(p => `<tr><td>${key(p[0])}</td><td>${p[1]}</td><td class="num">${p[2]}</td><td class="num" data-stock="${p[0]}">${p[3]}</td></tr>`).join("")}</table></div>
        <div class="rtable appear" style="--i:2"><h4><span>orders</span><span>${ORD.length} rows</span></h4><table>
          <tr><th>id</th><th>day</th><th>customer</th><th>item</th><th>qty</th></tr>
          ${ORD.map(o => `<tr class="r-${o[2]}"><td>${o[0]}</td><td>${o[1]}</td><td>${key(o[2])}</td><td>${key(o[3])}</td><td class="num">${o[4]}</td></tr>`).join("")}</table></div>
        </div><div class="console" aria-live="polite"></div></div>`));
      consoleLines(v, [`<span class="cm">-- SQL console</span>`], true);
    },
    steps: [
      { t: "Same orders, reorganised: one table per kind of thing. Customers, products and orders each live in their own place.",
        run(v){ qa(v,".rtable").forEach(t => t.classList.add("on"));
          consoleLines(v, [`<span class="cm">-- 3 tables. “J. Okafor” and “Jon Okafor” are now one customer: C2.</span>`]); } },
      { t: "Every customer is stored once, with an ID. Orders don’t copy her details, they just point to C1.",
        run(v){ qa(v,".rtable").forEach(t => t.classList.add("on")); q(v,".rel-tables").classList.add("c1");
          consoleLines(v, [`<span class="cm">-- orders.customer → customers.id   (a “foreign key”)</span>`, `<span class="okc">3 orders point at C1</span>`]); } },
      { t: "She changes her number. Update it once, and every order sees the new one. No row gets missed.",
        run(v,{instant}){ q(v,".rel-tables").classList.add("c1");
          const ph = q(v,'[data-ph="C1"]'); ph.textContent = "555-0199"; fx(ph,"flash",instant);
          qa(v,".rtable:nth-child(3) tr.r-C1").forEach(r => fx(r,"pulse",instant));
          consoleLines(v, [`<span class="kw">UPDATE</span> customers <span class="kw">SET</span> phone = <span class="str">'555-0199'</span> <span class="kw">WHERE</span> id = <span class="str">'C1'</span>;`, `<span class="okc">1 row updated</span>`]); } },
      { t: "Rules guard the door. A quantity must be a number, and an order must belong to a real customer.",
        run(v,{instant}){ q(v,".rel-tables").classList.remove("c1");
          const c = consoleLines(v, [
            `<span class="kw">INSERT INTO</span> orders <span class="kw">VALUES</span> (<span class="str">'O7'</span>, <span class="str">'Sat'</span>, <span class="str">'C3'</span>, <span class="str">'P1'</span>, <span class="str">'twelve'</span>);`,
            `<span class="err">ERROR: qty must be a whole number</span>`,
            `<span class="kw">INSERT INTO</span> orders <span class="kw">VALUES</span> (<span class="str">'O7'</span>, <span class="str">'Sat'</span>, <span class="str">'C9'</span>, <span class="str">'P1'</span>, 12);`,
            `<span class="err">ERROR: customer C9 does not exist</span>`]);
          fx(c,"shake",instant); } },
      { t: "Ask questions across tables. One query joins them back together: who spent the most this week?",
        run(v){
          consoleLines(v, [
            `<span class="kw">SELECT</span> c.name, <span class="kw">SUM</span>(o.qty * p.price) <span class="kw">AS</span> spent`,
            `<span class="kw">FROM</span> orders o <span class="kw">JOIN</span> customers c <span class="kw">ON</span> … <span class="kw">JOIN</span> products p <span class="kw">ON</span> …`,
            `<span class="kw">GROUP BY</span> c.name <span class="kw">ORDER BY</span> spent <span class="kw">DESC</span>;`,
            `<table><tr><th>name</th><th>spent</th></tr><tr><td>Amira Haddad</td><td>42.00</td></tr><tr><td>Mrs. Patel</td><td>40.00</td></tr><tr><td>Jon Okafor</td><td>28.00</td></tr></table>`]); } },
      { t: "Two customers grab the last 2 baguettes at the same moment. A transaction lets one win cleanly. Stock never goes below zero.",
        run(v,{instant}){
          const st = q(v,'[data-stock="P3"]'); st.textContent = "0"; fx(st,"flash",instant);
          consoleLines(v, [
            `<span class="cm">-- 10:02:31.004  order A: 2 × Baguette</span>`, `<span class="okc">COMMIT  ✓ stock 2 → 0</span>`,
            `<span class="cm">-- 10:02:31.005  order B: 2 × Baguette</span>`, `<span class="err">ROLLBACK  ✗ only 0 left, nothing charged</span>`]); } },
      { t: "Weak spot: the shape is fixed up front. A custom wedding cake with tiers, flavours and a photo doesn’t fit the columns.",
        run(v,{instant}){
          const c = consoleLines(v, [
            `<span class="kw">INSERT INTO</span> orders (…, tiers, flavours, topper_photo) <span class="kw">VALUES</span> (…, 3, <span class="str">'lemon, raspberry'</span>, <span class="str">'cake.jpg'</span>);`,
            `<span class="err">ERROR: column "tiers" does not exist</span>`,
            `<span class="cm">-- fix: plan a schema change (a “migration”), test it, deploy it</span>`]);
          fx(c,"shake",instant); } },
      { t: "Rule of thumb: when the same kinds of records repeat and several people or apps share them, use a relational database.",
        run(v){ qa(v,".rtable").forEach(t => t.style.boxShadow = "0 0 0 3px var(--rel)");
          consoleLines(v, [`<span class="okc">Customers, orders, invoices, inventory, bookings: this is home ground.</span>`]); } },
    ],
  };
})();
