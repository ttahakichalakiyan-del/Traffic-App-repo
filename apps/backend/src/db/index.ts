import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import * as relations from './relations';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // Supabase pooler needs more time
  ssl: { rejectUnauthorized: false }, // Required for Supabase
});

export const db = drizzle(pool, {
  schema: { ...schema, ...relations },
  // Disable prepared statements — Supabase port 6543 is transaction mode pooler
  // which does not support prepared statements
});

// Re-export all table definitions and types
export {
  dspUsers,
  areas,
  sectors,
  staffMembers,
  sessions,
  staffLocations,
  trafficSnapshots,
  predictions,
  alerts,
  dutyCategories,
  dailyRosters,
  rosterEntries,
  rosterShares,
  adminUsers,
} from './schema';

export type {
  DspUser,
  NewDspUser,
  Area,
  NewArea,
  Sector,
  NewSector,
  StaffMember,
  NewStaffMember,
  Session,
  NewSession,
  StaffLocation,
  NewStaffLocation,
  TrafficSnapshot,
  NewTrafficSnapshot,
  Prediction,
  NewPrediction,
  Alert,
  NewAlert,
  DutyCategory,
  NewDutyCategory,
  DailyRoster,
  NewDailyRoster,
  RosterEntry,
  NewRosterEntry,
  RosterShare,
  NewRosterShare,
  AdminUser,
  NewAdminUser,
} from './schema';
