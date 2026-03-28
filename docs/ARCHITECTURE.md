# CTPL Traffic System — Architecture

## Overview

The City Traffic Police Lahore (CTPL) system is a monorepo containing 5 applications that work together to manage traffic operations, staff deployment, and predictive analytics.

## System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                        CTPL MONOREPO                            │
├─────────────┬──────────────┬──────────────┬──────────┬──────────┤
│  DSP App    │  Staff App   │   Backend    │ ML Engine│  Admin   │
│  (Expo/RN)  │  (Expo/RN)   │  (Express)   │ (FastAPI)│  (Vite)  │
│             │              │              │          │          │
│ • Dashboard │ • GPS Track  │ • REST API   │ • Prophet│ • Tables │
│ • Maps      │ • Background │ • Socket.io  │ • Nightly│ • Charts │
│ • Roster    │   location   │ • JWT Auth   │   cron   │ • CRUD   │
│ • Alerts    │ • Push notif │ • PostGIS    │ • Predict│ • Reports│
│ • Reports   │              │ • FCM Push   │          │          │
└──────┬──────┴───────┬──────┴──────┬───────┴────┬─────┴────┬─────┘
       │              │             │            │          │
       └──────────────┴─────────────┤            │          │
                                    ▼            ▼          │
                            ┌──────────────────────┐       │
                            │  PostgreSQL + PostGIS │       │
                            └──────────────────────┘       │
                            ┌──────────────────────┐       │
                            │       Redis          │◄──────┘
                            └──────────────────────┘
```

## 1. DSP Command App (`/apps/dsp-app`)

**Purpose:** Mobile app for Deputy Superintendents of Police (DSPs) to manage their assigned areas.

**Key Features:**
- Real-time map with staff locations (react-native-maps + Socket.io)
- Daily roster management (create, edit, publish)
- Traffic alerts (create, view, resolve)
- Traffic density snapshots
- ML-powered traffic predictions
- PDF report generation (via backend)
- Push notifications for alerts

**Tech:** React Native (Expo SDK 50+), Expo Router, Zustand, React Query

## 2. Staff GPS Tracker (`/apps/staff-app`)

**Purpose:** Minimal APK installed on field staff phones for continuous GPS tracking.

**Key Features:**
- Background location tracking (expo-task-manager)
- Sends location to backend every 30 seconds
- Receives push notifications
- Minimal UI — duty status toggle only
- Battery-optimized

**Tech:** React Native (Expo), expo-location, expo-task-manager

## 3. Backend API (`/apps/backend`)

**Purpose:** Central REST + WebSocket server.

**Key Features:**
- JWT authentication with refresh tokens
- CRUD for all entities (users, areas, sectors, rosters, alerts)
- Real-time location ingestion via Socket.io
- PostGIS spatial queries (staff near intersection, area boundaries)
- Push notification dispatch via FCM
- PDF report generation via Puppeteer
- Scheduled jobs via node-cron

**Tech:** Express, TypeScript, Drizzle ORM, PostgreSQL + PostGIS, Socket.io

## 4. ML Prediction Engine (`/apps/ml-engine`)

**Purpose:** Nightly batch job + on-demand API for traffic predictions.

**Key Features:**
- Prophet time-series model per sector/intersection
- Nightly training on historical snapshots
- REST endpoint for predictions
- Confidence intervals

**Tech:** Python, FastAPI, Prophet, Pandas, APScheduler

## 5. Admin Panel (`/apps/admin-panel`)

**Purpose:** Web dashboard for headquarters/admin staff.

**Key Features:**
- User management (DSPs, staff, admins)
- Area/sector configuration with map editor
- System-wide traffic overview with charts
- Roster review and approval
- Audit logs

**Tech:** React 18, Vite, TanStack Table, Recharts, React Router

## Shared Packages

### `@ctpl/shared-types`
TypeScript interfaces shared across all JS/TS apps: user models, API response wrappers, Socket.io event types.

### `@ctpl/config`
Shared ESLint, Prettier, and base TypeScript configuration.

## Data Flow

1. **Staff GPS** → Staff App sends location every 30s → Backend Socket.io → stored in PostgreSQL (PostGIS) → broadcast to subscribed DSPs
2. **Traffic Snapshots** → DSP creates snapshot → Backend API → PostgreSQL → ML Engine reads for training
3. **Predictions** → ML Engine nightly job → reads snapshots → trains Prophet → writes predictions → Backend serves to DSP App
4. **Alerts** → DSP creates alert → Backend → Socket.io broadcast to all subscribed clients + FCM push to relevant staff
5. **Rosters** → DSP creates roster → Backend API → Push notifications to assigned staff

## Hosting

- **Backend + Admin Panel:** Railway.app
- **Database:** Supabase (PostgreSQL + PostGIS)
- **ML Engine:** Railway.app (Python service)
- **Mobile Apps:** Direct APK distribution (no Play Store)

## Local Development

```bash
# Start infrastructure
docker-compose up -d

# Install all dependencies
npm install

# Run all apps in dev mode
npx turbo run dev
```
