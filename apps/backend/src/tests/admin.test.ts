import request from 'supertest';
import { app } from '../server';
import { db } from '../db/index';
import { dspUsers } from '../db/schema';
import { eq } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import {
  createTestDsp,
  createTestArea,
  createTestAdmin,
  getAdminToken,
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

describe('Admin Operations', () => {
  let adminToken: string;

  beforeEach(async () => {
    const admin = await createTestAdmin();
    adminToken = getAdminToken(admin.id);
  });

  test('Create DSP returns 201 with temp password', async () => {
    const res = await request(app)
      .post('/api/admin/dsp-users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        username: 'newdsp_test',
        fullName: 'New DSP Officer',
        rank: 'DSP',
        badgeNumber: 'DSP999',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.tempPassword).toBeDefined();
    expect(res.body.data.tempPassword.length).toBeGreaterThan(6);
  });

  test('Duplicate username returns 409', async () => {
    await request(app)
      .post('/api/admin/dsp-users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'dupedsp_test', fullName: 'First', rank: 'DSP' });

    const res = await request(app)
      .post('/api/admin/dsp-users')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ username: 'dupedsp_test', fullName: 'Second', rank: 'DSP' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CONFLICT');
  });

  test('Reset DSP password: new password works, old fails', async () => {
    const dsp = await createTestDsp();

    const res = await request(app)
      .post(`/api/admin/dsp-users/${dsp.id}/reset-password`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    const newPass = res.body.data.tempPassword;
    expect(newPass).toBeDefined();

    const loginNew = await request(app)
      .post('/api/auth/dsp/login')
      .send({ username: dsp.username, password: newPass });
    expect(loginNew.status).toBe(200);

    const loginOld = await request(app)
      .post('/api/auth/dsp/login')
      .send({ username: dsp.username, password: dsp.password });
    expect(loginOld.status).toBe(401);
  });

  test('Deactivated DSP cannot login after DELETE', async () => {
    const dsp = await createTestDsp();

    await request(app)
      .delete(`/api/admin/dsp-users/${dsp.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    const res = await request(app)
      .post('/api/auth/dsp/login')
      .send({ username: dsp.username, password: dsp.password });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });

  test('Areas list endpoint returns array for dropdowns', async () => {
    const dsp = await createTestDsp();
    await createTestArea(dsp.id, 'Test Area For List');

    const res = await request(app)
      .get('/api/admin/areas-list')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data.areas)).toBe(true);
  });
});
