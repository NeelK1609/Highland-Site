// First-person walkthrough of Highland Height, 2 BHK Type A.
// All coordinates are in feet: x runs left→right across the brochure plan, z runs top→bottom.
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.169.0/build/three.module.min.js";

// Phones and small screens get a lighter scene: lower resolution, cheaper shadows, fewer lights.
const LOW = matchMedia("(pointer: coarse)").matches || innerWidth < 760;

const H = 10;          // floor-to-ceiling height
const T = 0.45;        // wall thickness
const EYE = 5.2;       // eye height
const R = 0.85;        // body radius for collisions

const ROOMS = [
  { n: "Attached toilet", d: `4'0" × 6'6"`, r: [0, 0, 4.5, 6.5] },
  { n: "Common toilet", d: `6'4" × 4'0"`, r: [0, 10, 4.5, 14] },
  { n: "Bedroom 2", d: `12'5" × 10'0"`, r: [0, 0, 17, 10] },
  { n: "Balcony", d: `10'0" × 4'0"`, r: [17, 0, 27, 4] },
  { n: "Drawing room", d: `10'0" × 18'0"`, r: [17, 4, 27, 22] },
  { n: "Passage", d: `3'8" × 4'0"`, r: [4.5, 10, 10.5, 14] },
  { n: "Dining", d: `6'9" × 13'2"`, r: [10.5, 10, 17, 22] },
  { n: "Bedroom 1", d: `10'0" × 10'6"`, r: [0, 14, 10.5, 24.5] },
  { n: "Wash", d: `7'4" × 5'0"`, r: [3, 24.5, 10.5, 29.5] },
  { n: "Kitchen", d: `11'6" × 7'0"`, r: [10.5, 22, 22, 29.5] },
  { n: "Foyer", d: `5'2" × 7'4"`, r: [22, 22, 27, 29.5] },
];

// Walkable graph for guided movement
const NODES = {
  E: [24.5, 26.8], F: [24.5, 20.5], L: [20, 16], LB: [19.6, 6.8], BD: [23.7, 4.6], B: [22.5, 2],
  D: [16.4, 12.4], B2D: [13.5, 10], B2a: [12.9, 8.9], B2: [8.6, 5.6],
  C: [7.5, 12], B1: [7.8, 16.4], K: [16.2, 25], WD: [10.5, 26.2], W: [7, 26.8],
};
const EDGES = [["E","F"],["F","L"],["L","LB"],["LB","BD"],["BD","B"],["L","D"],["F","D"],["D","B2D"],["B2D","B2a"],["B2a","B2"],
  ["D","C"],["C","B1"],["D","K"],["K","WD"],["WD","W"]];
const PLACES = [
  { id: "L", label: "Drawing room", look: [25.5, 4.6, 9] },
  { id: "B", label: "Balcony", look: [40, 3, -14] },
  { id: "D", label: "Dining", look: [13.2, 2.6, 16.2] },
  { id: "K", label: "Kitchen", look: [16, 3.2, 29.5] },
  { id: "B2", label: "Bedroom 2", look: [15.5, 2, 4.8] },
  { id: "B1", label: "Bedroom 1", look: [4.5, 2, 21.5] },
];
const TOUR = [
  { id: "L", look: [25.5, 4.6, 9], say: "The drawing room, 10' × 18', with a full-height window and open to the dining area." },
  { id: "B", look: [40, 3, -14], say: "Step out onto the 10' × 4' balcony, ten floors of open sky above the trees." },
  { id: "D", look: [13.2, 2.6, 16.2], say: "Dining, 6'9\" × 13'2\", sits between the living room and the kitchen." },
  { id: "K", look: [16, 3.2, 29.5], say: "The kitchen, 11'6\" × 7', with a granite platform and a separate wash area." },
  { id: "B2", look: [15.5, 2, 4.8], say: "Bedroom 2, 12'5\" × 10', has its own attached toilet." },
  { id: "B1", look: [4.5, 2, 21.5], say: "Bedroom 1, 10' × 10'6\", is next to the common toilet." },
  { id: "L", look: [25.5, 4.6, 12], say: "That's the home. Download the brochure to see every plan." },
];

let started = false;

