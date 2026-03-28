import { relations } from 'drizzle-orm';
import {
  dspUsers,
  areas,
  sectors,
  staffMembers,
  staffLocations,
  trafficSnapshots,
  predictions,
  alerts,
  dutyCategories,
  dailyRosters,
  rosterEntries,
  rosterShares,
} from './schema';

// ============================================================
// dsp_users relations
// ============================================================
export const dspUsersRelations = relations(dspUsers, ({ many }) => ({
  areas: many(areas),
  sectors: many(sectors),
  dailyRosters: many(dailyRosters),
  acknowledgedAlerts: many(alerts),
  rosterShares: many(rosterShares),
}));

// ============================================================
// areas relations
// ============================================================
export const areasRelations = relations(areas, ({ one, many }) => ({
  dspUser: one(dspUsers, {
    fields: [areas.dspUserId],
    references: [dspUsers.id],
  }),
  sectors: many(sectors),
  staffMembers: many(staffMembers),
  trafficSnapshots: many(trafficSnapshots),
  predictions: many(predictions),
  alerts: many(alerts),
}));

// ============================================================
// sectors relations
// ============================================================
export const sectorsRelations = relations(sectors, ({ one, many }) => ({
  area: one(areas, {
    fields: [sectors.areaId],
    references: [areas.id],
  }),
  dspUser: one(dspUsers, {
    fields: [sectors.dspUserId],
    references: [dspUsers.id],
  }),
  staffMembers: many(staffMembers),
  dailyRosters: many(dailyRosters),
}));

// ============================================================
// staff_members relations
// ============================================================
export const staffMembersRelations = relations(staffMembers, ({ one, many }) => ({
  area: one(areas, {
    fields: [staffMembers.areaId],
    references: [areas.id],
  }),
  sector: one(sectors, {
    fields: [staffMembers.sectorId],
    references: [sectors.id],
  }),
  locations: many(staffLocations),
  rosterEntries: many(rosterEntries),
}));

// ============================================================
// staff_locations relations
// ============================================================
export const staffLocationsRelations = relations(staffLocations, ({ one }) => ({
  staff: one(staffMembers, {
    fields: [staffLocations.staffId],
    references: [staffMembers.id],
  }),
}));

// ============================================================
// traffic_snapshots relations
// ============================================================
export const trafficSnapshotsRelations = relations(trafficSnapshots, ({ one }) => ({
  area: one(areas, {
    fields: [trafficSnapshots.areaId],
    references: [areas.id],
  }),
}));

// ============================================================
// predictions relations
// ============================================================
export const predictionsRelations = relations(predictions, ({ one }) => ({
  area: one(areas, {
    fields: [predictions.areaId],
    references: [areas.id],
  }),
}));

// ============================================================
// alerts relations
// ============================================================
export const alertsRelations = relations(alerts, ({ one }) => ({
  area: one(areas, {
    fields: [alerts.areaId],
    references: [areas.id],
  }),
  acknowledgedByDsp: one(dspUsers, {
    fields: [alerts.acknowledgedByDspId],
    references: [dspUsers.id],
  }),
}));

// ============================================================
// duty_categories relations
// ============================================================
export const dutyCategoriesRelations = relations(dutyCategories, ({ many }) => ({
  rosterEntries: many(rosterEntries),
}));

// ============================================================
// daily_rosters relations
// ============================================================
export const dailyRostersRelations = relations(dailyRosters, ({ one, many }) => ({
  sector: one(sectors, {
    fields: [dailyRosters.sectorId],
    references: [sectors.id],
  }),
  createdByDsp: one(dspUsers, {
    fields: [dailyRosters.createdByDspId],
    references: [dspUsers.id],
  }),
  entries: many(rosterEntries),
  shares: many(rosterShares),
}));

// ============================================================
// roster_entries relations
// ============================================================
export const rosterEntriesRelations = relations(rosterEntries, ({ one }) => ({
  roster: one(dailyRosters, {
    fields: [rosterEntries.rosterId],
    references: [dailyRosters.id],
  }),
  staff: one(staffMembers, {
    fields: [rosterEntries.staffId],
    references: [staffMembers.id],
  }),
  dutyCategory: one(dutyCategories, {
    fields: [rosterEntries.dutyCategoryId],
    references: [dutyCategories.id],
  }),
}));

// ============================================================
// roster_shares relations
// ============================================================
export const rosterSharesRelations = relations(rosterShares, ({ one }) => ({
  roster: one(dailyRosters, {
    fields: [rosterShares.rosterId],
    references: [dailyRosters.id],
  }),
  sharedByDsp: one(dspUsers, {
    fields: [rosterShares.sharedByDspId],
    references: [dspUsers.id],
  }),
}));
