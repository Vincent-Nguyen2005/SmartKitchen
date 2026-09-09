#!/usr/bin/env bash
set -euo pipefail

# Idempotent directory bootstrap for contributors starting from a sparse checkout.
for directory in apps/gateway apps/mobile packages/shared services scripts .github; do
  if [[ ! -d "$directory" ]]; then
    mkdir -p "$directory"
  fi
done

echo "Directories verified. Existing files were left untouched."