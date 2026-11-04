#!/usr/bin/env bash
set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
passed=0
total=13

check_route() {
  local label="$1"
  local url="$2"
  local expected_status="$3"
  local expected_body="$4"
  local response status body
  response=$(curl --silent --show-error --max-time 5 --write-out '\n%{http_code}' "$url" 2>/dev/null || true)
  status=$(printf '%s\n' "$response" | tail -n 1)
  body=$(printf '%s\n' "$response" | sed '$d')
  if [[ "$status" == "$expected_status" && "$body" == *"$expected_body"* ]]; then
    printf "${GREEN}PASS${NC} %s\n" "$label"
    passed=$((passed + 1))
  else
    printf "${RED}FAIL${NC} %s (HTTP %s)\n" "$label" "${status:-unreachable}"
  fi
}

check_route "aggregate health" "http://localhost:4000/api/health" "200" '"status":"OK"'

for prefix in auth families inventory nutrition meal-diary recipes menus shopping-list payments notifications admin; do
  check_route "$prefix health" "http://localhost:4000/api/$prefix/health" "200" '"status":"OK"'
done

check_route "unknown prefix" "http://localhost:4000/api/unknown-prefix/x" "404" 'ROUTE_NOT_FOUND'

printf '\n%s/%s Routes Verified\n' "$passed" "$total"
[[ "$passed" -eq "$total" ]]