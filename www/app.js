// Cam2Wall – camera wall for go2rtc (WebRTC). No build step, no dependencies.
//
// Streams are read from go2rtc's API. Naming convention:
//   cam1      -> shown in the grid (use the camera's low-res sub stream here)
//   cam1_hd   -> optional; loaded instead of cam1 while that camera is shown full size

import { VideoRTC } from "./video-rtc.js";   // player from go2rtc (MIT), see THIRD-PARTY.md

// Plain video element without go2rtc's info overlay or player controls
class CameraStream extends VideoRTC {
    oninit() {
        super.oninit();
        this.video.controls = false;
    }
}
customElements.define("camera-stream", CameraStream);

const params = new URLSearchParams(location.search);
// Served by go2rtc itself (static_dir) -> same origin. ?api=http://host:1984 overrides for development.
const ORIGIN = (params.get("api") || (location.protocol.startsWith("http") ? location.origin : "http://localhost:1984")).replace(/\/$/, "");
const WS_ORIGIN = ORIGIN.replace(/^http/, "ws");

const LOADING_TIMEOUT_MS = 12000;
const MAX_ZOOM = 8;

const TEXT = {
    en: { loading: "Loading cameras …", connecting: "Connecting …", offline: "No signal", none: "No cameras configured in go2rtc.yaml.", error: "Cannot reach go2rtc at " },
    de: { loading: "Lade Kameras …", connecting: "Verbinde …", offline: "Kein Signal", none: "Keine Kameras in go2rtc.yaml konfiguriert.", error: "Keine Verbindung zu go2rtc unter " },
};
const t = TEXT[(navigator.language || "en").toLowerCase().startsWith("de") ? "de" : "en"];
document.documentElement.lang = t === TEXT.de ? "de" : "en";

const HELP = {
    en: [["Click / Enter", "Single view on/off"], ["Wheel / pinch", "Zoom"], ["Drag", "Pan (when zoomed)"], ["Double-click", "Reset zoom"],
         ["N", "Show / hide names"], ["F", "Fullscreen"], ["Esc", "Back to all cameras"], ["? / H", "This help"]],
    de: [["Klick / Enter", "Einzelansicht an/aus"], ["Mausrad / Pinch", "Zoom"], ["Ziehen", "Verschieben (beim Zoomen)"], ["Doppelklick", "Zoom zurücksetzen"],
         ["N", "Namen ein/aus"], ["F", "Vollbild"], ["Esc", "Zurück zu allen Kameras"], ["? / H", "Diese Hilfe"]],
}[t === TEXT.de ? "de" : "en"];

const help = document.getElementById("help");
help.innerHTML = `<table>${HELP.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}</table><p>Cam2Wall · go2rtc</p>`;
help.addEventListener("click", () => { help.hidden = true; });
document.getElementById("helpBtn").addEventListener("click", () => { help.hidden = !help.hidden; });

const grid = document.getElementById("grid");
const msg = document.getElementById("msg");
msg.textContent = t.loading;

// ---------------------------------------------------------------- layout

const phoneQuery = matchMedia("(max-width: 700px) and (orientation: portrait)");

// Pick the column count that makes the 16:9 tiles as large as possible.
function layout() {
    document.documentElement.classList.toggle("mobile", phoneQuery.matches);
    const n = grid.children.length;
    if (!n) return;
    const W = innerWidth - 12, H = innerHeight - 12;
    let best = { cols: 1, size: 0 };
    for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols);
        const w = W / cols, h = H / rows;
        const size = Math.min(w, h * 16 / 9) ** 2;
        if (size > best.size) best = { cols, size };
    }
    grid.style.setProperty("--cols", best.cols);
    grid.style.setProperty("--rows", Math.ceil(n / best.cols));
}

// ---------------------------------------------------------------- player + status

function makePlayer(name) {
    const player = document.createElement("camera-stream");
    player.mode = "webrtc,mse";
    player.background = false;          // pause when the tab is hidden
    player.visibilityThreshold = 0.1;   // ...and when the tile is scrolled out of view / hidden
    player.src = new URL(`${WS_ORIGIN}/api/ws?src=${encodeURIComponent(name)}`);
    return player;
}

function setState(tile, state) {
    clearTimeout(tile._timer);
    tile.dataset.state = state;
    tile.querySelector(".status-text").textContent = state === "offline" ? t.offline : t.connecting;
    if (state === "loading") {
        tile._timer = setTimeout(() => setState(tile, "offline"), LOADING_TIMEOUT_MS);
    }
}

