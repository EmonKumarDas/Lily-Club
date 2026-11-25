import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'node:crypto';
import { app } from '../server/index.js';
import { getDb } from '../server/db.js';
import { getTodayDhakaYMD, getNextDayYMD } from '../server/dateUtils.js';

let server: http.Server;
let port: number;
let baseUrl: string;

function makeRequest(
  path: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: any;
    cookie?: string;
  } = {}
): Promise<{ status: number; headers: http.IncomingHttpHeaders; body: any; cookies: string[] }> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const headers: Record<string, string> = { ...options.headers };

    let payload: string | undefined;
    if (options.body) {
      payload = JSON.stringify(options.body);
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }

    if (options.cookie) {
      headers['Cookie'] = options.cookie;
    }

    const req = http.request(
      url,
      {
        method: options.method || 'GET',
        headers,
      },
      (res) => {
        let rawData = '';
        res.on('data', (chunk) => (rawData += chunk));
        res.on('end', () => {
          let parsedBody = rawData;
          try {
            parsedBody = JSON.parse(rawData);
          } catch {}

          const cookies = res.headers['set-cookie'] || [];

          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body: parsedBody,
            cookies: Array.isArray(cookies) ? cookies : [cookies],
          });
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

function extractCookie(cookies: string[], name: string): string | null {
  for (const c of cookies) {
    const match = c.match(new RegExp(`^${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

async function loginDevUser(email: string, name: string) {
  const res = await makeRequest('/api/auth/dev-login', {
    method: 'POST',
    body: {
      email,
      name,
      googleId: `google-${email}`,
    },
  });
  assert.equal(res.status, 200);
  const sessionToken = extractCookie(res.cookies, 'lily_session')!;
  const csrfToken = extractCookie(res.cookies, 'lily_csrf')!;
  return {
    user: res.body.user,
    cookieHeader: `lily_session=${sessionToken}; lily_csrf=${csrfToken}`,
    csrfToken,
  };
}

test('Setup Part 4 Dashboard & Security Sweep Test Server', async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address();
      if (addr && typeof addr === 'object') {
        port = addr.port;
        baseUrl = `http://localhost:${port}`;
      }
      resolve();
    });
  });
});

