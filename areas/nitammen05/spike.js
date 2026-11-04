// Touchdown Spike: a football player runs into the end zone and spikes the ball.
// Everything is drawn in a fixed 1280 x 800 "world" and scaled to fit the window.
// Space or a click restarts the animation; it also restarts by itself.

const canvas = document.getElementById("field");
const ctx = canvas.getContext("2d");

const W = 1280;          // world width
const H = 800;           // world height
const GROUND = 640;      // y of the player's feet
const GOAL_LINE = 820;   // x where the end zone starts
const LOOP = 7;          // seconds before the scene starts over

// Timeline, in seconds since the start of a run.
const RUN_END = 2.2;     // player reaches the end zone
const RAISE_END = 2.6;   // ball held high
const SPIKE_END = 2.75;  // arm has swung down
const RELEASE = 2.68;    // moment the ball leaves the hand

let startTime = null;    // set on the first frame, and on restart
let ball = null;         // the flying ball, once it is released
let confetti = [];
let dust = [];
let scale = 1, offsetX = 0, offsetY = 0;

// ---------- small helpers ----------

const clamp01 = (v) => Math.max(0, Math.min(1, v));
const lerp = (a, b, k) => a + (b - a) * k;
const easeInOut = (k) => k * k * (3 - 2 * k);
const rand = (a, b) => a + Math.random() * (b - a);

// A point at distance len from (x, y), at angle a measured from straight down.
// Positive angles point forward (to the right, the way the player runs).
function limb(x, y, a, len) {
  return { x: x + Math.sin(a) * len, y: y + Math.cos(a) * len };
}

function line(p, q, width, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(p.x, p.y);
  ctx.lineTo(q.x, q.y);
  ctx.stroke();
}

// ---------- the stadium (crowd dots are made once so they don't flicker) ----------

const crowd = [];
for (let i = 0; i < 900; i++) {
  crowd.push({
    x: Math.random() * W,
    y: 190 + Math.random() * 240,
    color: ["#d6453d", "#f2c14e", "#ffffff", "#3d6fd6", "#2b2b3a"][i % 5],
    phase: Math.random() * Math.PI * 2,
  });
}

function drawStadium(t) {
  // night sky
  const sky = ctx.createLinearGradient(0, 0, 0, 200);
  sky.addColorStop(0, "#0b1026");
  sky.addColorStop(1, "#283a6b");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, 200);

  // stadium lights
  for (const lx of [200, 640, 1080]) {
    ctx.fillStyle = "#fffbe0";
    ctx.fillRect(lx - 40, 60, 80, 24);
    ctx.fillStyle = "rgba(255, 251, 224, 0.12)";
    ctx.beginPath();
    ctx.arc(lx, 72, 90, 0, Math.PI * 2);
    ctx.fill();
  }

  // stands with a crowd that bounces faster once the ball is spiked
  ctx.fillStyle = "#1c2238";
  ctx.fillRect(0, 180, W, 270);
  const excited = t > RELEASE ? 12 : 3;
  for (const c of crowd) {
    const bob = Math.sin(t * excited + c.phase) * (t > RELEASE ? 4 : 1);
    ctx.fillStyle = c.color;
    ctx.fillRect(c.x, c.y + bob, 5, 5);
  }

  // wall between stands and field
  ctx.fillStyle = "#0e3b6e";
  ctx.fillRect(0, 440, W, 24);

  // grass with mowing stripes
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i % 2 ? "#2f8a3a" : "#34963f";
    ctx.fillRect(i * 128, 464, 128, H - 464);
  }

  // end zone paint, goal line, and lettering
  ctx.fillStyle = "#a3242f";
  ctx.fillRect(GOAL_LINE, 464, W - GOAL_LINE, H - 464);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(GOAL_LINE - 6, 464, 12, H - 464);
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
  ctx.textAlign = "center";
  ctx.fillText("END ZONE", (GOAL_LINE + W) / 2, 760);

  // goal post at the back of the end zone
  ctx.strokeStyle = "#f2d43d";
  ctx.lineWidth = 10;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(1200, 520);  // post
  ctx.lineTo(1200, 300);
  ctx.moveTo(1140, 300);  // crossbar
  ctx.lineTo(1260, 300);
  ctx.moveTo(1140, 300);  // uprights
  ctx.lineTo(1140, 120);
  ctx.moveTo(1260, 300);
  ctx.lineTo(1260, 120);
  ctx.stroke();
}

// ---------- the player's pose at time t ----------

