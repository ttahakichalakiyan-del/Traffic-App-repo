# CTPL System — Troubleshooting Guide

## GPS Issues

### Staff location not updating on DSP map
1. **Check DSP app** — staff count shows 0? Socket disconnected?
2. **Check staff app home screen** — GPS status green?
3. **Battery optimization OFF?** (most common issue on Samsung/MIUI)
   - Staff app > Settings > Battery Setup kar dein
4. **Check Railway backend logs** — location records arriving?
   - Railway dashboard > ctpl-backend > Logs
   - Look for `POST /api/tracking/location 200`
5. **Socket connected?** DSP app Settings > Backend status

### GPS accuracy poor (100+ metres)
- Normal indoors or in basement areas — physics limitation
- `ACCURACY_BALANCED` mode: 30–50m typical outdoors
- `ACCURACY_HIGH` (Foreground): 5–15m outdoors
- Cannot improve further without hardware upgrade

### Staff marker stuck at old position
- Staff phone may have lost network — marker turns grey after 5 min
- Check staff app — orange "queued" count shows offline pings
- When network restored, batch upload sends all pending locations

---

## Login Issues

### DSP cannot login
1. Check admin panel > DSP Management > `is_active = true`?
2. Badge number correct? (case-sensitive)
3. Reset password via admin panel
4. Check backend logs for specific error code

### Staff PIN not working
1. PIN must be exactly 4 digits
2. Admin panel > Staff Management > Reset PIN
3. New PIN shown once — confirm directly with staff member
4. CNIC must match exactly (13 digits, no dashes)

---

## App Crashes

### DSP app crashes on map
1. **Google Maps API key quota** — check `console.cloud.google.com > APIs > Maps SDK`
2. **Memory** — close other apps on phone, retry
3. Check Railway backend logs for errors around crash time
4. Wrap in ErrorBoundary already in place — check console logs

### Staff app stops tracking after phone locked
1. **Battery optimization** re-enabled itself (common after Samsung/MIUI update)
2. Re-do battery optimization: Settings > Battery Setup in app
3. On MIUI: also check Autostart permission still ON
4. On Samsung: check "Never sleeping" list in Battery settings

### Staff app crashes on startup
1. Force stop app > Clear cache > Reopen
2. If persists: uninstall, reinstall APK
3. Check if Android version < 8.0 (minSdk 24 = Android 7.0 required)

---

## Backend Issues

### Railway service restarting repeatedly
1. Check Railway logs for `OOM` (Out of Memory) errors
2. If OOM: upgrade Railway plan or reduce `max` in pool config
3. Check for infinite loops in cron jobs (8 PM prediction job)

### `Database connection error` in logs
1. Must use **Transaction mode** URL (port 6543), NOT direct (port 5432)
2. Add `?pgbouncer=true&connection_limit=1` to connection string
3. Check Supabase dashboard — database paused? (free tier pauses after 7 days inactivity)

### `JWT malformed` or `invalid signature` errors
- JWT_SECRET mismatch between old and new deploy
- In Railway: update JWT_SECRET > Redeploy all services
- All active sessions will be invalidated (users must re-login)

---

## ML Engine Issues

### Predictions not showing on map
1. Check ML engine health: `https://[ml].railway.app/health`
2. Check predictions ran last night: `GET /api/predictions/:areaId`
3. Railway logs at 8 PM — look for `run-predictions` success
4. Manual trigger: `POST /api/internal/run-predictions` (admin auth)

### ML engine out of memory during predictions
- Prophet needs ~200MB RAM per model
- Ensure Railway ML service has at least 512MB RAM
- If still OOM: reduce training window in `predictor.py`

---

## Admin Panel Issues

### Admin panel shows blank page
1. Check Vercel deployment logs for build errors
2. `VITE_API_URL` correct? Should be `https://[backend].railway.app`
3. CORS error in browser console? Add Vercel URL to `CORS_ORIGINS` in Railway

### Cannot login to admin panel
- Username: `admin`, Password: `ctpl@admin2026`
- If forgotten: update directly in Supabase SQL editor:
  ```sql
  UPDATE admin_users SET password_hash = crypt('newpassword', gen_salt('bf'))
  WHERE username = 'admin';
  ```

---

## Pakistan Network Issues

### App unusable on Jazz/Zong edge areas
- Staff app has offline queue — locations saved locally, sent when connected
- Queue shows in home screen: "5 locations pending upload"
- Offline mode works indefinitely — syncs on reconnect

### Push notifications not received
1. Check FCM service account in Railway env vars
2. Supabase → check `fcm_token` stored for staff member
3. Firebase Console → Check project health
4. Test manually: `POST /api/internal/test-fcm` (admin auth)
5. Some ISPs (especially in rural areas) block FCM — no fix available

---

## Quick Reference — Railway Environment Variables

If a service is failing, verify all env vars are set:

```
Backend required:
  DATABASE_URL, JWT_SECRET, PORT=3001, NODE_ENV=production,
  GOOGLE_MAPS_API_KEY, FCM_SERVICE_ACCOUNT, ML_ENGINE_URL,
  INTERNAL_API_KEY, CORS_ORIGINS, TZ=Asia/Karachi

ML Engine required:
  DATABASE_URL, BACKEND_URL, INTERNAL_API_KEY, TZ=Asia/Karachi
```
