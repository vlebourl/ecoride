#!/usr/bin/env bash
# test-oauth-deploy.sh — Verify OAuth + service worker deployment
# Usage: bash scripts/test-oauth-deploy.sh [domain]
set -uo pipefail

DOMAIN="${1:-ecoride.tiarkaerell.com}"
BASE="https://$DOMAIN"
PASS=0
FAIL=0

pass() { echo "  ✅ PASS"; ((PASS++)); }
fail() { echo "  ❌ FAIL — $1"; ((FAIL++)); }

echo "=== OAuth Deploy Verification: $BASE ==="
echo ""

# ---- Test 1: sw.js contains denylist ----
echo "[TEST 1] sw.js contains NavigationRoute denylist for /api/"
SW=$(curl -sf "$BASE/sw.js" 2>/dev/null || echo "FETCH_FAILED")
if echo "$SW" | grep -q 'denylist'; then
  pass
else
  fail "denylist not found in sw.js. SW still intercepts /api/ navigations."
fi

# ---- Test 2: sw.js imports sw-api-guard.js ----
echo "[TEST 2] sw.js imports sw-api-guard.js (belt-and-suspenders)"
if echo "$SW" | grep -q 'sw-api-guard'; then
  pass
else
  fail "importScripts('sw-api-guard.js') not found in sw.js"
fi

# ---- Test 3: sw-api-guard.js is accessible ----
echo "[TEST 3] sw-api-guard.js is accessible (HTTP 200)"
GUARD_STATUS=$(curl -sf -o /dev/null -w "%{http_code}" "$BASE/sw-api-guard.js" 2>/dev/null)
if [ "$GUARD_STATUS" = "200" ]; then
  pass
else
  fail "HTTP $GUARD_STATUS (expected 200)"
fi

# ---- Test 4: /api/auth/callback/google returns 302 NOT HTML ----
echo "[TEST 4] /api/auth/callback/google returns 302 redirect (not HTML)"
CALLBACK_RESP=$(curl -sf -D /dev/stderr -o /tmp/ecoride_cb_body "$BASE/api/auth/callback/google?state=test&code=test" 2>&1)
CALLBACK_STATUS=$(echo "$CALLBACK_RESP" | grep -oE 'HTTP/[0-9.]+ [0-9]+' | head -1 | awk '{print $2}')
CALLBACK_BODY=$(cat /tmp/ecoride_cb_body 2>/dev/null || echo "")
if [ "$CALLBACK_STATUS" = "302" ]; then
  if echo "$CALLBACK_BODY" | grep -q '<!DOCTYPE'; then
    fail "Got 302 but body is HTML (SPA served instead of API redirect)"
  else
    pass
  fi
elif [ "$CALLBACK_STATUS" = "200" ]; then
  if echo "$CALLBACK_BODY" | grep -q '<!DOCTYPE'; then
    fail "Got 200 with HTML — service worker or SPA fallback intercepting the callback"
  else
    fail "Got 200 but unexpected body"
  fi
else
  fail "HTTP $CALLBACK_STATUS (expected 302)"
fi

# ---- Test 5: /api/health returns JSON ----
echo "[TEST 5] /api/health returns {ok:true}"
HEALTH=$(curl -sf "$BASE/api/health" 2>/dev/null || echo "FETCH_FAILED")
if echo "$HEALTH" | grep -q '"ok":true'; then
  pass
else
  fail "Response: $HEALTH"
fi

# ---- Test 6: OAuth sign-in endpoint returns Google URL ----
echo "[TEST 6] POST /api/auth/sign-in/social returns Google OAuth URL"
SIGNIN=$(curl -sf -X POST "$BASE/api/auth/sign-in/social" \
  -H "Content-Type: application/json" \
  -d "{\"provider\":\"google\",\"callbackURL\":\"$BASE/\"}" 2>/dev/null || echo "FETCH_FAILED")
if echo "$SIGNIN" | grep -q 'accounts.google.com'; then
  pass
else
  fail "Response: $(echo "$SIGNIN" | head -c 200)"
fi

echo ""
echo "==============================="
echo "Results: $PASS passed, $FAIL failed"
echo "==============================="
[ "$FAIL" -eq 0 ] && echo "All tests passed — safe to test in browser." && exit 0
echo "FIX THE FAILURES before testing in browser." && exit 1
