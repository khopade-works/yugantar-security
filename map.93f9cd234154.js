(() => {
const { PLAN, $, esc, short, colour, reduced, state, block, teamsAt, placesNow, icon, selectPlace, render, sync } = globalThis.YugantarApp;
// ---- pixel map: the fest's campus picture, each place outlined, Team Lead tags on top
const MAP_W = 1536, MAP_H = 768, SVGNS = "http://www.w3.org/2000/svg";
const stage = $("stage"), world = $("world"), mapEl = $("map");
// The top edge is uniform sea. The other edges (grass, road, parking) carry on as a soft continuation: their last 24px averaged
// in 48px samples (so the white kerbs can't streak), smoothly stretched outward, fading to the edge's average colour.
function paintEdges() {
  const img = mapEl.querySelector("img"), c = document.createElement("canvas");
  c.width = MAP_W; c.height = MAP_H;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const avg = (x, y, w, h) => {
    const d = g.getImageData(x, y, w, h).data, n = d.length / 4, s = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; }
    return `rgb(${s.map((v) => Math.round(v / n)).join(" ")})`;
  };
  const line = (sx, sy, sw, sh, w, h) => {  // downscaling sw×sh into w×h averages the edge into soft samples
    const l = document.createElement("canvas");
    l.width = w; l.height = h;
    const lg = l.getContext("2d");
    lg.imageSmoothingQuality = "high";
    lg.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return `url(${l.toDataURL()}) 0 0 / 100% 100%`;
  };
  const fade = (dir, colour) => `linear-gradient(${dir}, transparent, ${colour} 40px)`;
  $("edgeT").style.background = avg(0, 0, MAP_W, 4);
  const E = 24;
  $("edgeB").style.background = `${fade("to bottom", avg(0, MAP_H - E, MAP_W, E))}, ${line(0, MAP_H - E, MAP_W, E, MAP_W / 48, 1)}`;
  $("edgeL").style.background = `${fade("to left", avg(0, 0, E, MAP_H))}, ${line(0, 0, E, MAP_H, 1, MAP_H / 48)}`;
  $("edgeR").style.background = `${fade("to right", avg(MAP_W - E, 0, E, MAP_H))}, ${line(MAP_W - E, 0, E, MAP_H, 1, MAP_H / 48)}`;
}
// Cosmetic only: if painting fails, the stage's sea colour fills the gaps.
{ const img = mapEl.querySelector("img"); (img.complete ? Promise.resolve() : img.decode()).then(paintEdges).catch(() => {}); }
const at = ([x, y]) => ({ left: `${(x / MAP_W) * 100}%`, top: `${(y / MAP_H) * 100}%` });
const tags = {};
for (const [name, polys] of Object.entries(PLAN.areas)) {
  const g = document.createElementNS(SVGNS, "g");
  g.setAttribute("class", "zone");
  g.style.setProperty("--c", colour(name));
  g.dataset.place = name;
  for (const poly of polys) {
    const p = document.createElementNS(SVGNS, "polygon");
    p.setAttribute("points", poly.map((q) => q.join(",")).join(" "));
    g.appendChild(p);
  }
  $("zones").appendChild(g);
  const el = document.createElement("button");
  el.type = "button";
  el.className = "lbl panzoom-exclude";
  el.style.setProperty("--c", colour(name));
  Object.assign(el.style, at(PLAN.places[name].at));
  el.addEventListener("click", () => selectPlace(name));
  $("pins").appendChild(el);
  tags[name] = { g, el };
}
const marks = PLAN.marks.map(([x, y, text, kind, when]) => {
  const el = document.createElement("div");
  el.className = `mark ${kind}`;
  el.innerHTML = kind === "closed" ? `${icon("x")}${esc(text)}` : esc(text);
  Object.assign(el.style, at([x, y]));
  $("pins").appendChild(el);
  return { el, when };
});

// Your team's quest marker: it sits on your team's tag and flies to the next post when the shift or a swap changes it.
const quest = $("quest"), questLabel = quest.firstElementChild;
let questFrom = null, questPlace, questFly = false;
function bob() { questLabel.classList.remove("bob"); void questLabel.offsetWidth; questLabel.classList.add("bob"); }
function placeQuest() {
  const mine = Object.values(tags).find((t) => !t.el.hidden && t.el.classList.contains("mine") && !t.el.classList.contains("away"));
  const s = stage.getBoundingClientRect(), r = mine?.el.getBoundingClientRect();
  if (!r || r.top < s.top || r.bottom > s.bottom + 2 || r.right < s.left || r.left > s.right) { quest.hidden = true; questFrom = null; return; }  // tag not fully in view
  const x = r.left + r.width / 2 - s.left, y = r.top - s.top;
  quest.hidden = false;
  Object.assign(quest.style, { left: `${x}px`, top: `${y}px` });
  if (questFly) {
    quest.getAnimations().forEach((a) => a.cancel());
    if (questFrom && !reduced.matches) {
      quest.animate([{ translate: `${questFrom.x - x}px ${questFrom.y - y}px` }, { translate: "0 0" }],
                    { duration: 600, easing: "cubic-bezier(.16, 1, .3, 1)" }).finished.then(bob, () => {});
    } else bob();
    questFly = false;
  }
  questFrom = { x, y };
}

function updateMap() {
  const now = new Set(placesNow()), b = block(), mine = state.team && state.roster[b]?.[state.team];
  for (const [name, { g, el }] of Object.entries(tags)) {
    const on = now.has(name);
    g.classList.toggle("off", !on);
    g.classList.toggle("sel", state.place === name);
    el.hidden = !on;
    el.innerHTML = `<span>${esc(name)}</span><b>${teamsAt(name).map((t) => esc(short(t))).join(", ")}</b>`;
    el.classList.toggle("sel", state.place === name);
    el.classList.toggle("mine", mine === name);
  }
  if (mine !== questPlace) { questFly = true; questPlace = mine; }
  mapEl.classList.toggle("night", state.time === "Evening");
  for (const m of marks) m.el.hidden = (m.when === "D1D2" && state.day === "D3") || (m.when === "notD3E" && b === "D3 Evening");
  requestAnimationFrame(declutter);
}

// Keep tags readable: nudge a tag that sticks out past the map edge back in, then move any tag that would cover the
// map buttons or another tag to the nearest free spot above or below, preferring spots inside the map area.
// (About 10 tags; the nearest free spot is always the tag's own spot or touching an edge of something already placed.)
function declutter() {
  const els = Object.values(tags).map((t) => t.el).filter((el) => !el.hidden), s = stage.getBoundingClientRect();
  els.forEach((el) => { el.style.setProperty("--dx", "0px"); el.style.setProperty("--dy", "0px"); el.classList.remove("away"); });
  const b = document.querySelector(".mapbtns").getBoundingClientRect();
  const placed = [{ left: b.left - 3, right: b.right + 3, top: b.top - 3, bottom: b.bottom }];
  for (const [el, r] of els.map((el) => [el, el.getBoundingClientRect()]).sort((a, c) => a[1].top - c[1].top)) {
    if (r.bottom < s.top || r.top > s.bottom || r.right < s.left || r.left > s.right) continue;  // off screen: leave it be
    const dx0 = Math.max(0, s.left + 4 - r.left) - Math.max(0, r.right - s.right + 4);  // partly off the side: nudge in
    const badge = el.classList.contains("mine") ? (stage.classList.contains("short") ? 16 : 24) : 0;  // room for the quest marker above your team's tag
    const w = r.width, h = r.height + badge, from = r.top - badge;
    const box = (dx, top) => ({ dx, top, left: r.left + dx, right: r.right + dx, bottom: top + h });
    const hits = (c) => placed.filter((p) => c.left < p.right && c.right > p.left && c.top < p.bottom && c.bottom > p.top);
    const inside = (c) => c.top >= s.top && c.bottom <= s.bottom && c.left >= s.left + 2 && c.right <= s.right - 2;
    // Candidates: its own spot, or touching an edge of whatever it would cover: above, below, or beside it (beside stays near the place).
    const start = box(dx0, from), cands = [start];
    for (const p of hits(start)) {
      cands.push(box(dx0, p.bottom + 3), box(dx0, p.top - 3 - h));
      for (const dx of [p.right + 3 - r.left, p.left - 3 - r.right]) if (Math.abs(dx) <= w * .75) cands.push(box(dx, from));
    }
    for (const p of placed) if (p.left < start.right && p.right > start.left) cands.push(box(dx0, p.bottom + 3), box(dx0, p.top - 3 - h));
    const best = cands.filter((c) => !hits(c).length)
      .sort((a, c) => inside(c) - inside(a) || (Math.abs(a.dx - dx0) + Math.abs(a.top - from)) - (Math.abs(c.dx - dx0) + Math.abs(c.top - from)))[0] || start;
    const ax = (r.left + r.right) / 2, placeOnScreen = ax >= s.left && ax <= s.right && r.bottom >= s.top && r.bottom <= s.bottom;
    if (!inside(best) && !placeOnScreen) { el.classList.add("away"); continue; }
    if (best.dx) el.style.setProperty("--dx", `${best.dx}px`);
    if (best.top !== from) el.style.setProperty("--dy", `${best.top - from}px`);
    placed.push(best);
  }
  placeQuest();
}

// The picture is fitted inside the map area; pinch/drag (Panzoom) moves the whole #world, drawn as scale(s) translate(t) around its centre.
let fit = { k: 1, x: 0, y: 0 }, pz = null, userMoved = false;
function layout() {
  const w = stage.clientWidth, h = stage.clientHeight, k = Math.min(w / MAP_W, h / MAP_H);
  fit = { k, x: (w - MAP_W * k) / 2, y: (h - MAP_H * k) / 2 };
  Object.assign(mapEl.style, { width: `${MAP_W * k}px`, height: `${MAP_H * k}px`, left: `${fit.x}px`, top: `${fit.y}px` });
  mapEl.style.setProperty("--bx", `${fit.x}px`);
  mapEl.style.setProperty("--by", `${fit.y}px`);
  stage.classList.toggle("short", h < 330);  // small phones and phones held sideways: smaller tags
}
// Once the zoomed picture is bigger than the map area its edges stay outside (no empty band); while smaller it stays centred.
function clampAxis(t, S, M, s, off) {  // S: map area size, M: picture size at zoom 1, off: picture offset in the world
  const lo = (S / 2 - M * s) / s + S / 2 - off, hi = -S / 2 / s + S / 2 - off;  // picture's near edge between S - M·s and 0
  return M * s >= S ? Math.min(Math.max(t, lo), hi) : (lo + hi) / 2;
}
const clamp = (x, y, s) => [clampAxis(x, stage.clientWidth, MAP_W * fit.k, s, fit.x), clampAxis(y, stage.clientHeight, MAP_H * fit.k, s, fit.y)];
function centreOn([x, y], scale, animate) {
  if (!pz) return;
  const [tx, ty] = clamp(stage.clientWidth / 2 - (fit.x + x * fit.k), stage.clientHeight / 2 - (fit.y + y * fit.k), scale);
  pz.zoom(scale, { animate });
  pz.pan(tx, ty, { animate });
}
function startView() {  // phones: fill the map area's height, centred between Gate 6 and the OAT; wide screens: whole campus
  const fill = stage.clientHeight / (MAP_H * fit.k);
  if (fill > 1.15) centreOn([700, 400], Math.min(fill, 3), false);
  else pz?.reset({ animate: false });
}
function focusPlace(name) {
  const p = PLAN.places[name]?.at;
  if (!p || !pz) return;
  // The screen-space marker cannot track the map's CSS pan; hide it until the settled tag position is known.
  quest.hidden = true; questFrom = null; questLabel.classList.remove("bob");
  quest.getAnimations({ subtree: true }).forEach((a) => a.cancel());
  userMoved = true;
  centreOn(p, Math.max(pz.getScale(), innerHeight > innerWidth ? 2.6 : 2), !reduced.matches);
}
let down = null;  // a tap (not a drag) on an outlined area selects that place
stage.addEventListener("pointerdown", (e) => { down = [e.clientX, e.clientY]; }, true);
stage.addEventListener("pointerup", (e) => {
  if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6 || e.target.closest("button")) return;
  const zone = document.elementsFromPoint(e.clientX, e.clientY).map((el) => el.closest?.(".zone")).find(Boolean);
  if (zone) selectPlace(zone.dataset.place);
}, true);
new ResizeObserver(() => { layout(); if (!userMoved) startView(); requestAnimationFrame(declutter); }).observe(stage);
document.fonts.addEventListener("loadingdone", () => requestAnimationFrame(declutter));  // tags change size when the web fonts arrive
document.addEventListener("app:update", updateMap);
document.addEventListener("app:focus", (e) => focusPlace(e.detail));
$("marksBtn").onclick = () => $("marksBtn").setAttribute("aria-pressed", stage.classList.toggle("marks"));
// The map without a mouse or a drag: arrow keys move it, + and - zoom, 0 shows the whole campus.
stage.addEventListener("keydown", (e) => {
  if (e.target !== stage || !pz || e.metaKey || e.ctrlKey || e.altKey) return;
  const s = pz.getScale(), animate = !reduced.matches;
  const move = { ArrowLeft: [80, 0], ArrowRight: [-80, 0], ArrowUp: [0, 80], ArrowDown: [0, -80] }[e.key];
  if (move) pz.pan(move[0] / s, move[1] / s, { relative: true, animate });
  else if (e.key === "+" || e.key === "=") pz.zoomIn({ animate });
  else if (e.key === "-") pz.zoomOut({ animate });
  else if (e.key === "0") pz.reset({ animate });
  else return;
  userMoved = true;
  e.preventDefault();
});
import("https://cdn.jsdelivr.net/npm/@panzoom/panzoom@4.6.2/dist/panzoom.es.js").catch(() => null).then((m) => {
  if (!m) return;  // no internet for the zoom library: the map still shows, just without zoom
  // Panzoom paints each move a frame later with the unclamped position, so clamp at paint time: no frame shows an empty band.
  pz = m.default(world, { minScale: 1, maxScale: 6, excludeClass: "panzoom-exclude", cursor: "grab",
    setTransform: (el, { x, y, scale }) => { const [cx, cy] = clamp(x, y, scale); el.style.transform = `scale(${scale}) translate(${cx}px, ${cy}px)`; } });
  const animate = () => !reduced.matches;
  stage.addEventListener("wheel", (e) => { userMoved = true; pz.zoomWithWheel(e); }, { passive: false });
  world.addEventListener("panzoomstart", () => { userMoved = true; });
  world.addEventListener("transitionend", () => requestAnimationFrame(declutter));  // animated moves report their end position before they get there
  world.addEventListener("panzoomchange", (e) => {
    const { x, y, scale } = e.detail, [cx, cy] = clamp(x, y, scale);  // keep the stored position in line with what's painted
    if (Math.abs(cx - x) > 0.5 || Math.abs(cy - y) > 0.5) pz.pan(cx, cy, { silent: true, animate: false });
    world.style.setProperty("--inv", 1 / scale);
    requestAnimationFrame(declutter);
  });
  $("zoomAll").onclick = () => { userMoved = true; pz.reset({ animate: animate() }); };
  $("zoomIn").onclick = () => { userMoved = true; pz.zoomIn({ animate: animate() }); };
  $("zoomOut").onclick = () => { userMoved = true; pz.zoomOut({ animate: animate() }); };
  for (const id of ["zoomAll", "zoomIn", "zoomOut"]) $(id).hidden = false;
  layout();
  startView();
});

render();
sync();
})();
