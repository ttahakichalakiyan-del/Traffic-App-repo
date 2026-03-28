# Railway.app Setup Guide

## Step 1: Create Railway Account
1. railway.app > Sign Up with GitHub
2. New Project > Empty Project
3. Name: ctpl-traffic-system

## Step 2: Deploy Backend Service

1. New Service > Deploy from GitHub Repo
2. Select your repo, branch: main
3. Root Directory: leave empty (uses railway.toml)
4. Service name: ctpl-backend

Set Environment Variables (Settings > Variables):
  NODE_ENV = production
  PORT = 3001
  TZ = Asia/Karachi
  DATABASE_URL = [Supabase connection string - Transaction mode]
  JWT_SECRET = [run: openssl rand -hex 64]
  JWT_EXPIRY = 30d
  GOOGLE_MAPS_API_KEY = [your key]
  FCM_SERVICE_ACCOUNT = [base64: cat firebase-key.json | base64 -w 0]
  ML_ENGINE_URL = https://[ml-service].railway.app
  INTERNAL_API_KEY = [openssl rand -hex 32]
  CORS_ORIGINS = https://[admin-panel].vercel.app
  APK_DOWNLOAD_URL = [optional: where staff download APK from]
  HERE_API_KEY = [optional: for traffic data]

Custom Domain (optional):
  Settings > Networking > Custom Domain
  api.ctpl.gov.pk (if you have domain)

## Step 3: Deploy ML Engine Service

1. Same repo > New Service
2. Set Root Directory: apps/ml-engine
3. Service name: ctpl-ml-engine

Environment Variables:
  DATABASE_URL = [same Supabase URL]
  BACKEND_URL = https://[backend].railway.app
  INTERNAL_API_KEY = [same key as backend]
  TZ = Asia/Karachi
  PORT = 8001

## Step 4: Get Supabase Connection String

1. Supabase Dashboard > Settings > Database
2. Connection string > Transaction mode (port 6543)
   postgres://postgres.[ref]:[password]@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres
3. Add ?pgbouncer=true&connection_limit=1 to end

## Step 5: Configure Daily Backups on Supabase

1. Settings > Backups
2. Enable Point-in-Time Recovery (paid) OR
3. Free tier: automatic daily backups last 7 days
4. Test restore process: Settings > Backups > Restore