function loadSource(tile, name) {
    const view = tile.querySelector(".view");
    view.replaceChildren(makePlayer(name));
    setState(tile, "loading");
}

function buildTile(name, hdName) {
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.tabIndex = 0;
    tile.setAttribute("role", "button");
    tile.setAttribute("aria-label", name);

    const view = document.createElement("div");
    view.className = "view";

    const tag = document.createElement("div");
    tag.className = "tag";
    tag.textContent = name;

    const status = document.createElement("div");
    status.className = "status";
    status.innerHTML = '<div class="spinner"></div><div class="status-text"></div>';

    tile.append(view, tag, status);

    // Media events don't bubble -> listen in the capture phase
    tile.addEventListener("playing", () => setState(tile, "live"), true);

    tile.toggleMax = () => {
        const y = scrollY;
        const nowMax = tile.classList.toggle("max");
        if (nowMax) tile.dataset.scroll = y;
        else requestAnimationFrame(() => scrollTo(0, +tile.dataset.scroll || 0));
        if (hdName) {
            loadSource(tile, nowMax ? hdName : name);   // swap sub stream <-> main stream
            tag.textContent = name;
            if (nowMax) tag.insertAdjacentHTML("beforeend", '<span class="hd">HD</span>');
        }
    };

    loadSource(tile, name);
    enableZoom(tile, view);
    return tile;
}

// ---------------------------------------------------------------- zoom / pan

// Wheel / pinch = zoom, drag = pan, double click = reset, click (not zoomed) = single view on/off
function enableZoom(tile, view) {
    let s = 1, tx = 0, ty = 0, moved = false, drag = null, pinch = null;
    const ptrs = new Map();

    const apply = () => {
        const r = tile.getBoundingClientRect();
        s = Math.min(MAX_ZOOM, Math.max(1, s));
        tx = Math.min(0, Math.max(r.width * (1 - s), tx));    // image always covers the tile
        ty = Math.min(0, Math.max(r.height * (1 - s), ty));
        view.style.transform = s === 1 ? "" : `translate(${tx}px, ${ty}px) scale(${s})`;
        tile.style.cursor = s > 1 ? "grab" : "";
    };
    const reset = () => { s = 1; tx = ty = 0; apply(); };

    tile.addEventListener("wheel", e => {
        e.preventDefault();
        const r = tile.getBoundingClientRect();
        const px = e.clientX - r.left, py = e.clientY - r.top;
        const ns = Math.min(MAX_ZOOM, Math.max(1, s * Math.exp(-e.deltaY * 0.0015)));
        tx = px - (px - tx) * ns / s;
        ty = py - (py - ty) * ns / s;
        s = ns;
        apply();
    }, { passive: false });

    const mid = () => {
        const [a, b] = [...ptrs.values()];
        const r = tile.getBoundingClientRect();
        return { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 };
    };

    tile.addEventListener("pointerdown", e => {
        moved = false;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (ptrs.size === 2) {
            pinch = { ...mid(), s, tx, ty };
            drag = null;
            moved = true;
        } else if (s > 1) {
            drag = { x: e.clientX, y: e.clientY, tx, ty };
            tile.style.cursor = "grabbing";
        }
        if (s > 1 || ptrs.size === 2) tile.setPointerCapture(e.pointerId);
    });

    tile.addEventListener("pointermove", e => {
        if (!ptrs.has(e.pointerId)) return;
        ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pinch && ptrs.size >= 2) {
            const m = mid();
            const ns = Math.min(MAX_ZOOM, Math.max(1, pinch.s * m.d / pinch.d));
            tx = m.x - (pinch.x - pinch.tx) * ns / pinch.s;
            ty = m.y - (pinch.y - pinch.ty) * ns / pinch.s;
            s = ns;
            apply();
        } else if (drag) {
            const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
            if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
            tx = drag.tx + dx;
            ty = drag.ty + dy;
            apply();
        }
    });

    const release = e => {
        ptrs.delete(e.pointerId);
        pinch = null;
        drag = null;
        if (ptrs.size === 1 && s > 1) {   // one finger stays down -> keep panning
            const [p] = ptrs.values();
            drag = { x: p.x, y: p.y, tx, ty };
        }
        apply();
    };
    tile.addEventListener("pointerup", release);
    tile.addEventListener("pointercancel", release);

    tile.addEventListener("click", e => {
        if (e.detail > 0) tile.blur();   // real mouse/touch click: no keyboard focus frame
        if (moved) { moved = false; return; }
        if (s === 1) tile.toggleMax();
    });
    tile.addEventListener("dblclick", reset);
    tile.addEventListener("keydown", e => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); if (s === 1) tile.toggleMax(); }
    });

    // Tile size changed (single view, window resize) -> reset the zoom
    new ResizeObserver(reset).observe(tile);
}