export function start(stage) {
  if (started) return;
  started = true;

  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, LOW ? 1.25 : 1.75));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = LOW ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  stage.prepend(renderer.domElement);
  renderer.domElement.addEventListener("webglcontextlost", e => {
    e.preventDefault();
    const c = stage.querySelector("#caption");
    c.textContent = "The 3D view stopped on this device. Reload the page to try again."; c.classList.add("on");
  });

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xdfe8ee);
  scene.fog = new THREE.Fog(0xdfe8ee, 260, 1500);

  const camera = new THREE.PerspectiveCamera(72, 1, 0.1, 4000);
  camera.rotation.order = "YXZ";

  buildLights(scene);
  const solids = [];
  buildApartment(scene, solids);
  buildOutside(scene);

  // ---------- state ----------
  const me = { x: NODES.E[0], z: NODES.E[1], yaw: 0, pitch: -0.04, vx: 0, vz: 0, bob: 0 };
  const keys = new Set();
  const stickV = { x: 0, y: 0 };
  let auto = null;           // { pts:[[x,z]...], i, look, onDone }
  let tour = null;           // { step }
  let lookHoldUntil = 0;

  // ---------- HUD ----------
  const roomEl = stage.querySelector("#room");
  const capEl = stage.querySelector("#caption");
  const mini = stage.querySelector("#mini");
  const dock = stage.querySelector("#dock");
  const tourBtn = stage.querySelector("#tourBtn");
  mini.innerHTML = miniMap();
  const dot = mini.querySelector("#me"), cone = mini.querySelector("#cone");
  const roomRects = [...mini.querySelectorAll("[data-room]")];
  let curRoom = "";

  const chips = PLACES.map(p => {
    const b = document.createElement("button");
    b.className = "chip"; b.type = "button"; b.textContent = p.label; b.setAttribute("aria-pressed", "false");
    b.onclick = () => { stopTour(); goTo(p.id, p.look); setPressed(b); };
    dock.appendChild(b);
    return b;
  });
  function setPressed(b) { chips.forEach(c => c.setAttribute("aria-pressed", c === b ? "true" : "false")); }
  tourBtn.onclick = () => (tour ? stopTour() : startTour());

  let capTimer;
  function say(text) {
    clearTimeout(capTimer);
    capEl.textContent = text; capEl.classList.add("on");
    capTimer = setTimeout(() => capEl.classList.remove("on"), 5200);
  }

  // ---------- movement helpers ----------
  function nearestNode() {
    let best = null, bd = Infinity;
    for (const [k, [x, z]] of Object.entries(NODES)) {
      const d = Math.hypot(x - me.x, z - me.z);
      if (d < bd && clearLine(me.x, me.z, x, z)) { bd = d; best = k; }
    }
    return best ?? "E";
  }
  function route(from, to) {
    const adj = {};
    for (const [a, b] of EDGES) { (adj[a] ??= []).push(b); (adj[b] ??= []).push(a); }
    const prev = { [from]: null }, q = [from];
    while (q.length) { const n = q.shift(); if (n === to) break; for (const m of adj[n] || []) if (!(m in prev)) { prev[m] = n; q.push(m); } }
    const out = []; for (let n = to; n != null; n = prev[n]) out.unshift(n);
    return out;
  }
  function goTo(id, look, onDone) {
    const path = route(nearestNode(), id).map(k => NODES[k]);
    auto = { pts: [[me.x, me.z], ...path], i: 1, look, onDone };
  }
  function startTour() {
    tour = { step: 0 }; tourBtn.setAttribute("aria-pressed", "true"); tourBtn.textContent = "❚❚ Stop tour"; setPressed(null);
    nextStop();
  }
  function nextStop() {
    if (!tour) return;
    const s = TOUR[tour.step];
    if (!s) return stopTour();
    goTo(s.id, s.look, () => {
      say(s.say);
      setPressed(chips[PLACES.findIndex(p => p.id === s.id)] || null);
      tour && (tour.wait = setTimeout(() => { if (tour) { tour.step++; nextStop(); } }, 4600));
    });
  }
  function stopTour() {
    if (!tour) return;
    clearTimeout(tour.wait); tour = null; auto = null;
    tourBtn.setAttribute("aria-pressed", "false"); tourBtn.textContent = "▶ Guided tour";
  }
  function takeControl() { if (auto || tour) { stopTour(); auto = null; setPressed(null); } }

  function blocked(x, z) {
    for (const s of solids) {
      const cx = Math.max(s[0], Math.min(x, s[2])), cz = Math.max(s[1], Math.min(z, s[3]));
      if ((x - cx) ** 2 + (z - cz) ** 2 < R * R) return true;
    }
    return false;
  }
  function clearLine(x0, z0, x1, z1) {
    const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.3);
    for (let i = 1; i <= n; i++) if (blocked(x0 + (x1 - x0) * i / n, z0 + (z1 - z0) * i / n)) return false;
    return true;
  }
  function resolve() {
    for (let it = 0; it < 3; it++) for (const s of solids) {
      const cx = Math.max(s[0], Math.min(me.x, s[2])), cz = Math.max(s[1], Math.min(me.z, s[3]));
      const dx = me.x - cx, dz = me.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < R * R) {
        if (d2 > 1e-6) { const d = Math.sqrt(d2), p = (R - d) / d; me.x += dx * p; me.z += dz * p; }
        else me.z += R;
      }
    }
  }
  const angTo = (x, z) => Math.atan2(-(x - me.x), -(z - me.z));
  const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));

  // ---------- input ----------
  const canvas = renderer.domElement;
  canvas.tabIndex = 0;
  canvas.setAttribute("aria-label", "3D walkthrough. Use W A S D or arrow keys to walk, drag to look around.");
  let drag = null;
  canvas.addEventListener("pointerdown", e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); canvas.focus({ preventScroll: true }); });
  canvas.addEventListener("pointermove", e => {
    if (!drag || drag.id !== e.pointerId) return;
    const k = e.pointerType === "touch" ? 0.006 : 0.0042;
    me.yaw += (e.clientX - drag.x) * k; me.pitch += (e.clientY - drag.y) * k * 0.8;
    me.pitch = Math.max(-1.1, Math.min(1.1, me.pitch));
    drag.x = e.clientX; drag.y = e.clientY; lookHoldUntil = performance.now() + 1800;
    if (auto && auto.done && !tour) auto = null;
  });
  const endDrag = e => { if (drag && drag.id === e.pointerId) drag = null; };
  canvas.addEventListener("pointerup", endDrag); canvas.addEventListener("pointercancel", endDrag);

  const KEYMAP = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r", ShiftLeft: "run", ShiftRight: "run" };
  let inView = false;
  addEventListener("keydown", e => {
    const k = KEYMAP[e.code];
    if (!k || !inView || !stage.contains(document.activeElement)) return;
    if (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (k !== "run") { e.preventDefault(); takeControl(); }
    keys.add(k);
  });
  addEventListener("keyup", e => { const k = KEYMAP[e.code]; if (k) keys.delete(k); });
  addEventListener("blur", () => keys.clear());

  if (matchMedia("(pointer: coarse)").matches) stage.classList.add("touch");
  const stick = stage.querySelector("#stick"), knob = stick.firstElementChild;
  let sid = null;
  const stickMove = e => {
    const r = stick.getBoundingClientRect();
    let x = e.clientX - (r.left + r.width / 2), y = e.clientY - (r.top + r.height / 2);
    const m = Math.hypot(x, y), max = r.width / 2 - 10;
    if (m > max) { x *= max / m; y *= max / m; }
    knob.style.transform = `translate(${x}px,${y}px)`;
    stickV.x = x / max; stickV.y = y / max;
  };
  stick.addEventListener("pointerdown", e => { sid = e.pointerId; stick.setPointerCapture(sid); takeControl(); stickMove(e); });
  stick.addEventListener("pointermove", e => { if (e.pointerId === sid) stickMove(e); });
  const stickEnd = e => { if (e.pointerId !== sid) return; sid = null; stickV.x = stickV.y = 0; knob.style.transform = ""; };
  stick.addEventListener("pointerup", stickEnd); stick.addEventListener("pointercancel", stickEnd);

  // ---------- sizing & visibility ----------
  const resize = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    renderer.setSize(w, h, false); camera.aspect = w / h;
    // keep roughly 70° of side-to-side view on tall phone screens
    camera.fov = camera.aspect < 1 ? Math.min(98, 2 * Math.atan(Math.tan(35 * Math.PI / 180) / camera.aspect) * 180 / Math.PI) : 72;
    camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(stage); resize();
  new IntersectionObserver(es => { inView = es[0].isIntersecting; if (!inView) keys.clear(); }, { threshold: 0.15 }).observe(stage);

  // ---------- loop ----------
  const clock = new THREE.Clock();
  const fwd = new THREE.Vector3();
  function frame() {
    requestAnimationFrame(frame);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (!inView || document.hidden) return;

    let moving = 0;
    if (auto && !auto.done) {
      const [tx, tz] = auto.pts[auto.i];
      const dx = tx - me.x, dz = tz - me.z, dist = Math.hypot(dx, dz);
      const step = 4.6 * dt;
      if (dist <= step) {
        me.x = tx; me.z = tz; auto.i++;
        if (auto.i >= auto.pts.length) { const a = auto; auto = { done: true, look: a.look }; a.onDone?.(); }
      } else {
        me.x += dx / dist * step; me.z += dz / dist * step; moving = 1;
        if (performance.now() > lookHoldUntil) {
          me.yaw += wrap(angTo(tx, tz) - me.yaw) * Math.min(1, dt * 3.2);
          me.pitch += (-0.04 - me.pitch) * Math.min(1, dt * 2);
        }
      }
    }
    if (auto && auto.done) {
      const [lx, ly, lz] = auto.look;
      if (performance.now() > lookHoldUntil) {
        me.yaw += wrap(angTo(lx, lz) - me.yaw) * Math.min(1, dt * 2.6);
        const want = Math.atan2(ly - EYE, Math.hypot(lx - me.x, lz - me.z));
        me.pitch += (want - me.pitch) * Math.min(1, dt * 2.2);
      }
    } else if (!auto) {
      let f = 0, s = 0;
      if (keys.has("f")) f += 1; if (keys.has("b")) f -= 1;
      if (keys.has("r")) s += 1; if (keys.has("l")) s -= 1;
      f -= stickV.y; s += stickV.x;
      const m = Math.hypot(f, s);
      if (m > 1) { f /= m; s /= m; }
      const speed = keys.has("run") ? 9 : 5.4;
      const sin = Math.sin(me.yaw), cos = Math.cos(me.yaw);
      const tvx = (-sin * f + cos * s) * speed, tvz = (-cos * f - sin * s) * speed;
      const a = Math.min(1, dt * 9);
      me.vx += (tvx - me.vx) * a; me.vz += (tvz - me.vz) * a;
      me.x += me.vx * dt; me.z += me.vz * dt;
      resolve();
      moving = Math.min(1, Math.hypot(me.vx, me.vz) / 5);
    }

    me.bob += moving * dt * 9.5;
    camera.position.set(me.x, EYE + Math.sin(me.bob) * 0.075 * moving, me.z);
    camera.rotation.set(me.pitch, me.yaw, Math.sin(me.bob * 0.5) * 0.004 * moving);
    renderer.render(scene, camera);

    // HUD
    const room = ROOMS.find(r => me.x >= r.r[0] && me.x <= r.r[2] && me.z >= r.r[1] && me.z <= r.r[3]);
    if (room && room.n !== curRoom) {
      curRoom = room.n;
      roomEl.innerHTML = `<b>${room.n}</b><span>${room.d}</span>`;
      roomRects.forEach(el => el.setAttribute("fill", el.dataset.room === room.n ? "rgba(180,143,85,.55)" : "rgba(255,255,255,.07)"));
    }
    dot.setAttribute("cx", me.x.toFixed(2)); dot.setAttribute("cy", me.z.toFixed(2));
    camera.getWorldDirection(fwd);
    cone.setAttribute("transform", `translate(${me.x.toFixed(2)} ${me.z.toFixed(2)}) rotate(${(Math.atan2(fwd.z, fwd.x) * 180 / Math.PI).toFixed(1)})`);
  }
  // Begin facing into the home and say hello
  me.yaw = angTo(NODES.F[0], NODES.F[1]);
  canvas.focus({ preventScroll: true });
  frame();
  setTimeout(() => say("Welcome home. Walk in from the foyer, or start the guided tour."), 600);
}