function poseAt(t) {
  const p = {
    x: 0, jump: 0, lean: 0,
    run: 0, legPhase: t * 14,
    armR: 0.4, elbowR: 1.6,      // front arm (holds the ball)
    armL: 0, elbowL: 1.0,        // back arm
    ballInHand: t < RELEASE,
  };

  // Running in from the left, slowing down near the end.
  const k = clamp01(t / RUN_END);
  p.x = lerp(-80, 920, 1 - (1 - k) * (1 - k));
  p.run = t < RUN_END ? 1 : 1 - clamp01((t - RUN_END) / 0.25);
  p.lean = 0.18 * p.run;
  p.armL = -Math.sin(p.legPhase) * 0.8 * p.run;

  if (t >= RUN_END && t < RAISE_END) {
    // Raise the ball high overhead.
    const r = easeInOut((t - RUN_END) / (RAISE_END - RUN_END));
    p.armR = lerp(0.4, 2.9, r);
    p.elbowR = lerp(1.6, 0.2, r);
    p.lean = lerp(p.lean, -0.12, r);
  } else if (t >= RAISE_END && t < SPIKE_END) {
    // Whip the arm down hard.
    const r = (t - RAISE_END) / (SPIKE_END - RAISE_END);
    p.armR = lerp(2.9, 0.5, r * r);
    p.elbowR = lerp(0.2, 0, r);
    p.lean = lerp(-0.12, 0.25, r);
  } else if (t >= SPIKE_END) {
    // Celebrate: both arms up, jumping.
    const r = clamp01((t - SPIKE_END) / 0.3);
    p.armR = lerp(0.5, 2.7, r);
    p.armL = lerp(0, -2.7, r);
    p.elbowR = 0.3;
    p.elbowL = -0.3;
    p.lean = lerp(0.25, -0.05, r);
    p.jump = Math.abs(Math.sin((t - SPIKE_END) * 6)) * 50 * r;
  }
  return p;
}

// ---------- drawing the player ----------

const JERSEY = "#b81e2a", PANTS = "#f2d43d", SKIN = "#8d5a3b", SOCK = "#ffffff";

