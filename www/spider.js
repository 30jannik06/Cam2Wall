// A spider that wanders over the screen. Loaded on demand (only while the "spider" state is on).
//
// Walking is procedural: every foot stays planted on the "ground" until the body has moved too far away, then it
// steps to a new spot (alternating tetrapod gait, like a real spider).
//
// The spider plays little "acts" so it stays unpredictable:
//   walk    - wanders around at different sizes (it seems to move towards / away from the viewer), then leaves
//   emerge  - crawls out of the picture: starts tiny and faint "deep in the image" and grows as it comes closer
//   recede  - the opposite: runs away and shrinks into the picture
//   lunge   - suddenly jumps towards the screen (gets big for a moment), then bolts off
//   rappel  - drops from the top edge on a silk thread, dangles, and climbs back up
// Click it to squash it - it comes back a while later.

const K = 1.05;           // base size factor (body ~ 22px, leg span ~ 60px at scale 1)
const BOX = 220;          // canvas size in CSS px (fits the legs up to MAX_SCALE)
const MAX_SCALE = 2.8;
const SPEED = [70, 150];  // px/s while walking (at scale 1)
const PAUSE = [0.4, 3];   // s standing still
const RESPAWN_S = 9;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const easeOut = t => 1 - (1 - t) * (1 - t);
const easeIn = t => t * t;

// a random point just outside one of the four screen edges
function edgePoint() {
    const m = BOX * 0.6;
    return [[-m, rand(0, innerHeight)], [innerWidth + m, rand(0, innerHeight)],
            [rand(0, innerWidth), -m], [rand(0, innerWidth), innerHeight + m]][Math.floor(rand(0, 4))];
}
const screenPoint = () => [rand(BOX * 0.5, innerWidth - BOX * 0.5), rand(BOX * 0.5, innerHeight - BOX * 0.5)];

// four leg pairs: hip position on the body and resting foot position (body coordinates at scale 1, head = -y)
const HIP_Y = [-6.5, -2.5, 1.5, 5.5];
const REST = [[17, -25], [25, -11], [25, 8], [18, 26]];

function makeLegs() {
    const legs = [];
    for (let p = 0; p < 4; p++) {
        for (const side of [-1, 1]) {
            legs.push({
                side, pair: p,
                hip: [side * 3, HIP_Y[p]],
                rest: [side * REST[p][0], REST[p][1]],
                group: (p + (side > 0 ? 1 : 0)) % 2,        // alternating tetrapod gait
                foot: [0, 0], from: [0, 0], t: 1, dur: 0.12,
            });
        }
    }
    return legs;
}

// two-bone IK: knee position for a hip and a foot; the knee bends away from the body
function knee(hip, foot, outward, femur, tibia) {
    const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
    const len = Math.hypot(dx, dy) || 0.001;
    const d = Math.min(len, femur + tibia - 0.01);
    const ux = dx / len, uy = dy / len;
    const a = (d * d + femur * femur - tibia * tibia) / (2 * d);
    const h = Math.sqrt(Math.max(0, femur * femur - a * a));
    let px = -uy, py = ux;
    if (px * outward[0] + py * outward[1] < 0) { px = -px; py = -py; }
    return [hip[0] + ux * a + px * h, hip[1] + uy * a + py * h];
}

