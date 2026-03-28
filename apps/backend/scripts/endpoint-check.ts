/**
 * Endpoint health check script — verifies all API routes respond correctly.
 * Run with: npx ts-node scripts/endpoint-check.ts
 * Requires backend running locally (npm run dev) or set BASE_URL env var.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:3001';
const PASS_COLOR = '\x1b[32m';
const FAIL_COLOR = '\x1b[31m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;

interface CheckResult {
  name: string;
  status: 'PASS' | 'FAIL';
  detail?: string;
}

async function request(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown } = {},
): Promise<{ status: number; body: unknown }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers['Authorization'] = `Bearer ${opts.token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
}

function check(name: string, condition: boolean, detail?: string): CheckResult {
  if (condition) {
    passed++;
    console.log(`${PASS_COLOR}PASS${RESET}: ${name}`);
    return { name, status: 'PASS' };
  } else {
    failed++;
    console.log(`${FAIL_COLOR}FAIL${RESET}: ${name}${detail ? ` — ${detail}` : ''}`);
    return { name, status: 'FAIL', detail };
  }
}

async function run() {
  console.log(`\n=== CTPL API Endpoint Check ===`);
  console.log(`Target: ${BASE_URL}\n`);

  // ── Health & version (no auth) ──────────────────────────────
  const health = await request('GET', '/health');
  check('GET /health → 200', health.status === 200);
  check('GET /health has status:ok', (health.body as Record<string, string>)?.status === 'ok');

  const version = await request('GET', '/api/version');
  check('GET /api/version → 200', version.status === 200);
  check('GET /api/version has dspApp', JSON.stringify(version.body).includes('dspApp'));

  // ── Auth routes ──────────────────────────────────────────────
  const noAuthDsp = await request('GET', '/api/auth/me');
  check('GET /api/auth/me without token → 401', noAuthDsp.status === 401);

  const badLogin = await request('POST', '/api/auth/dsp/login', {
    body: { badgeNumber: 'XXXXX', password: 'wrong' },
  });
  check('POST /api/auth/dsp/login with wrong creds → 401', badLogin.status === 401);

  const staffBadLogin = await request('POST', '/api/auth/staff/login', {
    body: { cnic: '0000000000000', pin: '9999' },
  });
  check('POST /api/auth/staff/login with wrong creds → 401', staffBadLogin.status === 401);

  // ── Auth — get real token ────────────────────────────────────
  const adminLogin = await request('POST', '/api/auth/admin/login', {
    body: { username: 'admin', password: 'ctpl@admin2026' },
  });
  const adminToken = (adminLogin.body as Record<string, Record<string, string>>)?.data?.token;
  check('POST /api/auth/admin/login → 200 with token', adminLogin.status === 200 && !!adminToken);

  // ── Tracking routes (require staff token — just verify 401) ──
  const locationNoAuth = await request('POST', '/api/tracking/location', {
    body: { lat: 31.52, lng: 74.36, timestamp: new Date().toISOString() },
  });
  check('POST /api/tracking/location without token → 401', locationNoAuth.status === 401);

  const batchNoAuth = await request('POST', '/api/tracking/location/batch', {
    body: { locations: [] },
  });
  check('POST /api/tracking/location/batch without token → 401', batchNoAuth.status === 401);

  const dutyStartNoAuth = await request('POST', '/api/tracking/duty/start');
  check('POST /api/tracking/duty/start without token → 401', dutyStartNoAuth.status === 401);

  const dutyEndNoAuth = await request('POST', '/api/tracking/duty/end');
  check('POST /api/tracking/duty/end without token → 401', dutyEndNoAuth.status === 401);

  // ── UUID validation ──────────────────────────────────────────
  const badUuid = await request('GET', '/api/tracking/area/not-a-uuid/staff', {
    token: adminToken,
  });
  check('GET /area/bad-uuid/staff → 400 INVALID_UUID', badUuid.status === 400);

  const badAreaUuid = await request('GET', '/api/areas/not-a-uuid', {
    token: adminToken,
  });
  check('GET /api/areas/bad-uuid → 400 or 404', badAreaUuid.status === 400 || badAreaUuid.status === 404);

  // ── Areas (require DSP token — verify 401) ───────────────────
  const areasNoAuth = await request('GET', '/api/areas/my');
  check('GET /api/areas/my without token → 401', areasNoAuth.status === 401);

  // ── Roster routes (require DSP token) ────────────────────────
  const rosterNoAuth = await request('GET', '/api/roster/daily');
  check('GET /api/roster/daily without token → 401', rosterNoAuth.status === 401);

  const categoriesNoAuth = await request('GET', '/api/roster/categories');
  check('GET /api/roster/categories without token → 401', categoriesNoAuth.status === 401);

  const hotspotsNoAuth = await request('GET', '/api/roster/hotspots');
  check('GET /api/roster/hotspots without token → 401', hotspotsNoAuth.status === 401);

  const myDutyNoAuth = await request('GET', '/api/roster/my-duty');
  check('GET /api/roster/my-duty without token → 401', myDutyNoAuth.status === 401);

  // ── Admin routes (with admin token) ─────────────────────────
  if (adminToken) {
    const stats = await request('GET', '/api/admin/system/stats', { token: adminToken });
    check('GET /api/admin/system/stats with admin token → 200', stats.status === 200);

    const areasList = await request('GET', '/api/admin/areas-list', { token: adminToken });
    check('GET /api/admin/areas-list with admin token → 200', areasList.status === 200);
  }

  // ── 404 for unknown routes ───────────────────────────────────
  const notFound = await request('GET', '/api/does-not-exist');
  check('GET /api/does-not-exist → 404', notFound.status === 404);

  // ── Summary ──────────────────────────────────────────────────
  console.log(`\n=== Summary ===`);
  console.log(`${PASS_COLOR}PASSED: ${passed}${RESET}`);
  if (failed > 0) {
    console.log(`${FAIL_COLOR}FAILED: ${failed}${RESET}`);
  }
  console.log('');

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log(`${PASS_COLOR}ALL CHECKS PASSED${RESET}\n`);
  }
}

run().catch((err) => {
  console.error('Endpoint check crashed:', err);
  process.exit(1);
});