// ---------------------------------------------------------------- textures
function canvasTex(w, h, draw, repeat) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8;
  t.userData.size = repeat; // feet covered by one tile of the texture
  return t;
}
function noise(g, w, h, n, alpha, color) {
  g.fillStyle = color;
  for (let i = 0; i < n; i++) { g.globalAlpha = Math.random() * alpha; g.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2); }
  g.globalAlpha = 1;
}
const TEX = {
  marble: () => canvasTex(1024, 1024, (g, w, h) => {
    g.fillStyle = "#ece6dc"; g.fillRect(0, 0, w, h);
    noise(g, w, h, 9000, .08, "#a8998a");
    g.strokeStyle = "rgba(150,135,120,.18)"; g.lineWidth = 2;
    for (let i = 0; i < 9; i++) { g.beginPath(); let x = Math.random() * w, y = 0; g.moveTo(x, y); while (y < h) { x += (Math.random() - .5) * 60; y += 40; g.lineTo(x, y); } g.stroke(); }
    g.fillStyle = "rgba(120,105,90,.35)"; g.fillRect(0, 0, w, 3); g.fillRect(0, 0, 3, h); g.fillRect(w / 2, 0, 2, h); g.fillRect(0, h / 2, w, 2);
  }, 4),
  wood: (base = "#a77b52") => canvasTex(512, 1024, (g, w, h) => {
    const pw = w / 4;
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) {
      const y = (j * h / 3 + i * 170) % h, l = h / 3;
      const c = new THREE.Color(base).offsetHSL(0, (Math.random() - .5) * .06, (Math.random() - .5) * .07);
      g.fillStyle = "#" + c.getHexString(); g.fillRect(i * pw, y, pw, l); if (y + l > h) g.fillRect(i * pw, y - h, pw, l);
      g.strokeStyle = "rgba(60,35,20,.12)";
      for (let k = 0; k < 14; k++) { g.beginPath(); const x = i * pw + Math.random() * pw; g.moveTo(x, y); g.bezierCurveTo(x + 6, y + l / 3, x - 6, y + l * 2 / 3, x + 2, y + l); g.stroke(); }
      g.fillStyle = "rgba(40,22,12,.45)"; g.fillRect(i * pw, y, pw, 2);
    }
    g.fillStyle = "rgba(40,22,12,.4)"; for (let i = 0; i <= 4; i++) g.fillRect(i * pw - 1, 0, 2, h);
  }, 3),
  smallTile: (base = "#d9d6d0") => canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = base; g.fillRect(0, 0, w, h); noise(g, w, h, 3000, .1, "#777");
    g.fillStyle = "rgba(90,90,90,.35)"; for (let i = 0; i < 4; i++) { g.fillRect(i * w / 4, 0, 2, h); g.fillRect(0, i * h / 4, w, 2); }
  }, 4),
  fabric: (base) => canvasTex(256, 256, (g, w, h) => { g.fillStyle = base; g.fillRect(0, 0, w, h); noise(g, w, h, 6000, .12, "#000"); noise(g, w, h, 3000, .1, "#fff"); }, 2),
};
function tiled(tex, w, d) { const t = tex.clone(); t.needsUpdate = true; t.repeat.set(w / tex.userData.size, d / tex.userData.size); return t; }

