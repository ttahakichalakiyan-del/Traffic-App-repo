# CTPL Traffic Command System

> Internal Android app system for City Traffic Police Lahore.
> Manages real-time staff tracking, daily duty rosters, and AI traffic predictions.

## Components

| Component | Platform | Purpose |
|-----------|----------|---------|
| **DSP Command App** | Android APK | Real-time map, roster management, alerts |
| **Staff GPS Tracker** | Android APK | Field staff duty + location tracking |
| **Backend API** | Railway.app | Node.js + Express + Socket.io |
| **ML Engine** | Railway.app | Python + Prophet predictions |
| **Admin Panel** | Vercel | Web dashboard for management |

## Quick Start

### Prerequisites
- Node.js 20+, Python 3.11+
- Android SDK (for APK builds)
- Supabase account (PostgreSQL + PostGIS)
- Railway.app account

### Local Development
```bash
# Install all dependencies
npm install

# Start all services
npm run dev        # starts backend (port 3001) + admin panel (port 5173)
cd apps/ml-engine && uvicorn main:app --reload --port 8001
```

### Build APKs
```bash
KEYSTORE_PASSWORD=ctpl@secure2026 KEY_PASSWORD=ctpl@secure2026 \
  ./scripts/build-apks.sh
# Output: release-apks/ctpl-dsp-v1.0.0.apk
#         release-apks/ctpl-staff-v1.0.0.apk
```

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](DEPLOYMENT.md) | Full deployment guide + cost breakdown |
| [ARCHITECTURE.md](ARCHITECTURE.md) | System design and data flow |
| [INSTALLATION.md](INSTALLATION.md) | IT admin APK sideloading guide (Urdu) |
| [STAFF_ONBOARDING.md](STAFF_ONBOARDING.md) | Field staff quick start guide (Urdu) |
| [TROUBLESHOOTING.md](TROUBLESHOOTING.md) | Common issues and fixes |

## Tech Stack

**Frontend (DSP App)**
- React Native + Expo SDK 55
- Expo Router (file-based navigation)
- React Query + Zustand
- Google Maps SDK
- Socket.io client

**Frontend (Staff App)**
- React Native + Expo SDK 55
- Background location tracking (expo-location)
- Offline queue (AsyncStorage)
- FCM push notifications

**Backend**
- Node.js 20 + Express + TypeScript
- Socket.io (real-time)
- Drizzle ORM + PostgreSQL (Supabase)
- PostGIS (spatial queries)
- JWT authentication

**ML Engine**
- Python 3.11 + FastAPI
- Prophet (time-series forecasting)
- Runs 8 PM daily predictions

**Infrastructure**
- Railway.app (backend + ML)
- Supabase (PostgreSQL + PostGIS)
- Vercel (admin panel)
- Firebase FCM (push notifications)
- Google Maps Platform

## Cost
~$5–35/month (~Rs 1,400–9,800/month)
See [DEPLOYMENT.md](DEPLOYMENT.md) for full breakdown.
