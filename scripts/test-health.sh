#!/usr/bin/env bash
set -u

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'
passed=0
total=12

for port in $(seq 4000 4011); do
  response=$(curl --silent --show-error --max-time 5 --write-out '\n%{http_code}' "http://localhost:${port}/health" 2>/dev/null || true)
  status=$(printf '%s\n' "$response" | tail -n 1)
  body=$(printf '%s\n' "$response" | sed '$d')
  if [[ "$status" == "200" && "$body" == *'"status":"OK"'* ]]; then
    printf "${GREEN}PASS${NC} port %s\n" "$port"
    passed=$((passed + 1))
  else
    printf "${RED}FAIL${NC} port %s (HTTP %s)\n" "$port" "${status:-unreachable}"
  fi
done

printf '\n%s/%s Services Operational\n' "$passed" "$total"
[[ "$passed" -eq "$total" ]]