// ---------------------------------------------------------------- materials
const M = {
  wall: new THREE.MeshStandardMaterial({ color: 0xf1ece4, roughness: 0.92 }),
  wallTile: new THREE.MeshStandardMaterial({ color: 0xe4e0da, roughness: 0.35 }),
  ceiling: new THREE.MeshStandardMaterial({ color: 0xfbf9f5, roughness: 1 }),
  frame: new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.5, metalness: 0.4 }),
  glass: new THREE.MeshStandardMaterial({ color: 0xcfe2e8, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false }),
  walnut: new THREE.MeshStandardMaterial({ color: 0x6b4a33, roughness: 0.6 }),
  oak: new THREE.MeshStandardMaterial({ color: 0xc7a47c, roughness: 0.65 }),
  white: new THREE.MeshStandardMaterial({ color: 0xf6f4f0, roughness: 0.55 }),
  ceramic: new THREE.MeshStandardMaterial({ color: 0xfdfdfd, roughness: 0.15 }),
  granite: new THREE.MeshStandardMaterial({ color: 0x252427, roughness: 0.18, metalness: 0.1 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xbfc3c6, roughness: 0.3, metalness: 0.85 }),
  black: new THREE.MeshStandardMaterial({ color: 0x111113, roughness: 0.25 }),
  brass: new THREE.MeshStandardMaterial({ color: 0xb48f55, roughness: 0.3, metalness: 0.9 }),
  linen: new THREE.MeshStandardMaterial({ color: 0xf3efe8, roughness: 0.95 }),
  wine: new THREE.MeshStandardMaterial({ color: 0x7c1d3e, roughness: 0.9 }),
  gold: new THREE.MeshStandardMaterial({ color: 0xc9a24c, roughness: 0.85 }),
  leaf: new THREE.MeshStandardMaterial({ color: 0x4f7a3f, roughness: 0.85 }),
  pot: new THREE.MeshStandardMaterial({ color: 0xd9cbb6, roughness: 0.8 }),
  rug: new THREE.MeshStandardMaterial({ color: 0xcbbca7, roughness: 1 }),
  glow: new THREE.MeshStandardMaterial({ color: 0xfff4e0, emissive: 0xfff1d6, emissiveIntensity: 2.2 }),
};
M.sofa = new THREE.MeshStandardMaterial({ map: TEX.fabric("#d8cfc2"), roughness: 1 });
M.headboard = new THREE.MeshStandardMaterial({ map: TEX.fabric("#b9a58c"), roughness: 1 });

// ---------------------------------------------------------------- builders
function box(parent, x0, y0, z0, x1, y1, z1, mat, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat);
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  m.castShadow = opts.cast ?? true; m.receiveShadow = true;
  parent.add(m);
  return m;
}
function solidBox(scene, solids, x0, y0, z0, x1, y1, z1, mat, opts) {
  solids.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1)]);
  return box(scene, x0, y0, z0, x1, y1, z1, mat, opts);
}

