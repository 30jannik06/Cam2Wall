# Contributing to Cam2Wall

Thanks for helping! Cam2Wall is intentionally small: **plain HTML/CSS/JS in `www/`, no build step,
no runtime dependencies**, and it has to stay light enough for a Raspberry Pi Zero.

## Ground rules

- Keep it dependency-free (no npm packages, no CDN links at runtime).
- Everything must work on **Windows and Linux** (`start.bat` + `start.sh`, `.ps1` + `.sh` scripts).
- Never commit camera URLs, passwords, IPs, certificates or the go2rtc binary.
- UI text exists in English and German (`TEXT` / `HELP` in `www/app.js`).

## Run it locally

```bash
git clone https://github.com/30jannik06/Cam2Wall.git && cd Cam2Wall
sh start.sh            # Windows: start.bat
```

Edit `www/` and reload the browser — go2rtc serves the folder directly. To work on the page without
cameras, open `http://localhost:1984/?api=http://<go2rtc-host>:1984`.

## Before you open a pull request

- Test on desktop and at phone width (browser dev tools are fine).
- `sh -n start.sh scripts/*.sh` and `node --input-type=module --check < www/app.js` should pass (CI runs them).
- Update `README.md`, `README.de.md` and `docs/index.html` when behaviour changes.

## Docs site

`docs/index.html` is a single self-contained page published with GitHub Pages
(`.github/workflows/pages.yml`). Open it directly in a browser to preview.
