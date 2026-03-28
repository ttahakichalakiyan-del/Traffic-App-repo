import request from 'supertest';
import { app } from '../server';
import { db } from '../db/index';
import { predictions } from '../db/schema';
import {
  createTestDsp,
  createTestArea,
  getDspToken,
} from './setup';

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

describe('ML Predictions', () => {
  test('Tomorrow predictions are returned for DSP with confidence >= 0.5', async () => {
    const dsp = await createTestDsp();
    const area = await createTestArea(dsp.id);
    const dspToken = getDspToken(dsp.id, area.id);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await db.insert(predictions).values({
      areaId: area.id,
      roadName: 'Mall Road',
      lat: 31.52,
      lng: 74.35,
      predictedDate: tomorrowStr,
      timeWindowStart: '07:00',
      timeWindowEnd: '09:00',
      dayOfWeek: 1,
      confidence: 0.75,
      historicalOccurrences: 5,
      modelVersion: '1.0.0',
    });

    const res = await request(app)
      .get(`/api/predictions/tomorrow/${area.id}`)
      .set('Authorization', `Bearer ${dspToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].roadName).toBe('Mall Road');
    expect(res.body.data[0].confidence).toBeGreaterThanOrEqual(0.5);
  });

  test('Past date predictions are NOT returned (only tomorrow is served)', async () => {
    const dsp = await createTestDsp();
    const area = await createTestArea(dsp.id);
    const dspToken = getDspToken(dsp.id, area.id);

    const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

    await db.insert(predictions).values({
      areaId: area.id,
      roadName: 'Old Road',
      lat: 31.52,
      lng: 74.35,
      predictedDate: yesterday,
      confidence: 0.8,
      dayOfWeek: 1,
      modelVersion: '1.0.0',
    });

    const res = await request(app)
      .get(`/api/predictions/tomorrow/${area.id}`)
      .set('Authorization', `Bearer ${dspToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('Low confidence predictions (< 0.5) not returned', async () => {
    const dsp = await createTestDsp();
    const area = await createTestArea(dsp.id);
    const dspToken = getDspToken(dsp.id, area.id);

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    await db.insert(predictions).values({
      areaId: area.id,
      roadName: 'Low Conf Road',
      lat: 31.52,
      lng: 74.35,
      predictedDate: tomorrowStr,
      confidence: 0.3,
      dayOfWeek: 1,
      modelVersion: '1.0.0',
    });

    const res = await request(app)
      .get(`/api/predictions/tomorrow/${area.id}`)
      .set('Authorization', `Bearer ${dspToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(0);
  });

  test('DSP cannot access predictions for another area', async () => {
    const dsp1 = await createTestDsp();
    const area1 = await createTestArea(dsp1.id);
    const dsp2 = await createTestDsp();
    const area2 = await createTestArea(dsp2.id);
    const dspToken1 = getDspToken(dsp1.id, area1.id);

    const res = await request(app)
      .get(`/api/predictions/tomorrow/${area2.id}`)
      .set('Authorization', `Bearer ${dspToken1}`);

    expect(res.status).toBe(403);
  });
});