// Axis-aligned wall from (x1,z1) to (x2,z2). Holes are [from, to, bottom, top] along the wall's axis.
function wall(scene, solids, x1, z1, x2, z2, holes = [], mat = M.wall, glazed = true) {
  const horiz = z1 === z2;
  const a0 = horiz ? Math.min(x1, x2) : Math.min(z1, z2), a1 = horiz ? Math.max(x1, x2) : Math.max(z1, z2);
  const c = horiz ? z1 : x1;
  const piece = (s, e, y0, y1, solid) => {
    if (e - s < 0.01 || y1 - y0 < 0.01) return;
    const [bx0, bx1, bz0, bz1] = horiz ? [s, e, c - T / 2, c + T / 2] : [c - T / 2, c + T / 2, s, e];
    if (solid) solidBox(scene, solids, bx0, y0, bz0, bx1, y1, bz1, mat);
    else box(scene, bx0, y0, bz0, bx1, y1, bz1, mat);
  };
  let cur = a0 - T / 2;
  for (const [s, e, y0, y1] of [...holes].sort((p, q) => p[0] - q[0])) {
    piece(cur, s, 0, H, true);
    piece(s, e, 0, y0, false);
    if (y0 > 0) solids.push(horiz ? [s, c - T / 2, e, c + T / 2] : [c - T / 2, s, c + T / 2, e]);
    piece(s, e, y1, H, false);
    if (y0 > 0 && glazed) window_(scene, horiz, c, s, e, y0, y1);
    cur = e;
  }
  piece(cur, a1 + T / 2, 0, H, true);
}
function window_(scene, horiz, c, s, e, y0, y1) {
  const f = 0.16, mid = (s + e) / 2;
  const add = (as, ae, b, t, mat, depth = 0.12) => {
    if (horiz) box(scene, as, b, c - depth / 2, ae, t, c + depth / 2, mat, { cast: false });
    else box(scene, c - depth / 2, b, as, c + depth / 2, t, ae, mat, { cast: false });
  };
  add(s, e, y0, y0 + f, M.frame); add(s, e, y1 - f, y1, M.frame);
  add(s, s + f, y0, y1, M.frame); add(e - f, e, y0, y1, M.frame); add(mid - f / 2, mid + f / 2, y0, y1, M.frame);
  add(s, e, y0, y1, M.glass, 0.02);
}
function floor(scene, x0, z0, x1, z1, tex, y = 0, rough = 0.35) {
  const mat = new THREE.MeshStandardMaterial({ map: tiled(tex, x1 - x0, z1 - z0), roughness: rough });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), mat);
  m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); m.receiveShadow = true;
  scene.add(m);
}
function plant(scene, solids, x, z, s = 1) {
  const g = new THREE.Group();
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.75 * s, 0.6 * s, 1.5 * s, 20), M.pot);
  pot.position.y = 0.75 * s; pot.castShadow = true; g.add(pot);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry((0.55 + Math.random() * .35) * s, 12, 10), M.leaf);
    l.position.set((Math.random() - .5) * 1.1 * s, (1.9 + Math.random() * 1.8) * s, (Math.random() - .5) * 1.1 * s);
    l.scale.y = 1.25; l.castShadow = true; g.add(l);
  }
  g.position.set(x, 0, z); scene.add(g);
  solids.push([x - .7 * s, z - .7 * s, x + .7 * s, z + .7 * s]);
}
function chair(scene, solids, x, z, face) {
  const g = new THREE.Group();
  box(g, -0.8, 1.45, -0.8, 0.8, 1.6, 0.8, M.sofa);
  for (const [a, b] of [[-.7, -.7], [.7, -.7], [-.7, .7], [.7, .7]]) box(g, a - .06, 0, b - .06, a + .06, 1.45, b + .06, M.walnut);
  box(g, -0.8, 1.6, 0.66, 0.8, 3.1, 0.8, M.walnut);
  g.position.set(x, 0, z); g.rotation.y = face; scene.add(g);
  solids.push([x - .8, z - .8, x + .8, z + .8]);
}
function bed(scene, solids, x0, z0, x1, z1, headAt) {
  solidBox(scene, solids, x0, 0, z0, x1, 1.3, z1, M.walnut);
  const i = 0.15;
  box(scene, x0 + i, 1.3, z0 + i, x1 - i, 2.05, z1 - i, M.linen);
  // throw across the foot, pillows at the head
  const along = headAt === "x+" || headAt === "x-";
  if (along) {
    const foot = headAt === "x+" ? x0 : x1 - 1.6, head = headAt === "x+" ? x1 - 1.4 : x0 + 0.4;
    box(scene, foot + (headAt === "x+" ? 0.6 : 0), 2.05, z0 + 0.05, foot + (headAt === "x+" ? 2.2 : 1.0), 2.15, z1 - 0.05, M.wine);
    box(scene, head, 2.05, z0 + 0.4, head + 1, 2.6, (z0 + z1) / 2 - 0.15, M.white);
    box(scene, head, 2.05, (z0 + z1) / 2 + 0.15, head + 1, 2.6, z1 - 0.4, M.white);
  } else {
    const foot = headAt === "z+" ? z0 : z1 - 1.6, head = headAt === "z+" ? z1 - 1.4 : z0 + 0.4;
    box(scene, x0 + 0.05, 2.05, foot + (headAt === "z+" ? 0.6 : 0), x1 - 0.05, 2.15, foot + (headAt === "z+" ? 2.2 : 1.0), M.wine);
    box(scene, x0 + 0.4, 2.05, head, (x0 + x1) / 2 - 0.15, 2.6, head + 1, M.white);
    box(scene, (x0 + x1) / 2 + 0.15, 2.05, head, x1 - 0.4, 2.6, head + 1, M.white);
  }
}
function wardrobe(scene, solids, x0, z0, x1, z1, frontAxis) {
  solidBox(scene, solids, x0, 0, z0, x1, 8, z1, M.oak);
  const n = Math.round((frontAxis === "z" ? x1 - x0 : z1 - z0) / 2);
  for (let i = 1; i < n; i++) {
    if (frontAxis === "z") { const x = x0 + (x1 - x0) * i / n; box(scene, x - .02, 0.1, z0 - .02, x + .02, 7.9, z0 + .01, M.walnut, { cast: false }); }
    else { const z = z0 + (z1 - z0) * i / n; box(scene, x1 - .01, 0.1, z - .02, x1 + .02, 7.9, z + .02, M.walnut, { cast: false }); }
  }
}
function downlight(scene, x, z) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), M.glow);
  m.rotation.x = Math.PI / 2; m.position.set(x, H - 0.02, z); scene.add(m);
}

