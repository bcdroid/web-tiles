// Night Drift: a blacked-out supercar drifts through a city at night, seen
// from above. Arrow keys or WASD drive, Space pulls the handbrake, R resets.
// Left alone for a few seconds, the car drives itself around the blocks.

"use strict";

const canvas = document.getElementById("city");
const ctx = canvas.getContext("2d");

// ---------- The city ----------
// A square grid: roads run between square blocks. Every length here is in
// "world pixels"; the camera decides how big they look on screen.

const ROAD = 220;                    // width of a road
const BLOCK = 380;                   // width of a block, sidewalk included
const CELL = ROAD + BLOCK;           // one road plus one block
const BLOCKS = 5;                    // blocks across, and blocks down
const WORLD = BLOCKS * CELL + ROAD;  // the whole city, edge to edge
const WALK = 18;                     // sidewalk width

const COLORS = {
  outside: "#0d0e12",
  asphalt: "#1d1f25",
  sidewalk: "#2c2e35",
  centerLine: "rgba(235, 196, 90, 0.55)",
  crosswalk: "rgba(225, 228, 235, 0.26)",
  roofs: ["#23252c", "#28262d", "#1f232a", "#2b2c32", "#212026", "#1c2027"],
  vent: "#34363e",
  skylight: "rgba(255, 214, 150, 0.4)",
};

// The middle of road number k (road 0 runs along the top or left edge).
function roadMiddle(k) {
  return k * CELL + ROAD / 2;
}