export function startSpider() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.round(BOX * dpr);
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${BOX}px;height:${BOX}px;z-index:30;pointer-events:none;` +
        "will-change:transform,opacity;opacity:0";
    const ctx = canvas.getContext("2d");
    canvas.className = "spider";
    document.body.append(canvas);

    let thread = null;       // silk thread element while rappelling

    const legs = makeLegs();

    // ---------------------------------------------------------------- state
    let x = -999, y = -999, angle = 0, v = 0;
    let s = 1, sTarget = 1, alpha = 0;                 // size factor (depth) and opacity
    let tx = 0, ty = 0, speed = 100, leaving = false, stops = 3, wait = 0;
    let mode = "lurk", t = 0, dur = 1, act = {};       // current act and its clock
    let phase = 0, idleTwitch = 1, lastFilterS = -1;
    let last = performance.now(), raf = 0, stopped = false, dead = false, deadTimer = 0, eat = false;

    const S = () => K * s;                             // scale in px per body unit
    const rot = (px, py) => {                          // body offset -> screen offset
        const c = Math.cos(angle), sn = Math.sin(angle);
        return [px * c - py * sn, px * sn + py * c];
    };
    const worldRest = l => { const r = rot(l.rest[0] * S(), l.rest[1] * S()); return [x + r[0], y + r[1]]; };
    const plantFeet = () => { for (const l of legs) { l.foot = worldRest(l); l.t = 1; } };

    const face = (px, py) => { angle = Math.atan2(py - y, px - x) + Math.PI / 2; };   // head points to -y

    // ---------------------------------------------------------------- acts
    function lurk(seconds) {
        mode = "lurk"; t = seconds; v = 0; alpha = 0;
        if (thread) { thread.remove(); thread = null; }
    }

    function pickAct() {
        const r = Math.random();
        if (r < 0.36) beginWalk();
        else if (r < 0.60) beginEmerge();
        else if (r < 0.80) beginRappel();
        else beginRecede();
    }

    function beginWalk() {
        mode = "walk"; leaving = false; stops = Math.floor(rand(2, 5)); wait = 0;
        [x, y] = edgePoint();
        s = rand(0.8, 1.3); sTarget = s; alpha = 1;
        [tx, ty] = screenPoint();
        speed = rand(...SPEED);
        face(tx, ty); plantFeet();
    }

    function beginEmerge() {                 // out of the picture: tiny + faint -> big + sharp
        mode = "emerge"; t = 0; dur = rand(4.5, 7);
        [x, y] = screenPoint();
        s = 0.14; alpha = 0;
        angle = rand(0, Math.PI * 2);
        act = { turn: rand(-0.35, 0.35), end: rand(2.0, 2.6) };
        plantFeet();
    }

    function beginRecede() {                 // into the picture: big -> tiny + faint
        mode = "recede"; t = 0; dur = rand(3, 4.5);
        [x, y] = screenPoint();
        s = rand(1.5, 2.2); alpha = 1;
        angle = rand(0, Math.PI * 2);
        act = { s0: s, turn: rand(-0.4, 0.4) };
        plantFeet();
    }

    function beginLunge() {                  // from the current spot: jump at the viewer, then bolt
        mode = "lunge"; t = 0; dur = 0.62;
        act = { s0: s, s1: Math.min(MAX_SCALE, s * 2.4 + 0.4) };
        v = 0; wait = 0;
    }

    function beginRappel() {                 // drop on a thread from the top edge
        mode = "rappel"; t = 0;
        s = rand(1, 1.5); alpha = 1; angle = Math.PI;          // head down, abdomen up
        const W = innerWidth, H = innerHeight;
        act = { x0: rand(0.12, 0.88) * W, yHang: rand(0.3, 0.65) * H, down: rand(0.9, 1.3), hang: rand(1.8, 3.6), up: rand(2.2, 3) };
        x = act.x0; y = -BOX * 0.5;
        thread = document.createElement("div");
        thread.style.cssText = "position:fixed;top:0;width:1.5px;z-index:29;pointer-events:none;" +
            "background:linear-gradient(rgba(220,225,230,.1),rgba(220,225,230,.65));opacity:.8";
        document.body.append(thread);
        plantFeet();
    }

    function flee() {                        // bolt off the screen
        mode = "walk"; leaving = true; wait = 0;
        [tx, ty] = edgePoint();
        speed = rand(260, 380);
        sTarget = Math.max(0.9, s * 0.8);
    }

    function nextTarget() {
        [tx, ty] = screenPoint();
        speed = rand(...SPEED) * (Math.random() < 0.15 ? 2 : 1);   // an occasional sprint
        sTarget = Math.random() < 0.18 ? rand(1.6, 2.1) : rand(0.7, 1.4);   // drifts closer / further away
    }

    // ---------------------------------------------------------------- legs
    function stepLegs(dt, moving) {
        const Sx = S();
        const stepping = [false, false];
        for (const l of legs) if (l.t < 1) stepping[l.group] = true;
        const dirx = Math.sin(angle), diry = -Math.cos(angle);
        const lead = moving ? v * 0.07 + 3 * Sx : 0;

        for (const l of legs) {
            const rest = worldRest(l);
            const target = [rest[0] + dirx * lead, rest[1] + diry * lead];
            if (l.t < 1) {   // swing phase: the landing spot follows the body while the foot is in the air
                l.t = Math.min(1, l.t + dt / l.dur);
                const e = l.t * l.t * (3 - 2 * l.t);
                l.foot = [lerp(l.from[0], target[0], e), lerp(l.from[1], target[1], e)];
                continue;
            }
            const dist = Math.hypot(l.foot[0] - rest[0], l.foot[1] - rest[1]);
            if ((dist > 6 * Sx && !stepping[1 - l.group]) || dist > 12 * Sx) {
                l.from = l.foot.slice();
                l.dur = clamp(0.1 - v / s * 0.0004, 0.05, 0.1);
                l.t = 0;
                stepping[l.group] = true;
            }
        }
    }

    function dangleLegs(time) {              // legs hang loosely while rappelling
        legs.forEach((l, i) => {
            const r = rot(l.rest[0] * S() * 0.78, l.rest[1] * S() * 0.78);
            l.foot = [x + r[0] + Math.sin(time / 90 + i * 1.7) * 3 * S(), y + r[1] + Math.cos(time / 110 + i * 2.3) * 3 * S()];
            l.t = 1;
        });
    }

    // ---------------------------------------------------------------- drawing
    function draw(time) {
        const C = BOX / 2, Sx = S(), femur = 15 * Sx, tibia = 17 * Sx;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, BOX, BOX);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const sway = Math.sin(phase * 0.9) * (v > 8 ? 0.9 * s : 0);
        const [swx, swy] = rot(sway, 0);
        const bx = C + swx, by = C + swy;

        for (const l of legs) {
            const h = rot(l.hip[0] * Sx, l.hip[1] * Sx);
            const hip = [bx + h[0], by + h[1]];
            const foot = [l.foot[0] - x + C, l.foot[1] - y + C];
            const k = knee(hip, foot, rot(l.side, 0), femur, tibia);
            ctx.beginPath();
            ctx.moveTo(hip[0], hip[1]); ctx.lineTo(k[0], k[1]); ctx.lineTo(foot[0], foot[1]);
            ctx.strokeStyle = "rgba(150,160,170,.28)"; ctx.lineWidth = 3.6 * s; ctx.stroke();   // faint rim: visible on dark video
            ctx.beginPath();
            ctx.moveTo(hip[0], hip[1]); ctx.lineTo(k[0], k[1]);
            ctx.strokeStyle = "#171717"; ctx.lineWidth = 2.5 * s; ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(k[0], k[1]); ctx.lineTo(foot[0], foot[1]);
            ctx.strokeStyle = "#1d1d1d"; ctx.lineWidth = 1.6 * s; ctx.stroke();
            ctx.beginPath(); ctx.arc(k[0], k[1], 1.5 * s, 0, 6.3); ctx.fillStyle = "#262626"; ctx.fill();
        }

        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);
        const bob = 1 + (v > 8 ? Math.sin(phase * 1.8) * 0.02 : Math.sin(time / 700) * 0.012);
        ctx.scale(Sx * bob, Sx * bob);

        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.6;          // pedipalps
        for (const sd of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(sd * 2, -9); ctx.lineTo(sd * 3.6, -14); ctx.lineTo(sd * 2.2, -16.5); ctx.stroke();
        }
        let g = ctx.createRadialGradient(-2, 8, 1, 0, 11, 13);     // abdomen
        g.addColorStop(0, "#3a3733"); g.addColorStop(0.55, "#1a1816"); g.addColorStop(1, "#090909");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 11, 8.6, 12, 0, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "rgba(150,160,170,.3)"; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.fillStyle = "rgba(200,190,170,.16)";
        ctx.beginPath(); ctx.ellipse(0, 9, 2.4, 4.4, 0, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 16, 1.6, 2.6, 0, 0, 6.3); ctx.fill();
        g = ctx.createRadialGradient(-1.5, -5.5, 1, 0, -3, 8);     // cephalothorax
        g.addColorStop(0, "#413d38"); g.addColorStop(1, "#0d0d0d");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -3, 5.8, 7.4, 0, 0, 6.3); ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#c53030";                                  // eyes
        for (const [ex, ey, r] of [[-1.7, -8.6, 1], [1.7, -8.6, 1], [-3.2, -6.8, 0.8], [3.2, -6.8, 0.8]]) {
            ctx.beginPath(); ctx.arc(ex, ey, r, 0, 6.3); ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.beginPath(); ctx.arc(-1.4, -8.9, 0.35, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.arc(2.0, -8.9, 0.35, 0, 6.3); ctx.fill();
        ctx.restore();
    }

    function drawSplat() {
        const C = BOX / 2, Sx = S();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, BOX, BOX);
        ctx.fillStyle = "rgba(45,58,22,.9)";
        const blobs = [[0, 0, 11, 8], [-13, -5, 3.5, 3], [12, 7, 3, 2.5], [4, -14, 2.5, 2.2], [-9, 12, 2.5, 2], [17, -5, 1.8, 1.6]];
        for (const [bx, by, rx, ry] of blobs) { ctx.beginPath(); ctx.ellipse(C + bx * Sx, C + by * Sx, rx * Sx, ry * Sx, 0.5, 0, 6.3); ctx.fill(); }
        ctx.strokeStyle = "rgba(20,25,10,.8)"; ctx.lineWidth = 1.2 * s;
        for (let i = 0; i < 8; i++) {          // crumpled legs
            const a = i * 0.8 + 0.3;
            ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * 8 * Sx, C + Math.sin(a) * 6 * Sx);
            ctx.lineTo(C + Math.cos(a + 0.3) * 17 * Sx, C + Math.sin(a + 0.3) * 13 * Sx); ctx.stroke();
        }
    }

    // depth cues: bigger = closer = softer focus and a bigger, softer shadow
    function updateFilter() {
        if (Math.abs(s - lastFilterS) < 0.04) return;
        lastFilterS = s;
        const blur = s > 1.7 ? (s - 1.7) * 1.1 : s < 0.45 ? (0.45 - s) * 1.6 : 0;
        canvas.style.filter = `drop-shadow(0 ${(2.2 * s).toFixed(1)}px ${(1.6 * s).toFixed(1)}px rgba(0,0,0,.45))` +
            (blur > 0.05 ? ` blur(${blur.toFixed(2)}px)` : "");
    }

    // ---------------------------------------------------------------- main loop
    function steer(dt, mul) {                // turn towards the target, returns the wanted speed
        const want = Math.atan2(ty - y, tx - x) + Math.PI / 2;
        const diff = ((want - angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        angle += clamp(diff, -4.5 * dt, 4.5 * dt);
        return speed * Math.pow(s, 0.8) * mul * (Math.abs(diff) > 1 ? 0.15 : 1);   // pivot first, then run
    }

    function frame(now) {
        if (stopped) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;

        if (dead) {
            t -= dt;
            if (t <= 0) { dead = false; canvas.style.transition = ""; lurk(rand(1, 4)); }
            return;
        }

        let vTarget = 0, hanging = false;

        switch (mode) {
            case "lurk":
                t -= dt;
                if (t <= 0) pickAct();
                break;

            case "walk": {
                s += (sTarget - s) * Math.min(1, dt * 0.7);
                const dist = Math.hypot(tx - x, ty - y);
                const gone = x < -BOX * 0.45 || y < -BOX * 0.45 || x > innerWidth + BOX * 0.45 || y > innerHeight + BOX * 0.45;
                if (leaving && gone) { lurk(rand(12, 45)); break; }          // left the screen: wait outside
                if (wait > 0) {
                    wait -= dt;
                } else if (dist < Math.max(5, v * 0.09)) {                   // arrived (generous at high speed)
                    v *= 0.3;
                    if (Math.random() < 0.14) { beginLunge(); break; }
                    wait = rand(...PAUSE);
                    if (--stops <= 0) {
                        if (Math.random() < 0.3) { mode = "recede"; t = 0; dur = rand(2.5, 4); act = { s0: s, turn: rand(-0.4, 0.4) }; break; }
                        leaving = true; [tx, ty] = edgePoint(); speed = rand(...SPEED);
                    } else nextTarget();
                } else {
                    vTarget = steer(dt, 1);
                }
                break;
            }

            case "emerge": {
                t += dt;
                const p = clamp(t / dur, 0, 1);
                s = lerp(0.14, act.end, easeIn(p));
                alpha = clamp(p * 4, 0, 1);
                angle += act.turn * dt;
                vTarget = (38 + 45 * p) * Math.pow(s, 0.8) * 1.4;
                if (p >= 1) { flee(); alpha = 1; }
                break;
            }

            case "recede": {
                t += dt;
                const p = clamp(t / dur, 0, 1);
                s = lerp(act.s0, 0.1, easeIn(p));
                alpha = 1 - clamp((p - 0.35) / 0.65, 0, 1);
                angle += act.turn * dt;
                vTarget = (70 - 25 * p) * Math.pow(s, 0.8) * 1.5;
                if (p >= 1) lurk(rand(8, 25));
                break;
            }

            case "lunge": {
                t += dt;
                const p = t / dur;
                if (p < 0.4) s = lerp(act.s0, act.s1, easeOut(p / 0.4));               // jump at the viewer
                else if (p < 0.6) s = act.s1 + Math.sin(t * 90) * 0.03;                 // hold, trembling
                else { flee(); s = act.s1; sTarget = Math.max(1, act.s0 * 0.9); }        // bolt
                idleTwitch = 0;
                break;
            }

            case "rappel": {
                t += dt;
                const a = act;
                hanging = true;
                if (t < a.down) {
                    y = lerp(-BOX * 0.5, a.yHang, easeOut(t / a.down));
                } else if (t < a.down + a.hang) {
                    const h = t - a.down;
                    y = a.yHang + Math.sin(h * 3.1) * 6 * s * Math.exp(-h * 0.5) + Math.sin(h * 1.3) * 3;
                    x = a.x0 + Math.sin(h * 1.1) * 7 * s;
                    angle = Math.PI + Math.sin(h * 1.4) * 0.12;
                } else {
                    const u = clamp((t - a.down - a.hang) / a.up, 0, 1);
                    y = lerp(a.yHang, -BOX * 0.6, easeIn(u));
                    if (u >= 1) { lurk(rand(10, 35)); break; }
                }
                if (thread) { thread.style.left = `${x - 0.75}px`; thread.style.height = `${Math.max(0, y)}px`; }
                dangleLegs(now);
                break;
            }
        }

        if (!hanging) {
            v += (vTarget - v) * Math.min(1, dt * (vTarget > v ? 7 : 11));
            if (v < 1.5) v = 0;
            const dir = angle - Math.PI / 2;
            x += Math.cos(dir) * v * dt;
            y += Math.sin(dir) * v * dt;
            phase += v * dt * 0.28 / Math.max(0.3, s);

            if (v === 0 && mode === "walk") {                  // idle fidgeting
                idleTwitch -= dt;
                if (idleTwitch <= 0) {
                    idleTwitch = rand(0.8, 3);
                    const l = legs[Math.floor(rand(0, legs.length))];
                    if (l.t >= 1) {
                        l.from = [l.foot[0] + rand(-5, 5) * S(), l.foot[1] + rand(-5, 5) * S()];
                        l.dur = 0.16; l.t = 0;
                    }
                }
            }
            if (mode !== "lurk") stepLegs(dt, v > 8);
        }

        if (mode === "lurk") { canvas.style.opacity = "0"; return; }

        canvas.style.opacity = String(alpha);
        canvas.style.transform = `translate(${x - BOX / 2}px, ${y - BOX / 2}px)`;
        updateFilter();
        draw(now);
    }

    // ---------------------------------------------------------------- squashing
    // The canvas does not catch clicks (it is big); instead check the distance to the spider.
    function onPointerDown(e) {
        if (dead || mode === "lurk" || alpha < 0.4) return;
        if (Math.hypot(e.clientX - x, e.clientY - y) > 30 * S()) return;
        e.stopPropagation(); e.preventDefault();
        eat = true;
        dead = true; t = RESPAWN_S;
        if (thread) { thread.remove(); thread = null; }
        drawSplat();
        canvas.style.filter = "";
        canvas.style.opacity = "1";
        requestAnimationFrame(() => { canvas.style.transition = "opacity 1.4s 1.2s"; canvas.style.opacity = "0"; });
        mode = "lurk";
    }
    function onClick(e) { if (eat) { e.stopPropagation(); e.preventDefault(); eat = false; } }
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("click", onClick, true);

    lurk(rand(0.2, 0.8));
    raf = requestAnimationFrame(frame);

    return function stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        clearTimeout(deadTimer);
        window.removeEventListener("pointerdown", onPointerDown, true);
        window.removeEventListener("click", onClick, true);
        if (thread) thread.remove();
        canvas.remove();
    };
}