// ---------------------------------------------------------------- start

async function init() {
    try {
        const streams = Object.keys(await (await fetch(`${ORIGIN}/api/streams`)).json());

        const hd = new Set(streams.filter(n => n.endsWith("_hd")));
        const names = streams.filter(n => !hd.has(n) && !n.startsWith("_"));   // "_..." = internal (hidden)

        if (!names.length) {
            msg.textContent = t.none;
            return;
        }
        msg.remove();

        for (const name of names) {
            const hdName = hd.has(`${name}_hd`) ? `${name}_hd` : null;
            grid.append(buildTile(name, hdName));
        }
        layout();
    } catch (e) {
        console.error(e);
        msg.className = "msg err";
        msg.textContent = t.error + ORIGIN;
    }
}

addEventListener("resize", layout);
phoneQuery.addEventListener("change", layout);

addEventListener("keydown", e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (k === "?" || k === "h") help.hidden = !help.hidden;
    else if (k === "n") document.body.classList.toggle("show-tags");
    else if (k === "f") document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    else if (e.key === "Escape") {
        if (!help.hidden) help.hidden = true;
        else document.querySelector(".tile.max")?.toggleMax();
    }
});

// Show the mouse cursor only while it is moving
let hideTimer;
addEventListener("mousemove", () => {
    document.body.classList.add("mouse");
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => document.body.classList.remove("mouse"), 3000);
});

// ---------------------------------------------------------------- optional "spider" state (prank)
// Shared state: the spider is on for every viewer while go2rtc has a stream named "_spider".
// Toggle it from any browser: Shift+S, or press-and-hold the round "?" button for ~1.5 s.
// ?spider=1 / ?spider=0 in the URL overrides it locally. go2rtc saves it in its config file, so it also survives a restart.
const SPIDER_STREAM = "_spider";
let spiderStop = null, spiderBusy = false, sharedSpider = false, localSpider = null;
const urlSpider = params.get("spider");
if (urlSpider !== null) localSpider = urlSpider !== "0" && urlSpider !== "false";

async function applySpider() {
    const want = localSpider ?? sharedSpider;
    if (spiderBusy || want === !!spiderStop) return;
    spiderBusy = true;
    try {
        if (want) spiderStop = (await import("./spider.js?v=8")).startSpider();
        else { spiderStop(); spiderStop = null; }
    } catch (e) { console.error(e); }
    spiderBusy = false;
    if ((localSpider ?? sharedSpider) !== !!spiderStop) applySpider();
}

async function pollSpider() {
    try {
        const streams = await (await fetch(`${ORIGIN}/api/streams`, { cache: "no-store" })).json();
        sharedSpider = SPIDER_STREAM in streams;
    } catch { /* keep the last known state */ }
    applySpider();
}

async function toggleSpider() {
    localSpider = null;   // the shared state wins again
    const method = sharedSpider ? "DELETE" : "PUT";
    const query = sharedSpider ? `src=${SPIDER_STREAM}` : `name=${SPIDER_STREAM}&src=${encodeURIComponent("rtsp://127.0.0.1:1/spider")}`;
    try { await fetch(`${ORIGIN}/api/streams?${query}`, { method }); } catch (e) { console.error(e); }
    pollSpider();
}

addEventListener("keydown", e => {
    if (e.shiftKey && e.key === "S" && !e.ctrlKey && !e.metaKey && !e.altKey) toggleSpider();
});

// press-and-hold on the help button (works on touch screens too)
{
    const btn = document.getElementById("helpBtn");
    let timer = 0, held = false;
    btn.addEventListener("pointerdown", () => {
        held = false;
        timer = setTimeout(() => { held = true; toggleSpider(); }, 1500);
    });
    for (const ev of ["pointerup", "pointerleave", "pointercancel"]) btn.addEventListener(ev, () => clearTimeout(timer));
    btn.addEventListener("click", e => { if (held) { e.stopImmediatePropagation(); held = false; } }, true);
}

layout();
init();
pollSpider();
setInterval(pollSpider, 5000);
