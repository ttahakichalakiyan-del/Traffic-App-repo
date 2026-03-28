/**
 * Socket.io test client — connects as a fake DSP
 * Usage: npx tsx scripts/test-socket.ts
 */
import { io as ioClient } from 'socket.io-client';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-ctpl-2026-change-in-production';
const SERVER_URL = process.env.BACKEND_URL || 'http://localhost:3001';

// Generate a test DSP token
const testDspId = '00000000-0000-0000-0000-000000000001';
const testAreaId = '00000000-0000-0000-0000-000000000010';

const token = jwt.sign(
  { userId: testDspId, userType: 'dsp', areaId: testAreaId },
  JWT_SECRET,
  { expiresIn: '1h' },
);

console.log('='.repeat(60));
console.log('CTPL Socket.io Test Client');
console.log('='.repeat(60));
console.log(`Server: ${SERVER_URL}`);
console.log(`DSP ID: ${testDspId}`);
console.log(`Area ID: ${testAreaId}`);
console.log('');

const socket = ioClient(SERVER_URL, {
  auth: { token },
  transports: ['websocket', 'polling'],
  reconnection: true,
  reconnectionAttempts: 3,
  timeout: 10000,
});

// ── Connection events ─────────────────────────────────────

socket.on('connect', () => {
  console.log(`[OK] Connected! Socket ID: ${socket.id}`);
  console.log(`[OK] Transport: ${socket.io.engine.transport.name}`);
});

socket.on('connected', (data: { message: string }) => {
  console.log(`[SERVER] ${data.message}`);
});

socket.on('connect_error', (err: Error) => {
  console.error(`[ERROR] Connection failed: ${err.message}`);
});

socket.on('disconnect', (reason: string) => {
  console.log(`[DISCONNECTED] Reason: ${reason}`);
});

// ── Staff tracking events ─────────────────────────────────

socket.on('staff:position_update', (data: Record<string, unknown>) => {
  console.log(`[POSITION] ${data.fullName}: lat=${data.lat}, lng=${data.lng}, battery=${data.batteryLevel}%`);
});

socket.on('staff:duty_started', (data: Record<string, unknown>) => {
  console.log(`[DUTY START] ${data.fullName} (${data.designation}) at ${data.sectorName}`);
});

socket.on('staff:duty_ended', (data: Record<string, unknown>) => {
  console.log(`[DUTY END] ${data.fullName}`);
});

socket.on('staff:went_offline', (data: Record<string, unknown>) => {
  console.log(`[OFFLINE] ${data.fullName} — last seen: ${data.lastSeen}`);
});

// ── Alert events ──────────────────────────────────────────

socket.on('alert:new', (data: Record<string, unknown>) => {
  console.log(`[ALERT] ${data.alertType} (severity ${data.severity}): ${data.description}`);
});

// ── Roster events ─────────────────────────────────────────

socket.on('roster:published', (data: Record<string, unknown>) => {
  console.log(`[ROSTER] Published: ${data.sectorName} for ${data.date}`);
});

// ── Prediction events ─────────────────────────────────────

socket.on('predictions:updated', (data: Record<string, unknown>) => {
  console.log(`[PREDICTIONS] Updated for area ${data.areaId}, date=${data.date}`);
});

// ── Auto-disconnect after 15 seconds ──────────────────────

setTimeout(() => {
  console.log('');
  console.log('[TEST] Disconnecting after 15 seconds...');
  socket.disconnect();
  process.exit(0);
}, 15000);
