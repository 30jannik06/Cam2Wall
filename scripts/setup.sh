#!/bin/sh
# Downloads go2rtc (https://github.com/AlexxIT/go2rtc) matching this CPU into bin/.
# The version is pinned in go2rtc.version so the dashboard and go2rtc always fit together.
# Raspberry Pi Zero (armv6l) is supported.   Usage: scripts/setup.sh [version]
set -e
cd "$(dirname "$0")/.."
VERSION="${1:-$(head -n 1 go2rtc.version | tr -d '[:space:]')}"
case "$(uname -m)" in
    armv6l)         ASSET=go2rtc_linux_armv6 ;;
    armv7l|armhf)   ASSET=go2rtc_linux_arm ;;
    aarch64|arm64)  ASSET=go2rtc_linux_arm64 ;;
    x86_64|amd64)   ASSET=go2rtc_linux_amd64 ;;
    i386|i686)      ASSET=go2rtc_linux_i386 ;;
    *) echo "Unsupported architecture: $(uname -m)"; exit 1 ;;
esac
mkdir -p bin
URL="https://github.com/AlexxIT/go2rtc/releases/download/v$VERSION/$ASSET"
echo "Downloading go2rtc v$VERSION from $URL"
if command -v curl >/dev/null; then curl -fL "$URL" -o bin/go2rtc; else wget -O bin/go2rtc "$URL"; fi
chmod +x bin/go2rtc
echo "go2rtc v$VERSION installed in bin/"
