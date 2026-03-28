#!/bin/bash
# =============================================================
# CTPL Final APK Pre-Release Checklist
# Run from monorepo root: ./scripts/final-apk-check.sh
# =============================================================

echo "=== CTPL Final APK Pre-Release Checklist ==="
echo ""

ISSUES=0

# ── Check 1: Debug console statements ────────────────────────
echo "1. Checking for debug console statements in production code..."
DEBUG_COUNT=$(grep -r "console\.log\|console\.error\|console\.warn" \
  apps/dsp-app/src apps/staff-app/src \
  --include="*.ts" --include="*.tsx" \
  --exclude-dir="__tests__" \
  2>/dev/null | grep -v "//.*console\|ErrorBoundary\|deviceUtils" | wc -l | tr -d ' ')

if [ "$DEBUG_COUNT" -eq 0 ]; then
  echo "   PASS: 0 debug statements"
else
  echo "   WARN: $DEBUG_COUNT console statements found (review before release)"
fi

# ── Check 2: HTTP (non-HTTPS) URLs ────────────────────────────
echo ""
echo "2. Checking for insecure HTTP URLs..."
HTTP_URLS=$(grep -r "http://" apps/dsp-app/src apps/staff-app/src \
  --include="*.ts" --include="*.tsx" 2>/dev/null \
  | grep -v "localhost\|127.0.0.1\|//\s" | grep -v "^.*://.*//")

if [ -z "$HTTP_URLS" ]; then
  echo "   PASS: No insecure HTTP URLs"
else
  echo "   FAIL: Insecure HTTP URLs found:"
  echo "$HTTP_URLS"
  ISSUES=$((ISSUES + 1))
fi

# ── Check 3: Version consistency ─────────────────────────────
echo ""
echo "3. Checking version number consistency..."
DSP_VER=$(grep '"version"' apps/dsp-app/package.json | head -1 | tr -d ' ",' | cut -d: -f2)
STAFF_VER=$(grep '"version"' apps/staff-app/package.json | head -1 | tr -d ' ",' | cut -d: -f2)
SHARED_VER=$(grep "DSP_APP" packages/shared-types/src/version.ts 2>/dev/null | head -1)
echo "   DSP app version: $DSP_VER"
echo "   Staff app version: $STAFF_VER"
echo "   Shared types: $SHARED_VER"

# ── Check 4: .env files not committed ─────────────────────────
echo ""
echo "4. Checking .env files not tracked by git..."
ENV_IN_GIT=$(git ls-files 2>/dev/null | grep "\.env$" | grep -v ".env.example")
if [ -z "$ENV_IN_GIT" ]; then
  echo "   PASS: No .env files in git"
else
  echo "   FAIL: .env files committed to git:"
  echo "$ENV_IN_GIT"
  ISSUES=$((ISSUES + 1))
fi

# ── Check 5: Keystores NOT in git ─────────────────────────────
echo ""
echo "5. Checking keystores not tracked by git..."
KEYSTORES_IN_GIT=$(git ls-files 2>/dev/null | grep "\.keystore\|\.jks")
if [ -z "$KEYSTORES_IN_GIT" ]; then
  echo "   PASS: No keystores in git"
else
  echo "   FAIL: Keystores in git — REMOVE IMMEDIATELY:"
  echo "$KEYSTORES_IN_GIT"
  ISSUES=$((ISSUES + 1))
fi

# ── Check 6: APK files exist ──────────────────────────────────
echo ""
echo "6. Checking APK files..."
DSP_APK=$(ls release-apks/ctpl-dsp-*.apk 2>/dev/null | head -1)
STAFF_APK=$(ls release-apks/ctpl-staff-*.apk 2>/dev/null | head -1)

if [ -n "$DSP_APK" ]; then
  DSP_SIZE=$(du -h "$DSP_APK" | cut -f1)
  echo "   PASS: DSP APK: $DSP_APK ($DSP_SIZE)"
else
  echo "   FAIL: DSP APK not found in release-apks/"
  ISSUES=$((ISSUES + 1))
fi

if [ -n "$STAFF_APK" ]; then
  STAFF_SIZE=$(du -h "$STAFF_APK" | cut -f1)
  echo "   PASS: Staff APK: $STAFF_APK ($STAFF_SIZE)"
else
  echo "   FAIL: Staff APK not found in release-apks/"
  ISSUES=$((ISSUES + 1))
fi

# ── Check 7: APK size sanity ──────────────────────────────────
echo ""
echo "7. Checking APK sizes..."
if [ -n "$DSP_APK" ]; then
  DSP_BYTES=$(du -b "$DSP_APK" 2>/dev/null | cut -f1 || du -k "$DSP_APK" | cut -f1)
  if [ "$DSP_BYTES" -gt 10000000 ]; then
    echo "   PASS: DSP APK > 10MB (has native code)"
  else
    echo "   WARN: DSP APK seems small — verify it's a release build"
  fi
fi

# ── Check 8: .gitignore covers sensitive files ─────────────────
echo ""
echo "8. Checking .gitignore coverage..."
GITIGNORE_OK=true
for pattern in "*.keystore" "*.jks" "release-apks/" ".env"; do
  if ! grep -q "$pattern" .gitignore 2>/dev/null; then
    echo "   WARN: $pattern not in root .gitignore"
    GITIGNORE_OK=false
  fi
done
if $GITIGNORE_OK; then
  echo "   PASS: .gitignore covers all sensitive patterns"
fi

# ── Summary ────────────────────────────────────────────────────
echo ""
echo "=== Automated Check Results ==="
if [ "$ISSUES" -eq 0 ]; then
  echo "AUTOMATED CHECKS: ALL PASS"
else
  echo "AUTOMATED CHECKS: $ISSUES ISSUE(S) FOUND — fix before releasing"
fi

echo ""
echo "=== Manual Checks Required ==="
echo "[ ] App icon set (not default Expo robot)"
echo "[ ] Splash screen: navy background with CTPL text"
echo "[ ] Both APKs signed with release keystore (not debug.keystore)"
echo "[ ] Tested on real Android phone (not just emulator)"
echo "[ ] GPS background tracking: lock phone 5 min, check DB locations table"
echo "[ ] WhatsApp share tested on real device — image quality clear"
echo "[ ] PDF download tested on real device"
echo "[ ] Push notification received on real device"
echo "[ ] App works on slow 3G connection (test with Zong/Jazz SIM)"
echo "[ ] DSP app: all 5 map layers toggle correctly"
echo "[ ] Staff app: offline queue works — disable wifi, add locations, re-enable"
echo ""

exit $ISSUES
