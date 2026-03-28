import request from 'supertest';
import { eq } from 'drizzle-orm';
import { app } from '../server';
import { db } from '../db/index';
import { staffLocations, staffMembers } from '../db/schema';
import {
  createTestDsp,
  createTestArea,
  createTestSector,
  createTestStaff,
  getDspToken,
  getStaffToken,
} from './setup';

// Mock the socket module so emitToArea is a jest spy
jest.mock('../socket/index', () => ({
  emitToArea: jest.fn(),
  emitToDsp: jest.fn(),
  emitToStaff: jest.fn(),
  initializeSocket: jest.fn().mockReturnValue({
    use: jest.fn(),
    on: jest.fn(),
    to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    close: jest.fn(),
  }),
  getIO: jest.fn(),
}));

import * as socketModule from '../socket/index';

describe('Staff Location Tracking', () => {
  let dsp: { id: string; username: string; password: string };
  let area: { id: string };
  let sector: { id: string };
  let staff: { id: string; badgeId: string; pin: string };
  let dspToken: string;
  let staffToken: string;

  beforeEach(async () => {
    jest.clearAllMocks();
    dsp = await createTestDsp();
    area = await createTestArea(dsp.id);
    sector = await createTestSector(area.id, dsp.id);
    staff = await createTestStaff(sector.id, area.id);
    dspToken = getDspToken(dsp.id, area.id);
    staffToken = getStaffToken(staff.id, area.id, sector.id);
  });

  test('Staff sends location — saved to DB + socket emitted', async () => {
    const emitSpy = socketModule.emitToArea as jest.Mock;

    const res = await request(app)
      .post('/api/tracking/location')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        lat: 31.5204,
        lng: 74.3587,
        accuracy: 10,
        batteryLevel: 80,
        timestamp: new Date().toISOString(),
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const locations = await db
      .select()
      .from(staffLocations)
      .where(eq(staffLocations.staffId, staff.id));
    expect(locations.length).toBe(1);
    expect(emitSpy).toHaveBeenCalledWith(
      area.id,
      'staff:position_update',
      expect.objectContaining({ staffId: staff.id }),
    );
  });

  test('Batch locations (10 items) saved correctly', async () => {
    const locations = Array.from({ length: 10 }, (_, i) => ({
      lat: 31.5204 + i * 0.0001,
      lng: 74.3587 + i * 0.0001,
      accuracy: 10,
      batteryLevel: 80,
      timestamp: new Date(Date.now() - i * 60000).toISOString(),
    }));

    const res = await request(app)
      .post('/api/tracking/location/batch')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ locations });

    expect(res.status).toBe(200);
    expect(res.body.data.processed).toBe(10);

    const saved = await db
      .select()
      .from(staffLocations)
      .where(eq(staffLocations.staffId, staff.id));
    expect(saved.length).toBe(10);
  });

  test('Location outside Pakistan lat bounds returns 400', async () => {
    const res = await request(app)
      .post('/api/tracking/location')
      .set('Authorization', `Bearer ${staffToken}`)
      .send({
        lat: 51.5074, // London latitude, outside Pakistan range 23-37
        lng: 74.3587,
        accuracy: 10,
        batteryLevel: 80,
        timestamp: new Date().toISOString(),
      });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  test('Location without JWT returns 401', async () => {
    const res = await request(app)
      .post('/api/tracking/location')
      .send({ lat: 31.52, lng: 74.35, timestamp: new Date().toISOString() });

    expect(res.status).toBe(401);
  });

  test('Duty start sets is_on_duty=true and emits socket event', async () => {
    const emitSpy = socketModule.emitToArea as jest.Mock;

    const res = await request(app)
      .post('/api/tracking/duty/start')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ isOnDuty: staffMembers.isOnDuty })
      .from(staffMembers)
      .where(eq(staffMembers.id, staff.id));
    expect(updated.isOnDuty).toBe(true);

    expect(emitSpy).toHaveBeenCalledWith(
      area.id,
      'staff:duty_started',
      expect.objectContaining({ staffId: staff.id }),
    );
  });

  test('Duty end sets is_on_duty=false', async () => {
    // Start duty first
    await request(app)
      .post('/api/tracking/duty/start')
      .set('Authorization', `Bearer ${staffToken}`);

    const res = await request(app)
      .post('/api/tracking/duty/end')
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);

    const [updated] = await db
      .select({ isOnDuty: staffMembers.isOnDuty })
      .from(staffMembers)
      .where(eq(staffMembers.id, staff.id));
    expect(updated.isOnDuty).toBe(false);
  });

  test('DSP views area staff returns grouped status arrays', async () => {
    const res = await request(app)
      .get(`/api/tracking/area/${area.id}/staff`)
      .set('Authorization', `Bearer ${dspToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('on_duty');
    expect(res.body.data).toHaveProperty('offline');
    expect(res.body.data).toHaveProperty('never_connected');
    expect(Array.isArray(res.body.data.on_duty)).toBe(true);
    expect(Array.isArray(res.body.data.never_connected)).toBe(true);
    // Our test staff has never sent a location, should be in never_connected
    expect(res.body.data.never_connected.length).toBeGreaterThanOrEqual(1);
  });
});
