#!/bin/bash
set -e

echo "=== Generating CTPL Keystores ==="

mkdir -p apps/dsp-app/android/app/keystores
mkdir -p apps/staff-app/android/app/keystores

# DSP App keystore
echo "Generating DSP app keystore..."
keytool -genkey -v \
  -keystore apps/dsp-app/android/app/keystores/ctpl-dsp.keystore \
  -alias ctpl-dsp-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=CTPL DSP Command App, OU=IT Department, O=City Traffic Police Lahore, L=Lahore, ST=Punjab, C=PK" \
  -storepass "${KEYSTORE_PASSWORD:-ctpl@dsp2026}" \
  -keypass "${KEY_PASSWORD:-ctpl@dsp2026}"
echo "DSP keystore created."

# Staff App keystore
echo "Generating Staff app keystore..."
keytool -genkey -v \
  -keystore apps/staff-app/android/app/keystores/ctpl-staff.keystore \
  -alias ctpl-staff-key \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000 \
  -dname "CN=CTPL Staff GPS Tracker, OU=IT Department, O=City Traffic Police Lahore, L=Lahore, ST=Punjab, C=PK" \
  -storepass "${KEYSTORE_PASSWORD:-ctpl@staff2026}" \
  -keypass "${KEY_PASSWORD:-ctpl@staff2026}"
echo "Staff keystore created."

# Print SHA-256 fingerprints
echo ""
echo "=== DSP App SHA-256 Fingerprint ==="
keytool -list -v \
  -keystore apps/dsp-app/android/app/keystores/ctpl-dsp.keystore \
  -alias ctpl-dsp-key \
  -storepass "${KEYSTORE_PASSWORD:-ctpl@dsp2026}" \
  | grep "SHA256:"

echo ""
echo "=== Staff App SHA-256 Fingerprint ==="
keytool -list -v \
  -keystore apps/staff-app/android/app/keystores/ctpl-staff.keystore \
  -alias ctpl-staff-key \
  -storepass "${KEYSTORE_PASSWORD:-ctpl@staff2026}" \
  | grep "SHA256:"

echo ""
echo "=== IMPORTANT: Save these fingerprints! ==="
echo "Add them to Google Maps Platform API key restrictions."
echo "Keystores saved in android/app/keystores/ folders."
echo ""
echo "=== NEVER commit keystores to git! ==="
