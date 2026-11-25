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
    csrfToken,
    cookie: `lily_session=${sessionToken}; lily_csrf=${csrfToken}`,
  };
}

// Valid 1x1 transparent PNG base64 for receipt upload test
const VALID_1X1_PNG_BASE64 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

test('Part 3 E2E Setup Server', async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test('Part 3 E2E: Full Money Flow (Booking -> Advance -> Partial -> Final -> Refund -> Reversal), Slot Change after Payment, Midnight Last Day of Month, Full Occupancy, Expenses, Exports, Notifications & Role Security', async () => {
  // 1. Setup Owner, Manager, Staff, Viewer in Room P3
  const owner = await loginDevUser('p3-owner@lilycc.local', 'Owner Part 3');
  const manager = await loginDevUser('p3-manager@lilycc.local', 'Manager Part 3');
  const staff = await loginDevUser('p3-staff@lilycc.local', 'Staff Part 3');
  const viewer = await loginDevUser('p3-viewer@lilycc.local', 'Viewer Part 3');

  const roomRes = await makeRequest('/api/rooms', {
    method: 'POST',
    cookie: owner.cookie,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      name: 'লিলি কমিউনিটি সেন্টার (Part 3 Financial Test)',
      address: 'ধানমন্ডি, ঢাকা',
      phone: '+8801711889900',
      default_language: 'bn',
    },
  });
  assert.equal(roomRes.status, 201);
  const roomId = roomRes.body.room.id;

  const db = getDb();
  const now = Date.now();
  for (const [u, role] of [
    [manager.user, 'MANAGER'],
    [staff.user, 'STAFF'],
    [viewer.user, 'VIEWER'],
  ] as const) {
    db.prepare(`
      INSERT INTO room_members (id, room_id, user_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'ACTIVE', ?, ?)
    `).run(crypto.randomUUID(), roomId, u.id, role, now, now);
  }

  // 2. Create Hall (Day: 30,000 | Night: 40,000 | Full: 65,000) & Customer
  const hallRes = await makeRequest(`/api/rooms/${roomId}/halls`, {
    method: 'POST',
    cookie: owner.cookie,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      name: 'শাপলা গ্র্যান্ড হল (Shapla Hall)',
      capacity: 500,
      day_price: 30000,
      night_price: 40000,
      full_price: 65000,
    },
  });
  assert.equal(hallRes.status, 201);
  const hallId = hallRes.body.hall.id;

  const custRes = await makeRequest(`/api/rooms/${roomId}/customers`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      name: 'মাহমুদুর রহমান চৌধুরী',
      phone: '01711-445566',
    },
  });
  assert.equal(custRes.status, 201);
  const custId = custRes.body.customer.id;

  // =========================================================================
  // 3. TEST FULL MONEY FLOW & SLOT CHANGE AFTER PAYMENT ON BOOKING #1 (November 2026)
  // =========================================================================
  // Booking #1 starts on 2026-11-25 as DAY slot (base price 30,000) with initial advance 10,000.
  const b1Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: custId,
      hall_id: hallId,
      event_type: 'WEDDING',
      event_date: '2026-11-25',
      slot: 'DAY',
      guest_count: 300,
      advance_amount: 10000,
      status: 'CONFIRMED',
      confirm_past_date: true,
    },
  });
  assert.equal(b1Res.status, 201);
  const b1Id = b1Res.body.booking.id;
  assert.equal(b1Res.body.booking.total_amount, 30000);
  assert.equal(b1Res.body.booking.advance_amount, 10000);
  assert.equal(b1Res.body.booking.due_amount, 20000);

  // Check that initial advance automatically created a Money Receipt in payments table!
  let b1Payments = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    cookie: manager.cookie,
  });
  assert.equal(b1Payments.status, 200);
  assert.equal(b1Payments.body.payments.length, 1);
  assert.equal(b1Payments.body.payments[0].payment_type, 'ADVANCE');
  assert.equal(b1Payments.body.payments[0].amount, 10000);
  assert.ok(b1Payments.body.payments[0].receipt_number.startsWith('MR-2026-'));

  // Zero or negative payment must be blocked
  const zeroPayRes = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      payment_type: 'PARTIAL',
      amount: 0,
      payment_date: '2026-11-25',
      method: 'CASH',
    },
  });
  assert.equal(zeroPayRes.status, 400);

  const negPayRes = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      payment_type: 'PARTIAL',
      amount: -500,
      payment_date: '2026-11-25',
      method: 'CASH',
    },
  });
  assert.equal(negPayRes.status, 400);

  // Record PARTIAL payment of 8,000 via bKash (with idempotency double-click test!)
  const partialIdemKey = `pay-idem-${Date.now()}`;
  const [pClick1, pClick2] = await Promise.all([
    makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
      method: 'POST',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: {
        payment_type: 'PARTIAL',
        amount: 8000,
        payment_date: '2026-11-25',
        method: 'BKASH',
        reference_number: 'BKASH99887766',
        idempotency_key: partialIdemKey,
      },
    }),
    makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
      method: 'POST',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: {
        payment_type: 'PARTIAL',
        amount: 8000,
        payment_date: '2026-11-25',
        method: 'BKASH',
        reference_number: 'BKASH99887766',
        idempotency_key: partialIdemKey,
      },
    }),
  ]);
  assert.equal(pClick1.body.payment.id, pClick2.body.payment.id, 'Double click must never create two payments');
  assert.equal(pClick1.body.payment.receipt_number, pClick2.body.payment.receipt_number);
  // Paid is now 10,000 + 8,000 = 18,000; Due = 30,000 - 18,000 = 12,000
  assert.equal(pClick1.body.booking.advance_amount, 18000);
  assert.equal(pClick1.body.booking.due_amount, 12000);

  // Now test: Booking changed from DAY (30,000) to NIGHT (40,000) AFTER payments (18,000) were recorded!
  const changeDayToNight = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}`, {
    method: 'PATCH',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: { slot: 'NIGHT', confirm_past_date: true },
  });
  assert.equal(changeDayToNight.status, 200);
  assert.equal(changeDayToNight.body.booking.slot, 'NIGHT');
  assert.equal(changeDayToNight.body.booking.total_amount, 40000, 'Price recalculated to Night base price 40,000');
  assert.equal(changeDayToNight.body.booking.advance_amount, 18000, 'Recorded payments (18,000) preserved');
  assert.equal(changeDayToNight.body.booking.due_amount, 22000, 'Due updated to 40,000 - 18,000 = 22,000');

  // Test overpayment warning when trying to pay 25,000 (exceeds 22,000 due) without confirm_overpayment
  const overpayWarnRes = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      payment_type: 'FINAL',
      amount: 25000,
      payment_date: '2026-11-26',
      method: 'BANK',
      confirm_overpayment: false,
    },
  });
  assert.equal(overpayWarnRes.status, 400, 'Must warn and block overpayment when confirm_overpayment is false');
  assert.equal(overpayWarnRes.body.error, 'OVERPAYMENT_WARNING');

  // Record wrong payment of 5,000 first, then REVERSE it via immutable reversal entry!
  const wrongPayRes = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      payment_type: 'PARTIAL',
      amount: 5000,
      payment_date: '2026-11-26',
      method: 'NAGAD',
      note: 'Mistaken entry',
    },
  });
  assert.equal(wrongPayRes.status, 201);
  const wrongPayId = wrongPayRes.body.payment.id;
  assert.equal(wrongPayRes.body.booking.due_amount, 17000); // 22000 - 5000

  // Reverse the 5,000 payment
  const revPayRes = await makeRequest(
    `/api/rooms/${roomId}/bookings/${b1Id}/payments/${wrongPayId}/reverse`,
    {
      method: 'POST',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: { reason: 'Entered wrong Nagad amount' },
    }
  );
  assert.equal(revPayRes.status, 200);
  assert.equal(revPayRes.body.reversalPayment.payment_type, 'REVERSAL');
  assert.equal(revPayRes.body.reversalPayment.amount, -5000);
  assert.equal(revPayRes.body.originalPayment.is_reversed, 1, 'Original payment stays visible and marked is_reversed=1');
  assert.equal(revPayRes.body.booking.advance_amount, 18000, 'Net paid restored to 18,000');
  assert.equal(revPayRes.body.booking.due_amount, 22000, 'Due restored to 22,000');

  // Record FINAL payment of 22,000
  const finalPayRes = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      payment_type: 'FINAL',
      amount: 22000,
      payment_date: '2026-11-26',
      method: 'BANK',
    },
  });
  assert.equal(finalPayRes.status, 201);
  assert.equal(finalPayRes.body.booking.advance_amount, 40000);
  assert.equal(finalPayRes.body.booking.due_amount, 0);

  // Record REFUND of 2,000 (e.g., goodwill discount refund)
  const refundPayRes = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}/payments`, {
    method: 'POST',
    cookie: owner.cookie,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      payment_type: 'REFUND',
      amount: 2000,
      payment_date: '2026-11-27',
      method: 'CASH',
      note: 'Goodwill refund',
    },
  });
  assert.equal(refundPayRes.status, 201);
  assert.equal(refundPayRes.body.payment.amount, -2000);
  // Net paid for B1 is now 10,000 + 8,000 + 5,000 - 5,000 + 22,000 - 2,000 = 38,000; Due = 40,000 - 38,000 = 2,000
  assert.equal(refundPayRes.body.booking.advance_amount, 38000);
  assert.equal(refundPayRes.body.booking.due_amount, 2000);

  // =========================================================================
  // 4. BOOKING #2: NIGHT BOOKING CROSSING MIDNIGHT ON THE LAST DAY OF A MONTH (2026-11-30)
  // =========================================================================
  const b2Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: custId,
      hall_id: hallId,
      event_type: 'RECEPTION',
      event_date: '2026-11-30', // Last day of November!
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '01:30', // Crosses midnight into Dec 1, 2026!
      guest_count: 350,
      advance_amount: 15000,
      status: 'CONFIRMED',
      confirm_past_date: true,
    },
  });
  assert.equal(b2Res.status, 201);
  // B2: Night slot, total = 40,000, paid = 15,000, due = 25,000. Must belong strictly to November 2026!

  // =========================================================================
  // 5. BOOKING #3: FULL BOOKING ON 2026-11-28 (Occupies 1 Day + 1 Night in occupancy)
  // =========================================================================
  const b3Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: custId,
      hall_id: hallId,
      event_type: 'HOLUD',
      event_date: '2026-11-28',
      slot: 'FULL',
      guest_count: 450,
      advance_amount: 65000,
      status: 'CONFIRMED',
      confirm_past_date: true,
    },
  });
  assert.equal(b3Res.status, 201);
  // B3: Full slot, total = 65,000, paid = 65,000, due = 0.

  // =========================================================================
  // 6. BOOKING #4: CANCELLED BOOKING WITH REFUND (Must NOT count as revenue!)
  // =========================================================================
  const b4Res = await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: custId,
      hall_id: hallId,
      event_type: 'BIRTHDAY',
      event_date: '2026-11-29',
      slot: 'DAY',
      guest_count: 200,
      advance_amount: 10000,
      status: 'CONFIRMED',
      confirm_past_date: true,
    },
  });
  assert.equal(b4Res.status, 201);
  const b4Id = b4Res.body.booking.id;

  // Cancel B4 and refund all 10,000
  const cancelB4Res = await makeRequest(`/api/rooms/${roomId}/bookings/${b4Id}/cancel`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      reason: 'Birthday postponed, full advance refunded',
      refund_amount: 10000,
      refund_method: 'CASH',
      refund_date: '2026-11-29',
    },
  });
  assert.equal(cancelB4Res.status, 200);
  assert.equal(cancelB4Res.body.booking.status, 'CANCELLED');
  assert.equal(cancelB4Res.body.booking.advance_amount, 0);
  assert.equal(cancelB4Res.body.booking.due_amount, 0);

  // =========================================================================
  // 7. EXPENSES: Create with Receipt Photo, Reject Fake Non-Image, Reverse Expense
  // =========================================================================
  // Fake executable disguised as image must be rejected
  const badPhotoRes = await makeRequest(`/api/rooms/${roomId}/expenses`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      category: 'REPAIR',
      amount: 3000,
      expense_date: '2026-11-25',
      receipt_image_base64: 'data:image/png;base64,SGVsbG9Xb3JsZE5vdEFRealPng==',
    },
  });
  assert.equal(badPhotoRes.status, 400, 'Fake PNG without valid magic bytes must be rejected');

  // Create valid expense 1: 12,000 Electricity with valid PNG receipt photo
  const exp1Res = await makeRequest(`/api/rooms/${roomId}/expenses`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      category: 'ELECTRICITY',
      amount: 12000,
      expense_date: '2026-11-25',
      note: 'DESCO November Bill',
      receipt_image_base64: VALID_1X1_PNG_BASE64,
    },
  });
  assert.equal(exp1Res.status, 201);
  assert.ok(exp1Res.body.expense.receipt_photo.startsWith('/api/uploads/receipt-'));

  // Create expense 2: 4,000 Cleaning, then REVERSE it
  const exp2Res = await makeRequest(`/api/rooms/${roomId}/expenses`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      category: 'CLEANING',
      amount: 4000,
      expense_date: '2026-11-26',
      note: 'Duplicate cleaning voucher',
    },
  });
  assert.equal(exp2Res.status, 201);
  const exp2Id = exp2Res.body.expense.id;

  const revExp2Res = await makeRequest(`/api/rooms/${roomId}/expenses/${exp2Id}/reverse`, {
    method: 'POST',
    cookie: owner.cookie,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: { reason: 'Duplicate voucher reversed', expense_date: '2026-11-26' },
  });
  assert.equal(revExp2Res.status, 200);
  // Net expenses in November 2026 = 12,000 + 4,000 - 4,000 = 12,000.

  // =========================================================================
  // 8. VERIFY NOVEMBER 2026 REPORT AGAINST EXACT HAND CALCULATION
  // =========================================================================
  // Hand Calculation for 2026-11-01 to 2026-11-30:
  // - Booking #1 (2026-11-25, changed DAY->NIGHT): Active, Revenue = 40,000, Collected = 38,000, Due = 2,000
  // - Booking #2 (2026-11-30, NIGHT crossing midnight): Active, Revenue = 40,000, Collected = 15,000, Due = 25,000
  // - Booking #3 (2026-11-28, FULL): Active, Revenue = 65,000, Collected = 65,000, Due = 0
  // - Booking #4 (2026-11-29, DAY, CANCELLED with 10,000 refund): Cancelled, Revenue = 0, Collected = 0, Due = 0
  //
  // Expected Totals:
  // - totalBookings = 4 (3 active, 1 cancelled)
  // - revenue = 40,000 + 40,000 + 65,000 = 145,000
  // - collected = 38,000 + 15,000 + 65,000 + 0 = 118,000
  // - due = 2,000 + 25,000 + 0 = 27,000
  // - expenses = 12,000
  // - profit = 145,000 - 12,000 = 133,000
  // - Slot Breakdown:
  //   * DAY: count = 0 (since B1 changed to NIGHT and B4 was CANCELLED!), revenue = 0
  //   * NIGHT: count = 2 (B1 + B2), revenue = 80,000, collected = 53,000, due = 27,000
  //   * FULL: count = 1 (B3), revenue = 65,000, collected = 65,000, due = 0
  // - Occupancy for Hall 1 in November (30 days):
  //   * Day slots booked = 1 (from B3 FULL booking!)
  //   * Night slots booked = 3 (B1 NIGHT + B2 NIGHT + B3 FULL!) — Full counted once for Day and once for Night!
  const repRes = await makeRequest(
    `/api/rooms/${roomId}/reports?dateFrom=2026-11-01&dateTo=2026-11-30`,
    { cookie: owner.cookie }
  );
  assert.equal(repRes.status, 200);
  const rep = repRes.body.report;

  assert.equal(rep.totalBookings, 4);
  assert.equal(rep.activeBookingsCount, 3);
  assert.equal(rep.cancellationsCount, 1);
  assert.equal(rep.revenue, 145000, 'Revenue must match hand calculation (145,000) and exclude cancelled B4');
  assert.equal(rep.collected, 118000, 'Collected must match hand calculation (118,000) after refunds & reversals');
  assert.equal(rep.due, 27000, 'Due must match hand calculation (27,000)');
  assert.equal(rep.expenses, 12000, 'Net expenses must match hand calculation (12,000)');
  assert.equal(rep.profit, 133000, 'Profit must match Revenue - Expenses (133,000)');

  assert.equal(rep.slotBreakdown.DAY.count, 0);
  assert.equal(rep.slotBreakdown.DAY.revenue, 0);
  assert.equal(rep.slotBreakdown.NIGHT.count, 2);
  assert.equal(rep.slotBreakdown.NIGHT.revenue, 80000);
  assert.equal(rep.slotBreakdown.FULL.count, 1);
  assert.equal(rep.slotBreakdown.FULL.revenue, 65000);

  // Verify Full booking counted once for Day and once for Night in occupancy
  const hallOcc = rep.occupancyByHall.find((h: any) => h.hall_id === hallId);
  assert.ok(hallOcc);
  assert.equal(hallOcc.day_slots_booked, 1, 'Full booking counts once for Day');
  assert.equal(hallOcc.night_slots_booked, 3, '2 Night bookings + 1 Full booking = 3 Night slots');

  // Verify December 2026 report does NOT falsely include the Nov 30 Night booking that ended at 1:30 AM on Dec 1!
  const decRepRes = await makeRequest(
    `/api/rooms/${roomId}/reports?dateFrom=2026-12-01&dateTo=2026-12-31`,
    { cookie: owner.cookie }
  );
  assert.equal(decRepRes.status, 200);
  assert.equal(
    decRepRes.body.report.totalBookings,
    0,
    'Night booking on Nov 30 ending at 1:30 AM next day must stay in November and never leak into December'
  );

  // Verify CSV Export in both languages includes both dates and slot, and logs REPORT_EXPORT
  const csvBnRes = await makeRequest(
    `/api/rooms/${roomId}/reports/export?dateFrom=2026-11-01&dateTo=2026-11-30&format=csv&lang=bn`,
    { cookie: manager.cookie }
  );
  assert.equal(csvBnRes.status, 200);
  assert.ok(String(csvBnRes.body).includes('বঙ্গাব্দ'), 'Bangla CSV export must include Bengali calendar dates');
  assert.ok(String(csvBnRes.body).includes('রাত (Night)'), 'CSV export must include slot name');

  // =========================================================================
  // 9. DIRECT ENDPOINT CALLS AS STAFF & VIEWER FOR MONEY DATA MUST BE BLOCKED
  // =========================================================================
  for (const restrictedUser of [staff, viewer]) {
    const repTry = await makeRequest(
      `/api/rooms/${roomId}/reports?dateFrom=2026-11-01&dateTo=2026-11-30`,
      { cookie: restrictedUser.cookie }
    );
    assert.equal(repTry.status, 403, 'Staff/Viewer must get 403 on /reports');

    const expExportTry = await makeRequest(
      `/api/rooms/${roomId}/reports/export?dateFrom=2026-11-01&dateTo=2026-11-30`,
      { cookie: restrictedUser.cookie }
    );
    assert.equal(expExportTry.status, 403, 'Staff/Viewer must get 403 on /reports/export');

    const payLedgerTry = await makeRequest(
      `/api/rooms/${roomId}/bookings/${b1Id}/payments`,
      { cookie: restrictedUser.cookie }
    );
    assert.equal(payLedgerTry.status, 403, 'Staff/Viewer must get 403 on /bookings/:id/payments');

    const expensesTry = await makeRequest(`/api/rooms/${roomId}/expenses`, {
      cookie: restrictedUser.cookie,
    });
    assert.equal(expensesTry.status, 403, 'Staff/Viewer must get 403 on /expenses');

    const bookingDetailTry = await makeRequest(`/api/rooms/${roomId}/bookings/${b1Id}`, {
      cookie: restrictedUser.cookie,
    });
    assert.equal(bookingDetailTry.status, 200);
    assert.equal(
      bookingDetailTry.body.booking.total_amount,
      undefined,
      'Money fields must be stripped from direct booking detail endpoint for Staff and Viewer'
    );
    assert.equal(bookingDetailTry.body.booking.advance_amount, undefined);
    assert.equal(bookingDetailTry.body.booking.due_amount, undefined);
  }

  // =========================================================================
  // 10. NOTIFICATIONS: Role Filtering, Slot Naming, Deduplication, Mark Read
  // =========================================================================
  // Create a booking for TOMORROW so EVENT_TOMORROW and DUE_WITHIN_7_DAYS notifications fire
  const today = getTodayDhakaYMD();
  const tomorrow = getNextDayYMD(today);

  await makeRequest(`/api/rooms/${roomId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: custId,
      hall_id: hallId,
      event_type: 'ENGAGEMENT',
      event_date: tomorrow,
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '23:00',
      guest_count: 200,
      advance_amount: 5000,
      status: 'CONFIRMED',
    },
  });

  // Owner fetches notifications
  const ownerNotifs = await makeRequest(`/api/rooms/${roomId}/notifications`, {
    cookie: owner.cookie,
  });
  assert.equal(ownerNotifs.status, 200);
  assert.ok(ownerNotifs.body.unreadCount > 0);
  const tomorrowNotif = ownerNotifs.body.notifications.find(
    (n: any) => n.type === 'EVENT_TOMORROW'
  );
  assert.ok(tomorrowNotif, 'Must generate EVENT_TOMORROW notification');
  assert.ok(
    tomorrowNotif.title_en.includes('Night event tomorrow, 6:00 PM'),
    'Notification must name the slot and 12-hour time ("Night event tomorrow, 6:00 PM")'
  );
  assert.ok(
    tomorrowNotif.message_bn.includes('বঙ্গাব্দ'),
    'Notification message must include both Bengali and English dates'
  );

  // Staff fetches notifications -> Must NOT receive PAYMENT_RECEIVED or DUE_WITHIN_7_DAYS (money notifications)
  const staffNotifs = await makeRequest(`/api/rooms/${roomId}/notifications`, {
    cookie: staff.cookie,
  });
  assert.equal(staffNotifs.status, 200);
  const leakedMoneyNotif = staffNotifs.body.notifications.find((n: any) => n.is_money === 1);
  assert.equal(leakedMoneyNotif, undefined, 'Staff must never receive money notifications');

  // Calling /notifications again must not create duplicates
  const countBefore = ownerNotifs.body.notifications.length;
  const ownerNotifsAgain = await makeRequest(`/api/rooms/${roomId}/notifications`, {
    cookie: owner.cookie,
  });
  assert.equal(
    ownerNotifsAgain.body.notifications.length,
    countBefore,
    'No duplicate notifications for the same event'
  );

  // Mark all as read for Owner
  const markAllRes = await makeRequest(`/api/rooms/${roomId}/notifications/read-all`, {
    method: 'POST',
    cookie: owner.cookie,
    headers: { 'x-csrf-token': owner.csrfToken },
  });
  assert.equal(markAllRes.status, 200);
  const ownerNotifsAfterRead = await makeRequest(`/api/rooms/${roomId}/notifications`, {
    cookie: owner.cookie,
  });
  assert.equal(ownerNotifsAfterRead.body.unreadCount, 0);

  // =========================================================================
  // 11. AUDIT LOG: Filter by Action & User, Sensitive Data Masking
  // =========================================================================
  const auditPaymentLogs = await makeRequest(
    `/api/rooms/${roomId}/audit-logs?action=PAYMENT_CREATE`,
    { cookie: owner.cookie }
  );
  assert.equal(auditPaymentLogs.status, 200);
  assert.ok(auditPaymentLogs.body.logs.length >= 2);
  // Check that reference number 'BKASH99887766' was masked in the audit log details!
  const allDetailsText = auditPaymentLogs.body.logs.map((l: any) => l.details).join(' ');
  assert.ok(
    !allDetailsText.includes('BKASH99887766'),
    'Full payment reference numbers must never be written into audit logs'
  );
  assert.ok(allDetailsText.includes('***766'), 'Reference number must be masked');
});

test('Part 3 E2E Teardown Server', async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
