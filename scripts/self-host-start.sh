#!/bin/bash
# Start (or update) the self-hosted SmartKitchen stack. Guide: docs/deploy/self-host.md
#   scripts/self-host-start.sh               pull the latest images, then start
#   SKIP_PULL=1 scripts/self-host-start.sh   start with images already on this machine (built locally)
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE=(docker compose -p smartkitchen -f docker-compose.prod.yml)
GATEWAY_HEALTH_URL="http://127.0.0.1:4000/health"
TIMEOUT_SECONDS="${TIMEOUT_SECONDS:-300}"

if [ ! -f .env ]; then
  echo "Missing .env. Copy .env.example to .env and fill in the secrets first." >&2
  exit 1
fi

# Pull latest images, start services, wait for gateway healthy
if [ "${SKIP_PULL:-0}" != "1" ]; then
  "${COMPOSE[@]}" pull
fi
"${COMPOSE[@]}" up -d

echo "Waiting for gateway at ${GATEWAY_HEALTH_URL} (up to ${TIMEOUT_SECONDS}s)..."
deadline=$((SECONDS + TIMEOUT_SECONDS))
until curl -sf "${GATEWAY_HEALTH_URL}" > /dev/null; do
  if [ "${SECONDS}" -ge "${deadline}" ]; then
    echo "Gateway did not become healthy in ${TIMEOUT_SECONDS}s. Check: ${COMPOSE[*]} ps" >&2
    exit 1
  fi
  sleep 3
done
echo "SmartKitchen is up."
