// A small spider that wanders over the screen. Loaded on demand (only while the "spider" state is on).
// Click it to squash it - it comes back a few seconds later.

const SIZE = 46;          // px
const SPEED = [70, 150];  // px/s while walking
const PAUSE = [0.4, 3];   // s standing still
const RESPAWN_MS = 9000;

const SVG = `
<svg viewBox="-30 -34 60 68" width="${SIZE}" height="${Math.round(SIZE * 68 / 60)}" aria-hidden="true">
  <g class="legs">
    ${[[-1, -16, -26, 1], [-1, -6, -29, 2], [-1, 5, -28, 1], [-1, 15, -24, 2],
       [1, -16, -26, 2], [1, -6, -29, 1], [1, 5, -28, 2], [1, 15, -24, 1]].map(([side, y, reach, grp]) => {
        const x1 = side * 5, x2 = side * 17, x3 = side * 27;
        const y2 = y - 9, y3 = y + (reach > 0 ? 6 : 8);
        return `<polyline class="leg g${grp}" style="transform-origin:${x1}px ${y * 0.35}px" fill="none"
            points="${x1},${y * 0.35} ${x2},${y2} ${x3},${y3}"/>`;
    }).join("")}
  </g>
  <ellipse cx="0" cy="13" rx="9" ry="12.5" class="body"/>
  <ellipse cx="0" cy="-4" rx="6.5" ry="8" class="body"/>
  <circle cx="-2.4" cy="-9" r="1.3" class="eye"/><circle cx="2.4" cy="-9" r="1.3" class="eye"/>
</svg>`;

const SPLAT = `
<svg viewBox="-30 -30 60 60" width="${SIZE}" height="${SIZE}" aria-hidden="true">
  <g fill="#3b4a1c" opacity=".85">
    <ellipse cx="0" cy="0" rx="11" ry="9"/><circle cx="-14" cy="-5" r="3.5"/><circle cx="13" cy="7" r="3"/>
    <circle cx="4" cy="-15" r="2.5"/><circle cx="-9" cy="13" r="2.5"/><circle cx="18" cy="-6" r="1.8"/>
  </g>
</svg>`;

const CSS = `
.spider{position:fixed;left:0;top:0;z-index:30;width:${SIZE}px;pointer-events:auto;cursor:crosshair;
  will-change:transform;filter:drop-shadow(0 0 1.5px rgba(255,255,255,.55)) drop-shadow(0 3px 3px rgba(0,0,0,.5))}
.spider svg{display:block;overflow:visible}
.spider .body{fill:#161616;stroke:#555;stroke-width:.8}
.spider .eye{fill:#ef4444}
.spider .leg{stroke:#161616;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.spider.walk .leg.g1{animation:sp-a .16s ease-in-out infinite alternate}
.spider.walk .leg.g2{animation:sp-b .16s ease-in-out infinite alternate}
@keyframes sp-a{from{transform:rotate(-14deg)}to{transform:rotate(14deg)}}
@keyframes sp-b{from{transform:rotate(14deg)}to{transform:rotate(-14deg)}}
.spider.squashed{pointer-events:none;filter:none;transition:opacity 1.4s 1.2s;opacity:0}
`;

const rand = (a, b) => a + Math.random() * (b - a);

export function startSpider() {
    const style = document.createElement("style");
    style.textContent = CSS;
    const el = document.createElement("div");
    el.className = "spider";
    el.title = "";
    document.head.append(style);
    document.body.append(el);

    let x = -SIZE * 2, y = rand(0, innerHeight), angle = 0;   // enters from the left
    let tx = rand(0.2, 0.8) * innerWidth, ty = rand(0.2, 0.8) * innerHeight;
    let speed = rand(...SPEED), wait = 0, last = performance.now(), raf = 0, respawn = 0, dead = false, stopped = false;

    const place = () => { el.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px) rotate(${angle}rad)`; };

    function nextTarget() {
        const edge = Math.random() < 0.25;   // sometimes leave the screen and come back from another side
        if (edge) {
            const side = Math.floor(rand(0, 4));
            [tx, ty] = [[-SIZE * 2, rand(0, innerHeight)], [innerWidth + SIZE * 2, rand(0, innerHeight)],
                        [rand(0, innerWidth), -SIZE * 2], [rand(0, innerWidth), innerHeight + SIZE * 2]][side];
        } else {
            tx = rand(SIZE, innerWidth - SIZE);
            ty = rand(SIZE, innerHeight - SIZE);
        }
        speed = rand(...SPEED) * (Math.random() < 0.15 ? 2 : 1);   // an occasional sprint
    }

    function frame(now) {
        if (stopped) return;
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - last) / 1000);
        last = now;
        if (dead) return;

        if (wait > 0) {
            wait -= dt;
            el.classList.remove("walk");
            return;
        }
        const dx = tx - x, dy = ty - y, dist = Math.hypot(dx, dy);
        if (dist < 4) {
            const offscreen = x < 0 || y < 0 || x > innerWidth || y > innerHeight;
            wait = offscreen ? rand(6, 25) : rand(...PAUSE);   // lurk outside for a while
            if (offscreen) { x = tx; y = ty; }
            nextTarget();
            return;
        }
        // turn smoothly towards the target (head points to -y, hence the +90deg)
        const want = Math.atan2(dy, dx) + Math.PI / 2;
        let diff = ((want - angle) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI;
        const turn = 4 * dt;                              // rad per frame at 4 rad/s
        angle += Math.max(-turn, Math.min(turn, diff));
        const dir = angle - Math.PI / 2;
        x += Math.cos(dir) * speed * dt;
        y += Math.sin(dir) * speed * dt;
        el.classList.add("walk");
        place();
    }

    el.innerHTML = SVG;
    el.addEventListener("click", e => {
        e.stopPropagation();
        if (dead) return;
        dead = true;
        el.classList.remove("walk");
        el.innerHTML = SPLAT;
        el.style.transform = `translate(${x - SIZE / 2}px, ${y - SIZE / 2}px)`;
        el.classList.add("squashed");
        respawn = setTimeout(() => {
            el.classList.remove("squashed");
            el.innerHTML = SVG;
            x = -SIZE * 2; y = rand(0, innerHeight); angle = 0;
            nextTarget();
            dead = false;
        }, RESPAWN_MS);
    });

    place();
    raf = requestAnimationFrame(frame);

    return function stop() {
        stopped = true;
        cancelAnimationFrame(raf);
        clearTimeout(respawn);
        el.remove();
        style.remove();
    };
}