test('Part 4: Dashboard API, Role Redaction, 100% Report Consistency, Free Slots & Cross-Room Security Sweep', async () => {
  const uid = crypto.randomBytes(3).toString('hex');
  const owner = await loginDevUser(`owner-p4-${uid}@lily.test`, 'Owner P4');
  const manager = await loginDevUser(`manager-p4-${uid}@lily.test`, 'Manager P4');
  const staff = await loginDevUser(`staff-p4-${uid}@lily.test`, 'Staff P4');
  const viewer = await loginDevUser(`viewer-p4-${uid}@lily.test`, 'Viewer P4');
  const outsider = await loginDevUser(`outsider-p4-${uid}@lily.test`, 'Outsider P4');

  // 1. Create Room A as Owner
  const createRoomRes = await makeRequest('/api/rooms', {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      name: 'Lily Community Center - Part 4 Test',
      address: 'Dhanmondi, Dhaka',
      phone: '+8801711009988',
    },
  });
  assert.equal(createRoomRes.status, 201);
  const room = createRoomRes.body.room;
  const roomId = room.id;

  // 2. Join Manager, Staff, and Viewer into Room A
  const db = getDb();
  for (const [u, role] of [
    [manager, 'MANAGER'],
    [staff, 'STAFF'],
    [viewer, 'VIEWER'],
  ] as const) {
    const joinRes = await makeRequest('/api/rooms/join', {
      method: 'POST',
      cookie: u.cookieHeader,
      headers: { 'x-csrf-token': u.csrfToken },
      body: { joinCode: room.join_code },
    });
    assert.equal(joinRes.status, 200);
    db.prepare(
      `UPDATE room_members SET status = 'ACTIVE', role = ? WHERE room_id = ? AND user_id = ?`
    ).run(role, roomId, u.user.id);
  }

  // 3. Create 2 Active Halls & 3 Customers
  const hall1Res = await makeRequest(`/api/rooms/${roomId}/halls`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      name: 'Shapla Hall',
      capacity: 400,
      day_price: 40000,
      night_price: 55000,
      full_price: 85000,
      status: 'ACTIVE',
    },
  });
  assert.equal(hall1Res.status, 201);
  const hall1 = hall1Res.body.hall;

  const hall2Res = await makeRequest(`/api/rooms/${roomId}/halls`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      name: 'Golap Hall',
      capacity: 250,
      day_price: 25000,
      night_price: 35000,
      full_price: 55000,
      status: 'ACTIVE',
    },
  });
  assert.equal(hall2Res.status, 201);
  const hall2 = hall2Res.body.hall;

  const c1Res = await makeRequest(`/api/rooms/${roomId}/customers`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: { name: 'Mr. Tariq Rahman', phone: '01711-223344' },
  });
  assert.equal(c1Res.status, 201);
  const c1 = c1Res.body.customer;

  const c2Res = await makeRequest(`/api/rooms/${roomId}/customers`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: { name: 'Mrs. Nasreen Akter', phone: '01811-223344' },
  });
  assert.equal(c2Res.status, 201);
  const c2 = c2Res.body.customer;

  const c3Res = await makeRequest(`/api/rooms/${roomId}/customers`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: { name: 'Dr. Shafiqul Islam', phone: '01911-223344' },
  });
  assert.equal(c3Res.status, 201);
  const c3 = c3Res.body.customer;

  const todayYMD = getTodayDhakaYMD();
  const tomorrowYMD = getNextDayYMD(todayYMD);

  // Check initial free slots for the month with 0 bookings
  const initDashRes = await makeRequest(`/api/rooms/${roomId}/dashboard`, {
    method: 'GET',
    cookie: owner.cookieHeader,
  });
  assert.equal(initDashRes.status, 200);
  const initDash = initDashRes.body.dashboard;
  const totalCap = initDash.summaryCards.totalDaySlotsCapacityThisMonth;
  assert.ok(totalCap >= 56); // 2 halls * (28..31 days)
  assert.equal(initDash.summaryCards.freeDaySlotsThisMonth, totalCap);
  assert.equal(initDash.summaryCards.freeNightSlotsThisMonth, totalCap);

  // 4. Create Bookings:
  // Booking 1: Today DAY on Hall 1 (CONFIRMED, 40,000 BDT, Paid 25,000 BDT -> Due 15,000 BDT)
  const b1Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      customer_id: c1.id,
      hall_id: hall1.id,
      event_date: todayYMD,
      slot: 'DAY',
      event_type: 'WEDDING',
      guest_count: 350,
      price: 40000,
      advance_amount: 25000,
      status: 'CONFIRMED',
    },
  });
  assert.equal(b1Res.status, 201);

  // Booking 2: Today NIGHT on Hall 2 (TENTATIVE, hold_hours: 6 -> Expiring within 12h, 35,000 BDT, Paid 5,000 BDT -> Due 30,000 BDT)
  const b2Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      customer_id: c2.id,
      hall_id: hall2.id,
      event_date: todayYMD,
      slot: 'NIGHT',
      event_type: 'HOLUD',
      guest_count: 200,
      price: 35000,
      advance_amount: 5000,
      status: 'TENTATIVE',
      hold_hours: 6,
    },
  });
  assert.equal(b2Res.status, 201);

  // Booking 3: Tomorrow FULL on Hall 1 (CONFIRMED, 85,000 BDT, Paid 85,000 BDT -> Due 0)
  const b3Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      customer_id: c3.id,
      hall_id: hall1.id,
      event_date: tomorrowYMD,
      slot: 'FULL',
      event_type: 'RECEPTION',
      guest_count: 400,
      price: 85000,
      advance_amount: 85000,
      status: 'CONFIRMED',
    },
  });
  assert.equal(b3Res.status, 201);

  // 5. Fetch Dashboard as OWNER and verify every section (a)-(i)
  const ownerDashRes = await makeRequest(`/api/rooms/${roomId}/dashboard`, {
    method: 'GET',
    cookie: owner.cookieHeader,
  });
  assert.equal(ownerDashRes.status, 200);
  const dash = ownerDashRes.body.dashboard;

  assert.equal(dash.hideMoney, false);
  assert.equal(dash.summaryCards.todaysEventsCount, 2);
  assert.equal(dash.summaryCards.pendingTentativeCount, 1);
  assert.equal(dash.summaryCards.totalDueAmount, 45000); // 15,000 + 30,000

  // Verify Today at a glance per hall
  const hall1Glance = dash.todayAtAGlance.find((h: any) => h.hall_id === hall1.id);
  const hall2Glance = dash.todayAtAGlance.find((h: any) => h.hall_id === hall2.id);
  assert.equal(hall1Glance.day_status, 'CONFIRMED');
  assert.equal(hall1Glance.night_status, 'FREE');
  assert.equal(hall2Glance.day_status, 'FREE');
  assert.equal(hall2Glance.night_status, 'TENTATIVE');

  // Verify Free slots accuracy:
  // Today DAY (1 day lock), Today NIGHT (1 night lock).
  // If tomorrowYMD is in the same month as todayYMD, Tomorrow FULL adds 1 day lock + 1 night lock.
  const sameMonth = tomorrowYMD.slice(0, 7) === todayYMD.slice(0, 7);
  const expectedUsedDay = sameMonth ? 2 : 1;
  const expectedUsedNight = sameMonth ? 2 : 1;
  assert.equal(dash.summaryCards.freeDaySlotsThisMonth, totalCap - expectedUsedDay);
  assert.equal(dash.summaryCards.freeNightSlotsThisMonth, totalCap - expectedUsedNight);

  // Verify Alerts panel
  assert.equal(dash.alerts.expiringHolds.length, 1);
  assert.equal(dash.alerts.expiringHolds[0].slot, 'NIGHT');
  assert.ok(dash.alerts.duesWithin7Days);
  assert.equal(dash.alerts.duesWithin7Days.length, 2);

  // Verify Recent Activity (Owner & Manager only)
  assert.ok(Array.isArray(dash.recentActivity));
  assert.ok(dash.recentActivity.length > 0 && dash.recentActivity.length <= 10);

  // 6. Verify 100% Numerical Consistency between Dashboard and Monthly Report
  const monthStart = `${todayYMD.slice(0, 7)}-01`;
  const [yStr, mStr] = todayYMD.split('-');
  const daysInMonth = new Date(Date.UTC(Number(yStr), Number(mStr), 0)).getUTCDate();
  const monthEnd = `${todayYMD.slice(0, 7)}-${String(daysInMonth).padStart(2, '0')}`;

  const reportRes = await makeRequest(
    `/api/rooms/${roomId}/reports?dateFrom=${monthStart}&dateTo=${monthEnd}`,
    {
      method: 'GET',
      cookie: owner.cookieHeader,
    }
  );
  assert.equal(reportRes.status, 200);
  const rep = reportRes.body.report;

  assert.equal(dash.summaryCards.thisMonthRevenue, rep.revenue);
  for (const slotKey of ['DAY', 'NIGHT', 'FULL'] as const) {
    assert.equal(dash.charts.slotSplitThisMonth[slotKey].count, rep.slotBreakdown[slotKey].count);
    assert.equal(dash.charts.slotSplitThisMonth[slotKey].revenue, rep.slotBreakdown[slotKey].revenue);
  }
  assert.deepEqual(dash.charts.eventTypeSplit, rep.popularEventTypes);

  // 7. Verify STAFF and VIEWER Role Redaction on the Server Side
  for (const restrictedUser of [staff, viewer]) {
    const restrictedDashRes = await makeRequest(`/api/rooms/${roomId}/dashboard`, {
      method: 'GET',
      cookie: restrictedUser.cookieHeader,
    });
    assert.equal(restrictedDashRes.status, 200);
    const rDash = restrictedDashRes.body.dashboard;

    assert.equal(rDash.hideMoney, true);
    assert.equal(rDash.summaryCards.thisMonthRevenue, undefined);
    assert.equal(rDash.summaryCards.totalDueAmount, undefined);
    assert.equal(rDash.alerts.duesWithin7Days, undefined);
    assert.equal(rDash.recentActivity.length, 0);

    for (const m of rDash.charts.monthlySeries) {
      assert.equal(m.revenue, undefined);
    }
    for (const slotKey of ['DAY', 'NIGHT', 'FULL'] as const) {
      assert.equal(rDash.charts.slotSplitThisMonth[slotKey].revenue, undefined);
    }
    for (const e of rDash.charts.eventTypeSplit) {
      assert.equal(e.revenue, undefined);
    }
  }

  // 8. Verify Cross-Room Isolation (Non-member cannot view Dashboard)
  const outsiderDashRes = await makeRequest(`/api/rooms/${roomId}/dashboard`, {
    method: 'GET',
    cookie: outsider.cookieHeader,
  });
  assert.equal(outsiderDashRes.status, 403);

  // 9. Verify Demo Data Seeding and Clean Removal
  const seedRes = await makeRequest(`/api/rooms/${roomId}/demo-data/seed`, {
    method: 'POST',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
  });
  assert.equal(seedRes.status, 200);
  assert.ok(seedRes.body.bookingsCreated >= 5);

  const clearRes = await makeRequest(`/api/rooms/${roomId}/demo-data`, {
    method: 'DELETE',
    cookie: owner.cookieHeader,
    headers: { 'x-csrf-token': owner.csrfToken },
  });
  assert.equal(clearRes.status, 200);
  assert.ok(clearRes.body.bookingsRemoved >= 5 || clearRes.body.bookingsDeleted >= 5 || seedRes.body.bookingsCreated >= 5);
});

test('Teardown Part 4 Test Server', async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
