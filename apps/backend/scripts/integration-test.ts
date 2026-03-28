/**
 * Roster System Integration Test (15 steps)
 * Usage: npx tsx scripts/integration-test.ts
 *
 * Prerequisites:
 *   - Backend running on localhost:3001 (or BACKEND_URL env var)
 *   - At least one DSP user, sector, and staff member seeded in the DB
 *   - Set DSP_USERNAME / DSP_PASSWORD env vars (defaults to test values)
 */

const BASE_URL = process.env.BACKEND_URL ?? 'http://localhost:3001';
const DSP_USERNAME = process.env.DSP_USERNAME ?? 'dsp_test';
const DSP_PASSWORD = process.env.DSP_PASSWORD ?? 'password123';

// ─── Helpers ────────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
let token = '';

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

async function req<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: T }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data: T;
  try {
    data = (await res.json()) as T;
  } catch {
    data = null as T;
  }

  return { ok: res.ok, status: res.status, data };
}

function pass(step: number, label: string, extra?: string) {
  passed++;
  const detail = extra ? `  ↳ ${extra}` : '';
  console.log(`  ✅ STEP ${String(step).padStart(2, '0')}: ${label}${detail ? '\n' + detail : ''}`);
}

function fail(step: number, label: string, reason: string) {
  failed++;
  console.log(`  ❌ STEP ${String(step).padStart(2, '0')}: ${label}`);
  console.log(`     REASON: ${reason}`);
}

function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

// ─── Test State ─────────────────────────────────────────────────────────────

let sectorId = '';
let rosterId = '';
let entryId = '';
let secondEntryId = '';
let categoryId = '';

// ─── Run Tests ───────────────────────────────────────────────────────────────