// ---------------------------------------------------------------- the home
function buildApartment(scene, solids) {
  const marble = TEX.marble(), oakFloor = TEX.wood("#b98b5f"), deck = TEX.wood("#8a6545"),
    bathTile = TEX.smallTile("#d6d3cd"), washTile = TEX.smallTile("#bdbab4");

  floor(scene, -0.3, -0.3, 27.3, 29.8, marble, 0, 0.22);
  floor(scene, 4.5, 0, 17, 10, oakFloor, 0.01, 0.55);
  floor(scene, 0, 6.5, 4.5, 10, oakFloor, 0.01, 0.55);
  floor(scene, 0, 14, 10.5, 24.5, oakFloor, 0.01, 0.55);
  floor(scene, 0, 0, 4.5, 6.5, bathTile, 0.01, 0.3);
  floor(scene, 0, 10, 4.5, 14, bathTile, 0.01, 0.3);
  floor(scene, 3, 24.5, 10.5, 29.5, washTile, 0.01, 0.45);
  floor(scene, 17, 0, 27, 4, deck, 0.01, 0.7);

  // ceiling (single slab) with a gentle cove over the drawing room
  box(scene, -0.3, H, -0.3, 27.3, H + 0.5, 29.8, M.ceiling); // slab: also keeps the sun out
  box(scene, 17.2, H - 0.9, 4.2, 26.8, H, 4.9, M.ceiling, { cast: false });
  box(scene, 17.2, H - 0.9, 21.1, 26.8, H, 21.8, M.ceiling, { cast: false });
  box(scene, 17.2, H - 0.9, 4.2, 17.9, H, 21.8, M.ceiling, { cast: false });
  box(scene, 26.1, H - 0.9, 4.2, 26.8, H, 21.8, M.ceiling, { cast: false });
  const cove = new THREE.Mesh(new THREE.PlaneGeometry(8.2, 16.2), new THREE.MeshStandardMaterial({ color: 0xfff1da, emissive: 0xffe7c2, emissiveIntensity: 0.35 }));
  cove.rotation.x = Math.PI / 2; cove.position.set(22, H - 0.02, 13); scene.add(cove);

  // exterior walls
  wall(scene, solids, 0, 0, 17, 0, [[1.4, 3.1, 5.2, 7.2], [6, 10, 3, 7.8]]);
  wall(scene, solids, 17, 0, 27, 0, [[17, 27, 3.4, H]], M.wall, false);
  wall(scene, solids, 27, 0, 27, 4, [[0, 4, 3.4, H]], M.wall, false);
  wall(scene, solids, 27, 4, 27, 29.5, [[7, 19, 1.4, 8.4]]);
  wall(scene, solids, 0, 0, 0, 24.5, [[11, 13, 5.4, 7.2], [15, 18.4, 3, 7.8]]);
  wall(scene, solids, 0, 24.5, 3, 24.5);
  wall(scene, solids, 3, 24.5, 3, 29.5);
  wall(scene, solids, 3, 29.5, 27, 29.5, [[4.2, 9, 4, 7.2], [13, 19, 4.4, 7.4], [23, 26, 0, 7.2]]);
  // balcony glass rail
  box(scene, 17, 3.4, -0.05, 27, 3.55, 0.05, M.frame, { cast: false });
  box(scene, 26.95, 3.4, 0, 27.05, 3.55, 4, M.frame, { cast: false });

  // interior walls
  wall(scene, solids, 4.5, 0, 4.5, 6.5, [[3.6, 6.1, 0, 7]], M.wallTile);
  wall(scene, solids, 0, 6.5, 4.5, 6.5, [], M.wallTile);
  wall(scene, solids, 17, 0, 17, 10);
  wall(scene, solids, 17, 4, 27, 4, [[18.5, 25.5, 0, 8]], M.wall, false);
  wall(scene, solids, 0, 10, 17, 10, [[12, 15, 0, 7]]);
  wall(scene, solids, 4.5, 10, 4.5, 14, [[11, 13.5, 0, 7]], M.wallTile);
  wall(scene, solids, 0, 14, 10.5, 14, [[6, 9, 0, 7]]);
  wall(scene, solids, 10.5, 14, 10.5, 24.5);
  wall(scene, solids, 3, 24.5, 10.5, 24.5);
  wall(scene, solids, 10.5, 24.5, 10.5, 29.5, [[25, 27.5, 0, 7]]);
  wall(scene, solids, 22, 22, 22, 29.5);
  wall(scene, solids, 17, 22, 22, 22);

  // sliding door to balcony: one fixed glass panel, the other side open
  box(scene, 18.5, 0, 3.94, 22, 8, 4.06, M.glass, { cast: false });
  box(scene, 21.95, 0, 3.9, 22.1, 8, 4.1, M.frame);
  box(scene, 18.5, 7.85, 3.9, 25.5, 8, 4.1, M.frame, { cast: false });
  solids.push([18.5, 3.75, 22.1, 4.25]);

  // main door (closed behind you)
  box(scene, 23, 0, 29.32, 26, 7.2, 29.5, M.walnut);
  box(scene, 25.3, 3.3, 29.2, 25.45, 4.6, 29.3, M.brass);

  // ---- drawing room
  const tvx = 17 + T / 2;
  box(scene, tvx, 0, 4.4, tvx + 0.15, 9.1, 9.8, M.walnut);
  box(scene, tvx + 0.15, 0.9, 5, tvx + 1.4, 1.7, 9.2, M.oak);
  box(scene, tvx + 0.15, 3.4, 5.3, tvx + 0.25, 5.5, 8.9, M.black);
  box(scene, 19.6, 0.012, 6, 24.2, 0.03, 13.6, M.rug, { cast: false });
  solidBox(scene, solids, 24.4, 0, 6, 26.75, 1.45, 13.2, M.sofa);           // 3-seater
  box(scene, 26.1, 1.45, 6, 26.75, 2.9, 13.2, M.sofa);                       // back
  solidBox(scene, solids, 21.9, 0, 12.6, 26.75, 1.45, 15, M.sofa);          // chaise
  box(scene, 21.9, 1.45, 14.35, 26.75, 2.9, 15, M.sofa);
  for (const z of [6.8, 8.6, 10.6]) box(scene, 25.6, 1.45, z, 26.1, 2.7, z + 1.4, M.gold);
  box(scene, 25.6, 1.45, 12.4, 26.1, 2.6, 13.6, M.wine);
  solidBox(scene, solids, 20.6, 1.2, 8, 23, 1.35, 11.2, M.white);            // coffee table top
  box(scene, 21.2, 0, 8.6, 22.4, 1.2, 10.6, M.walnut);
  box(scene, 21.3, 1.35, 9.2, 21.9, 1.75, 9.8, M.brass);
  // floor lamp
  box(scene, 26.2, 0, 16.2, 26.3, 5.4, 16.3, M.black);
  const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 1, 24, 1, true), new THREE.MeshStandardMaterial({ color: 0xf6ead4, emissive: 0xffdcaa, emissiveIntensity: 0.6, side: THREE.DoubleSide }));
  shade.position.set(26.25, 5.6, 16.25); scene.add(shade);
  plant(scene, solids, 26.1, 4.95, 0.95);
  plant(scene, solids, 18.2, 20.8, 0.8);
  // art on the partition, facing the room
  box(scene, 18.3, 4, 21.7, 21.2, 6.6, 21.78, M.brass, { cast: false });
  box(scene, 18.45, 4.15, 21.68, 21.05, 6.45, 21.7, new THREE.MeshStandardMaterial({ color: 0x8c6d58, roughness: 0.9 }), { cast: false });
  [6, 10, 14, 18].forEach(z => { downlight(scene, 18.4, z); downlight(scene, 25.6, z); });

  // ---- balcony
  plant(scene, solids, 17.9, 0.9, 0.9); plant(scene, solids, 26.1, 0.9, 0.9);

  // ---- dining
  solidBox(scene, solids, 11.8, 2.45, 14, 14.6, 2.6, 18.5, M.walnut);
  for (const [x, z] of [[12, 14.2], [14.4, 14.2], [12, 18.3], [14.4, 18.3]]) box(scene, x - .08, 0, z - .08, x + .08, 2.45, z + .08, M.walnut);
  chair(scene, solids, 11.1, 15.25, Math.PI / 2); chair(scene, solids, 11.1, 17.25, Math.PI / 2);
  chair(scene, solids, 15.3, 15.25, -Math.PI / 2); chair(scene, solids, 15.3, 17.25, -Math.PI / 2);
  box(scene, 13.18, 7.4, 16.23, 13.22, H, 16.27, M.black, { cast: false });
  const pendant = new THREE.Mesh(new THREE.SphereGeometry(0.75, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), M.brass);
  pendant.position.set(13.2, 6.8, 16.25); scene.add(pendant);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), M.glow); bulb.position.set(13.2, 6.75, 16.25); scene.add(bulb);
  box(scene, 12.2, 2.6, 15.6, 13.9, 2.62, 16.9, M.linen, { cast: false });

  // ---- kitchen
  const kz = 29.5 - T / 2;
  solidBox(scene, solids, 10.73, 0, 27.4, 21.78, 2.8, kz, M.white);
  box(scene, 10.73, 2.8, 27.3, 21.78, 2.95, kz, M.granite);
  box(scene, 10.73, 2.95, kz - 0.05, 21.78, 4.4, kz, new THREE.MeshStandardMaterial({ color: 0xcfc4b3, roughness: 0.3 }), { cast: false }); // dado
  box(scene, 10.73, 5.2, 28.2, 12.8, 7.9, kz, M.oak); box(scene, 19.2, 5.2, 28.2, 21.78, 7.9, kz, M.oak);
  box(scene, 14.2, 2.95, 27.7, 16, 3.0, 28.9, M.black);                    // hob
  box(scene, 17.6, 2.9, 27.8, 19.2, 2.96, 28.9, M.steel);                  // sink
  box(scene, 18.35, 2.95, 28.9, 18.45, 3.9, 29, M.steel);
  for (let x = 11.6; x < 21.5; x += 2) box(scene, x, 1.6, 27.36, x + 0.6, 1.66, 27.4, M.steel, { cast: false });
  solidBox(scene, solids, 20.1, 0, 22.4, 21.78, 6.2, 24.6, M.steel);       // fridge
  downlight(scene, 13, 25.5); downlight(scene, 17, 25.5); downlight(scene, 20, 25.5);

  // ---- wash
  solidBox(scene, solids, 4, 0, 27.4, 6.1, 2.9, 29.27, M.white);
  const drum = new THREE.Mesh(new THREE.CircleGeometry(0.65, 24), M.black); drum.position.set(5.05, 1.5, 27.38); drum.rotation.y = Math.PI; scene.add(drum);

  // ---- bedroom 2 (headboard on the drawing-room wall)
  const hb = 17 - T / 2;
  box(scene, hb - 0.3, 0, 1.8, hb, 4.2, 8, M.headboard);
  bed(scene, solids, 11.2, 2.6, hb - 0.3, 7.4, "x+");
  solidBox(scene, solids, hb - 1.6, 0, 0.5, hb, 1.8, 1.9, M.walnut);
  solidBox(scene, solids, hb - 1.6, 0, 7.6, hb - 0.3, 1.8, 8.9, M.walnut);
  box(scene, hb - 0.9, 1.8, 0.9, hb - 0.7, 3, 1.1, M.brass);
  wardrobe(scene, solids, 4.7, 8.3, 9.6, 10 - T / 2, "z");
  downlight(scene, 9, 5); downlight(scene, 13.5, 5);

  // ---- bedroom 1 (headboard on the wash wall)
  const hb1 = 24.5 - T / 2;
  box(scene, 1.6, 0, hb1 - 0.3, 7.6, 4.2, hb1, M.headboard);
  bed(scene, solids, 2.1, 18, 7.1, hb1 - 0.3, "z+");
  solidBox(scene, solids, 0.25, 0, hb1 - 1.6, 1.5, 1.8, hb1, M.walnut);
  solidBox(scene, solids, 7.7, 0, hb1 - 1.6, 9, 1.8, hb1, M.walnut);
  wardrobe(scene, solids, 8.6, 15, 10.5 - T / 2, 21, "x");
  downlight(scene, 5, 19);

  // ---- toilets
  solidBox(scene, solids, 0.5, 0, 0.4, 1.9, 1.35, 2, M.ceramic);
  box(scene, 0.25, 1.35, 0.4, 0.6, 3, 2, M.ceramic);
  solidBox(scene, solids, 2.6, 2.5, 0.25, 4.1, 2.9, 1.5, M.ceramic);
  solidBox(scene, solids, 0.5, 0, 12.2, 1.9, 1.35, 13.75, M.ceramic);
  solidBox(scene, solids, 0.25, 2.5, 10.3, 1.5, 2.9, 11.6, M.ceramic);
  downlight(scene, 2.2, 3.2); downlight(scene, 2.2, 12);

  // ---- foyer
  solidBox(scene, solids, 26.05, 0, 23.3, 26.77, 3, 27.6, M.oak);
  box(scene, 26.7, 3.8, 24, 26.77, 7, 26.9, new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: 0.02, metalness: 0.9 }), { cast: false });
  downlight(scene, 24.5, 25.5);
}

