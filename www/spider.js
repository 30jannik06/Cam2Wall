// A small spider that wanders over the screen. Loaded on demand (only while the "spider" state is on).
// Procedural walking: every foot stays planted on the "ground" until the body has moved too far away, then
// it steps to a new spot (alternating tetrapod gait, like a real spider). Click it to squash it.

const K = 1.05;           // overall size factor (body ~ 22px, leg span ~ 60px)
const BOX = 104;          // canvas size in CSS px (must fit the legs)
const SPEED = [70, 150];  // px/s while walking
const PAUSE = [0.4, 3];   // s standing still
const RESPAWN_MS = 9000;
const FEMUR = 15 * K, TIBIA = 17 * K;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// a random point just outside one of the four screen edges
function edgePoint() {
    const m = BOX;
    return [[-m, rand(0, innerHeight)], [innerWidth + m, rand(0, innerHeight)],
            [rand(0, innerWidth), -m], [rand(0, innerWidth), innerHeight + m]][Math.floor(rand(0, 4))];
}

// four leg pairs: hip position on the body and resting foot position (body coordinates, head = -y)
const HIP_Y = [-6.5, -2.5, 1.5, 5.5];
const REST = [[17, -25], [25, -11], [25, 8], [18, 26]];

function makeLegs() {
    const legs = [];
    for (let p = 0; p < 4; p++) {
        for (const side of [-1, 1]) {
            legs.push({
                side, pair: p,
                hip: [side * 3 * K, HIP_Y[p] * K],
                rest: [side * REST[p][0] * K, REST[p][1] * K],
                group: (p + (side > 0 ? 1 : 0)) % 2,        // alternating tetrapod gait
                foot: [0, 0], from: [0, 0], to: [0, 0], t: 1, dur: 0.12,
            });
        }
    }
    return legs;
}

// two-bone IK: knee position for a hip and a foot; the knee bends away from the body
function knee(hip, foot, outward) {
    const dx = foot[0] - hip[0], dy = foot[1] - hip[1];
    const len = Math.hypot(dx, dy) || 0.001;
    const d = Math.min(len, FEMUR + TIBIA - 0.01);
    const ux = dx / len, uy = dy / len;
    const a = (d * d + FEMUR * FEMUR - TIBIA * TIBIA) / (2 * d);
    const h = Math.sqrt(Math.max(0, FEMUR * FEMUR - a * a));
    let px = -uy, py = ux;
    if (px * outward[0] + py * outward[1] < 0) { px = -px; py = -py; }
    return [hip[0] + ux * a + px * h, hip[1] + uy * a + py * h];
}

