// Step player for the animated explainers.
// A scene is {build(view), steps:[{t: caption, run(view, ctx)}]}.
// Going to step n rebuilds the scene, replays steps 0..n-1 with motion off, then plays step n with motion.
window.Stage = function(stageEl, scene){
  const view = stageEl.querySelector(".stage-view");
  const cap = stageEl.querySelector(".stage-cap");
  const dots = stageEl.querySelector(".stage-dots");
  const btn = {
    prev: stageEl.querySelector("[data-act=prev]"),
    play: stageEl.querySelector("[data-act=play]"),
    next: stageEl.querySelector("[data-act=next]"),
  };
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const STEP_MS = 5200;
  let cur = -1, timer = null, playing = false, seen = new Set();

  dots.innerHTML = scene.steps.map((s,i) => `<button type="button" aria-label="Step ${i+1}"></button>`).join("");
  const dotBtns = [...dots.children];

  let token = 0;
  function go(n, animate = true){
    n = Math.max(0, Math.min(scene.steps.length-1, n));
    const my = ++token;
    stageEl.classList.add("instant");
    view.innerHTML = "";
    scene.build(view);
    for(let i=0;i<n;i++) scene.steps[i].run(view, {instant:true});
    void view.offsetWidth;
    if(animate && !reduce){
      stageEl.classList.remove("instant");
      setTimeout(() => { if(my === token) scene.steps[n].run(view, {instant:false}); }, 30);
    } else {
      scene.steps[n].run(view, {instant:true});
      void view.offsetWidth;
      stageEl.classList.remove("instant");
    }
    cur = n; seen.add(n);
    cap.innerHTML = `<span class="n">Step ${n+1} of ${scene.steps.length}</span><span class="t"></span>`;
    cap.querySelector(".t").textContent = scene.steps[n].t;
    dotBtns.forEach((d,i) => { d.setAttribute("aria-current", String(i===n)); d.classList.toggle("seen", seen.has(i)); });
    btn.prev.disabled = n === 0;
    btn.next.disabled = n === scene.steps.length-1;
  }
  function setPlaying(p){
    playing = p; clearInterval(timer);
    btn.play.textContent = p ? "❚❚" : "▶";
    btn.play.setAttribute("aria-label", p ? "Pause" : "Play");
    if(p){
      if(cur >= scene.steps.length-1) go(0);
      timer = setInterval(() => { if(cur >= scene.steps.length-1) setPlaying(false); else go(cur+1); }, STEP_MS);
    }
  }
  let touched = false; // once the visitor steps manually, don't auto-start over them
  stageEl.addEventListener("pointerdown", () => { touched = true; });
  stageEl.addEventListener("keydown", () => { touched = true; });
  btn.prev.addEventListener("click", () => { setPlaying(false); go(cur-1); });
  btn.next.addEventListener("click", () => { setPlaying(false); go(cur+1); });
  btn.play.addEventListener("click", () => setPlaying(!playing));
  dotBtns.forEach((d,i) => d.addEventListener("click", () => { setPlaying(false); go(i); }));
  stageEl.addEventListener("keydown", e => {
    if(e.key === "ArrowRight"){ setPlaying(false); go(cur+1); }
    if(e.key === "ArrowLeft"){ setPlaying(false); go(cur-1); }
  });

  go(0, false);
  // Start playing the first time the stage scrolls into view (not with reduced motion).
  if(!reduce && "IntersectionObserver" in window){
    let started = false;
    new IntersectionObserver((ents, obs) => {
      if(!started && ents.some(e => e.isIntersecting)){ started = true; obs.disconnect(); if(!touched){ go(0); setPlaying(true); } }
    }, {threshold:.45}).observe(stageEl);
  }
};

// Small helpers shared by scenes.
window.S = {
  h(html){ const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; },
  q(v, sel){ return v.querySelector(sel); },
  qa(v, sel){ return [...v.querySelectorAll(sel)]; },
  fx(el, cls, instant){ if(instant || !el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },
  money(n){ return n.toFixed(2); },
};
