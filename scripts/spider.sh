#!/bin/sh
# Switches the spider easter egg on or off:  sh scripts/spider.sh on|off
cd "$(dirname "$0")/.."
case "$1" in
    on)  echo '{"spider": true}' > www/state.json; echo "Spider is ON (visible within ~5 seconds)." ;;
    off) rm -f www/state.json; echo "Spider is OFF." ;;
    *)   echo "Usage: sh scripts/spider.sh on|off"; exit 1 ;;
esac