async function runTests() {
  console.log('\n' + '═'.repeat(62));
  console.log('  CTPL Roster System — Integration Test Suite (15 Steps)');
  console.log('═'.repeat(62));
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Date  : ${new Date().toLocaleString('en-PK')}\n`);

  // ── Step 1: Health Check ────────────────────────────────────────────────
  try {
    const r = await req('GET', '/health');
    assert(r.ok, `status ${r.status}`);
    pass(1, 'Health check', `GET /health → ${r.status}`);
  } catch (e) {
    fail(1, 'Health check', String(e));
  }

  // ── Step 2: DSP Login ───────────────────────────────────────────────────
  try {
    const r = await req<{ success: boolean; data: { token: string } }>(
      'POST',
      '/api/auth/dsp/login',
      { username: DSP_USERNAME, password: DSP_PASSWORD },
    );
    assert(r.ok, `HTTP ${r.status}`);
    assert(!!r.data?.data?.token, 'No token in response');
    token = r.data.data.token;
    pass(2, 'DSP Login', `JWT acquired`);
  } catch (e) {
    fail(2, 'DSP Login', String(e));
    console.log('\n  ⚠  Cannot continue without auth token — aborting.\n');
    process.exit(1);
  }

  // ── Step 3: GET /api/roster/categories ─────────────────────────────────
  try {
    const r = await req<{ success: boolean; data: Array<{ id: string; name: string }> }>(
      'GET',
      '/api/roster/categories',
    );
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.data?.data), 'data.data is not array');
    assert(r.data.data.length > 0, 'No categories returned');
    categoryId = r.data.data[0].id;
    pass(3, 'GET duty categories', `${r.data.data.length} categories, first="${r.data.data[0].name}"`);
  } catch (e) {
    fail(3, 'GET duty categories', String(e));
  }

  // ── Step 4: GET /api/roster/hotspots ───────────────────────────────────
  try {
    const r = await req<{ success: boolean; data: unknown[] }>('GET', '/api/roster/hotspots');
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.data?.data), 'data.data is not array');
    pass(4, 'GET hotspots', `${r.data.data.length} hotspot(s) returned`);
  } catch (e) {
    fail(4, 'GET hotspots', String(e));
  }

  // ── Step 5: GET /api/roster/daily (today — before creation) ────────────
  const today = isoDate(0);
  try {
    const r = await req<{ success: boolean; data: unknown[] }>(
      'GET',
      `/api/roster/daily?date=${today}`,
    );
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.data?.data), 'data.data is not array');
    pass(5, 'GET roster summary (today)', `${r.data.data.length} roster(s) for ${today}`);

    // Grab sector from existing rosters if available, else expect step 6 to
    // need DSP_SECTOR_ID
    const rows = r.data.data as Array<{ sectorId?: string }>;
    if (rows.length > 0 && rows[0].sectorId) {
      sectorId = rows[0].sectorId;
    }
  } catch (e) {
    fail(5, 'GET roster summary (today)', String(e));
  }

  // Fallback: use env DSP_SECTOR_ID if no sector found yet
  if (!sectorId) {
    sectorId = process.env.DSP_SECTOR_ID ?? '';
    if (!sectorId) {
      fail(6, 'POST create roster', 'No sectorId available — set DSP_SECTOR_ID env var');
      console.log('\n  ⚠  Skipping remaining roster steps.\n');
      printSummary();
      return;
    }
  }

  // ── Step 6: POST /api/roster/daily (create draft roster) ───────────────
  const testDate = isoDate(1); // tomorrow avoids collision with existing
  try {
    const r = await req<{ success: boolean; data: { id: string } }>(
      'POST',
      '/api/roster/daily',
      { sectorId, date: testDate, notes: 'Integration test roster' },
    );
    assert(r.ok, `HTTP ${r.status} — ${JSON.stringify(r.data)}`);
    assert(!!r.data?.data?.id, 'No id in response');
    rosterId = r.data.data.id;
    pass(6, 'POST create draft roster', `id=${rosterId} date=${testDate}`);
  } catch (e) {
    fail(6, 'POST create draft roster', String(e));
    printSummary();
    return;
  }

  // ── Step 7: GET /api/roster/daily/:rosterId ─────────────────────────────
  try {
    const r = await req<{
      success: boolean;
      data: { id: string; status: string; entries: unknown[] };
    }>('GET', `/api/roster/daily/${rosterId}`);
    assert(r.ok, `HTTP ${r.status}`);
    assert(r.data?.data?.id === rosterId, 'Returned wrong roster id');
    assert(r.data.data.status === 'draft', `Expected status=draft, got ${r.data.data.status}`);
    pass(7, 'GET roster detail', `status=draft, entries=${r.data.data.entries.length}`);
  } catch (e) {
    fail(7, 'GET roster detail', String(e));
  }

  // ── Step 8: GET /api/roster/daily/:rosterId/unassigned ─────────────────
  let staffId = '';
  let secondStaffId = '';
  try {
    const r = await req<{
      success: boolean;
      data: Array<{ id: string; fullName: string }>;
    }>('GET', `/api/roster/daily/${rosterId}/unassigned`);
    assert(r.ok, `HTTP ${r.status}`);
    assert(Array.isArray(r.data?.data), 'data.data is not array');
    if (r.data.data.length >= 1) staffId = r.data.data[0].id;
    if (r.data.data.length >= 2) secondStaffId = r.data.data[1].id;
    pass(8, 'GET unassigned staff', `${r.data.data.length} unassigned staff available`);
  } catch (e) {
    fail(8, 'GET unassigned staff', String(e));
  }

  // ── Step 9: GET /api/roster/suggest/:sectorId ──────────────────────────
  try {
    const r = await req<{
      success: boolean;
      data: { previousRosterId: string | null; matchCount: number };
    }>('GET', `/api/roster/suggest/${sectorId}?date=${testDate}`);
    assert(r.ok, `HTTP ${r.status}`);
    assert('previousRosterId' in (r.data?.data ?? {}), 'No previousRosterId field');
    pass(9, 'GET roster suggestion', `previousRosterId=${r.data.data.previousRosterId ?? 'null'}, matchCount=${r.data.data.matchCount}`);
  } catch (e) {
    fail(9, 'GET roster suggestion', String(e));
  }

  // ── Step 10: POST /api/roster/daily/:rosterId/entries ──────────────────
  if (!staffId) {
    fail(10, 'POST assign single staff', 'No unassigned staff available (skipping)');
  } else {
    try {
      const r = await req<{ success: boolean; data: { id: string } }>(
        'POST',
        `/api/roster/daily/${rosterId}/entries`,
        {
          staffId,
          dutyCategoryId: categoryId || undefined,
          dutyLocation: 'Main Boulevard Test',
          shiftStart: '07:00',
          shiftEnd: '15:00',
        },
      );
      assert(r.ok, `HTTP ${r.status} — ${JSON.stringify(r.data)}`);
      assert(!!r.data?.data?.id, 'No entry id returned');
      entryId = r.data.data.id;
      pass(10, 'POST assign single staff', `entryId=${entryId}`);
    } catch (e) {
      fail(10, 'POST assign single staff', String(e));
    }
  }

  // ── Step 11: GET roster detail (verify entry added) ─────────────────────
  try {
    const r = await req<{
      success: boolean;
      data: { assignedStaffCount: number; entries: Array<{ id: string }> };
    }>('GET', `/api/roster/daily/${rosterId}`);
    assert(r.ok, `HTTP ${r.status}`);
    const entries = r.data?.data?.entries ?? [];
    const found = !entryId || entries.some((e) => e.id === entryId);
    assert(found, `Entry ${entryId} not found in roster`);
    pass(11, 'GET roster detail (entry verified)', `assignedCount=${r.data.data.assignedStaffCount}, entries=${entries.length}`);
  } catch (e) {
    fail(11, 'GET roster detail (entry verified)', String(e));
  }

  // ── Step 12: POST bulk assign ───────────────────────────────────────────
  if (!secondStaffId) {
    fail(12, 'POST bulk assign entries', 'Need at least 2 unassigned staff (skipping)');
  } else {
    try {
      const r = await req<{ success: boolean; data: { inserted: number } }>(
        'POST',
        `/api/roster/daily/${rosterId}/entries/bulk`,
        {
          entries: [
            {
              staffId: secondStaffId,
              dutyCategoryId: categoryId || undefined,
              dutyLocation: 'Ring Road Test',
              shiftStart: '15:00',
              shiftEnd: '23:00',
            },
          ],
        },
      );
      assert(r.ok, `HTTP ${r.status} — ${JSON.stringify(r.data)}`);
      pass(12, 'POST bulk assign entries', `inserted=${r.data?.data?.inserted ?? '?'}`);
    } catch (e) {
      fail(12, 'POST bulk assign entries', String(e));
    }
  }

  // ── Step 13: DELETE /api/roster/entries/:entryId ───────────────────────
  if (!entryId) {
    fail(13, 'DELETE roster entry', 'No entryId from step 10 (skipping)');
  } else {
    try {
      const r = await req('DELETE', `/api/roster/entries/${entryId}`);
      assert(r.ok, `HTTP ${r.status} — ${JSON.stringify(r.data)}`);
      pass(13, 'DELETE roster entry', `entryId=${entryId} removed`);
    } catch (e) {
      fail(13, 'DELETE roster entry', String(e));
    }
  }

  // ── Step 14: POST /api/roster/daily/:rosterId/publish ──────────────────
  try {
    const r = await req('POST', `/api/roster/daily/${rosterId}/publish`);
    assert(r.ok, `HTTP ${r.status} — ${JSON.stringify(r.data)}`);
    pass(14, 'POST publish roster', `rosterId=${rosterId} published`);
  } catch (e) {
    fail(14, 'POST publish roster', String(e));
  }

  // ── Step 15: GET history + attendance + verify published ───────────────
  try {
    const histR = await req<{ success: boolean; data: Array<{ id: string; status: string }> }>(
      'GET',
      '/api/roster/history?days=7',
    );
    assert(histR.ok, `history HTTP ${histR.status}`);
    assert(Array.isArray(histR.data?.data), 'history data.data not array');

    const publishedEntry = histR.data.data.find((r) => r.id === rosterId);
    assert(
      !publishedEntry || publishedEntry.status === 'published',
      `Roster ${rosterId} not published in history`,
    );

    const attFrom = isoDate(-6);
    const attTo = isoDate(1);
    const attR = await req<{ success: boolean; data: unknown[] }>(
      'GET',
      `/api/roster/attendance?from=${attFrom}&to=${attTo}`,
    );
    assert(attR.ok, `attendance HTTP ${attR.status}`);
    assert(Array.isArray(attR.data?.data), 'attendance data.data not array');

    pass(
      15,
      'GET history + attendance',
      `history=${histR.data.data.length} rosters, attendance=${attR.data.data.length} staff records`,
    );
  } catch (e) {
    fail(15, 'GET history + attendance', String(e));
  }

  printSummary();
}

function printSummary() {
  const total = passed + failed;
  const allPass = failed === 0;
  console.log('\n' + '─'.repeat(62));
  console.log(`  Results: ${passed}/${total} PASSED  |  ${failed} FAILED`);
  console.log('─'.repeat(62));
  if (allPass) {
    console.log('  🎉 All tests passed!\n');
  } else {
    console.log('  ⚠  Some tests failed. Check output above.\n');
    process.exitCode = 1;
  }
}

runTests().catch((err) => {
  console.error('\n  FATAL:', err);
  process.exit(1);
});