// A seeded random number generator, so the city looks the same every time.
function seededRandom(seed) {
  return function () {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = seededRandom(299);

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

// Split a block into a few buildings, with narrow alleys between them.
function makeBuildings(x, y, w, h) {
  const list = [];
  split(x, y, w, h, 2);
  return list;

  function split(x, y, w, h, depth) {
    if (depth === 0 || (depth === 1 && random() < 0.4)) {
      list.push(makeBuilding(x, y, w, h));
      return;
    }
    const gap = 10;
    const cut = 0.35 + random() * 0.3;
    if (w >= h) {
      const left = w * cut - gap / 2;
      split(x, y, left, h, depth - 1);
      split(x + left + gap, y, w - left - gap, h, depth - 1);
    } else {
      const top = h * cut - gap / 2;
      split(x, y, w, top, depth - 1);
      split(x, y + top + gap, w, h - top - gap, depth - 1);
    }
  }
}

// One rooftop: a colour, a few air-conditioning units, maybe lit skylights.
function makeBuilding(x, y, w, h) {
  const b = { x, y, w, h, color: pick(COLORS.roofs), vents: [], skylights: [] };
  const vents = 1 + Math.floor(random() * 3);
  for (let k = 0; k < vents; k++) {
    const size = 12 + random() * 18;
    b.vents.push({
      x: x + 10 + random() * Math.max(0, w - size - 20),
      y: y + 10 + random() * Math.max(0, h / 2 - size - 10),
      size,
    });
  }
  if (random() < 0.5) {
    const count = Math.min(6, Math.floor((w - 30) / 22));
    for (let k = 0; k < count; k++) {
      b.skylights.push({ x: x + 18 + k * 22, y: y + h * 0.7 });
    }
  }
  return b;
}

const blocks = [];
const lamps = [];
for (let j = 0; j < BLOCKS; j++) {
  for (let i = 0; i < BLOCKS; i++) {
    const x = ROAD + i * CELL;
    const y = ROAD + j * CELL;
    const inner = BLOCK - 2 * WALK;
    blocks.push({ x, y, buildings: makeBuildings(x + WALK, y + WALK, inner, inner) });

    // Street lamps stand on the sidewalk: one at each corner, one mid-side.
    const near = WALK / 2;
    const mid = BLOCK / 2;
    const far = BLOCK - WALK / 2;
    const spots = [[near, near], [mid, near], [far, near], [far, mid],
                   [far, far], [mid, far], [near, far], [near, mid]];
    for (const [lx, ly] of spots) lamps.push({ x: x + lx, y: y + ly });
  }
}

// ---------- Pre-drawn light sprites ----------
// Soft round glows are drawn once into small canvases, then stamped many
// times per frame. That is much faster than building a gradient each time.

function makeGlow(radius, rgb, alpha) {
  const c = document.createElement("canvas");
  c.width = c.height = radius * 2;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(radius, radius, 0, radius, radius, radius);
  grad.addColorStop(0, `rgba(${rgb}, ${alpha})`);
  grad.addColorStop(1, `rgba(${rgb}, 0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, radius * 2, radius * 2);
  return c;
}

const LAMP_POOL = makeGlow(150, "255, 180, 100", 0.1);
const LAMP_BULB = makeGlow(16, "255, 230, 190", 0.9);
const TAIL_GLOW = makeGlow(40, "255, 30, 30", 0.5);
const SMOKE = makeGlow(32, "205, 207, 214", 0.6);

// Tyre marks are painted onto their own canvas the size of the city, at half
// resolution to save memory. Every second it fades a little.
const SKID_SCALE = 0.5;
const skidCanvas = document.createElement("canvas");
skidCanvas.width = skidCanvas.height = Math.ceil(WORLD * SKID_SCALE);
const skid = skidCanvas.getContext("2d");
skid.lineCap = "butt";
skid.lineWidth = 7 * SKID_SCALE;
skid.strokeStyle = "rgba(3, 3, 5, 0.45)";

// ---------- The car ----------

const CAR_LENGTH = 64;
const CAR_WIDTH = 30;
const HIT_RADIUS = 15;   // the car collides as two circles of this radius,
const HIT_OFFSET = 16;   // this far in front of and behind its centre

const ENGINE = 560;          // forward push, pixels per second per second
const BRAKE = 950;
const REVERSE = 380;
const MAX_REVERSE = 220;
const DRAG = 0.6;            // air resistance; sets the top speed
const STEER_RATE = 2.9;      // how fast the car turns at full lock, radians/s
const GRIP = 10;             // how quickly tyres stop sideways sliding
const GRIP_DRIFT = 3.4;      // ... once the rear has broken loose
const GRIP_HANDBRAKE = 1.4;  // ... with the handbrake on
const DRIFT_START = 150;     // sideways speed that starts a drift
const DRIFT_END = 60;        // sideways speed that ends one

const START = { x: roadMiddle(1), y: roadMiddle(1), angle: 0 };
const car = {};
const rearWheels = [{ x: null, y: null }, { x: null, y: null }];

function resetCar() {
  Object.assign(car, START, { vx: 300, vy: 0, steer: 0, drifting: false, braking: false });
  for (const w of rearWheels) w.x = null;
}
resetCar();

// One small step of driving physics. The trick that makes drifting work:
// split the car's velocity into a part along its nose ("forward") and a part
// out of its side ("sideways"). The engine and brakes change the forward part.
// Tyres kill the sideways part, quickly when they grip and slowly when they
// slide. Steering turns the car's body, and the velocity only catches up as
// fast as the tyres allow, so a hard turn at speed swings the tail out.
function updateCar(dt, input) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const rx = -fy;
  const ry = fx;
  let forward = car.vx * fx + car.vy * fy;
  let sideways = car.vx * rx + car.vy * ry;

  car.steer += (input.steer - car.steer) * Math.min(1, dt * 8);
  car.braking = input.brake > 0 && forward > 20;

  if (input.throttle > 0) forward += ENGINE * input.throttle * dt;
  if (input.brake > 0) {
    if (forward > 20) forward -= BRAKE * dt;
    else forward = Math.max(forward - REVERSE * dt, -MAX_REVERSE);
  }
  if (!input.throttle && !input.brake) forward -= forward * 0.6 * dt;
  if (input.handbrake) forward -= forward * 1.1 * dt;
  forward -= forward * DRAG * dt;

  // Steering needs a little speed to bite, and is gentler at top speed.
  const speed = Math.hypot(car.vx, car.vy);
  const bite = Math.min(1, Math.abs(forward) / 160) / (1 + speed / 1400);
  let turn = car.steer * STEER_RATE * bite * Math.sign(forward);
  if (car.drifting || input.handbrake) turn *= 1.3;
  car.angle += turn * dt;

  if (car.drifting && Math.abs(sideways) < DRIFT_END) car.drifting = false;
  if (!car.drifting && Math.abs(sideways) > DRIFT_START) car.drifting = true;
  let grip = car.drifting ? GRIP_DRIFT : GRIP;
  if (input.handbrake) grip = GRIP_HANDBRAKE;
  sideways *= Math.exp(-grip * dt);

  car.vx = fx * forward + rx * sideways;
  car.vy = fy * forward + ry * sideways;
  car.x += car.vx * dt;
  car.y += car.vy * dt;

  const impact = collide();
  const skidding = car.drifting || (input.handbrake && speed > 60) || (car.braking && forward > 250);
  leaveMarks(dt, skidding && speed > 40, Math.abs(sideways));
  return { sideways: Math.abs(sideways), speed, impact };
}

// Keep the car out of buildings and inside the city. Returns how hard it hit.
function collide() {
  let impact = 0;
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);

  function push(nx, ny, depth) {
    car.x += nx * depth;
    car.y += ny * depth;
    const into = car.vx * nx + car.vy * ny;
    if (into < 0) {
      car.vx -= 1.35 * into * nx;   // bounce off, losing some speed
      car.vy -= 1.35 * into * ny;
      car.vx *= 0.92;
      car.vy *= 0.92;
      impact = Math.max(impact, -into);
    }
  }

  for (const offset of [-HIT_OFFSET, HIT_OFFSET]) {
    const cx = car.x + fx * offset;
    const cy = car.y + fy * offset;
    const r = HIT_RADIUS;
    if (cx < r) push(1, 0, r - cx);
    if (cx > WORLD - r) push(-1, 0, cx - (WORLD - r));
    if (cy < r) push(0, 1, r - cy);
    if (cy > WORLD - r) push(0, -1, cy - (WORLD - r));

    for (const b of blocks) {
      const px = Math.min(Math.max(cx, b.x), b.x + BLOCK);
      const py = Math.min(Math.max(cy, b.y), b.y + BLOCK);
      const dx = cx - px;
      const dy = cy - py;
      const d = Math.hypot(dx, dy);
      if (d >= r) continue;
      if (d > 0) {
        push(dx / d, dy / d, r - d);
      } else {
        // The centre got inside the block: leave by the nearest side.
        const sides = [
          [cx - b.x, -1, 0], [b.x + BLOCK - cx, 1, 0],
          [cy - b.y, 0, -1], [b.y + BLOCK - cy, 0, 1],
        ].sort((a, c) => a[0] - c[0]);
        push(sides[0][1], sides[0][2], sides[0][0] + r);
      }
    }
  }
  return impact;
}

// Paint tyre marks behind the rear wheels and puff smoke while skidding.
function leaveMarks(dt, skidding, sideways) {
  const fx = Math.cos(car.angle);
  const fy = Math.sin(car.angle);
  const back = -CAR_LENGTH * 0.3;
  const half = CAR_WIDTH * 0.42;
  [-1, 1].forEach((side, k) => {
    const wheel = rearWheels[k];
    const x = car.x + fx * back - fy * half * side;
    const y = car.y + fy * back + fx * half * side;
    if (!skidding) {
      wheel.x = null;
      return;
    }
    if (wheel.x !== null) {
      skid.beginPath();
      skid.moveTo(wheel.x * SKID_SCALE, wheel.y * SKID_SCALE);
      skid.lineTo(x * SKID_SCALE, y * SKID_SCALE);
      skid.stroke();
    }
    wheel.x = x;
    wheel.y = y;
    if (sideways > 120 && Math.random() < dt * 30) addSmoke(x, y);
  });
}

// ---------- Smoke ----------

const smoke = [];

function addSmoke(x, y) {
  if (smoke.length > 350) smoke.shift();
  smoke.push({
    x, y,
    vx: car.vx * 0.15 + (Math.random() - 0.5) * 40,
    vy: car.vy * 0.15 + (Math.random() - 0.5) * 40,
    age: 0,
    life: 1.1 + Math.random() * 0.9,
  });
}

function updateSmoke(dt) {
  for (const p of smoke) {
    p.age += dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 1 - dt * 1.5;
    p.vy *= 1 - dt * 1.5;
  }
  while (smoke.length && smoke[0].age > smoke[0].life) smoke.shift();
}

// ---------- Autopilot ----------
// When nobody is driving, the car laps a loop around four blocks. It aims at
// a point a little way ahead along the loop ("pure pursuit"), and pulls the
// handbrake when that point swings round a corner, so it drifts the turns.

const ROUTE = [[1, 1], [3, 1], [3, 3], [1, 3]].map(([i, j]) => ({ x: roadMiddle(i), y: roadMiddle(j) }));
const LEGS = ROUTE.map((a, k) => {
  const b = ROUTE[(k + 1) % ROUTE.length];
  return { a, b, len: Math.hypot(b.x - a.x, b.y - a.y) };
});
const LOOP = LEGS.reduce((sum, leg) => sum + leg.len, 0);
const IDLE_SECONDS = 6;

const autopilot = { on: true, idle: 0, stuck: 0, reversing: 0 };

// How far along the loop is the point closest to (x, y)?
function distanceAlongRoute(x, y) {
  let best = Infinity;
  let bestS = 0;
  let start = 0;
  for (const { a, b, len } of LEGS) {
    const t = Math.min(1, Math.max(0, ((x - a.x) * (b.x - a.x) + (y - a.y) * (b.y - a.y)) / (len * len)));
    const d = Math.hypot(a.x + (b.x - a.x) * t - x, a.y + (b.y - a.y) * t - y);
    if (d < best) {
      best = d;
      bestS = start + t * len;
    }
    start += len;
  }
  return bestS;
}

function pointAlongRoute(s) {
  s = ((s % LOOP) + LOOP) % LOOP;
  for (const { a, b, len } of LEGS) {
    if (s <= len) return { x: a.x + (b.x - a.x) * (s / len), y: a.y + (b.y - a.y) * (s / len) };
    s -= len;
  }
  return ROUTE[0];
}

function wrapAngle(a) {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

function autopilotInput(dt) {
  const speed = Math.hypot(car.vx, car.vy);
  const aim = pointAlongRoute(distanceAlongRoute(car.x, car.y) + 150 + speed * 0.3);
  const off = wrapAngle(Math.atan2(aim.y - car.y, aim.x - car.x) - car.angle);
  const steer = Math.max(-1, Math.min(1, off * 2.5));

  // If it has crashed and stopped, back up for a moment and try again.
  if (autopilot.reversing > 0) {
    autopilot.reversing -= dt;
    return { throttle: 0, brake: 1, steer: -steer, handbrake: false };
  }
  autopilot.stuck = speed < 40 ? autopilot.stuck + dt : 0;
  if (autopilot.stuck > 1.2) {
    autopilot.stuck = 0;
    autopilot.reversing = 0.8;
  }
  // Brake early enough to reach the next corner at a speed it can drift.
  const toCorner = distanceToNextCorner(car.x, car.y);
  const safe = Math.sqrt(CORNER_SPEED ** 2 + 2 * BRAKE * 0.6 * Math.max(0, toCorner - 120));
  const tooFast = speed > safe;
  return {
    throttle: tooFast ? 0 : Math.abs(off) > 1.2 ? 0.5 : 1,
    brake: tooFast ? 1 : 0,
    steer,
    handbrake: Math.abs(off) > 0.3 && speed > 280,
  };
}

const CORNER_SPEED = 450;

function distanceToNextCorner(x, y) {
  let s = distanceAlongRoute(x, y);
  for (const leg of LEGS) {
    if (s <= leg.len) return leg.len - s;
    s -= leg.len;
  }
  return 0;
}

// ---------- Keyboard ----------

const keys = new Set();
const DRIVE_KEYS = new Set([
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "KeyW", "KeyA", "KeyS", "KeyD", "Space",
]);

window.addEventListener("keydown", (e) => {
  if (DRIVE_KEYS.has(e.code)) {
    e.preventDefault();
    keys.add(e.code);
    autopilot.on = false;
    autopilot.idle = 0;
  } else if (e.code === "KeyR") {
    resetCar();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());
canvas.addEventListener("pointerdown", () => window.focus());

function keyboardInput() {
  const held = (...codes) => codes.some((c) => keys.has(c));
  return {
    throttle: held("ArrowUp", "KeyW") ? 1 : 0,
    brake: held("ArrowDown", "KeyS") ? 1 : 0,
    steer: (held("ArrowRight", "KeyD") ? 1 : 0) - (held("ArrowLeft", "KeyA") ? 1 : 0),
    handbrake: held("Space"),
  };
}

// ---------- Score ----------
// Points pile up while the car is sideways. A drift banks its points when it
// ends cleanly; hitting a wall mid-drift loses them.

const score = { combo: 0, total: 0, best: 0, message: "", messageColor: "", messageTime: 0 };

function updateScore(dt, result) {
  if (car.drifting && result.speed > 150) {
    score.combo += result.sideways * dt;
  }
  if (score.combo > 0 && result.impact > 160) {
    flash("CRASH", "#ff4a4a");
    score.combo = 0;
  } else if (score.combo > 0 && !car.drifting) {
    const points = Math.round(score.combo);
    if (points >= 50) {
      score.total += points;
      score.best = Math.max(score.best, points);
      flash(`+${points.toLocaleString()}`, "#ffd36a");
    }
    score.combo = 0;
  }
  score.messageTime = Math.max(0, score.messageTime - dt);
}

function flash(text, color) {
  score.message = text;
  score.messageColor = color;
  score.messageTime = 1.6;
}

// ---------- Camera and screen ----------

const camera = { x: START.x, y: START.y };
let viewWidth = 0;
let viewHeight = 0;

function resize() {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  viewWidth = window.innerWidth;
  viewHeight = window.innerHeight;
  canvas.width = Math.round(viewWidth * ratio);
  canvas.height = Math.round(viewHeight * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
}
window.addEventListener("resize", resize);
resize();

function updateCamera(dt) {
  // Look a little ahead of where the car is going.
  const lead = Math.min(1, 220 / (Math.hypot(car.vx, car.vy) * 0.35 + 1));
  const tx = car.x + car.vx * 0.35 * lead;
  const ty = car.y + car.vy * 0.35 * lead;
  const ease = Math.min(1, dt * 3);
  camera.x += (tx - camera.x) * ease;
  camera.y += (ty - camera.y) * ease;
}

function zoom() {
  // Fit roughly a 1060 by 660 patch of city, and pull back a bit at speed.
  const fit = Math.min(viewWidth / 1060, viewHeight / 660);
  const speed = Math.min(900, Math.hypot(car.vx, car.vy));
  return fit * (1 - (speed / 900) * 0.15);
}

// ---------- Drawing ----------

function draw() {
  const z = zoom();
  const view = {
    left: camera.x - viewWidth / 2 / z,
    top: camera.y - viewHeight / 2 / z,
    right: camera.x + viewWidth / 2 / z,
    bottom: camera.y + viewHeight / 2 / z,
  };
  const seen = (x, y, w, h) => x + w > view.left && x < view.right && y + h > view.top && y < view.bottom;

  ctx.fillStyle = COLORS.outside;
  ctx.fillRect(0, 0, viewWidth, viewHeight);

  ctx.save();
  ctx.translate(viewWidth / 2, viewHeight / 2);
  ctx.scale(z, z);
  ctx.translate(-camera.x, -camera.y);

  // Ground: a sidewalk round the edge of the city, roads, block sidewalks.
  ctx.fillStyle = COLORS.sidewalk;
  ctx.fillRect(-WALK, -WALK, WORLD + 2 * WALK, WORLD + 2 * WALK);
  ctx.fillStyle = COLORS.asphalt;
  ctx.fillRect(0, 0, WORLD, WORLD);
  ctx.fillStyle = COLORS.sidewalk;
  for (const b of blocks) ctx.fillRect(b.x, b.y, BLOCK, BLOCK);

  drawMarkings(seen);
  ctx.drawImage(skidCanvas, 0, 0, WORLD, WORLD);

  // Light falls on the ground before the buildings go on top, so the
  // buildings block it.
  ctx.globalCompositeOperation = "lighter";
  for (const l of lamps) {
    if (seen(l.x - 150, l.y - 150, 300, 300)) ctx.drawImage(LAMP_POOL, l.x - 150, l.y - 150);
  }
  drawHeadlights();
  ctx.globalCompositeOperation = "source-over";

  for (const b of blocks) {
    if (seen(b.x, b.y, BLOCK + 10, BLOCK + 10)) drawBuildings(b);
  }

  ctx.globalCompositeOperation = "lighter";
  for (const l of lamps) {
    if (seen(l.x - 16, l.y - 16, 32, 32)) ctx.drawImage(LAMP_BULB, l.x - 16, l.y - 16);
  }
  ctx.globalCompositeOperation = "source-over";

  drawCar();
  drawSmoke();
  ctx.restore();

  drawHud();
}

function drawMarkings(seen) {
  ctx.strokeStyle = COLORS.centerLine;
  ctx.lineWidth = 4;
  ctx.setLineDash([30, 26]);
  ctx.beginPath();
  for (let k = 0; k <= BLOCKS; k++) {
    const m = roadMiddle(k);
    for (let s = 0; s < BLOCKS; s++) {
      const a = s * CELL + ROAD + 44;   // from just past one crossing ...
      const b = (s + 1) * CELL - 44;    // ... to just before the next
      ctx.moveTo(a, m);
      ctx.lineTo(b, m);
      ctx.moveTo(m, a);
      ctx.lineTo(m, b);
    }
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Zebra crossings on each side of every crossroads.
  ctx.fillStyle = COLORS.crosswalk;
  for (let j = 0; j <= BLOCKS; j++) {
    for (let i = 0; i <= BLOCKS; i++) {
      const x = i * CELL;
      const y = j * CELL;
      if (!seen(x - 40, y - 40, ROAD + 80, ROAD + 80)) continue;
      for (let s = 14; s < ROAD - 14; s += 22) {
        if (j > 0) ctx.fillRect(x + s, y - 34, 11, 28);
        if (j < BLOCKS) ctx.fillRect(x + s, y + ROAD + 6, 11, 28);
        if (i > 0) ctx.fillRect(x - 34, y + s, 28, 11);
        if (i < BLOCKS) ctx.fillRect(x + ROAD + 6, y + s, 28, 11);
      }
    }
  }
}

function drawBuildings(block) {
  for (const b of block.buildings) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";   // shadow
    ctx.fillRect(b.x + 6, b.y + 7, b.w, b.h);
  }
  for (const b of block.buildings) {
    ctx.fillStyle = b.color;
    ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";   // low wall round the roof
    ctx.lineWidth = 3;
    ctx.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
    ctx.fillStyle = COLORS.vent;
    for (const v of b.vents) ctx.fillRect(v.x, v.y, v.size, v.size);
    ctx.fillStyle = COLORS.skylight;
    for (const s of b.skylights) ctx.fillRect(s.x, s.y, 10, 10);
  }
}

function drawHeadlights() {
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);
  for (const side of [-1, 1]) {
    const hx = CAR_LENGTH * 0.44;
    const hy = side * 10;
    const reach = 360;
    const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, reach);
    g.addColorStop(0, "rgba(255, 246, 225, 0.30)");
    g.addColorStop(1, "rgba(255, 246, 225, 0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.arc(hx, hy, reach, -0.3 + side * 0.06, 0.3 + side * 0.06);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

// The car is drawn with its nose pointing along +x, centred on (0, 0).
function drawCar() {
  const L = CAR_LENGTH / 2;
  const W = CAR_WIDTH / 2;
  ctx.save();
  ctx.translate(car.x, car.y);
  ctx.rotate(car.angle);

  // Shadow on the road.
  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  bodyPath(4, 5);
  ctx.fill();

  // Wheels: wide, black, the front pair turned by the steering.
  for (const [wx, wy, front] of [[19, 2 - W, true], [19, W - 2, true], [-19, 2 - W, false], [-19, W - 2, false]]) {
    ctx.save();
    ctx.translate(wx, wy);
    if (front) ctx.rotate(car.steer * 0.45);
    ctx.fillStyle = "#060606";
    ctx.fillRect(-7, -4, 14, 8);
    ctx.fillStyle = "#1a1b1f";
    ctx.fillRect(-4, -1, 8, 2);
    ctx.restore();
  }

  // Body: matte black with a faint sheen down the middle.
  const sheen = ctx.createLinearGradient(0, -W, 0, W);
  sheen.addColorStop(0, "#030304");
  sheen.addColorStop(0.5, "#17181c");
  sheen.addColorStop(1, "#030304");
  ctx.fillStyle = sheen;
  bodyPath(0, 0);
  ctx.fill();
  ctx.strokeStyle = "#2a2b31";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Mirrors.
  ctx.fillStyle = "#0a0a0c";
  ctx.fillRect(5, -W - 2.5, 5, 3);
  ctx.fillRect(5, W - 0.5, 5, 3);

  // Tinted glass, then the roof on top of it.
  ctx.fillStyle = "#010102";
  ctx.beginPath();
  ctx.moveTo(14, -9);
  ctx.lineTo(14, 9);
  ctx.lineTo(-15, 8);
  ctx.lineTo(-15, -8);
  ctx.closePath();
  ctx.fill();
  const glare = ctx.createLinearGradient(14, -9, 4, 9);
  glare.addColorStop(0, "rgba(140, 150, 175, 0)");
  glare.addColorStop(0.5, "rgba(140, 150, 175, 0.22)");
  glare.addColorStop(1, "rgba(140, 150, 175, 0)");
  ctx.fillStyle = glare;
  ctx.fillRect(4, -9, 10, 18);
  ctx.fillStyle = "#0c0c0f";
  ctx.fillRect(-7, -8, 11, 16);

  // Engine cover slats, bonnet vents, rear wing.
  ctx.strokeStyle = "#202126";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  for (let x = -18; x >= -26; x -= 2.5) {
    ctx.moveTo(x, -6);
    ctx.lineTo(x, 6);
  }
  ctx.moveTo(20, -5); ctx.lineTo(26, -4);
  ctx.moveTo(20, 5); ctx.lineTo(26, 4);
  ctx.stroke();
  ctx.fillStyle = "#08080a";
  ctx.fillRect(-L + 1, -W + 1, 4, CAR_WIDTH - 2);
  ctx.strokeStyle = "#2a2b31";
  ctx.strokeRect(-L + 1, -W + 1, 4, CAR_WIDTH - 2);

  // Headlights: thin cold-white slits.
  ctx.strokeStyle = "#e6eeff";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(L - 3, -8); ctx.lineTo(L - 8, -12.5);
  ctx.moveTo(L - 3, 8); ctx.lineTo(L - 8, 12.5);
  ctx.stroke();

  // Tail lights: one red bar across the back, brighter when braking.
  ctx.strokeStyle = car.braking ? "#ff4040" : "#b3151a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-L, -11);
  ctx.lineTo(-L, 11);
  ctx.stroke();
  ctx.globalCompositeOperation = "lighter";
  ctx.globalAlpha = car.braking ? 1 : 0.5;
  ctx.drawImage(TAIL_GLOW, -L - 40, -40);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";

  ctx.restore();
}

// The outline of the body: a pointed nose, a narrow waist, wide rear haunches.
function bodyPath(dx, dy) {
  ctx.beginPath();
  ctx.moveTo(32 + dx, -7 + dy);
  ctx.quadraticCurveTo(33.5 + dx, dy, 32 + dx, 7 + dy);
  ctx.quadraticCurveTo(26 + dx, 14 + dy, 17 + dx, 14.5 + dy);
  ctx.quadraticCurveTo(4 + dx, 12.5 + dy, -12 + dx, 15.5 + dy);
  ctx.quadraticCurveTo(-30 + dx, 15 + dy, -32 + dx, 11 + dy);
  ctx.lineTo(-32 + dx, -11 + dy);
  ctx.quadraticCurveTo(-30 + dx, -15 + dy, -12 + dx, -15.5 + dy);
  ctx.quadraticCurveTo(4 + dx, -12.5 + dy, 17 + dx, -14.5 + dy);
  ctx.quadraticCurveTo(26 + dx, -14 + dy, 32 + dx, -7 + dy);
  ctx.closePath();
}

function drawSmoke() {
  for (const p of smoke) {
    const size = 14 + p.age * 55;
    ctx.globalAlpha = 0.35 * (1 - p.age / p.life);
    ctx.drawImage(SMOKE, p.x - size, p.y - size, size * 2, size * 2);
  }
  ctx.globalAlpha = 1;
}

function drawHud() {
  const speed = Math.round(Math.hypot(car.vx, car.vy) * 0.33);
  ctx.textBaseline = "top";
  ctx.fillStyle = "rgba(230, 232, 238, 0.9)";
  ctx.textAlign = "left";
  ctx.font = "600 34px system-ui, sans-serif";
  ctx.fillText(`${speed}`, 20, 16);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText("KM/H", 22, 54);

  ctx.textAlign = "right";
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillText(`SCORE ${score.total.toLocaleString()}`, viewWidth - 20, 18);
  ctx.font = "14px system-ui, sans-serif";
  ctx.fillText(`BEST DRIFT ${score.best.toLocaleString()}`, viewWidth - 20, 44);

  ctx.textAlign = "center";
  if (score.combo >= 50) {
    ctx.font = "italic 700 36px system-ui, sans-serif";
    ctx.fillText(`DRIFT ${Math.round(score.combo).toLocaleString()}`, viewWidth / 2, 22);
  } else if (score.messageTime > 0) {
    ctx.globalAlpha = Math.min(1, score.messageTime);
    ctx.fillStyle = score.messageColor;
    ctx.font = "italic 700 36px system-ui, sans-serif";
    ctx.fillText(score.message, viewWidth / 2, 22);
    ctx.globalAlpha = 1;
  }
  if (autopilot.on) {
    ctx.fillStyle = "rgba(185, 188, 198, 0.7)";
    ctx.font = "13px system-ui, sans-serif";
    ctx.fillText("AUTOPILOT · press an arrow key to drive", viewWidth / 2, 66);
  }
}

// ---------- Main loop ----------

let last = performance.now();
let fadeTimer = 0;

function frame(now) {
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;

  if (!autopilot.on) {
    autopilot.idle = keys.size ? 0 : autopilot.idle + dt;
    if (autopilot.idle > IDLE_SECONDS) autopilot.on = true;
  }

  // Two half steps per frame keep the physics steady.
  for (let k = 0; k < 2; k++) {
    const input = autopilot.on ? autopilotInput(dt / 2) : keyboardInput();
    const result = updateCar(dt / 2, input);
    updateScore(dt / 2, result);
  }
  updateSmoke(dt);
  updateCamera(dt);

  fadeTimer += dt;
  if (fadeTimer > 1) {
    fadeTimer = 0;
    skid.globalCompositeOperation = "destination-out";
    skid.fillStyle = "rgba(0, 0, 0, 0.05)";
    skid.fillRect(0, 0, skidCanvas.width, skidCanvas.height);
    skid.globalCompositeOperation = "source-over";
  }

  draw();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
