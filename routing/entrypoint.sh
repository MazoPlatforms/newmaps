#!/bin/sh
set -eu

case "${ROUTE_PROFILE:-}" in
  driving) profile=car ;;
  walking) profile=foot ;;
  cycling) profile=bicycle ;;
  *) echo "Unsupported route profile" >&2; exit 64 ;;
esac

test -s "/data/${profile}.osrm" || { echo "Routing graph is missing" >&2; exit 66; }
exec osrm-routed --algorithm mld --ip 0.0.0.0 --port 5000 --threads 1 "/data/${profile}.osrm"
