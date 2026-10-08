#!/bin/sh
# Linux / Raspberry Pi launcher: go2rtc serves both the streams and the dashboard.
set -e
cd "$(dirname "$0")"

[ -x bin/go2rtc ] || sh scripts/setup.sh
if [ ! -f config/go2rtc.yaml ]; then
    cp config/go2rtc.example.yaml config/go2rtc.yaml
    echo "config/go2rtc.yaml created - enter your camera URLs there, then run: sh start.sh"
    exit 1
fi
[ -f certs/cert.pem ] || sh scripts/make-cert.sh || true

set -- -config config/go2rtc.yaml
[ -f config/tls.yaml ] && set -- "$@" -config config/tls.yaml

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
echo "Dashboard:  http://${IP:-localhost}:1984"
[ -f config/tls.yaml ] && echo "            https://${IP:-localhost}:1985  (accept the certificate warning once)"
exec bin/go2rtc "$@"
