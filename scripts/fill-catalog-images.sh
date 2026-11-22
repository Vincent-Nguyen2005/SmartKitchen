#!/usr/bin/env sh
# Fills missing catalog images from Wikimedia Commons (reusable licenses only, with author / license / source).
# Runs inside the admin-service container of the compose project "smartkitchen".
#   scripts/fill-catalog-images.sh --dry-run            # show what would be set
#   scripts/fill-catalog-images.sh --limit 10           # set at most 10
#   scripts/fill-catalog-images.sh                      # set all missing
exec docker compose -p smartkitchen exec -T admin-service node dist/scripts/fill-catalog-images.js "$@"
