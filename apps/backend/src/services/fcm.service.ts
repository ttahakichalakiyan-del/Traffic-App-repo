import * as admin from 'firebase-admin';
import { eq } from 'drizzle-orm';
import { db } from '../db/index';
import { staffMembers } from '../db/schema';
import type { Alert } from '../db/schema';

// ── Initialize Firebase Admin SDK (once) ──────────────────

let initialized = false;

function ensureInitialized(): boolean {
  if (initialized) return true;
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT;
    if (!raw) {
      console.warn('[FCM] FCM_SERVICE_ACCOUNT not set — push notifications disabled');
      return false;
    }
    const serviceAccount = JSON.parse(Buffer.from(raw, 'base64').toString());
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
    initialized = true;
    console.log('[FCM] Firebase Admin initialized');
    return true;
  } catch (err) {
    console.error('[FCM] Initialization failed:', err);
    return false;
  }
}

// ── Send to single device ─────────────────────────────────

export async function sendToDevice(
  token: string,
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<boolean> {
  if (!ensureInitialized()) return false;
  try {
    await admin.messaging().send({
      token,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    });
    return true;
  } catch (err) {
    console.error(`[FCM] sendToDevice failed for token=${token.slice(0, 20)}...:`, err);
    return false;
  }
}

// ── Send to multiple devices ──────────────────────────────

export async function sendToMultiple(
  tokens: string[],
  title: string,
  body: string,
  data?: Record<string, string>,
): Promise<{ successCount: number; failureCount: number }> {
  const validTokens = tokens.filter((t) => t && t.length > 0);
  if (validTokens.length === 0 || !ensureInitialized()) {
    return { successCount: 0, failureCount: 0 };
  }
  try {
    const response = await admin.messaging().sendEachForMulticast({
      tokens: validTokens,
      notification: { title, body },
      data,
      android: {
        priority: 'high',
        notification: { sound: 'default' },
      },
    });
    return {
      successCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (err) {
    console.error('[FCM] sendToMultiple failed:', err);
    return { successCount: 0, failureCount: validTokens.length };
  }
}

// ── Domain-specific notifications ─────────────────────────

export async function sendDutyNotification(
  staffId: string,
  category: string,
  location: string,
  date: string,
): Promise<void> {
  const [staff] = await db
    .select({ deviceToken: staffMembers.deviceToken })
    .from(staffMembers)
    .where(eq(staffMembers.id, staffId))
    .limit(1);

  if (!staff?.deviceToken) {
    console.log(`[FCM] No device token for staff ${staffId}`);
    return;
  }

  await sendToDevice(
    staff.deviceToken,
    'CTPL Duty Assign',
    `${date} ko aapki duty: ${category} - ${location || 'Location TBD'}`,
    { type: 'duty_assigned', date },
  );
}

export async function sendAlertNotification(
  alertObj: Alert,
): Promise<void> {
  // Alert notifications go to area DSP — but dsp_users doesn't have device_token column.
  // For now, log it. In production add device_token to dsp_users.
  console.log(
    `[FCM] Alert notification: ${alertObj.alertType} severity=${alertObj.severity} at ${alertObj.roadName}`,
  );
}

export async function sendRosterReminderToDsp(
  _dspUserId: string,
  incompleteSectors: string[],
): Promise<void> {
  // DSP device tokens not stored yet — log for now
  console.log(
    `[FCM] Roster reminder: incomplete sectors: ${incompleteSectors.join(', ')}`,
  );
}
