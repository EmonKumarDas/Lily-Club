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

test('Part 2 E2E Setup Server', async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test('Part 2 E2E: Complete Slot Matrix, Concurrency, Pricing, Permissions, Midnight Crossing, and Safety Checks', async () => {
  // 1. Setup Owner, Manager, Staff, Viewer in Room A, plus Owner B in Room B (for cross-room ID tampering test)
  const owner = await loginDevUser('p2-owner@lilycc.local', 'Owner Part 2');
  const manager = await loginDevUser('p2-manager@lilycc.local', 'Manager Part 2');
  const staff = await loginDevUser('p2-staff@lilycc.local', 'Staff Part 2');
  const viewer = await loginDevUser('p2-viewer@lilycc.local', 'Viewer Part 2');
  const otherOwner = await loginDevUser('p2-other@lilycc.local', 'Other Room Owner');

  // Create Room A
  const roomARes = await makeRequest('/api/rooms', {
    method: 'POST',
    cookie: owner.cookie,
    headers: { 'x-csrf-token': owner.csrfToken },
    body: {
      name: 'লিলি কমিউনিটি সেন্টার (Part 2 Test)',
      address: 'ধানমন্ডি, ঢাকা',
      phone: '+8801711223344',
      default_language: 'bn',
    },
  });
  assert.equal(roomARes.status, 201);
  const roomAId = roomARes.body.room.id;

  // Add Manager, Staff, Viewer directly as ACTIVE members of Room A
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
    `).run(crypto.randomUUID(), roomAId, u.id, role, now, now);
  }

  // Create Room B by otherOwner
  const roomBRes = await makeRequest('/api/rooms', {
    method: 'POST',
    cookie: otherOwner.cookie,
    headers: { 'x-csrf-token': otherOwner.csrfToken },
    body: {
      name: 'Other Club Room B',
      address: 'Banani, Dhaka',
      phone: '+8801999887766',
      default_language: 'en',
    },
  });
  assert.equal(roomBRes.status, 201);
  const roomBId = roomBRes.body.room.id;

  // 2. HALLS: Owner/Manager create hall; Staff/Viewer cannot create hall
  const staffHallTry = await makeRequest(`/api/rooms/${roomAId}/halls`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      name: 'Unauthorized Hall',
      capacity: 200,
      day_price: 20000,
      night_price: 30000,
      full_price: 45000,
    },
  });
  assert.equal(staffHallTry.status, 403, 'Staff must not be able to create halls');

  const hallRes = await makeRequest(`/api/rooms/${roomAId}/halls`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      name: 'শাপলা গ্র্যান্ড হল (Shapla Grand Hall)',
      capacity: 500,
      day_price: 40000,
      night_price: 50000,
      full_price: 80000,
      facilities: ['AC', 'Stage', 'Generator'],
    },
  });
  assert.equal(hallRes.status, 201);
  const hallId = hallRes.body.hall.id;

  // 3. CUSTOMERS: Create customer with long Bangla name + test duplicate phone suggestion
  const longBanglaName =
    'আলহাজ্ব মোহাম্মদ মাহমুদুর রহমান চৌধুরী ইবনে আবদুর রশিদ তালুকদার (মাহমুদ সাহেব)';
  const cust1Res = await makeRequest(`/api/rooms/${roomAId}/customers`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      name: longBanglaName,
      phone: '01711-556677',
      alt_phone: '01811-556677',
      address: 'ধানমন্ডি, ঢাকা',
    },
  });
  assert.equal(cust1Res.status, 201);
  const cust1Id = cust1Res.body.customer.id;
  assert.equal(cust1Res.body.customer.name, longBanglaName);

  // Entering same phone number suggests existing customer (409 DUPLICATE_CUSTOMER_PHONE)
  const dupCustRes = await makeRequest(`/api/rooms/${roomAId}/customers`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      name: 'Duplicate Person',
      phone: '01711556677', // Even without hyphen, normalizer catches it!
    },
  });
  assert.equal(dupCustRes.status, 409, 'Must suggest existing customer on duplicate phone');
  assert.equal(dupCustRes.body.error, 'DUPLICATE_CUSTOMER_PHONE');
  assert.equal(dupCustRes.body.existingCustomer.id, cust1Id);

  // Second distinct customer
  const cust2Res = await makeRequest(`/api/rooms/${roomAId}/customers`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      name: 'ফারহানা ইয়াসমিন',
      phone: '01911-334455',
    },
  });
  assert.equal(cust2Res.status, 201);
  const cust2Id = cust2Res.body.customer.id;

  // 4. SLOT MATRIX TESTS ON ONE HALL AND ONE DATE
  const today = getTodayDhakaYMD();
  const matrixDate = getNextDayYMD(getNextDayYMD(today)); // +2 days in future

  // Check initial availability: BOTH_FREE
  let availRes = await makeRequest(
    `/api/rooms/${roomAId}/availability?date=${matrixDate}&hallId=${hallId}`,
    { cookie: staff.cookie }
  );
  assert.equal(availRes.status, 200);
  assert.equal(availRes.body.availability.availability_state, 'BOTH_FREE');

  // (A) Book DAY slot on matrixDate
  const dayBookRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'WEDDING',
      event_date: matrixDate,
      slot: 'DAY',
      guest_count: 300,
      advance_amount: 10000,
      status: 'CONFIRMED',
    },
  });
  assert.equal(dayBookRes.status, 201);
  const dayBookingId = dayBookRes.body.booking.id;
  // Manager checks server-calculated totals
  const mgrDayCheck = await makeRequest(`/api/rooms/${roomAId}/bookings/${dayBookingId}`, {
    cookie: manager.cookie,
  });
  assert.equal(mgrDayCheck.body.booking.total_amount, 40000);
  assert.equal(mgrDayCheck.body.booking.due_amount, 30000);

  // Availability now: NIGHT_ONLY_FREE
  availRes = await makeRequest(
    `/api/rooms/${roomAId}/availability?date=${matrixDate}&hallId=${hallId}`,
    { cookie: staff.cookie }
  );
  assert.equal(availRes.body.availability.availability_state, 'NIGHT_ONLY_FREE');
  assert.equal(availRes.body.availability.day_free, false);
  assert.equal(availRes.body.availability.night_free, true);

  // (B) Day + Day BLOCKED on same hall & date
  const dayDupRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust2Id,
      hall_id: hallId,
      event_type: 'HOLUD',
      event_date: matrixDate,
      slot: 'DAY',
      guest_count: 150,
    },
  });
  assert.equal(dayDupRes.status, 409, 'Day + Day must be blocked');
  assert.equal(dayDupRes.body.error, 'SLOT_CONFLICT');
  assert.ok(dayDupRes.body.messageBn.includes('দিন'));
  assert.ok(dayDupRes.body.messageEn.includes('Day'));

  // (C) Full BLOCKED by existing Day
  const fullBlockedByDayRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust2Id,
      hall_id: hallId,
      event_type: 'RECEPTION',
      event_date: matrixDate,
      slot: 'FULL',
      guest_count: 400,
    },
  });
  assert.equal(fullBlockedByDayRes.status, 409, 'Full must be blocked by existing Day');
  assert.equal(fullBlockedByDayRes.body.error, 'SLOT_CONFLICT');

  // (D) Day + Night ALLOWED together on same hall & date
  const nightBookRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust2Id,
      hall_id: hallId,
      event_type: 'HOLUD',
      event_date: matrixDate,
      slot: 'NIGHT',
      guest_count: 250,
      advance_amount: 15000,
      status: 'CONFIRMED',
    },
  });
  assert.equal(nightBookRes.status, 201, 'Day + Night on the same hall and date must be allowed');
  const nightBookingId = nightBookRes.body.booking.id;
  const mgrNightCheck = await makeRequest(`/api/rooms/${roomAId}/bookings/${nightBookingId}`, {
    cookie: manager.cookie,
  });
  assert.equal(mgrNightCheck.body.booking.total_amount, 50000);
  assert.equal(mgrNightCheck.body.booking.due_amount, 35000);

  // Availability now: FULLY_BOOKED
  availRes = await makeRequest(
    `/api/rooms/${roomAId}/availability?date=${matrixDate}&hallId=${hallId}`,
    { cookie: staff.cookie }
  );
  assert.equal(availRes.body.availability.availability_state, 'FULLY_BOOKED');

  // (E) Night + Night BLOCKED
  const nightDupRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'MEETING',
      event_date: matrixDate,
      slot: 'NIGHT',
      guest_count: 100,
    },
  });
  assert.equal(nightDupRes.status, 409, 'Night + Night must be blocked');

  // (F) Edit Day to Night with conflict BLOCKED
  const editDayToNightConflict = await makeRequest(
    `/api/rooms/${roomAId}/bookings/${dayBookingId}`,
    {
      method: 'PATCH',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: { slot: 'NIGHT' },
    }
  );
  assert.equal(editDayToNightConflict.status, 409, 'Editing Day to Night when Night is taken must fail with 409');

  // (G) Staff cannot cancel CONFIRMED booking; Manager/Owner can cancel and free slot immediately
  const staffCancelConfirmed = await makeRequest(
    `/api/rooms/${roomAId}/bookings/${dayBookingId}/cancel`,
    {
      method: 'POST',
      cookie: staff.cookie,
      headers: { 'x-csrf-token': staff.csrfToken },
      body: { reason: 'Staff trying to cancel confirmed' },
    }
  );
  assert.equal(staffCancelConfirmed.status, 403, 'Staff cannot cancel confirmed bookings');

  // Manager cancels Day booking -> Day slot is freed immediately
  const mgrCancelDay = await makeRequest(
    `/api/rooms/${roomAId}/bookings/${dayBookingId}/cancel`,
    {
      method: 'POST',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: { reason: 'Client moved wedding date' },
    }
  );
  assert.equal(mgrCancelDay.status, 200);

  // Availability now: DAY_ONLY_FREE (since Night is still booked)
  availRes = await makeRequest(
    `/api/rooms/${roomAId}/availability?date=${matrixDate}&hallId=${hallId}`,
    { cookie: staff.cookie }
  );
  assert.equal(availRes.body.availability.availability_state, 'DAY_ONLY_FREE');

  // (H) Full BLOCKED by existing Night
  const fullBlockedByNight = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'RECEPTION',
      event_date: matrixDate,
      slot: 'FULL',
      guest_count: 400,
    },
  });
  assert.equal(fullBlockedByNight.status, 409, 'Full must be blocked by existing Night');

  // (I) Cancel Night booking too, then rebook as FULL!
  const mgrCancelNight = await makeRequest(
    `/api/rooms/${roomAId}/bookings/${nightBookingId}/cancel`,
    {
      method: 'POST',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: { reason: 'Upgrading to Full booking' },
    }
  );
  assert.equal(mgrCancelNight.status, 200);

  // Rebook matrixDate as FULL
  const fullBookRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'WEDDING',
      event_date: matrixDate,
      slot: 'FULL',
      guest_count: 500,
      advance_amount: 30000,
      status: 'CONFIRMED',
    },
  });
  assert.equal(fullBookRes.status, 201, 'Should rebook after cancellation');
  assert.equal(fullBookRes.body.booking.total_amount, 80000);
  assert.equal(fullBookRes.body.booking.due_amount, 50000);

  // (J) Day BLOCKED by existing Full & Night BLOCKED by existing Full
  const dayBlockedByFull = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust2Id,
      hall_id: hallId,
      event_type: 'MEETING',
      event_date: matrixDate,
      slot: 'DAY',
      guest_count: 100,
    },
  });
  assert.equal(dayBlockedByFull.status, 409, 'Day must be blocked by existing Full');

  const nightBlockedByFull = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust2Id,
      hall_id: hallId,
      event_type: 'MEETING',
      event_date: matrixDate,
      slot: 'NIGHT',
      guest_count: 100,
    },
  });
  assert.equal(nightBlockedByFull.status, 409, 'Night must be blocked by existing Full');

  // 5. TWO SIMULTANEOUS SAVES OF THE SAME SLOT + DOUBLE-CLICK IDEMPOTENCY
  const raceDate = getNextDayYMD(matrixDate);
  const [sim1, sim2] = await Promise.all([
    makeRequest(`/api/rooms/${roomAId}/bookings`, {
      method: 'POST',
      cookie: staff.cookie,
      headers: { 'x-csrf-token': staff.csrfToken },
      body: {
        customer_id: cust1Id,
        hall_id: hallId,
        event_type: 'WEDDING',
        event_date: raceDate,
        slot: 'DAY',
        guest_count: 200,
      },
    }),
    makeRequest(`/api/rooms/${roomAId}/bookings`, {
      method: 'POST',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: {
        customer_id: cust2Id,
        hall_id: hallId,
        event_type: 'HOLUD',
        event_date: raceDate,
        slot: 'DAY',
        guest_count: 200,
      },
    }),
  ]);

  const statuses = [sim1.status, sim2.status].sort();
  assert.deepEqual(
    statuses,
    [201, 409],
    'When two staff save the same hall + date + slot simultaneously, exactly one must succeed (201) and one must be blocked (409)'
  );

  // Double-click idempotency: same idempotency_key returns existing booking without duplicating
  const idemKey = `double-click-key-${Date.now()}`;
  const [click1, click2] = await Promise.all([
    makeRequest(`/api/rooms/${roomAId}/bookings`, {
      method: 'POST',
      cookie: staff.cookie,
      headers: { 'x-csrf-token': staff.csrfToken },
      body: {
        customer_id: cust1Id,
        hall_id: hallId,
        event_type: 'RECEPTION',
        event_date: raceDate,
        slot: 'NIGHT',
        guest_count: 250,
        idempotency_key: idemKey,
      },
    }),
    makeRequest(`/api/rooms/${roomAId}/bookings`, {
      method: 'POST',
      cookie: staff.cookie,
      headers: { 'x-csrf-token': staff.csrfToken },
      body: {
        customer_id: cust1Id,
        hall_id: hallId,
        event_type: 'RECEPTION',
        event_date: raceDate,
        slot: 'NIGHT',
        guest_count: 250,
        idempotency_key: idemKey,
      },
    }),
  ]);
  assert.equal(click1.body.booking.id, click2.body.booking.id, 'Double-click with idempotency key must create only one booking');

  // 6. NIGHT ENDING AFTER MIDNIGHT: stays on start date, never blocks next day's Day slot
  const midnightTestDate = getNextDayYMD(raceDate);
  const nextDayAfterMidnight = getNextDayYMD(midnightTestDate);

  const lateNightRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'RECEPTION',
      event_date: midnightTestDate,
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '01:30', // Ends 1:30 AM next day!
      guest_count: 300,
    },
  });
  assert.equal(lateNightRes.status, 201, 'Night slot crossing midnight must be valid');
  assert.equal(lateNightRes.body.booking.event_date, midnightTestDate);

  // Next day's DAY slot must still be completely free!
  const nextDayAvail = await makeRequest(
    `/api/rooms/${roomAId}/availability?date=${nextDayAfterMidnight}&hallId=${hallId}`,
    { cookie: staff.cookie }
  );
  assert.equal(nextDayAvail.body.availability.availability_state, 'BOTH_FREE');
  assert.equal(nextDayAvail.body.availability.day_free, true);

  // 7. PAST DATE WARNING, PRICING RULES & SERVER RECALCULATION ON SLOT CHANGE
  const pastDateRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'BIRTHDAY',
      event_date: '2024-01-15',
      slot: 'DAY',
      guest_count: 100,
      confirm_past_date: false,
    },
  });
  assert.equal(pastDateRes.status, 400, 'Past date without confirmation must warn/block');
  assert.equal(pastDateRes.body.error, 'PAST_DATE_WARNING');

  // Staff cannot lower price below base price without Manager approval
  const staffLowPriceRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: staff.cookie,
    headers: { 'x-csrf-token': staff.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'BIRTHDAY',
      event_date: nextDayAfterMidnight,
      slot: 'DAY',
      guest_count: 100,
      hall_rent: 25000, // Base price is 40000
      manager_price_approved: false,
    },
  });
  assert.equal(staffLowPriceRes.status, 403);
  assert.equal(staffLowPriceRes.body.error, 'PRICE_BELOW_BASE_NEEDS_APPROVAL');

  // Create on nextDayAfterMidnight as DAY at base price 40000 + 5000 service = 45000, advance 10000 -> due 35000
  const editSlotTestRes = await makeRequest(`/api/rooms/${roomAId}/bookings`, {
    method: 'POST',
    cookie: manager.cookie,
    headers: { 'x-csrf-token': manager.csrfToken },
    body: {
      customer_id: cust1Id,
      hall_id: hallId,
      event_type: 'BIRTHDAY',
      event_date: nextDayAfterMidnight,
      slot: 'DAY',
      guest_count: 100,
      extra_services: [{ type: 'SOUND', label: 'Sound', amount: 5000 }],
      advance_amount: 10000,
    },
  });
  assert.equal(editSlotTestRes.status, 201);
  const editSlotBookingId = editSlotTestRes.body.booking.id;
  assert.equal(editSlotTestRes.body.booking.total_amount, 45000);
  assert.equal(editSlotTestRes.body.booking.due_amount, 35000);

  // Change slot from DAY to FULL -> Server re-checks conflicts and recalculates price (Full base = 80000 + 5000 = 85000, due = 75000)
  const slotChangedRes = await makeRequest(
    `/api/rooms/${roomAId}/bookings/${editSlotBookingId}`,
    {
      method: 'PATCH',
      cookie: manager.cookie,
      headers: { 'x-csrf-token': manager.csrfToken },
      body: { slot: 'FULL' },
    }
  );
  assert.equal(slotChangedRes.status, 200);
  assert.equal(slotChangedRes.body.booking.slot, 'FULL');
  assert.equal(slotChangedRes.body.booking.base_price, 80000);
  assert.equal(slotChangedRes.body.booking.total_amount, 85000);
  assert.equal(slotChangedRes.body.booking.due_amount, 75000);

  // 8. CUSTOMER PROFILE MONEY HIDDEN FROM STAFF/VIEWER + HARD DELETE PROTECTION
  const staffCustProfile = await makeRequest(
    `/api/rooms/${roomAId}/customers/${cust1Id}`,
    { cookie: staff.cookie }
  );
  assert.equal(staffCustProfile.status, 200);
  assert.equal(staffCustProfile.body.hideMoneyColumns, true);
  assert.equal(staffCustProfile.body.bookings[0].total_amount, undefined, 'Money columns must be stripped from customer profile for Staff');

  const ownerCustProfile = await makeRequest(
    `/api/rooms/${roomAId}/customers/${cust1Id}`,
    { cookie: owner.cookie }
  );
  assert.equal(ownerCustProfile.body.hideMoneyColumns, false);
  assert.ok(ownerCustProfile.body.bookings[0].total_amount > 0, 'Owner sees money columns in customer profile');

  // Cannot hard-delete customer with bookings
  const delCustWithBookings = await makeRequest(
    `/api/rooms/${roomAId}/customers/${cust1Id}`,
    {
      method: 'DELETE',
      cookie: owner.cookie,
      headers: { 'x-csrf-token': owner.csrfToken },
    }
  );
  assert.equal(delCustWithBookings.status, 400);
  assert.equal(delCustWithBookings.body.error, 'CUSTOMER_HAS_BOOKINGS');

  // Deleting hall with bookings soft-deactivates instead of hard-deleting
  const delHallWithBookings = await makeRequest(
    `/api/rooms/${roomAId}/halls/${hallId}`,
    {
      method: 'DELETE',
      cookie: owner.cookie,
      headers: { 'x-csrf-token': owner.csrfToken },
    }
  );
  assert.equal(delHallWithBookings.status, 200);
  assert.equal(delHallWithBookings.body.deleted, false);
  assert.equal(delHallWithBookings.body.deactivated, true);

  // 9. CROSS-ROOM ID TAMPERING (IDOR) & VIEWER READ-ONLY ENFORCEMENT
  const crossRoomBookingTry = await makeRequest(
    `/api/rooms/${roomBId}/bookings/${editSlotBookingId}`,
    { cookie: otherOwner.cookie }
  );
  assert.equal(crossRoomBookingTry.status, 404, 'Booking from Room A must never be reachable from Room B');

  const crossRoomAccessTry = await makeRequest(
    `/api/rooms/${roomAId}/bookings/${editSlotBookingId}`,
    { cookie: otherOwner.cookie }
  );
  assert.equal(crossRoomAccessTry.status, 403, 'Non-member of Room A must be blocked with 403');

  const viewerWriteTry = await makeRequest(`/api/rooms/${roomAId}/customers`, {
    method: 'POST',
    cookie: viewer.cookie,
    headers: { 'x-csrf-token': viewer.csrfToken },
    body: { name: 'Viewer Tamper', phone: '01700999888' },
  });
  assert.equal(viewerWriteTry.status, 403, 'Viewer must be strictly read-only');
});

test('Part 2 E2E Teardown Server', async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
