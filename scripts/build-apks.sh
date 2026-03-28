#!/bin/bash
set -e

VERSION="1.0.0"
DATE=$(date +%Y%m%d)
OUTPUT_DIR="./release-apks"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== CTPL APK Build Script ==="
echo "Version: $VERSION | Date: $DATE"

mkdir -p "$OUTPUT_DIR"

# Check env vars
if [ -z "$KEYSTORE_PASSWORD" ]; then
  echo "ERROR: KEYSTORE_PASSWORD not set. Export it before running:"
  echo "  export KEYSTORE_PASSWORD=ctpl@secure2026"
  exit 1
fi

KEY_PASSWORD="${KEY_PASSWORD:-$KEYSTORE_PASSWORD}"

# ── DSP App ──────────────────────────────────────────────────
echo ""
echo "Building DSP Command App..."
cd "$ROOT_DIR/apps/dsp-app"

export KEYSTORE_PATH="$ROOT_DIR/apps/dsp-app/keystores/ctpl-dsp.keystore"
export KEY_ALIAS="ctpl-dsp-key"

# Prebuild (withSigningConfig plugin handles build.gradle patching)
npx expo prebuild --platform android --clean

# Copy local.properties for SDK location
echo "sdk.dir=$LOCALAPPDATA\\Android\\Sdk" > android/local.properties

# Copy splash screen logo drawable
for dir in drawable drawable-hdpi drawable-mdpi drawable-xhdpi drawable-xxhdpi drawable-xxxhdpi; do
  cp -f assets/splash-icon.png "android/app/src/main/res/$dir/splashscreen_logo.png" 2>/dev/null || true
done

cd android
EXPO_NO_METRO_WORKSPACE_ROOT=1 \
NODE_ENV=production \
KEYSTORE_PATH="$KEYSTORE_PATH" \
KEY_ALIAS="$KEY_ALIAS" \
KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD" \
KEY_PASSWORD="$KEY_PASSWORD" \
./gradlew assembleRelease --no-daemon
cd "$ROOT_DIR"

cp "apps/dsp-app/android/app/build/outputs/apk/release/app-release.apk" \
  "$OUTPUT_DIR/ctpl_dsp_command_v${VERSION}_${DATE}.apk"
echo "✓ DSP APK: $OUTPUT_DIR/ctpl_dsp_command_v${VERSION}_${DATE}.apk"

# ── Staff App ─────────────────────────────────────────────────
echo ""
echo "Building Staff GPS Tracker App..."
cd "$ROOT_DIR/apps/staff-app"

export KEYSTORE_PATH="$ROOT_DIR/apps/staff-app/keystores/ctpl-staff.keystore"
export KEY_ALIAS="ctpl-staff-key"

npx expo prebuild --platform android --clean

echo "sdk.dir=$LOCALAPPDATA\\Android\\Sdk" > android/local.properties

for dir in drawable drawable-hdpi drawable-mdpi drawable-xhdpi drawable-xxhdpi drawable-xxxhdpi; do
  cp -f assets/splash-icon.png "android/app/src/main/res/$dir/splashscreen_logo.png" 2>/dev/null || true
done

cd android
EXPO_NO_METRO_WORKSPACE_ROOT=1 \
NODE_ENV=production \
KEYSTORE_PATH="$KEYSTORE_PATH" \
KEY_ALIAS="$KEY_ALIAS" \
KEYSTORE_PASSWORD="$KEYSTORE_PASSWORD" \
KEY_PASSWORD="$KEY_PASSWORD" \
./gradlew assembleRelease --no-daemon
cd "$ROOT_DIR"

cp "apps/staff-app/android/app/build/outputs/apk/release/app-release.apk" \
  "$OUTPUT_DIR/ctpl_staff_gps_v${VERSION}_${DATE}.apk"
echo "✓ Staff APK: $OUTPUT_DIR/ctpl_staff_gps_v${VERSION}_${DATE}.apk"

# ── Summary ───────────────────────────────────────────────────
echo ""
echo "=== Build Complete ==="
ls -lh "$OUTPUT_DIR/"
echo ""
echo "Install commands:"
echo "  DSP App:   adb install $OUTPUT_DIR/ctpl_dsp_command_v${VERSION}_${DATE}.apk"
echo "  Staff App: adb install $OUTPUT_DIR/ctpl_staff_gps_v${VERSION}_${DATE}.apk"