function drawPlayer(p) {
  const hip = { x: p.x, y: GROUND - 96 - p.jump };
  const shoulder = limb(hip.x, hip.y, Math.PI - p.lean, 75);
  const parts = {};

  // Legs: s = +1 is the front leg, -1 the back leg.
  for (const s of [1, -1]) {
    const swing = Math.sin(p.legPhase) * s * 0.7 * p.run + s * 0.08;
    const bend = p.run * 0.9 * (1 + Math.cos(p.legPhase + (s > 0 ? 0 : Math.PI))) / 2;
    const knee = limb(hip.x, hip.y, swing, 48);
    const foot = limb(knee.x, knee.y, swing - bend, 48);
    parts[s] = { knee, foot };
  }

  // Arms: return the elbow and hand for a shoulder angle and an elbow bend.
  const arm = (a, bend) => {
    const elbow = limb(shoulder.x, shoulder.y, a, 38);
    return { elbow, hand: limb(elbow.x, elbow.y, a + bend, 36) };
  };
  const front = arm(p.armR, p.elbowR);
  const back = arm(p.armL, p.elbowL);

  // Back leg and back arm first, slightly darker, so they look farther away.
  line(hip, parts[-1].knee, 22, "#c9ad2f");
  line(parts[-1].knee, parts[-1].foot, 16, "#d9d9d9");
  line(shoulder, back.elbow, 16, "#8f1720");
  line(back.elbow, back.hand, 13, "#6e4630");

  // Torso and jersey number.
  line(hip, shoulder, 40, JERSEY);
  ctx.save();
  ctx.translate((hip.x + shoulder.x) / 2, (hip.y + shoulder.y) / 2);
  ctx.rotate(p.lean);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 22px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("88", 0, 0);
  ctx.restore();

  // Helmet with a face mask, facing right.
  const head = limb(shoulder.x, shoulder.y, Math.PI - p.lean, 26);
  ctx.fillStyle = JERSEY;
  ctx.beginPath();
  ctx.arc(head.x, head.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#dddddd";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(head.x + 10, head.y - 2);
  ctx.lineTo(head.x + 26, head.y - 2);
  ctx.moveTo(head.x + 10, head.y + 8);
  ctx.lineTo(head.x + 24, head.y + 8);
  ctx.moveTo(head.x + 24, head.y - 4);
  ctx.lineTo(head.x + 22, head.y + 12);
  ctx.stroke();

  // Front leg and front arm on top.
  line(hip, parts[1].knee, 22, PANTS);
  line(parts[1].knee, parts[1].foot, 16, SOCK);
  line(shoulder, front.elbow, 16, JERSEY);
  line(front.elbow, front.hand, 13, SKIN);

  return front.hand;
}

// ---------- the ball ----------

function drawBall(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#7a3e1d";
  ctx.beginPath();
  ctx.ellipse(0, 0, 22, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = 2;
  ctx.beginPath();          // laces
  ctx.moveTo(-8, 0);
  ctx.lineTo(8, 0);
  for (let i = -6; i <= 6; i += 4) {
    ctx.moveTo(i, -4);
    ctx.lineTo(i, 4);
  }
  ctx.stroke();
  ctx.restore();
}

// Move the ball with gravity. A football bounces at odd angles, so each bounce
// gets a random push sideways and a random new spin.
function updateBall(dt) {
  const floor = GROUND - 10;
  ball.vy += 2200 * dt;
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;
  ball.angle += ball.spin * dt;

  if (ball.y > floor) {
    ball.y = floor;
    if (ball.bounces === 0) burst(ball.x);
    ball.bounces++;
    ball.vy = -Math.abs(ball.vy) * 0.55;
    ball.vx = ball.vx * 0.6 + rand(-260, 260);
    ball.spin = rand(-18, 18);
    if (Math.abs(ball.vy) < 80) {   // too slow to bounce: roll to a stop
      ball.vy = 0;
      ball.vx *= 0.9;
      ball.spin = ball.vx / 20;
    }
  }
  // keep the ball on screen
  if (ball.x < 20 || ball.x > W - 20) ball.vx = -ball.vx;
  ball.x = Math.max(20, Math.min(W - 20, ball.x));
}

// ---------- particles: dust where the ball hits, confetti from above ----------

function burst(x) {
  for (let i = 0; i < 30; i++) {
    dust.push({ x, y: GROUND, vx: rand(-200, 200), vy: rand(-220, -40), life: 1 });
  }
  for (let i = 0; i < 160; i++) {
    confetti.push({
      x: rand(0, W), y: rand(-400, 0),
      vy: rand(80, 180), sway: rand(0, Math.PI * 2),
      spin: rand(-6, 6), angle: 0,
      color: ["#f2d43d", "#ffffff", "#b81e2a", "#3d6fd6"][i % 4],
    });
  }
}

function updateParticles(dt) {
  for (const d of dust) {
    d.vy += 500 * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.life -= dt * 1.5;
  }
  dust = dust.filter((d) => d.life > 0);
  for (const c of confetti) {
    c.y += c.vy * dt;
    c.sway += dt * 3;
    c.x += Math.sin(c.sway) * 40 * dt;
    c.angle += c.spin * dt;
  }
  confetti = confetti.filter((c) => c.y < H + 20);
}

function drawParticles() {
  for (const d of dust) {
    ctx.fillStyle = `rgba(200, 180, 140, ${d.life})`;
    ctx.beginPath();
    ctx.arc(d.x, d.y, 5, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const c of confetti) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.rotate(c.angle);
    ctx.fillStyle = c.color;
    ctx.fillRect(-5, -3, 10, 6);
    ctx.restore();
  }
}

function drawBanner(t) {
  const a = clamp01((t - 2.9) / 0.4);
  if (a === 0) return;
  const size = 96 + Math.sin(t * 8) * 4;
  ctx.font = `900 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = `rgba(14, 59, 110, ${a})`;
  ctx.strokeText("TOUCHDOWN!", W / 2, 130);
  ctx.fillStyle = `rgba(242, 212, 61, ${a})`;
  ctx.fillText("TOUCHDOWN!", W / 2, 130);
}

// ---------- main loop ----------

function restart() {
  startTime = null;
  ball = null;
  confetti = [];
  dust = [];
}

// Fit the 1280 x 800 world inside the window, centered.
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  scale = Math.min(canvas.width / W, canvas.height / H);
  offsetX = (canvas.width - W * scale) / 2;
  offsetY = (canvas.height - H * scale) / 2;
}

let lastNow = null;

function frame(now) {
  if (startTime === null) startTime = now;
  const dt = lastNow === null ? 0 : Math.min(0.05, (now - lastNow) / 1000);
  lastNow = now;
  let t = (now - startTime) / 1000;
  if (t > LOOP) {
    restart();
    startTime = now;
    t = 0;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = "#10162b";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);

  drawStadium(t);
  const pose = poseAt(t);
  const hand = drawPlayer(pose);

  if (pose.ballInHand) {
    drawBall(hand.x, hand.y, -Math.PI / 2 + pose.armR);
  } else {
    if (ball === null) {
      // Released: fire the ball down and forward, spinning.
      ball = { x: hand.x, y: hand.y, vx: 250, vy: 1500, angle: 1.2, spin: 10, bounces: 0 };
    }
    updateBall(dt);
    drawBall(ball.x, ball.y, ball.angle);
  }

  updateParticles(dt);
  drawParticles();
  drawBanner(t);

  requestAnimationFrame(frame);
}

window.addEventListener("resize", resize);
window.addEventListener("click", restart);
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    restart();
  }
});

resize();
requestAnimationFrame(frame);
