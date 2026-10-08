# Cam2Wall

[![Docs](https://img.shields.io/badge/docs-30jannik06.github.io%2FCam2Wall-38bdf8)](https://30jannik06.github.io/Cam2Wall/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Checks](https://github.com/30jannik06/Cam2Wall/actions/workflows/ci.yml/badge.svg)](https://github.com/30jannik06/Cam2Wall/actions/workflows/ci.yml)

A lightweight, full-screen camera wall for the browser. RTSP cameras (or any recorder/VMS that
exposes RTSP) are converted to low-latency WebRTC by [go2rtc](https://github.com/AlexxIT/go2rtc),
which also serves the dashboard — **one process, no Node, no Python, no build step**. Small enough
for a Raspberry Pi Zero.

**📖 [Documentation](https://30jannik06.github.io/Cam2Wall/)** · *[Deutsche Anleitung → README.de.md](README.de.md)*

```bash
git clone https://github.com/30jannik06/Cam2Wall.git && cd Cam2Wall
```

## Built on go2rtc

All the heavy lifting — pulling the RTSP streams and turning them into WebRTC — is done by
**[go2rtc](https://github.com/AlexxIT/go2rtc)** by [AlexxIT](https://github.com/AlexxIT). It is an
excellent, tiny and fast piece of software; if this project is useful to you, please give go2rtc a
star. Cam2Wall is only a focused front-end and a set of launchers around it.

You don't need to install anything by hand: on the first start `start.bat` / `start.sh` download the
matching go2rtc release (pinned in [`go2rtc.version`](go2rtc.version), 64-bit Windows, Linux x86/ARM
and Raspberry Pi Zero/ARMv6) from the official
[GitHub releases](https://github.com/AlexxIT/go2rtc/releases) into `bin/`. No binary is stored in this repository.

## Features

- Cameras fill the whole screen (auto grid, 16:9) – no title bars, no clutter, readable from a distance
- Click a camera for a single view; optional **HD main stream** only while a camera is enlarged
- Mouse wheel / pinch zoom up to 8×, drag to pan, double-click to reset
- Responsive: scrollable column on phones, wall layout on desktops and TVs
- Connection state per camera (connecting / no signal), automatic reconnect
- Streams pause while the tab is hidden or a camera is scrolled out of view
- Optional HTTPS with a self-signed certificate, German/English UI (browser language)
- Zero external dependencies at runtime – works offline in a LAN

## Quick start

**Windows** – double-click `start.bat`
**Linux / Raspberry Pi** – `sh start.sh`

On the first run the script downloads go2rtc, creates `config/go2rtc.yaml` from the example and
(if openssl is available) a self-signed certificate. Enter your camera URLs in
`config/go2rtc.yaml`, start again, and open:

| | URL |
|---|---|
| This machine | `http://localhost:1984` |
| Other devices in the LAN | `http://<IP>:1984` or `https://<IP>:1985` (accept the certificate warning once) |

Open these ports in the firewall if needed: TCP 1984, 1985, 8555 and UDP 8555 (WebRTC).

### Docker

```bash
cp config/go2rtc.example.yaml config/go2rtc.yaml    # edit your cameras
sh scripts/make-cert.sh                             # optional: HTTPS
docker compose up -d
```

`docker-compose.yml` uses host networking (Linux / Raspberry Pi). On Docker Desktop
(Windows/macOS) use the `ports:` block in the file and set `webrtc.candidates` in the config.

### Raspberry Pi autostart

Copy `deploy/cam2wall.service` to `/etc/systemd/system/`, adjust user and path, then
`sudo systemctl enable --now cam2wall`.

## Configuration

Everything lives in `config/go2rtc.yaml` (see [go2rtc docs](https://github.com/AlexxIT/go2rtc#configuration)).
The dashboard shows every stream except those ending in `_hd`:

```yaml
streams:
  cam1:    "rtsp://user:pass@192.168.1.10:554/stream?channel=0&stream=1"   # sub stream (grid)
  cam1_hd: "rtsp://user:pass@192.168.1.10:554/stream?channel=0&stream=0"   # main stream (single view, optional)
```

Using the low-res sub stream in the grid is the single biggest saving for weak hardware
(Raspberry Pi Zero) and for Wi-Fi.

> **After updating:** hard-reload the page (`Ctrl+F5`) — go2rtc sends no cache headers, so browsers can keep an old copy for a while.

## Keyboard & touch

| Action | Mouse | Touch |
|---|---|---|
| Single view on/off | click · `Enter` · `Esc` | tap |
| Zoom | wheel | pinch (in single view) |
| Pan | drag | one finger (when zoomed) |
| Reset zoom | double-click | double-tap |
| Show names | `N` | always visible on phones |
| Fullscreen | `F` | – |
| Help overlay | `?` or `H` or the round **?** button | **?** button |

On a phone, "Add to Home Screen" opens the dashboard as a fullscreen app.

## Easter egg: spider 🕷️

A small spider can crawl over the screen (it appears at a random screen edge; click it to squash it – it comes back a few seconds later).
It is **off by default** and a **shared switch**: it is on for *everyone* who has the dashboard open, and you can
flip it from any browser – including your phone:

- open the remote page **`http://<server-ip>:1984/remote.html`** – one big button (ideal on a phone; **no keyboard needed**
  on the machine that shows the wall, e.g. a Raspberry Pi with only a monitor),
- press **`Shift+S`** in any dashboard window, or
- **press and hold the round `?` button for ~1.5 seconds** (works on touch screens), or
- from a shell, e.g. over SSH on the Pi:
  ```bash
  curl -X PUT    "http://localhost:1984/api/streams?name=_spider&src=rtsp://127.0.0.1:1/spider"   # on
  curl -X DELETE "http://localhost:1984/api/streams?src=_spider"                                 # off
  ```

The state lives in go2rtc's memory (a hidden stream called `_spider`), so there is nothing to edit or commit and
it resets when go2rtc restarts. Other viewers pick it up within 5 seconds. For a quick local try-out append
`?spider=1` to the URL (`?spider=0` turns it off). After an update a browser may need one hard reload (`Ctrl+F5`).

## Security — please read

- go2rtc's API has **no login by default** and reveals stream URLs *including passwords*
  (`/api/streams`). Anyone who can reach port 1984 can read them. Run this only on a trusted
  network, or set `api.username` / `api.password` in the config.
- **Do not expose the ports to the internet.** For remote access use a VPN (WireGuard, Tailscale).
- `config/go2rtc.yaml`, `certs/` and `bin/` are git-ignored — never commit camera credentials.

## Project layout

```
Cam2Wall/
├── start.bat / start.sh        launchers (Windows / Linux, Raspberry Pi)
├── go2rtc.version              pinned go2rtc version that the setup scripts download
├── config/                     go2rtc.example.yaml (go2rtc.yaml + tls.yaml are generated, git-ignored)
├── www/                        the dashboard: index.html, style.css, app.js, video-rtc.js, icon, manifest
├── scripts/                    setup (download go2rtc), make-cert (self-signed HTTPS)
├── deploy/cam2wall.service     systemd unit (autostart)
├── docs/                       documentation site (GitHub Pages)
├── .github/                    issue templates, PR template, CI + Pages workflows
├── docker-compose.yml
└── LICENSE · THIRD-PARTY.md · CONTRIBUTING.md · SECURITY.md · README.de.md
```

## Contributing

Issues and pull requests are welcome – see [CONTRIBUTING.md](CONTRIBUTING.md). Security problems: [SECURITY.md](SECURITY.md).

## License

[MIT](LICENSE). `www/video-rtc.js` is taken from go2rtc (MIT) — see [THIRD-PARTY.md](THIRD-PARTY.md).
