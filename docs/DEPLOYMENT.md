# CTPL System Deployment Guide

## Architecture Overview

  Staff Phones                DSP Phones              Admin Browser
      |                           |                         |
      v                           v                         v
  Staff APK                   DSP APK              Vercel (admin-panel)
      |                           |                         |
      +---------------------------+-------------------------+
                                  |
                    Railway.app (Backend API)
                    Node.js + Express + Socket.io
                                  |
                    +-------------+-------------+
                    |                           |
           Supabase (PostgreSQL)      Railway.app (ML Engine)
           PostGIS + Data               Python + Prophet
                                              |
                                    Runs 8PM daily predictions

## Environment Variables Checklist

Backend (Railway):
  [ ] NODE_ENV=production
  [ ] PORT=3001
  [ ] DATABASE_URL (Supabase transaction mode)
  [ ] JWT_SECRET (64 char random hex)
  [ ] GOOGLE_MAPS_API_KEY (restricted to your app)
  [ ] FCM_SERVICE_ACCOUNT (base64 encoded JSON)
  [ ] ML_ENGINE_URL
  [ ] INTERNAL_API_KEY
  [ ] CORS_ORIGINS
  [ ] TZ=Asia/Karachi
  [ ] HERE_API_KEY (optional)

ML Engine (Railway):
  [ ] DATABASE_URL (same as backend)
  [ ] BACKEND_URL
  [ ] INTERNAL_API_KEY (same as backend)
  [ ] TZ=Asia/Karachi

Admin Panel (Vercel):
  [ ] VITE_API_URL (backend Railway URL)

## Monthly Cost Estimate

  Railway Starter Plan: $5/month
    Backend service: ~$3/month (512MB RAM)
    ML Engine: ~$2/month (runs mostly idle, spikes at 8PM)

  Supabase Free Tier: $0/month
    500MB database storage
    5GB bandwidth
    Sufficient for 6-month pilot (~50 DSPs, ~500 staff)

  Google Maps Platform: $0-30/month
    Maps SDK: first $200 free per month
    With 50 DSPs opening app daily: well within free tier

  Firebase FCM: $0/month
    First 1,000,000 notifications free forever

  Vercel Hobby: $0/month
    Admin panel static hosting

  TOTAL: ~$5-35/month
  In Rupees: ~Rs 1,400 - 9,800/month

## Upgrade Path (when traffic grows)

  Supabase Pro ($25/month): when > 500MB data
  Railway Pro ($20/month): when CPU/RAM consistently high
  Google Maps increase: if DSP count > 200
