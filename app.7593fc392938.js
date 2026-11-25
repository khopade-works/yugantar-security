(() => {
const { PLAN, API } = globalThis.YugantarConfig;
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const short = (t) => PLAN.short[t] || String(t).split(" ")[0];
const colour = (p) => PLAN.places[p]?.colour || "#64748b";
const reduced = matchMedia("(prefers-reduced-motion: reduce)");

const state = { day: "D1", time: "Morning", place: null, team: localStorage.getItem("yug26-team") || "",
                tab: localStorage.getItem("yug26-team") ? "team" : "places",
                teams: PLAN.teams, roster: PLAN.roster, events: PLAN.events, swaps: [], problems: [], live: null, synced: null };  // live: null until the first sync answers

// ---- data access: Google Sheet when online through Apps Script, otherwise this phone only
const LOCAL_KEY = "yug26-security-" + PLAN.built;
const live = API.startsWith("http");
const answer = async (res) => { const s = await res.json(); if (s.error) throw new Error(s.error); return s; };
const api = live ? {
  get: () => fetch(`${API}?api=state`).then(answer),
  swap: (block, a, b, code) => fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
                                            body: JSON.stringify({ block, a, b, code, shifts: Object.keys(PLAN.times) }) }).then(answer),
} : {
  async get() { return JSON.parse(localStorage.getItem(LOCAL_KEY) || "null") || { teams: PLAN.teams, roster: PLAN.roster, swaps: [] }; },
  async swap(block, a, b) {
    const s = await this.get();
    const why = swapProblem(s.roster, block, a, b);
    if (why) throw new Error(why);
    [s.roster[block][a], s.roster[block][b]] = [s.roster[block][b], s.roster[block][a]];
    s.swaps.unshift({ when: new Date().toLocaleString(), block: PLAN.labels[block], a, toA: s.roster[block][a], b, toB: s.roster[block][b] });
    localStorage.setItem(LOCAL_KEY, JSON.stringify(s));
    return s;
  },
};
function swapProblem(roster, block, a, b) {
  const r = roster[block];
  if (!r || !(a in r) || !(b in r)) return "Unknown Team Lead or time.";
  if (a === b) return "Pick another Team Lead.";
  if (r[a] === PLAN.rest || r[b] === PLAN.rest) return "A resting team can't swap.";
  if (r[a] === r[b]) return "You are already at the same place.";
  return "";
}

