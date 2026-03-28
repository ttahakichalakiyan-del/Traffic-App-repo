// ⚠ dotenv MUST be first — setup.ts loads db/index.ts which reads DATABASE_URL at module load time
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/index';
import {
  dspUsers,
  adminUsers,
  areas,
  sectors,
  staffMembers,
  dailyRosters,
  dutyCategories,
} from '../db/schema';
import { hashPassword, hashPin } from '../lib/password';
import { signToken } from '../lib/jwt';

// ============================================================
// DB cleanup between tests
// ============================================================
export async function cleanDatabase() {
  await db.execute(sql`
    TRUNCATE TABLE
      roster_shares, roster_entries, daily_rosters,
      staff_locations, sessions, alerts, predictions, traffic_snapshots,
      staff_members, sectors, areas, dsp_users, admin_users
    RESTART IDENTITY CASCADE
  `);
}

// ============================================================
// Fixtures
// ============================================================
export async function createTestDsp(overrides: {
  username?: string;
  password?: string;
} = {}) {
  const id = uuidv4();
  const username = overrides.username ?? `testdsp_${id.slice(0, 8)}`;
  const password = overrides.password ?? 'testpass123';
  const passwordHash = await hashPassword(password);
  await db.insert(dspUsers).values({
    id,
    username,
    passwordHash,
    fullName: 'Test DSP Officer',
    badgeNumber: `DSP_${id.slice(0, 8)}`,
    rank: 'DSP',
    isActive: true,
  });
  return { id, username, password };
}

export async function createTestAdmin(overrides: {
  username?: string;
  password?: string;
  isSuperAdmin?: boolean;
} = {}) {
  const id = uuidv4();
  const username = overrides.username ?? `testadmin_${id.slice(0, 8)}`;
  const password = overrides.password ?? 'adminpass123';
  const passwordHash = await hashPassword(password);
  await db.insert(adminUsers).values({
    id,
    username,
    passwordHash,
    fullName: 'Test Admin',
    isSuperAdmin: overrides.isSuperAdmin ?? true,
    isActive: true,
  });
  return { id, username, password };
}

export async function createTestArea(dspId: string, name?: string) {
  const id = uuidv4();
  await db.execute(sql`
    INSERT INTO areas (id, name, dsp_user_id, boundary, center_point, color_hex, is_active)
    VALUES (
      ${id},
      ${name ?? 'Test Area'},
      ${dspId},
      ST_GeomFromText('POLYGON((74.30 31.50, 74.40 31.50, 74.40 31.55, 74.30 31.55, 74.30 31.50))', 4326),
      ST_GeomFromText('POINT(74.35 31.525)', 4326),
      '#2563EB',
      true
    )
  `);
  return { id, name: name ?? 'Test Area' };
}

export async function createTestSector(
  areaId: string,
  dspId: string,
  name: string = 'Sector A',
) {
  const id = uuidv4();
  await db.insert(sectors).values({
    id,
    areaId,
    dspUserId: dspId,
    name,
    displayOrder: 1,
    colorHex: '#2563EB',
    isActive: true,
  });
  return { id, name };
}

export async function createTestStaff(
  sectorId: string,
  areaId: string,
  overrides: {
    badgeId?: string;
    fullName?: string;
    pin?: string;
  } = {},
) {
  const id = uuidv4();
  const badgeId = overrides.badgeId ?? `STAFF_${id.slice(0, 8)}`;
  const pin = overrides.pin ?? '1234';
  const pinHash = await hashPin(pin);
  await db.insert(staffMembers).values({
    id,
    badgeId,
    pinHash,
    fullName: overrides.fullName ?? 'Test Warden',
    rank: 'Warden',
    areaId,
    sectorId,
    isActive: true,
    isOnDuty: false,
  });
  return { id, badgeId, pin };
}

export async function createTestRoster(
  sectorId: string,
  dspId: string,
  date: string,
) {
  const id = uuidv4();
  await db.insert(dailyRosters).values({
    id,
    sectorId,
    rosterDate: date,
    status: 'draft',
    createdByDspId: dspId,
    totalStaffCount: 5,
    assignedStaffCount: 0,
  });
  return { id };
}

export async function getFirstDutyCategory(): Promise<string | null> {
  const cats = await db
    .select({ id: dutyCategories.id })
    .from(dutyCategories)
    .where(eq(dutyCategories.isActive, true))
    .limit(1);
  return cats[0]?.id ?? null;
}

// ============================================================
// Token helpers
// ============================================================
export function getDspToken(dspId: string, areaId: string) {
  return signToken({ userId: dspId, userType: 'dsp', areaId }, '1h');
}

export function getStaffToken(staffId: string, areaId: string, _sectorId?: string) {
  return signToken({ userId: staffId, userType: 'staff', areaId }, '1h');
}

export function getAdminToken(adminId: string) {
  return signToken({ userId: adminId, userType: 'admin' }, '1h');
}

// ============================================================
// Jest globals
// ============================================================
beforeAll(async () => {
  await db.execute(sql`SELECT 1`);
});

beforeEach(async () => {
  await cleanDatabase();
});

afterAll(async () => {
  // Pool cleanup handled by Node process exit
});
