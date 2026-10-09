#!/bin/sh
# EXPERIMENTAL: show the wall on a monitor attached to this Raspberry Pi (Raspberry Pi OS Lite), no keyboard needed.
# Installs cage (minimal Wayland kiosk) + Chromium and a systemd service that opens the dashboard fullscreen.
# Works best on a Pi Zero 2 W or newer; a Pi Zero (ARMv6) is probably too slow for a browser with video.
#
#   sh scripts/kiosk.sh [url]          install + enable   (default url: http://localhost:1984)
#   sh scripts/kiosk.sh remove         disable and remove
set -e
cd "$(dirname "$0")/.."

if [ "$1" = "remove" ]; then
    sudo systemctl disable --now cam2wall-kiosk 2>/dev/null || true
    sudo rm -f /etc/systemd/system/cam2wall-kiosk.service
    sudo systemctl daemon-reload
    sudo systemctl enable getty@tty1 2>/dev/null || true
    echo "Kiosk removed. Reboot to get the login prompt back on the monitor."
    exit 0
fi

[ "$(id -u)" -ne 0 ] || { echo "Run this as your normal user (it asks for sudo itself)."; exit 1; }
URL="${1:-http://localhost:1984}"

sudo apt-get update
sudo apt-get install -y --no-install-recommends cage chromium fonts-dejavu-core
BROWSER="$(command -v chromium || command -v chromium-browser || true)"
[ -n "$BROWSER" ] || { echo "No chromium package found."; exit 1; }

sed -e "s|@USER@|$USER|g" -e "s|@BROWSER@|$BROWSER|g" -e "s|@URL@|$URL|g" deploy/cam2wall-kiosk.service \
    | sudo tee /etc/systemd/system/cam2wall-kiosk.service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable cam2wall-kiosk

echo
echo "Kiosk installed. Start it now with:   sudo systemctl start cam2wall-kiosk"
echo "It also starts automatically after a reboot (cam2wall.service should be enabled as well)."
echo "Logs: journalctl -u cam2wall-kiosk -f      Remove: sh scripts/kiosk.sh remove"
