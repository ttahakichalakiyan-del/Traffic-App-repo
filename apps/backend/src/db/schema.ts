import {
  pgTable,
  uuid,
  varchar,
  boolean,
  timestamp,
  doublePrecision,
  smallint,
  text,
  jsonb,
  integer,
  time,
  date,
  real,
  unique,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { sql, type InferSelectModel, type InferInsertModel } from 'drizzle-orm';
import { customType } from 'drizzle-orm/pg-core';

// ============================================================
// Custom type for PostGIS geometry columns
// ============================================================
const geometry = <TType extends string>(name: string, geomType: TType, srid = 4326) =>
  customType<{ data: string; driverParam: string }>({
    dataType() {
      return `GEOMETRY(${geomType}, ${srid})`;
    },
    toDriver(value: string): string {
      return value;
    },
    fromDriver(value: unknown): string {
      return value as string;
    },
  })(name);

// ============================================================
// TABLE 1: dsp_users
// ============================================================
export const dspUsers = pgTable('dsp_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  badgeNumber: varchar('badge_number', { length: 20 }).unique(),
  rank: varchar('rank', { length: 50 }),
  designation: varchar('designation', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  isActive: boolean('is_active').default(true),
  lastLogin: timestamp('last_login', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 2: areas
// ============================================================
export const areas = pgTable('areas', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  dspUserId: uuid('dsp_user_id').references(() => dspUsers.id, { onDelete: 'set null' }),
  boundary: geometry('boundary', 'POLYGON').notNull(),
  centerPoint: geometry('center_point', 'POINT'),
  colorHex: varchar('color_hex', { length: 7 }).default('#2563EB'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 3: sectors
// ============================================================
export const sectors = pgTable('sectors', {
  id: uuid('id').primaryKey().defaultRandom(),
  areaId: uuid('area_id')
    .notNull()
    .references(() => areas.id, { onDelete: 'cascade' }),
  dspUserId: uuid('dsp_user_id').references(() => dspUsers.id, { onDelete: 'set null' }),
  name: varchar('name', { length: 100 }).notNull(),
  displayOrder: integer('display_order').default(1),
  colorHex: varchar('color_hex', { length: 7 }).default('#2563EB'),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 4: staff_members
// ============================================================
export const staffMembers = pgTable('staff_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  badgeId: varchar('badge_id', { length: 30 }).unique().notNull(),
  pinHash: varchar('pin_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  rank: varchar('rank', { length: 50 }),
  designation: varchar('designation', { length: 100 }),
  areaId: uuid('area_id').references(() => areas.id, { onDelete: 'set null' }),
  sectorId: uuid('sector_id').references(() => sectors.id, { onDelete: 'set null' }),
  phone: varchar('phone', { length: 20 }),
  deviceToken: text('device_token'),
  deviceInfo: jsonb('device_info'),
  isActive: boolean('is_active').default(true),
  isOnDuty: boolean('is_on_duty').default(false),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 5: sessions
// ============================================================
export const sessions = pgTable('sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull(),
  userType: varchar('user_type', { length: 10 }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).unique().notNull(),
  deviceFingerprint: text('device_fingerprint'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 6: staff_locations
// ============================================================
export const staffLocations = pgTable('staff_locations', {
  id: uuid('id').primaryKey().defaultRandom(),
  staffId: uuid('staff_id')
    .notNull()
    .references(() => staffMembers.id, { onDelete: 'cascade' }),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  locationPoint: geometry('location_point', 'POINT'),
  accuracy: real('accuracy'),
  speed: real('speed'),
  bearing: real('bearing'),
  batteryLevel: integer('battery_level'),
  isOnDuty: boolean('is_on_duty').default(false),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 7: traffic_snapshots
// ============================================================
export const trafficSnapshots = pgTable('traffic_snapshots', {
  id: uuid('id').primaryKey().defaultRandom(),
  areaId: uuid('area_id').references(() => areas.id, { onDelete: 'cascade' }),
  segmentId: varchar('segment_id', { length: 100 }),
  roadName: varchar('road_name', { length: 200 }),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  locationPoint: geometry('location_point', 'POINT'),
  congestionLevel: smallint('congestion_level'),
  speedKmh: real('speed_kmh'),
  jamFactor: real('jam_factor'),
  dataSource: varchar('data_source', { length: 50 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).notNull(),
});

// ============================================================
// TABLE 8: predictions
// ============================================================
export const predictions = pgTable('predictions', {
  id: uuid('id').primaryKey().defaultRandom(),
  areaId: uuid('area_id').references(() => areas.id, { onDelete: 'cascade' }),
  roadName: varchar('road_name', { length: 200 }),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  locationPoint: geometry('location_point', 'POINT'),
  predictedDate: date('predicted_date').notNull(),
  timeWindowStart: time('time_window_start'),
  timeWindowEnd: time('time_window_end'),
  dayOfWeek: smallint('day_of_week'),
  confidence: real('confidence'),
  historicalOccurrences: integer('historical_occurrences'),
  modelVersion: varchar('model_version', { length: 20 }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 9: alerts
// ============================================================
export const alerts = pgTable('alerts', {
  id: uuid('id').primaryKey().defaultRandom(),
  areaId: uuid('area_id').references(() => areas.id, { onDelete: 'cascade' }),
  lat: doublePrecision('lat'),
  lng: doublePrecision('lng'),
  roadName: varchar('road_name', { length: 200 }),
  alertType: varchar('alert_type', { length: 50 }),
  severity: smallint('severity'),
  description: text('description'),
  detectedAt: timestamp('detected_at', { withTimezone: true }).defaultNow(),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  acknowledgedByDspId: uuid('acknowledged_by_dsp_id').references(() => dspUsers.id, {
    onDelete: 'set null',
  }),
  isActive: boolean('is_active').default(true),
});

// ============================================================
// TABLE 10: duty_categories
// ============================================================
export const dutyCategories = pgTable('duty_categories', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).unique().notNull(),
  nameUrdu: varchar('name_urdu', { length: 100 }),
  iconName: varchar('icon_name', { length: 50 }),
  sortOrder: integer('sort_order').default(0),
  requiresLocation: boolean('requires_location').default(false),
  requiresRoute: boolean('requires_route').default(false),
  colorHex: varchar('color_hex', { length: 7 }),
  isActive: boolean('is_active').default(true),
});

// ============================================================
// TABLE 11: daily_rosters
// ============================================================
export const dailyRosters = pgTable(
  'daily_rosters',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sectorId: uuid('sector_id')
      .notNull()
      .references(() => sectors.id, { onDelete: 'cascade' }),
    rosterDate: date('roster_date').notNull(),
    status: varchar('status', { length: 10 }).notNull().default('draft'),
    createdByDspId: uuid('created_by_dsp_id').references(() => dspUsers.id, {
      onDelete: 'set null',
    }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    notes: text('notes'),
    totalStaffCount: integer('total_staff_count').default(0),
    assignedStaffCount: integer('assigned_staff_count').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueSectorDate: unique('uq_sector_roster_date').on(table.sectorId, table.rosterDate),
  }),
);

// ============================================================
// TABLE 12: roster_entries
// ============================================================
export const rosterEntries = pgTable(
  'roster_entries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    rosterId: uuid('roster_id')
      .notNull()
      .references(() => dailyRosters.id, { onDelete: 'cascade' }),
    staffId: uuid('staff_id')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'cascade' }),
    dutyCategoryId: uuid('duty_category_id').references(() => dutyCategories.id, {
      onDelete: 'set null',
    }),
    dutyLocation: varchar('duty_location', { length: 255 }),
    beatRoute: varchar('beat_route', { length: 500 }),
    shiftStart: time('shift_start'),
    shiftEnd: time('shift_end'),
    notes: varchar('notes', { length: 500 }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniqueRosterStaff: unique('uq_roster_staff').on(table.rosterId, table.staffId),
  }),
);

// ============================================================
// TABLE 13: roster_shares
// ============================================================
export const rosterShares = pgTable('roster_shares', {
  id: uuid('id').primaryKey().defaultRandom(),
  rosterId: uuid('roster_id')
    .notNull()
    .references(() => dailyRosters.id, { onDelete: 'cascade' }),
  sharedByDspId: uuid('shared_by_dsp_id').references(() => dspUsers.id, {
    onDelete: 'set null',
  }),
  shareType: varchar('share_type', { length: 20 }),
  recipientCount: integer('recipient_count').default(0),
  sharedAt: timestamp('shared_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TABLE 14: admin_users
// ============================================================
export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  username: varchar('username', { length: 50 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 100 }).notNull(),
  isSuperAdmin: boolean('is_super_admin').default(false),
  isActive: boolean('is_active').default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

// ============================================================
// TypeScript types — SELECT (read) and INSERT (write)
// ============================================================

// dsp_users
export type DspUser = InferSelectModel<typeof dspUsers>;
export type NewDspUser = InferInsertModel<typeof dspUsers>;

// areas
export type Area = InferSelectModel<typeof areas>;
export type NewArea = InferInsertModel<typeof areas>;

// sectors
export type Sector = InferSelectModel<typeof sectors>;
export type NewSector = InferInsertModel<typeof sectors>;

// staff_members
export type StaffMember = InferSelectModel<typeof staffMembers>;
export type NewStaffMember = InferInsertModel<typeof staffMembers>;

// sessions
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;

// staff_locations
export type StaffLocation = InferSelectModel<typeof staffLocations>;
export type NewStaffLocation = InferInsertModel<typeof staffLocations>;

// traffic_snapshots
export type TrafficSnapshot = InferSelectModel<typeof trafficSnapshots>;
export type NewTrafficSnapshot = InferInsertModel<typeof trafficSnapshots>;

// predictions
export type Prediction = InferSelectModel<typeof predictions>;
export type NewPrediction = InferInsertModel<typeof predictions>;

// alerts
export type Alert = InferSelectModel<typeof alerts>;
export type NewAlert = InferInsertModel<typeof alerts>;

// duty_categories
export type DutyCategory = InferSelectModel<typeof dutyCategories>;
export type NewDutyCategory = InferInsertModel<typeof dutyCategories>;

// daily_rosters
export type DailyRoster = InferSelectModel<typeof dailyRosters>;
export type NewDailyRoster = InferInsertModel<typeof dailyRosters>;

// roster_entries
export type RosterEntry = InferSelectModel<typeof rosterEntries>;
export type NewRosterEntry = InferInsertModel<typeof rosterEntries>;

// roster_shares
export type RosterShare = InferSelectModel<typeof rosterShares>;
export type NewRosterShare = InferInsertModel<typeof rosterShares>;

// admin_users
export type AdminUser = InferSelectModel<typeof adminUsers>;
export type NewAdminUser = InferInsertModel<typeof adminUsers>;
