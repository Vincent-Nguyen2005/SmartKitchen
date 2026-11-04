#!/usr/bin/env bash
# Read-only production smoke test. No writes, no auth, no destructive calls.
# Usage: bash scripts/test-prod-smoke.sh https://api.example.vn [https://app.example.vn] [--allow-degraded]
#   --allow-degraded: accept /api/health 503 DEGRADED (stage 1: stage-2 services are not deployed yet).
set -u
BASE_URL="${1:?usage: test-prod-smoke.sh BASE_URL [ORIGIN] [--allow-degraded]}"; BASE_URL="${BASE_URL%/}"
ORIGIN=""; ALLOW_DEGRADED=false
for arg in "${@:2}"; do [[ "$arg" == "--allow-degraded" ]] && ALLOW_DEGRADED=true || ORIGIN="$arg"; done
GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[0;33m'; NC='\033[0m'
passed=0; failed=0; body=$(mktemp); headers=$(mktemp); trap 'rm -f "$body" "$headers"' EXIT
probe(){ local method="$1" path="$2"; shift 2; curl -sS -o "$body" -D "$headers" -w '%{http_code}' --max-time 15 -X "$method" "$@" "$BASE_URL$path" 2>/dev/null || echo 000; }
header(){ tr -d '\r' < "$headers" | awk -F': ' -v k="$1" 'tolower($1)==tolower(k){print $2}' | tail -n 1; }
check(){ if [[ "$2" == ok ]]; then printf "${GREEN}PASS${NC} %s\n" "$1"; passed=$((passed+1)); else printf "${RED}FAIL${NC} %s %s\n" "$1" "${3:-}"; failed=$((failed+1)); fi; }
no_stack(){ grep -Eq '\bat [^ ]+ \(.*:[0-9]+:[0-9]+\)|node_modules/' "$body" && echo bad || echo ok; }

s=$(probe GET /health); check 'gateway /health = 200' "$([[ $s == 200 ]] && echo ok)" "(status $s)"
s=$(probe GET /api/health)
if [[ $s == 200 ]] || { $ALLOW_DEGRADED && [[ $s == 503 ]]; }; then check "aggregate /api/health ($s)" ok; else check "aggregate /api/health ($s)" bad '(use --allow-degraded during stage 1)'; fi
head -c 600 "$body"; echo
s=$(probe GET /api/__smoke_unknown_route__); check 'unknown route = 404 ROUTE_NOT_FOUND' "$([[ $s == 404 ]] && grep -q ROUTE_NOT_FOUND "$body" && echo ok)" "(status $s)"
check 'no stack trace in 404 body' "$(no_stack)"
rate=$(header RateLimit); [[ -z "$rate" ]] && rate=$(header RateLimit-Policy); check 'rate-limit headers present on /api' "$([[ -n $rate ]] && echo ok)"
s=$(probe GET /api/notifications/internal/notifications); check 'internal service routes hidden (404)' "$([[ $s == 404 ]] && echo ok)" "(status $s)"
s=$(probe GET /api/admin/reports -H 'x-user-id: smoke' -H 'x-user-role: ADMIN'); check 'forged x-user-role is not trusted (401/403)' "$([[ $s == 401 || $s == 403 ]] && echo ok)" "(status $s)"
s=$(probe GET /api/admin/reports/mine -H 'Authorization: Bearer smoke.invalid.token'); check 'invalid Bearer token = 401' "$([[ $s == 401 ]] && echo ok)" "(status $s)"
check 'no stack trace in 401 body' "$(no_stack)"
if [[ -n "$ORIGIN" ]]; then
  s=$(probe OPTIONS /api/notifications/promotions -H "Origin: $ORIGIN" -H 'Access-Control-Request-Method: GET'); allow=$(header Access-Control-Allow-Origin)
  check "CORS preflight allows $ORIGIN" "$([[ ($s == 200 || $s == 204) && "$allow" == "$ORIGIN" ]] && echo ok)" "(status $s, allow-origin '$allow')"
  probe OPTIONS /api/notifications/promotions -H 'Origin: https://evil.invalid' -H 'Access-Control-Request-Method: GET' >/dev/null; allow=$(header Access-Control-Allow-Origin)
  check 'CORS preflight does not allow an unknown origin' "$([[ "$allow" != 'https://evil.invalid' && "$allow" != '*' ]] && echo ok)"
else
  printf "${YELLOW}SKIP${NC} CORS preflight (pass ORIGIN as 2nd argument)\n"
fi
printf '\n%s passed, %s failed\n' "$passed" "$failed"; [[ $failed -eq 0 ]]