function buildLights(scene) {
  scene.add(new THREE.HemisphereLight(0xeaf2ff, 0xb8a58c, LOW ? 1.5 : 0.9));
  if (LOW) scene.add(new THREE.AmbientLight(0xfff4e6, 0.35));
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.2);
  sun.position.set(13.5 + 120, 95, 14 - 70);
  sun.target.position.set(13.5, 0, 14);
  sun.castShadow = true;
  sun.shadow.mapSize.set(LOW ? 1024 : 2048, LOW ? 1024 : 2048);
  Object.assign(sun.shadow.camera, { left: -26, right: 26, top: 26, bottom: -26, near: 60, far: 300 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  if (!LOW) for (const [x, z, i] of [[22, 13, 34], [13.2, 16, 22], [11, 5, 18], [5, 19, 18], [16, 26, 16], [24.5, 25.5, 9], [2.2, 7, 6]]) {
    const l = new THREE.PointLight(0xffe2bd, i, 30, 1.4);
    l.position.set(x, H - 1.2, z); scene.add(l);
  }
}

function buildOutside(scene) {
  const FLOOR_Y = -62; // the home is on the sixth floor
  // sky dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2600, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(0x7fa9d6) }, mid: { value: new THREE.Color(0xd9e6ef) }, bot: { value: new THREE.Color(0xe9e4da) } },
    vertexShader: "varying vec3 p;void main(){p=normalize(position);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
    fragmentShader: "uniform vec3 top,mid,bot;varying vec3 p;void main(){float h=p.y;vec3 c=h>0.?mix(mid,top,pow(h,.55)):mix(mid,bot,min(1.,-h*6.));gl_FragColor=vec4(c,1.);}",
  }));
  sky.position.set(13.5, 0, 14); scene.add(sky);

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshStandardMaterial({ color: 0x8a9a72, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(13.5, FLOOR_Y, 14); scene.add(ground);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(60, 6000), new THREE.MeshStandardMaterial({ color: 0x5d5f62, roughness: 0.9 }));
  road.rotation.x = -Math.PI / 2; road.position.set(13.5, FLOOR_Y + 0.3, 90); road.rotation.z = Math.PI / 2; scene.add(road);

  // the tower's own facade around the flat, so it doesn't float
  const facade = new THREE.MeshStandardMaterial({ color: 0x8e8f93, roughness: 0.8 });
  const towerBox = (x0, z0, x1, z1) => box(scene, x0, FLOOR_Y, z0, x1, -0.05, z1, facade, { cast: false });
  towerBox(-0.3, -0.3, 27.3, 29.8);
  box(scene, -0.3, H + 0.6, -0.3, 27.3, H + 75, 29.8, facade, { cast: false });

  // trees
  const rnd = (a, b) => a + Math.random() * (b - a);
  const N = LOW ? 240 : 520;
  const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, flatShading: true }), N);
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.6, 0.9, 1, 6), new THREE.MeshStandardMaterial({ color: 0x5b4636 }), N);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const a = rnd(0, Math.PI * 2), d = rnd(45, 900), x = 13.5 + Math.cos(a) * d, z = 14 + Math.sin(a) * d;
    if (Math.abs(z - 90) < 34) { i--; continue; }
    const h = rnd(18, 38), r = rnd(9, 17);
    m.compose(p.set(x, FLOOR_Y + h, z), q.identity(), s.set(r, r * rnd(.8, 1.1), r)); crowns.setMatrixAt(i, m);
    crowns.setColorAt(i, col.setHSL(rnd(.25, .31), rnd(.3, .45), rnd(.28, .4)));
    m.compose(p.set(x, FLOOR_Y + h / 2, z), q.identity(), s.set(1, h, 1)); trunks.setMatrixAt(i, m);
  }
  scene.add(crowns, trunks);

  // distant towers
  const stripes = canvasTex(8, 64, (g, w, h) => { g.fillStyle = "#e0dad0"; g.fillRect(0, 0, w, h); g.fillStyle = "#9aa3ab"; g.fillRect(0, 34, w, 20); }, 10);
  for (let i = 0; i < 46; i++) {
    const a = rnd(0, Math.PI * 2), d = rnd(260, 1200), x = 13.5 + Math.cos(a) * d, z = 14 + Math.sin(a) * d;
    const w = rnd(50, 110), dd = rnd(40, 80), h = rnd(70, 160);
    const t = stripes.clone(); t.needsUpdate = true; t.repeat.set(1, Math.round(h / 10));
    box(scene, x - w / 2, FLOOR_Y, z - dd / 2, x + w / 2, FLOOR_Y + h, z + dd / 2, new THREE.MeshStandardMaterial({ map: t, roughness: 0.8 }), { cast: false });
  }
}

// ---------------------------------------------------------------- mini map
function miniMap() {
  const seen = new Set();
  const rects = ROOMS.filter(r => r.n !== "Bedroom 2" || !seen.has(r.n)).map(r => {
    seen.add(r.n);
    let [x0, z0, x1, z1] = r.r;
    return `<rect data-room="${r.n}" x="${x0}" y="${z0}" width="${x1 - x0}" height="${z1 - z0}" fill="rgba(255,255,255,.07)" stroke="rgba(255,255,255,.45)" stroke-width=".25"/>`;
  });
  // draw the two toilets on top of bedroom 2
  return `<svg viewBox="-1 -1 29 31.5">
    ${rects.filter(s => s.includes("Bedroom 2")).join("")}${rects.filter(s => !s.includes("Bedroom 2")).join("")}
    <g id="cone"><path d="M0 0 L7 -3.2 A7.6 7.6 0 0 1 7 3.2 Z" fill="rgba(217,194,154,.45)"/></g>
    <circle id="me" r="1" fill="#d9c29a" stroke="#1e1a17" stroke-width=".35"/>
  </svg>`;
}
