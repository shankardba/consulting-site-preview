// Scene: a bakery's order sheet. Shows what spreadsheets do well, then where they crack.
window.SCENES = window.SCENES || {};
(function(){
  const ROWS = [
    ["Mon","Mrs. Patel","555-0142","Croissant",6,3.50],
    ["Mon","Jon Okafor","555-0187","Seeded Rye",2,7.00],
    ["Tue","Mrs. Patel","555-0142","Seeded Rye",1,7.00],
    ["Wed","Amira Haddad","555-0110","Croissant",12,3.50],
    ["Thu","J. Okafor","555-0187","Croissant",4,3.50],
    ["Fri","Mrs. Patel","555-0142","Baguette",3,4.00],
  ];
  const {h, q, qa, fx, money} = S;
  const cell = (v, r, c) => q(v, `tr[data-r="${r}"] td[data-c="${c}"]`);
  const note = (v, r, html) => { const n = cell(v, r, "note"); n.innerHTML = html; void n.offsetWidth; n.querySelector(".badge")?.classList.add("on"); };
  function total(v){ return qa(v, "tr.row").reduce((s, tr) => s + Number(tr.querySelector('[data-c="G"]').textContent || 0), 0); }

  window.SCENES.spreadsheet = {
    build(v){
      const body = ROWS.map((r,i) => `<tr class="row" data-r="${i+2}" style="--i:${i}"><td class="rn">${i+2}</td>
        <td data-c="A">${r[0]}</td><td data-c="B">${r[1]}</td><td data-c="C">${r[2]}</td><td data-c="D">${r[3]}</td>
        <td data-c="E" class="num">${r[4]}</td><td data-c="F" class="num">${money(r[5])}</td><td data-c="G" class="num">${money(r[4]*r[5])}</td>
        <td data-c="note" class="note"></td></tr>`).join("");
      v.append(h(`<div class="xl scroll-x">
        <div class="xl-bar"><span class="fx">fx</span><span class="formula">=E2*F2</span></div>
        <table><thead><tr><th></th><th>A</th><th>B</th><th>C</th><th>D</th><th>E</th><th>F</th><th>G</th><th></th></tr></thead>
        <tbody><tr class="hdr"><td class="rn">1</td><td>Day</td><td>Customer</td><td>Phone</td><td>Item</td><td>Qty</td><td>Price</td><td>Total</td><td class="note"></td></tr>
        ${body}
        <tr class="sum" data-r="8"><td class="rn">8</td><td colspan="6" style="text-align:right">Week total</td><td data-c="G" class="num" id="sum"></td><td data-c="note" class="note"></td></tr>
        </tbody></table></div>`));
    },
    steps: [
      { t: "Most small businesses start here: one sheet, one row per order. Anyone can open it and read it.",
        run(v){ q(v,".xl").classList.add("rows-on"); } },
      { t: "Strength: instant math. Sort, filter, add a total, done. No programmer needed.",
        run(v,{instant}){
          q(v,".xl").classList.add("sum-on");
          q(v,".formula").textContent = "=SUM(G2:G7)";
          const s = q(v,"#sum"); s.textContent = money(total(v)); s.classList.add("hl"); fx(s,"flash",instant);
          note(v, 8, `<span class="badge good">Totals in one formula</span>`);
        } },
      { t: "Strength: what-if is effortless. Raise the croissant price and every total updates on its own.",
        run(v,{instant}){
          q(v,".formula").textContent = "F2 = 3.75";
          qa(v,"tr.row").forEach(tr => { if(tr.querySelector('[data-c="D"]').textContent === "Croissant"){
            const f = tr.querySelector('[data-c="F"]'), g = tr.querySelector('[data-c="G"]');
            f.textContent = "3.75"; g.textContent = money(Number(tr.querySelector('[data-c="E"]').textContent) * 3.75);
            fx(f,"flash",instant); fx(g,"flash",instant); } });
          const s = q(v,"#sum"); s.textContent = money(total(v)); fx(s,"flash",instant);
          note(v, 8, `<span class="badge good">Recalculated: +$5.50</span>`);
        } },
      { t: "Weak spot: the same customer gets typed again and again, phone number and all.",
        run(v){
          [2,4,7].forEach(r => { cell(v,r,"B").classList.add("dup"); cell(v,r,"C").classList.add("dup"); });
          note(v, 2, `<span class="badge warn">Mrs. Patel × 3</span>`);
          note(v, 8, "");
        } },
      { t: "She gets a new number. Someone updates two rows… and misses the third. Which number is right?",
        run(v,{instant}){
          [2,4].forEach(r => { const c = cell(v,r,"C"); c.textContent = "555-0199"; fx(c,"flash",instant); });
          const c7 = cell(v,7,"C"); c7.classList.remove("dup"); c7.classList.add("bad");
          note(v, 7, `<span class="badge bad">Old number still here</span>`);
        } },
      { t: "Typos split people in two. Is “J. Okafor” the same person as “Jon Okafor”? The sheet can’t tell.",
        run(v){
          [3,6].forEach(r => cell(v,r,"B").classList.add("dup"));
          note(v, 6, `<span class="badge warn">1 customer or 2?</span>`);
        } },
      { t: "Nothing guards the door. Someone types “twelve” in Qty and the totals quietly break.",
        run(v,{instant}){
          const e = cell(v,5,"E"), g = cell(v,5,"G"), s = q(v,"#sum");
          e.textContent = "twelve"; e.classList.add("bad"); fx(e,"shake",instant);
          g.textContent = "#VALUE!"; g.classList.add("bad");
          s.textContent = "#VALUE!"; s.classList.remove("hl"); s.classList.add("bad");
          note(v, 5, `<span class="badge bad">No validation</span>`);
          note(v, 8, `<span class="badge bad">Report is now wrong</span>`);
        } },
      { t: "Rule of thumb: perfect for one person’s lists and quick math. Once several people share it or it holds customers, it’s time for a database.",
        run(v){ q(v,".xl").style.boxShadow = "0 0 0 3px var(--sheet)"; } },
    ],
  };
})();
