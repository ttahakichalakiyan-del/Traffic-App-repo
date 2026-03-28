# Firebase Cloud Messaging Setup

## Step 1: Firebase Console
1. console.firebase.google.com > New Project
2. Name: ctpl-traffic-system
3. Add Android App:
   DSP App: pk.gov.ctpl.dsp.command
   Staff App: pk.gov.ctpl.staff.tracker

## Step 2: Download Config Files
1. Project Settings > Your Apps
2. Download google-services.json for each app
3. Place in:
   apps/dsp-app/google-services.json
   apps/staff-app/google-services.json

## Step 3: Service Account for Backend
1. Project Settings > Service Accounts
2. Generate New Private Key
3. Save as firebase-service-account.json
4. Base64 encode for Railway:
   cat firebase-service-account.json | base64 -w 0
5. Set as FCM_SERVICE_ACCOUNT env var in Railway

## Step 4: Test Push Notification
  POST /api/internal/test-fcm [Admin JWT]
  Body: { deviceToken: "test-token", title: "Test", body: "Hello" }