export function startSpider() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = Math.round(BOX * dpr);
    canvas.style.cssText = `position:fixed;left:0;top:0;width:${BOX}px;height:${BOX}px;z-index:30;pointer-events:auto;` +
        "cursor:crosshair;will-change:transform;filter:drop-shadow(0 3px 3px rgba(0,0,0,.45))";
    const ctx = canvas.getContext("2d");
    const style = document.createElement("style");
    style.textContent = ".spider-squashed{pointer-events:none!important;transition:opacity 1.4s 1.2s;opacity:0}";
    document.head.append(style);
    canvas.className = "spider";
    document.body.append(canvas);

    const legs = makeLegs();
    let [x, y] = edgePoint();                        // world position of the body centre
    let tx = rand(0.2, 0.8) * innerWidth, ty = rand(0.2, 0.8) * innerHeight;
    let angle = Math.atan2(ty - y, tx - x) + Math.PI / 2;   // head points to -y
    let v = 0, speed = rand(...SPEED), wait = rand(0.2, 0.8), phase = 0, idleTwitch = rand(1, 3);
    let last = performance.now(), raf = 0, respawn = 0, dead = false, stopped = false;

    const rot = (px, py) => {      // body -> world offset
        const c = Math.cos(angle), s = Math.sin(angle);
        return [px * c - py * s, px * s + py * c];
    };
    const worldRest = leg => { const r = rot(...leg.rest); return [x + r[0], y + r[1]]; };

    function plantFeet() {
        for (const l of legs) { l.foot = worldRest(l); l.t = 1; }
    }
    plantFeet();

    function nextTarget() {
        if (Math.random() < 0.25) [tx, ty] = edgePoint();   // sometimes leave the screen and come back later
        else { tx = rand(BOX, innerWidth - BOX); ty = rand(BOX, innerHeight - BOX); }
        speed = rand(...SPEED) * (Math.random() < 0.15 ? 2 : 1);   // an occasional sprint
    }

    function stepLegs(dt, moving) {
        const stepping = [false, false];
        for (const l of legs) if (l.t < 1) stepping[l.group] = true;
        const dirx = Math.sin(angle), diry = -Math.cos(angle);       // heading (towards -y of the body)
        const lead = moving ? v * 0.07 + 3 * K : 0;                   // land a bit ahead of the resting spot

        for (const l of legs) {
            const rest = worldRest(l);
            const target = [rest[0] + dirx * lead, rest[1] + diry * lead];
            if (l.t < 1) {   // swing phase: the landing spot follows the body while the foot is in the air
                l.t = Math.min(1, l.t + dt / l.dur);
                const e = l.t * l.t * (3 - 2 * l.t);
                l.foot = [l.from[0] + (target[0] - l.from[0]) * e, l.from[1] + (target[1] - l.from[1]) * e];
                continue;
            }
            const dist = Math.hypot(l.foot[0] - rest[0], l.foot[1] - rest[1]);
            // normal step: only when the opposite group is on the ground; emergency step: leg is far behind
            if ((dist > 6 * K && !stepping[1 - l.group]) || dist > 12 * K) {
                l.from = l.foot.slice();
                l.dur = clamp(0.1 - v * 0.0004, 0.05, 0.1);
                l.t = 0;
                stepping[l.group] = true;
            }
        }
    }

    function draw(time) {
        const C = BOX / 2;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, BOX, BOX);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        const sway = Math.sin(phase * 0.9) * (v > 8 ? 0.9 : 0);          // slight body sway while walking
        const [swx, swy] = rot(sway, 0);
        const bx = C + swx, by = C + swy;

        // legs (feet are stored in world space)
        for (const l of legs) {
            const h = rot(...l.hip);
            const hip = [bx + h[0], by + h[1]];
            const foot = [l.foot[0] - x + C, l.foot[1] - y + C];
            const k = knee(hip, foot, rot(l.side, 0));
            ctx.beginPath();
            ctx.moveTo(hip[0], hip[1]); ctx.lineTo(k[0], k[1]); ctx.lineTo(foot[0], foot[1]);
            ctx.strokeStyle = "rgba(150,160,170,.28)"; ctx.lineWidth = 3.6; ctx.stroke();   // faint rim: visible on dark video
            ctx.beginPath();
            ctx.moveTo(hip[0], hip[1]); ctx.lineTo(k[0], k[1]);
            ctx.strokeStyle = "#171717"; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(k[0], k[1]); ctx.lineTo(foot[0], foot[1]);
            ctx.strokeStyle = "#1d1d1d"; ctx.lineWidth = 1.6; ctx.stroke();
            ctx.beginPath(); ctx.arc(k[0], k[1], 1.5, 0, 6.3); ctx.fillStyle = "#262626"; ctx.fill();
        }

        // body
        ctx.save();
        ctx.translate(bx, by);
        ctx.rotate(angle);
        const bob = 1 + (v > 8 ? Math.sin(phase * 1.8) * 0.02 : Math.sin(time / 700) * 0.012);
        ctx.scale(K * bob, K * bob);

        // pedipalps
        ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.6;
        for (const s of [-1, 1]) {
            ctx.beginPath(); ctx.moveTo(s * 2, -9); ctx.lineTo(s * 3.6, -14); ctx.lineTo(s * 2.2, -16.5); ctx.stroke();
        }
        // abdomen
        let g = ctx.createRadialGradient(-2, 8, 1, 0, 11, 13);
        g.addColorStop(0, "#3a3733"); g.addColorStop(0.55, "#1a1816"); g.addColorStop(1, "#090909");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, 11, 8.6, 12, 0, 0, 6.3); ctx.fill();
        ctx.strokeStyle = "rgba(150,160,170,.3)"; ctx.lineWidth = 0.7; ctx.stroke();
        ctx.fillStyle = "rgba(200,190,170,.16)";       // faint markings
        ctx.beginPath(); ctx.ellipse(0, 9, 2.4, 4.4, 0, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.ellipse(0, 16, 1.6, 2.6, 0, 0, 6.3); ctx.fill();
        // cephalothorax
        g = ctx.createRadialGradient(-1.5, -5.5, 1, 0, -3, 8);
        g.addColorStop(0, "#413d38"); g.addColorStop(1, "#0d0d0d");
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.ellipse(0, -3, 5.8, 7.4, 0, 0, 6.3); ctx.fill();
        ctx.stroke();
        // eyes
        ctx.fillStyle = "#c53030";
        for (const [ex, ey, r] of [[-1.7, -8.6, 1], [1.7, -8.6, 1], [-3.2, -6.8, 0.8], [3.2, -6.8, 0.8]]) {
            ctx.beginPath(); ctx.arc(ex, ey, r, 0, 6.3); ctx.fill();
        }
        ctx.fillStyle = "rgba(255,255,255,.7)";
        ctx.beginPath(); ctx.arc(-1.4, -8.9, 0.35, 0, 6.3); ctx.fill();
        ctx.beginPath(); ctx.arc(2.0, -8.9, 0.35, 0, 6.3); ctx.fill();
        ctx.restore();
    }

    function drawSplat() {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, BOX, BOX);
        const C = BOX / 2;
        ctx.fillStyle = "rgba(45,58,22,.9)";
        const blobs = [[0, 0, 11, 8], [-13, -5, 3.5, 3], [12, 7, 3, 2.5], [4, -14, 2.5, 2.2], [-9, 12, 2.5, 2], [17, -5, 1.8, 1.6]];
        for (const [bx, by, rx, ry] of blobs) { ctx.beginPath(); ctx.ellipse(C + bx, C + by, rx, ry, 0.5, 0, 6.3); ctx.fill(); }
        ctx.strokeStyle = "rgba(20,25,10,.8)"; ctx.lineWidth = 1.2;
        for (let i = 0; i < 8; i++) {          // crumpled legs
            const a = i * 0.8 + 0.3;
            ctx.beginPath(); ctx.moveTo(C + Math.cos(a) * 8, C + Math.sin(a) * 6);
            ctx.lineTo(C + Math.cos(a + 0.3) * 17, C + Math.sin(a + 0.3) * 13); ctx.stroke();
        }
    }

    function frame(now) {
        if (stopped) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (dead) return;

        // --- steering and speed ---
        const dx = tx - x, dy = ty - y, dist = Math.hypot(dx, dy);
        let vTarget = 0;
        if (wait > 0) {
            wait -= dt;
        } else if (dist < 4) {
            const offscreen = x < 0 || y < 0 || x > innerWidth || y > innerHeight;
            wait = offscreen ? rand(6, 25) : rand(...PAUSE);   // lurk outside for a while
            if (offscreen) { x = tx; y = ty; }
            v *= 0.3;
            nextTarget();
        } else {
            const want = Math.atan2(dy, dx) + Math.PI / 2;
            const diff = ((want - angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
            const turn = 4.5 * dt;
            angle += clamp(diff, -turn, turn);
            vTarget = speed * (Math.abs(diff) > 1 ? 0.15 : 1);     // pivot first, then run
        }
        v += (vTarget - v) * Math.min(1, dt * (vTarget > v ? 7 : 11));
        if (v < 1.5) v = 0;

        const dir = angle - Math.PI / 2;
        x += Math.cos(dir) * v * dt;
        y += Math.sin(dir) * v * dt;
        phase += v * dt * 0.28;

        // --- idle fidgeting: now and then one leg twitches ---
        if (v === 0) {
            idleTwitch -= dt;
            if (idleTwitch <= 0) {
                idleTwitch = rand(0.8, 3);
                const l = legs[Math.floor(rand(0, legs.length))];
                if (l.t >= 1) {
                    l.from = [l.foot[0] + rand(-5, 5) * K, l.foot[1] + rand(-5, 5) * K];   // lift and put down nearby
                    l.dur = 0.16; l.t = 0;
                }
            }
        }

        stepLegs(dt, v > 8);
        canvas.style.transform = `translate(${x - BOX / 2}px, ${y - BOX / 2}px)`;
        draw(now);
    }

    canvas.addEventListener("click", e => {
        e.stopPropagation();
        if (dead) return;
        dead = true;
        drawSplat();
        canvas.classList.add("spider-squashed");
        respawn = setTimeout(() => {
            canvas.classList.remove("spider-squashed");
            [x, y] = edgePoint();                 // pops up at a random edge again
            nextTarget();
            angle = Math.atan2(ty - y, tx - x) + Math.PI / 2;
            v = 0; wait = rand(0.2, 0.8);
            plantFeet();
            dead = false;
        }, RESPAWN_MS);
    });

    canvas.style.transform = `translate(${x - BOX / 2}px, ${y - BOX / 2}px)`;
    raf = requestAnimationFrame(frame);

    return function stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        clearTimeout(respawn);
        canvas.remove();
        style.remove();
    };
}
