// The Upside Down: a quiet night street that flips into its dark, spore-filled mirror.
(function () {
  "use strict";

  var canvas = document.getElementById("world");
  var ctx = canvas.getContext("2d");
  var W = 0, H = 0, DPR = 1;

  var trees = [], houses = [], stars = [], bulbs = [], spores = [], vines = [], fog = [];
  var bolts = [];
  var flash = 0;            // 0..1 brightness of the latest lightning flash
  var flip = 1;             // 0 = normal world, 1 = upside down (current, animated)
  var flipTarget = 1;
  var nextStrike = 1.5;     // seconds until the next automatic lightning strike
  var time = 0;

  var BULB_COLORS = ["#ff3b30", "#ffcc00", "#34c759", "#0a84ff", "#ff9f0a", "#bf5af2"];

  function rand(a, b) { return a + Math.random() * (b - a); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function groundY() { return H * 0.78; }

  // ---- scene setup -------------------------------------------------------

  function build() {
    var gy = groundY();
    var i;

    stars = [];
    for (i = 0; i < 160; i++) {
      stars.push({ x: rand(0, W), y: rand(0, gy * 0.8), r: rand(0.4, 1.6), p: rand(0, 6.3) });
    }

    houses = [];
    var hx = W * 0.12;
    while (hx < W * 0.88) {
      var hw = rand(140, 220);
      var hh = rand(90, 140);
      var windows = [];
      var cols = Math.floor(hw / 55);
      for (var c = 0; c < cols; c++) {
        windows.push({ x: hx + 22 + c * (hw - 44) / Math.max(1, cols - 1 || 1), lit: Math.random() < 0.7 });
      }
      houses.push({ x: hx, w: hw, h: hh, roof: rand(40, 70), windows: windows });
      hx += hw + rand(90, 200);
    }

    trees = [];
    for (i = 0; i < Math.ceil(W / 28); i++) {
      trees.push({ x: rand(-20, W + 20), h: rand(90, 260), w: rand(30, 60), back: Math.random() < 0.55 });
    }
    trees.sort(function (a, b) { return (a.back ? 0 : 1) - (b.back ? 0 : 1); });

    // A string of lights hung in drooping loops across the street.
    bulbs = [];
    var spans = 5;
    var top = gy - 210;
    for (var s = 0; s < spans; s++) {
      var x0 = W * (0.04 + 0.92 * s / spans);
      var x1 = W * (0.04 + 0.92 * (s + 1) / spans);
      var n = 9;
      for (var k = 0; k < n; k++) {
        var t = (k + 0.5) / n;
        bulbs.push({
          x: lerp(x0, x1, t),
          y: top + Math.sin(t * Math.PI) * 45,
          color: BULB_COLORS[bulbs.length % BULB_COLORS.length],
          glow: 0.6,
          boost: 0
        });
      }
    }

    spores = [];
    var count = Math.round(W * H / 4500);
    for (i = 0; i < count; i++) spores.push(newSpore(true));

    vines = [];
    for (i = 0; i < 26; i++) {
      var vx = rand(0, W);
      vines.push({ x: vx, len: rand(60, 240), dir: Math.random() < 0.5 ? -1 : 1, seed: rand(0, 100), w: rand(2, 5) });
    }

    fog = [];
    for (i = 0; i < 7; i++) {
      fog.push({ x: rand(0, W), y: rand(gy - 120, gy + 40), r: rand(180, 380), v: rand(-12, 12) });
    }
  }

  function newSpore(anywhere) {
    return {
      x: rand(0, W),
      y: anywhere ? rand(0, H) : H + 10,
      r: rand(0.6, 2.6),
      vy: rand(-14, -4),
      phase: rand(0, 6.3),
      sway: rand(6, 22),
      a: rand(0.25, 0.9)
    };
  }

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    build();
  }

  // ---- lightning ---------------------------------------------------------

  function strike(tx, ty) {
    var pts = [];
    var x = tx + rand(-W * 0.15, W * 0.15);
    var y = -10;
    var steps = 14;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      pts.push({
        x: lerp(x, tx, t) + (i === 0 || i === steps ? 0 : rand(-28, 28)),
        y: lerp(y, ty, t)
      });
    }
    // One or two side branches.
    var branches = [];
    for (var b = 0; b < 2; b++) {
      var from = pts[Math.floor(rand(3, steps - 3))];
      var br = [{ x: from.x, y: from.y }];
      var bx = from.x, by = from.y, dir = Math.random() < 0.5 ? -1 : 1;
      for (var j = 0; j < 5; j++) {
        bx += dir * rand(10, 35);
        by += rand(15, 40);
        br.push({ x: bx, y: by });
      }
      branches.push(br);
    }
    bolts.push({ pts: pts, branches: branches, life: 1 });
    flash = 1;
    for (var k = 0; k < bulbs.length; k++) bulbs[k].boost = Math.max(bulbs[k].boost, rand(0.3, 1));
  }

  // ---- palette -----------------------------------------------------------

  function mixColor(c1, c2, t) {
    return "rgb(" +
      Math.round(lerp(c1[0], c2[0], t)) + "," +
      Math.round(lerp(c1[1], c2[1], t)) + "," +
      Math.round(lerp(c1[2], c2[2], t)) + ")";
  }

  // ---- drawing -----------------------------------------------------------

  function drawSky(u) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, mixColor([8, 14, 38], [26, 4, 8], u));
    g.addColorStop(0.6, mixColor([20, 30, 64], [70, 10, 18], u));
    g.addColorStop(1, mixColor([30, 40, 70], [18, 24, 34], u));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Stars fade out in the Upside Down; red storm clouds fade in.
    var starA = 1 - u;
    if (starA > 0.01) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        ctx.globalAlpha = starA * (0.5 + 0.5 * Math.sin(time * 2 + s.p));
        ctx.fillStyle = "#fff";
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, 6.283);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      // Moon
      ctx.fillStyle = "rgba(240,240,220," + starA * 0.9 + ")";
      ctx.beginPath();
      ctx.arc(W * 0.82, H * 0.16, 34, 0, 6.283);
      ctx.fill();
    }
    if (u > 0.01) {
      for (var c = 0; c < 6; c++) {
        var cx = ((c * 0.21 + time * 0.006 * (c % 2 ? 1 : -1)) % 1.2 + 1.2) % 1.2 * W - W * 0.1;
        var cy = H * (0.08 + 0.06 * (c % 3));
        var cg = ctx.createRadialGradient(cx, cy, 0, cx, cy, W * 0.3);
        var a = u * (0.25 + 0.5 * flash);
        cg.addColorStop(0, "rgba(160,20,30," + a + ")");
        cg.addColorStop(1, "rgba(160,20,30,0)");
        ctx.fillStyle = cg;
        ctx.fillRect(0, 0, W, H);
      }
    }
  }

  function drawTree(t, color) {
    var gy = groundY();
    ctx.fillStyle = color;
    ctx.beginPath();
    var layers = 4;
    for (var i = 0; i < layers; i++) {
      var base = gy - (t.h * i) / layers * 0.8;
      var halfW = t.w * (1 - i / (layers + 1)) * 0.6;
      ctx.moveTo(t.x - halfW, base);
      ctx.lineTo(t.x, base - t.h * 0.45);
      ctx.lineTo(t.x + halfW, base);
    }
    ctx.fill();
    ctx.fillRect(t.x - 3, gy - 14, 6, 14);
  }

  function drawHouses(u) {
    var gy = groundY();
    for (var i = 0; i < houses.length; i++) {
      var h = houses[i];
      ctx.fillStyle = mixColor([10, 12, 22], [12, 8, 12], u);
      ctx.fillRect(h.x, gy - h.h, h.w, h.h);
      ctx.beginPath();
      ctx.moveTo(h.x - 12, gy - h.h);
      ctx.lineTo(h.x + h.w / 2, gy - h.h - h.roof);
      ctx.lineTo(h.x + h.w + 12, gy - h.h);
      ctx.fill();
      for (var j = 0; j < h.windows.length; j++) {
        var win = h.windows[j];
        if (!win.lit) continue;
        // Warm windows go dark in the Upside Down, with only a faint flicker.
        var flick = u > 0.5 ? (Math.random() < 0.04 ? 0.5 : 0.05) : 1;
        var a = lerp(1, flick, u);
        ctx.fillStyle = "rgba(255,200,110," + 0.85 * a + ")";
        ctx.fillRect(win.x - 11, gy - h.h + 22, 22, 26);
      }
      ctx.fillStyle = mixColor([60, 40, 30], [20, 10, 12], u);
      ctx.fillRect(h.x + h.w / 2 - 10, gy - 40, 20, 40);
    }
  }

  function drawLights(u) {
    if (!bulbs.length) return;
    // Wire
    ctx.strokeStyle = "rgba(0,0,0,0.8)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(bulbs[0].x, bulbs[0].y);
    for (var i = 1; i < bulbs.length; i++) ctx.lineTo(bulbs[i].x, bulbs[i].y);
    ctx.stroke();

    for (var k = 0; k < bulbs.length; k++) {
      var b = bulbs[k];
      // Steady in the normal world, restless and failing in the Upside Down.
      var base = lerp(0.85, Math.random() < 0.08 ? 0.9 : 0.15, u);
      var g = Math.min(1, base + b.boost);
      var color = b.color;
      ctx.globalAlpha = g * 0.45;
      var rg = ctx.createRadialGradient(b.x, b.y + 6, 0, b.x, b.y + 6, 22);
      rg.addColorStop(0, color);
      rg.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rg;
      ctx.fillRect(b.x - 22, b.y - 16, 44, 44);
      ctx.globalAlpha = 0.35 + 0.65 * g;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y + 6, 4, 6, 0, 0, 6.283);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawVines(u) {
    if (u < 0.01) return;
    var gy = groundY();
    ctx.strokeStyle = "rgba(30,6,10," + u + ")";
    ctx.lineCap = "round";
    for (var i = 0; i < vines.length; i++) {
      var v = vines[i];
      ctx.lineWidth = v.w;
      ctx.beginPath();
      ctx.moveTo(v.x, gy);
      var steps = 18;
      var grow = v.len * u;
      for (var s = 1; s <= steps; s++) {
        var t = s / steps;
        var x = v.x + v.dir * t * grow * 0.6 + Math.sin(t * 6 + v.seed + time * 0.6) * 14 * t;
        var y = gy - t * grow;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  function drawGround(u) {
    var gy = groundY();
    ctx.fillStyle = mixColor([6, 10, 14], [10, 4, 6], u);
    ctx.fillRect(0, gy, W, H - gy);
    // Road
    ctx.fillStyle = mixColor([24, 26, 32], [26, 14, 18], u);
    ctx.fillRect(0, gy + 18, W, 50);
  }

  function drawFog(u, dt) {
    for (var i = 0; i < fog.length; i++) {
      var f = fog[i];
      f.x += f.v * dt;
      if (f.x < -f.r) f.x = W + f.r;
      if (f.x > W + f.r) f.x = -f.r;
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      var col = u > 0.5 ? "120,140,170" : "150,160,190";
      g.addColorStop(0, "rgba(" + col + "," + (0.08 + 0.12 * u) + ")");
      g.addColorStop(1, "rgba(" + col + ",0)");
      ctx.fillStyle = g;
      ctx.fillRect(f.x - f.r, f.y - f.r, f.r * 2, f.r * 2);
    }
  }

  function drawWorld(u, dt) {
    drawSky(u);
    var back = mixColor([14, 20, 34], [22, 10, 16], u);
    var front = mixColor([4, 6, 12], [6, 2, 4], u);
    for (var i = 0; i < trees.length; i++) {
      drawTree(trees[i], trees[i].back ? back : front);
    }
    drawGround(u);
    drawHouses(u);
    drawVines(u);
    drawLights(u);
    drawFog(u, dt);
  }

  function drawSpores(u, dt) {
    for (var i = 0; i < spores.length; i++) {
      var s = spores[i];
      s.y += s.vy * dt;
      s.phase += dt * 0.7;
      if (s.y < -10) spores[i] = s = newSpore(false);
      if (u < 0.01) continue;
      var x = s.x + Math.sin(s.phase) * s.sway;
      ctx.globalAlpha = s.a * u;
      ctx.fillStyle = "#d8dde6";
      ctx.beginPath();
      ctx.arc(x, s.y, s.r, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBolts(dt) {
    for (var i = bolts.length - 1; i >= 0; i--) {
      var b = bolts[i];
      b.life -= dt * 2.2;
      if (b.life <= 0) { bolts.splice(i, 1); continue; }
      var hot = flip > 0.5;
      var a = Math.max(0, b.life) * (Math.random() < 0.2 ? 0.4 : 1);
      ctx.save();
      ctx.shadowBlur = 25;
      ctx.shadowColor = hot ? "rgba(255,40,40,1)" : "rgba(150,180,255,1)";
      ctx.strokeStyle = hot ? "rgba(255,120,110," + a + ")" : "rgba(220,230,255," + a + ")";
      ctx.lineWidth = 3;
      line(b.pts);
      ctx.lineWidth = 1.5;
      for (var k = 0; k < b.branches.length; k++) line(b.branches[k]);
      ctx.restore();
    }
  }

  function line(pts) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  // ---- main loop ---------------------------------------------------------

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    time += dt;

    // Ease the flip toward its target. The world turns over through its middle.
    var speed = 0.9;
    if (flip < flipTarget) flip = Math.min(flipTarget, flip + dt * speed);
    if (flip > flipTarget) flip = Math.max(flipTarget, flip - dt * speed);
    var p = flip * flip * (3 - 2 * flip);        // smoothstep
    var scaleY = Math.cos(p * Math.PI);          // 1 -> 0 -> -1
    var u = p;                                   // how far into the Upside Down

    if (flipTarget === 1 && flip === 1) {
      nextStrike -= dt;
      if (nextStrike <= 0) {
        strike(rand(W * 0.1, W * 0.9), rand(H * 0.25, H * 0.6));
        nextStrike = rand(2, 6);
      }
    }

    for (var i = 0; i < bulbs.length; i++) bulbs[i].boost = Math.max(0, bulbs[i].boost - dt * 1.6);
    flash = Math.max(0, flash - dt * 2.5);

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(0, H / 2);
    ctx.scale(1, scaleY === 0 ? 0.0001 : scaleY);
    ctx.translate(0, -H / 2);
    drawWorld(u, dt);
    ctx.restore();

    drawSpores(u, dt);
    drawBolts(dt);

    if (flash > 0) {
      ctx.fillStyle = u > 0.5
        ? "rgba(255,40,40," + flash * 0.25 + ")"
        : "rgba(200,220,255," + flash * 0.2 + ")";
      ctx.fillRect(0, 0, W, H);
    }

    // Dark vignette
    var vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0," + (0.45 + 0.25 * u) + ")");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(frame);
  }

  // ---- input -------------------------------------------------------------

  canvas.addEventListener("pointerdown", function (e) {
    canvas.focus();
    strike(e.clientX, e.clientY);
  });

  window.addEventListener("keydown", function (e) {
    if (e.code === "Space") {
      e.preventDefault();
      flipTarget = flipTarget === 1 ? 0 : 1;
      nextStrike = 1.2;
      return;
    }
    if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key) && bulbs.length) {
      var idx = (e.key.toLowerCase().charCodeAt(0) - 97) % bulbs.length;
      // Light the bulb for the letter, and a few of its neighbours a little.
      bulbs[idx].boost = 1.6;
      for (var d = 1; d <= 2; d++) {
        if (bulbs[idx - d]) bulbs[idx - d].boost = Math.max(bulbs[idx - d].boost, 0.6 / d);
        if (bulbs[idx + d]) bulbs[idx + d].boost = Math.max(bulbs[idx + d].boost, 0.6 / d);
      }
    }
  });

  window.addEventListener("resize", resize);
  resize();
  canvas.focus();
  requestAnimationFrame(frame);
})();
