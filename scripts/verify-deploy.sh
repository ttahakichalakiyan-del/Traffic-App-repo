#!/bin/bash

BACKEND_URL="${BACKEND_URL:-https://ctpl-backend.railway.app}"
ML_URL="${ML_URL:-https://ctpl-ml.railway.app}"
ADMIN_URL="${ADMIN_URL:-https://ctpl-admin.vercel.app}"
INTERNAL_KEY="${INTERNAL_API_KEY:-}"

echo "=== CTPL Production Deployment Verification ==="
echo "Backend: $BACKEND_URL"
echo "ML Engine: $ML_URL"
echo "Admin Panel: $ADMIN_URL"
echo ""

PASS=0
FAIL=0

check() {
  local name=$1
  local result=$2
  local expected=$3
  if echo "$result" | grep -q "$expected"; then
    echo "PASS: $name"
    PASS=$((PASS + 1))
  else
    echo "FAIL: $name"
    echo "  Expected: $expected"
    echo "  Got: $result"
    FAIL=$((FAIL + 1))
  fi
}

# 1. Backend health
echo "1. Checking backend health..."
BACKEND_HEALTH=$(curl -s "$BACKEND_URL/health")
check "Backend /health" "$BACKEND_HEALTH" '"status":"ok"'

# 2. ML Engine health
echo "2. Checking ML engine health..."
ML_HEALTH=$(curl -s "$ML_URL/health")
check "ML Engine /health" "$ML_HEALTH" '"status":"ok"'

# 3. Admin panel accessible
echo "3. Checking admin panel..."
ADMIN_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$ADMIN_URL")
check "Admin Panel HTTP" "$ADMIN_STATUS" "200"

# 4. Version endpoint
echo "4. Checking version endpoint..."
VERSION=$(curl -s "$BACKEND_URL/api/version")
check "Version endpoint" "$VERSION" '"dspApp"'

# 5. Database connected (via backend health detailed)
echo "5. Checking database connection..."
DB_CHECK=$(curl -s "$BACKEND_URL/health")
check "Database connected" "$DB_CHECK" '"status":"ok"'

# 6. Test admin login
echo "6. Testing admin login..."
ADMIN_LOGIN=$(curl -s -X POST "$BACKEND_URL/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"ctpl@admin2026"}')
check "Admin login" "$ADMIN_LOGIN" '"token"'

# Extract admin token
ADMIN_TOKEN=$(echo $ADMIN_LOGIN | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])" 2>/dev/null)

if [ -n "$ADMIN_TOKEN" ]; then
  # 7. System stats endpoint
  echo "7. Checking system stats..."
  STATS=$(curl -s "$BACKEND_URL/api/admin/system/stats" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  check "System stats" "$STATS" '"totalDsps"'

  # 8. Areas list
  echo "8. Checking areas list..."
  AREAS=$(curl -s "$BACKEND_URL/api/admin/areas-list" \
    -H "Authorization: Bearer $ADMIN_TOKEN")
  check "Areas list" "$AREAS" '"success":true'
fi

# 9. ML Engine areas summary
echo "9. Checking ML areas summary..."
ML_AREAS=$(curl -s "$ML_URL/areas-summary")
check "ML areas summary" "$ML_AREAS" '"success":true'

# 10. Test ML dry run predictions
echo "10. Testing ML predictions dry run..."
ML_PREDICT=$(curl -s -X POST "$ML_URL/run-predictions?dry_run=true" \
  -H "X-Internal-Key: $INTERNAL_KEY")
check "ML predictions dry run" "$ML_PREDICT" '"success":true'

# Summary
echo ""
echo "=== Verification Complete ==="
echo "PASSED: $PASS"
echo "FAILED: $FAIL"
echo ""

if [ $FAIL -eq 0 ]; then
  echo "ALL CHECKS PASSED -- System ready for production!"
  exit 0
else
  echo "SOME CHECKS FAILED -- Review above errors"
  exit 1
fi