// ---- helpers
const block = (d = state.day, t = state.time) => `${d} ${t}`;
const teamsAt = (place, b = block()) => state.teams.filter((t) => state.roster[b]?.[t] === place);
const toMin = (s) => { const [h, m] = s.split(":").map(Number); return h * 60 + m; };
function eventsNow(place) {
  const [a, b] = PLAN.times[state.time].window;
  return state.events.filter((e) => e.day === state.day && (!place || e.place === place)).filter((e) => {
    const s = toMin(e.start), f = e.end ? toMin(e.end) : s + 1;
    return s < b && f > (state.time === "Morning" ? 0 : a);
  });
}
const placesNow = () => [...new Set(Object.values(state.roster[block()] || {}))].filter((p) => p !== PLAN.rest);
const dayLabel = (d) => `${PLAN.days[d][0]}, ${PLAN.days[d][1]}`;
const timeLabel = (t) => `${t}, ${PLAN.times[t].hours}`;
const icon = (id) => `<svg class="icon" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// ---- render
function render() {
  const nb = nowBlock(), now = '<em class="nowtag">Now</em>';
  $("days").innerHTML = Object.entries(PLAN.days).map(([d, [n, date]]) =>
    `<button type="button" aria-pressed="${d === state.day}" data-day="${d}">${n}${nb?.startsWith(d + " ") ? now : ""}<small>${date}</small></button>`).join("");
  $("times").innerHTML = Object.entries(PLAN.times).map(([t, v]) =>
    `<button type="button" aria-pressed="${t === state.time}" data-time="${t}"${v.evening ? " data-evening" : ""}>${t}${nb === block(state.day, t) ? now : ""}<small><time>${v.hours}</time></small></button>`).join("");
  $("sheetBody").innerHTML = state.place ? placeView() : `${introCard()}
    <div class="tabs" role="group" aria-label="Show">
      <button type="button" data-tab="places" aria-pressed="${state.tab === "places"}">All places</button>
      <button type="button" data-tab="team" aria-pressed="${state.tab === "team"}">My team</button>
    </div>${state.tab === "team" ? teamView() : placesView()}`;
  showSync();
  document.dispatchEvent(new CustomEvent("app:update"));
}
const introCard = () => localStorage.getItem("yug26-intro") ? "" : `<div class="intro"><h2>Where is every security team, every shift?</h2>
  <ol><li>Open <b>My team</b> and pick your Team Lead: your places for all 3 days.</li>
  <li>Tap a place on the map: who is there and what to do.</li>
  <li>Swap a shift only after the other Team Lead agrees.</li></ol>
  <button class="btn primary" type="button" data-intro>Got it</button></div>`;
function meRow() {  // the one thing a Team Lead checks most: where their team is right now
  const p = state.team && state.roster[block()]?.[state.team];
  if (!p) return "";
  const inner = `<span class="dot"></span><span class="grow"><small>Your team (${esc(short(state.team))}) at this time</small>${esc(p)}</span>`;
  return p === PLAN.rest ? `<div class="row now" style="--c:${colour(p)};margin-bottom:10px">${inner}</div>`
    : `<button class="row now" type="button" data-place="${esc(p)}" style="--c:${colour(p)};margin-bottom:10px">${inner}${icon("next")}</button>`;
}
function showSync() {  // live: shared through the Sheet · offline: the Sheet can't be reached now · local: no Sheet set up yet
  const pill = $("sync"), mode = state.live ? "live" : !live ? "local" : state.live === false ? "offline" : "connecting";
  pill.className = "pill " + (mode === "live" ? "live" : "local");
  pill.textContent = { live: `Live${state.synced ? ", " + state.synced : ""}`, offline: "Offline, retrying", connecting: "Connecting…", local: "This phone only" }[mode];
  pill.title = { live: "Swaps are shared with everyone.", offline: "Can't reach the Google Sheet. Places may be out of date; it tries again every 20 seconds.",
                 connecting: "Loading the latest places from the Google Sheet.", local: "Swaps are saved on this phone only until the app is put online." }[mode];
}
function placesView() {
  const rows = placesNow().map((p) => {
    const t = teamsAt(p);
    return `<li><button class="row" type="button" data-place="${esc(p)}" style="--c:${colour(p)}"><span class="dot"></span>
      <span class="grow">${esc(p)}<small>${t.map((x) => esc(x)).join(", ")}</small></span></button></li>`;
  }).join("");
  const rest = teamsAt(PLAN.rest);
  const ev = eventsNow();
  const issues = state.problems.length ? `<div class="row" style="--c:var(--warn);display:block;margin-bottom:10px"><b class="note">Check the Day tabs in the Google Sheet</b>
    <small>${state.problems.slice(0, 4).map(esc).join("<br>")}${state.problems.length > 4 ? `<br>…and ${state.problems.length - 4} more` : ""}</small></div>` : "";
  return `${issues}${meRow()}<h2>${dayLabel(state.day)}</h2><p class="sub">${timeLabel(state.time)}${state.time === "Morning" ? ". Report by 7:30 AM at Security, Gate 6." : ""}</p>
    <ul class="list">${rows}</ul>
    ${rest.length ? `<p class="sub" style="margin-top:10px">Resting after the overnight (back at 1 PM): ${rest.map(esc).join(", ")}</p>` : ""}
    ${state.day === "D1" && state.time === "Morning" ? `<h3>Before 8 AM</h3>${PLAN.overnight.map((o) => `<div class="ev"><time>${esc(o[0])}</time><span>${esc(o[1])}<br><span class="muted">${esc(o[2])}</span></span></div>`).join("")}` : ""}
    ${ev.length ? `<h3>What's on (POA)</h3>${ev.map(evRow).join("")}` : ""}
    <h3>On call</h3><p class="sub">HoDs: ${PLAN.hods.map(esc).join(", ")}. Scout: ${esc(PLAN.scout)}.</p>`;
}
const evRow = (e) => `<div class="ev"><time>${e.start}${e.end ? "–" + e.end : ""}</time><span>${esc(e.what)}<br><span class="muted">${esc(e.venue)}</span></span></div>`;
function placeView() {
  const p = state.place, info = PLAN.places[p] || { day: [], evening: [] };
  const todo = PLAN.times[state.time].evening ? info.evening : info.day;
  const t = teamsAt(p), ev = eventsNow(p);
  return `<button class="back" type="button" data-back>${icon("back")}All places</button>
    <h2 class="placeh"><span class="dot" style="--c:${colour(p)}"></span>${esc(p)}</h2><p class="sub">${dayLabel(state.day)}, ${timeLabel(state.time)}</p>
    <h3>Teams here</h3>${t.length ? t.map((x) => `<span class="chip">${esc(x)}${PLAN.size[x] ? ` (${PLAN.size[x]} people)` : ""}</span>`).join("") : '<p class="sub">No team is posted here this shift. Pick another time above.</p>'}
    ${todo.length ? `<h3>What to do</h3><ul class="bullets">${todo.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>` : ""}
    ${ev.length ? `<h3>What's on here (POA)</h3>${ev.map(evRow).join("")}` : ""}`;
}
function teamView() {
  const pick = `<select class="bigselect" id="teamSel" aria-label="Your Team Lead"><option value="">Choose your Team Lead…</option>
    ${state.teams.map((t) => `<option ${t === state.team ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  if (!state.team) return pick + '<p class="sub" style="margin-top:10px">Pick your Team Lead to see your places for all 3 days.</p>';
  const t = state.team, now = state.roster[block()]?.[t];
  const days = Object.keys(PLAN.days).map((d) => `<h3>${dayLabel(d)}</h3><ul class="list">${Object.keys(PLAN.times).map((tm) => {
    const b = block(d, tm), p = state.roster[b]?.[t];
    const isNow = d === state.day && tm === state.time;
    return `<li><div class="row ${isNow ? "now" : ""}" style="--c:${colour(p)}"><span class="dot"></span>
      <button type="button" class="rowlink" data-goto="${b}">${esc(p)}<small>${tm}, <time>${PLAN.times[tm].hours}</time></small></button>
      ${p === PLAN.rest ? "" : `<button type="button" class="btn swapbtn" data-swap="${b}">${icon("swap")}Swap</button>`}</div></li>`;
  }).join("")}</ul>`).join("");
  const seen = new Set(PLAN.blocks.map((b) => state.roster[b]?.[t]).filter((p) => p && p !== PLAN.rest));
  const mine = state.swaps.filter((s) => s.a === t || s.b === t).slice(0, 5);
  return `<h2 class="vh">Your shifts</h2>${pick}<div class="row now" style="--c:${colour(now)};margin-top:10px"><span class="dot"></span><span class="grow">${esc(now)}
      <small>Your place on ${dayLabel(state.day)}, ${timeLabel(state.time)}</small></span></div>
    ${days}<p class="sub" style="margin-top:12px">Your team covers ${seen.size} different places over the 3 days.</p>
    ${mine.length ? `<h3>Your swaps</h3>${mine.map((s) => `<div class="ev"><time>${esc(s.block)}</time><span>${esc(s.a)}: now at ${esc(s.toA)}<br>${esc(s.b)}: now at ${esc(s.toB)}</span></div>`).join("")}` : ""}`;
}

// ---- actions
function selectPlace(p) {  // the panel stays its size so the map stays in view
  state.place = p; render();
  if (p) document.dispatchEvent(new CustomEvent("app:focus", { detail: p }));
}
function focusTeam() {  // mapped shifts zoom like team selection; an open place stays put, and unconfirmed places have no pointer
  const p = !state.place && state.team && state.roster[block()]?.[state.team];
  if (PLAN.places[p]?.at) document.dispatchEvent(new CustomEvent("app:focus", { detail: p }));
}
function selectTeam(t) {
  state.team = t; localStorage.setItem("yug26-team", t); render();
  focusTeam();
}
document.addEventListener("click", (e) => {
  const el = e.target.closest("[data-day],[data-time],[data-tab],[data-intro],[data-place],[data-back],[data-swap],[data-goto]");
  if (!el) return;
  if (el.dataset.day) { state.day = el.dataset.day; render(); focusTeam(); }
  else if (el.dataset.time) { state.time = el.dataset.time; render(); focusTeam(); }
  else if (el.dataset.tab) { state.tab = el.dataset.tab; render(); }
  else if ("intro" in el.dataset) { localStorage.setItem("yug26-intro", "done"); render(); }
  else if (el.dataset.place) selectPlace(el.dataset.place);
  else if ("back" in el.dataset) selectPlace(null);
  else if (el.dataset.swap) openSwap(el.dataset.swap);
  else if (el.dataset.goto) { [state.day, state.time] = el.dataset.goto.split(" "); render(); focusTeam(); }
});
document.addEventListener("change", (e) => { if (e.target.id === "teamSel") selectTeam(e.target.value); });
$("grip").onclick = () => {
  const go = () => { const o = $("sheet").classList.toggle("open"); $("grip").setAttribute("aria-expanded", o); $("grip").setAttribute("aria-label", o ? "Show less" : "Show more"); };
  document.startViewTransition && !reduced.matches ? document.startViewTransition(go) : go();  // the panel grows without animating layout every frame
};
$("rulesBtn").onclick = () => $("rulesDlg").showModal();
$("rulesList").innerHTML = PLAN.rules.map((r) => `<li>${esc(r)}</li>`).join("");
$("oncall").textContent = `On call: HoDs ${PLAN.hods.join(", ")}. Scout: ${PLAN.scout}.`;

// ---- swap dialog
let swapBlock = null;
function openSwap(b) {
  swapBlock = b;
  const [d, tm] = b.split(" "), me = state.team, r = state.roster[b];
  $("swapWhen").textContent = `${dayLabel(d)}, ${timeLabel(tm)}`;
  $("swapYou").innerHTML = `You: <b>${esc(me)}</b> at <b>${esc(r[me])}</b>`;
  $("swapWith").innerHTML = state.teams.filter((t) => t !== me).map((t) => {
    const off = r[t] === PLAN.rest || r[t] === r[me];
    return `<label class="opt"><input type="radio" name="with" value="${esc(t)}" ${off ? "disabled" : ""}><span class="dot" style="--c:${colour(r[t])}"></span>
      <span>${esc(t)}<br><small class="muted">${esc(r[t])}</small></span></label>`;
  }).join("");
  $("codeRow").hidden = !live;  // the Sheet always asks for the code, even while it's unreachable
  $("swapPreview").textContent = $("swapWarn").textContent = $("swapErr").textContent = "";
  $("swapCode").removeAttribute("aria-invalid");
  $("swapDlg").showModal();
}
function sameTwiceInARow(t, b, place) {
  const i = PLAN.blocks.indexOf(b), near = [PLAN.blocks[i - 1], PLAN.blocks[i + 1]].filter((x) => x && x.slice(0, 2) === b.slice(0, 2));
  return near.some((x) => state.roster[x]?.[t] === place);
}
$("swapWith").addEventListener("change", () => {
  const other = $("swapForm").elements.with.value, me = state.team, r = state.roster[swapBlock];
  $("swapPreview").innerHTML = `After the swap <b>${esc(me)}</b> goes to ${esc(r[other])} and <b>${esc(other)}</b> goes to ${esc(r[me])}.`;
  const warn = [[me, r[other]], [other, r[me]]].filter(([t, p]) => sameTwiceInARow(t, swapBlock, p)).map(([t, p]) => `${t} would be at ${p} two times in a row.`);
  $("swapWarn").textContent = warn.join(" ");
});
$("swapForm").addEventListener("submit", async (e) => {
  if (e.submitter?.value !== "swap") return;
  e.preventDefault();
  const other = $("swapForm").elements.with.value;
  if (!other) { $("swapErr").textContent = "Pick the Team Lead you agreed to swap with."; return; }
  $("swapGo").disabled = true;
  try {
    const after = await api.swap(swapBlock, state.team, other, $("swapCode").value);
    swapsDone++;
    apply(after);
    $("swapDlg").close();
    toast(`Swapped with ${other}.${state.live ? " Everyone sees it now." : ""}`);
  } catch (err) {
    const msg = err.message || String(err);
    $("swapErr").textContent = msg;
    if (/code/i.test(msg)) $("swapCode").setAttribute("aria-invalid", "true");
    if (!$("swapDlg").open) toast(`Swap not done: ${msg}`);  // they closed the dialog while it was sending
  } finally { $("swapGo").disabled = false; }
});
$("swapCode").addEventListener("input", () => $("swapCode").removeAttribute("aria-invalid"));
if (!("closedBy" in HTMLDialogElement.prototype)) {  // light dismiss where closedby is missing (Safari)
  for (const d of document.querySelectorAll("dialog[closedby='any']")) {
    d.addEventListener("click", (e) => {
      if (e.target !== d) return;
      const r = d.getBoundingClientRect();
      if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) d.close();
    });
  }
}
function toast(msg) {
  const t = $("toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.remove("show"), 3200);
}

// ---- sync
function apply(s) {
  if (!s || !s.roster) return;
  const events = s.events || state.events;  // the Sheet's copy of the POA; this phone's built-in copy when the reply has none
  let changed = JSON.stringify([s.roster, s.problems, events]) !== JSON.stringify([state.roster, state.problems, state.events])
    || (s.swaps || []).length !== state.swaps.length;
  state.teams = s.teams || Object.keys(s.roster[PLAN.blocks[0]] || {});
  state.roster = s.roster; state.events = events; state.swaps = s.swaps || []; state.problems = s.problems || []; state.live = live;
  if (state.team && !state.teams.includes(state.team)) { state.team = ""; localStorage.removeItem("yug26-team"); changed = true; }
  state.synced = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });
  if (changed) render();
  else showSync();
}
let swapsDone = 0;  // a read that started before a swap landed can't put the old places back
const sync = () => { const seen = swapsDone; return api.get().then((s) => seen === swapsDone && apply(s)).catch(() => { state.live = false; showSync(); }); };
if (live) { setInterval(sync, 20000); document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && sync()); }

// ---- today's fest day and the block happening now; the app opens on it (after the last block: that day's last block)
function festNow() {
  const now = new Date(), today = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  const d = Object.keys(PLAN.days).find((k) => PLAN.dates[k] === today);
  const m = now.getHours() * 60 + now.getMinutes();
  return { d, t: d && Object.keys(PLAN.times).find((k) => m < PLAN.times[k].window[1]) };
}
function nowBlock() { const { d, t } = festNow(); return t ? block(d, t) : null; }
const opening = festNow();
if (opening.d) { state.day = opening.d; state.time = opening.t || Object.keys(PLAN.times).at(-1); }


globalThis.YugantarApp = Object.freeze({
  PLAN, $, esc, short, colour, reduced, state, block, teamsAt, placesNow, icon, selectPlace, render, sync,
});
})();
