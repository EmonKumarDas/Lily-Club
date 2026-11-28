import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import { app } from '../server/index.js';
import { getDb } from '../server/db.js';
import { resetConfigCacheForTests } from '../server/config.js';
import { getTodayDhakaYMD } from '../server/dateUtils.js';

let server: http.Server;
let baseUrl = '';

async function api(
  method: string,
  path: string,
  opts: {
    cookie?: string;
    csrf?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}
) {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client-Version': '1.0.0',
    ...(opts.headers || {}),
  };
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });

  const setCookies = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  let cookieStr = opts.cookie || '';
  let csrf = opts.csrf || '';
  for (const sc of setCookies) {
    const pair = sc.split(';')[0];
    const [k, v] = pair.split('=');
    if (k === 'lily_csrf') csrf = v;
    if (k === 'lily_session' || k === 'lily_csrf') {
      const parts = cookieStr
        .split(';')
        .map((s) => s.trim())
        .filter((s) => s && !s.startsWith(`${k}=`));
      parts.push(pair);
      cookieStr = parts.join('; ');
    }
  }

  const data = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, data, cookie: cookieStr, csrf };
}

async function loginTestUser(label: string) {
  const uid = crypto.randomBytes(4).toString('hex');
  const res = await api('POST', '/api/auth/dev-login', {
    body: {
      email: `${label}-${uid}@lily.test`,
      name: `User ${label}`,
    },
  });
  assert.equal(res.status, 200);
  return {
    user: res.data.user,
    cookie: res.cookie,
    csrf: res.csrf,
  };
}

test('Setup Phase C Comprehensive Verification Server', async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test('Phase C #1 & #2: Brand-new user has zero access; role-selection & proxied dev-login blocked; room cap & ALLOWED_OWNER_EMAILS enforced', async () => {
  // 1. Attempting to choose a role during login is rejected with 400
  const roleSpoof = await api('POST', '/api/auth/dev-login', {
    body: { email: 'spoof@lily.test', name: 'Spoofer', role: 'OWNER' },
  });
  assert.equal(roleSpoof.status, 400);
  assert.equal(roleSpoof.data.error, 'ROLE_SELECTION_FORBIDDEN');

  // 2. Proxied / tunneled dev-login attempt (x-forwarded-for) is rejected with 403
  const proxiedLogin = await api('POST', '/api/auth/dev-login', {
    headers: { 'x-forwarded-for': '203.0.113.9' },
    body: { email: 'tunnel@lily.test', name: 'Tunnel Attacker' },
  });
  assert.equal(proxiedLogin.status, 403);

  // 3. Brand-new user signs in -> activeRoom is null, userRooms is empty
  const freshUser = await loginTestUser('fresh');
  const me = await api('GET', '/api/auth/me', { cookie: freshUser.cookie });
  assert.equal(me.status, 200);
  assert.equal(me.data.activeRoom, null);
  assert.equal(me.data.userRooms.length, 0);

  // 4. Max rooms per Owner (default 3) enforced on 4th room creation
  for (let i = 1; i <= 3; i++) {
    const r = await api('POST', '/api/rooms', {
      cookie: freshUser.cookie,
      csrf: freshUser.csrf,
      body: { name: `Cap Room ${i}`, address: 'Chattogram', phone: '01711223344' },
    });
    assert.equal(r.status, 201);
  }
  const fourthRoom = await api('POST', '/api/rooms', {
    cookie: freshUser.cookie,
    csrf: freshUser.csrf,
    body: { name: 'Cap Room 4', address: 'Chattogram', phone: '01711223344' },
  });
  assert.equal(fourthRoom.status, 403);
  assert.equal(fourthRoom.data.error, 'MAX_ROOMS_REACHED');

  // 5. ALLOWED_OWNER_EMAILS optional server gate blocks unlisted Gmail accounts
  process.env.ALLOWED_OWNER_EMAILS = 'vip-owner@lily.test';
  resetConfigCacheForTests();
  try {
    const nonVip = await loginTestUser('nonvip');
    const blockedCreate = await api('POST', '/api/rooms', {
      cookie: nonVip.cookie,
      csrf: nonVip.csrf,
      body: { name: 'Blocked Room', address: 'Dhaka', phone: '01700000000' },
    });
    assert.equal(blockedCreate.status, 403);
    assert.equal(blockedCreate.data.error, 'OWNER_EMAIL_NOT_ALLOWED');
  } finally {
    delete process.env.ALLOWED_OWNER_EMAILS;
    resetConfigCacheForTests();
  }
});

test('Phase C #3–#7: Pending Cancel, Reject, Approve (OWNER blocked), Immediate Suspend/Remove Session Cut-off, Ownership Transfer, Sole-Owner Delete Guard & Soft-Delete Room', async () => {
  const owner = await loginTestUser('owner-flow');
  const applicantCancel = await loginTestUser('applicant-cancel');
  const applicantReject = await loginTestUser('applicant-reject');
  const staffCandidate = await loginTestUser('staff-cand');
  const managerCandidate = await loginTestUser('mgr-cand');

  const createRes = await api('POST', '/api/rooms', {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { name: 'Lily Lifecycle Club', address: 'Halishahar', phone: '01955666622' },
  });
  assert.equal(createRes.status, 201);
  const roomId = createRes.data.room.id;
  const joinCode = createRes.data.room.join_code;

  // Applicant 1 joins -> PENDING -> cannot read bookings -> cancels own request
  const j1 = await api('POST', '/api/rooms/join', {
    cookie: applicantCancel.cookie,
    csrf: applicantCancel.csrf,
    headers: { 'x-forwarded-for': '10.99.1.1' },
    body: { joinCode },
  });
  assert.equal(j1.data.status, 'PENDING');

  const pendingReadBlocked = await api('GET', `/api/rooms/${roomId}/bookings`, {
    cookie: applicantCancel.cookie,
  });
  assert.equal(pendingReadBlocked.status, 403);

  const cancelReq = await api('DELETE', `/api/rooms/${roomId}/cancel-request`, {
    cookie: applicantCancel.cookie,
    csrf: applicantCancel.csrf,
  });
  assert.equal(cancelReq.status, 200);

  // Applicant 2 joins -> Owner rejects -> Applicant 2 sees REJECTED notice & zero access
  await api('POST', '/api/rooms/join', {
    cookie: applicantReject.cookie,
    csrf: applicantReject.csrf,
    headers: { 'x-forwarded-for': '10.99.1.2' },
    body: { joinCode },
  });
  const rejRes = await api('POST', `/api/rooms/${roomId}/requests/${applicantReject.user.id}/reject`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(rejRes.status, 200);
  const rejMe = await api('GET', '/api/auth/me', { cookie: applicantReject.cookie });
  assert.ok(rejMe.data.membershipNotices.some((n: any) => n.room_id === roomId && n.status === 'REJECTED'));

  // Staff & Manager candidates join
  await api('POST', '/api/rooms/join', {
    cookie: staffCandidate.cookie,
    csrf: staffCandidate.csrf,
    headers: { 'x-forwarded-for': '10.99.1.3' },
    body: { joinCode },
  });
  await api('POST', '/api/rooms/join', {
    cookie: managerCandidate.cookie,
    csrf: managerCandidate.csrf,
    headers: { 'x-forwarded-for': '10.99.1.4' },
    body: { joinCode },
  });

  // Owner CANNOT assign role: 'OWNER' via approve endpoint!
  const illegalApprove = await api('POST', `/api/rooms/${roomId}/requests/${staffCandidate.user.id}/approve`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { role: 'OWNER' },
  });
  assert.equal(illegalApprove.status, 400);
  assert.equal(illegalApprove.data.error, 'CANNOT_ASSIGN_OWNER');

  // Valid approvals as STAFF and MANAGER
  assert.equal(
    (
      await api('POST', `/api/rooms/${roomId}/requests/${staffCandidate.user.id}/approve`, {
        cookie: owner.cookie,
        csrf: owner.csrf,
        body: { role: 'STAFF' },
      })
    ).status,
    200
  );
  assert.equal(
    (
      await api('POST', `/api/rooms/${roomId}/requests/${managerCandidate.user.id}/approve`, {
        cookie: owner.cookie,
        csrf: owner.csrf,
        body: { role: 'MANAGER' },
      })
    ).status,
    200
  );

  // Staff switches into active room -> open session has activeRoom
  await api('POST', '/api/rooms/switch', {
    cookie: staffCandidate.cookie,
    csrf: staffCandidate.csrf,
    body: { roomId },
  });
  assert.equal((await api('GET', '/api/auth/me', { cookie: staffCandidate.cookie })).data.activeRoom.id, roomId);

  // Owner SUSPENDS Staff -> open session activeRoom immediately becomes null & API returns 403 + SUSPENDED notice
  const suspendRes = await api('POST', `/api/rooms/${roomId}/members/${staffCandidate.user.id}/suspend`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(suspendRes.status, 200);

  const staffMeAfterSuspend = await api('GET', '/api/auth/me', { cookie: staffCandidate.cookie });
  assert.equal(staffMeAfterSuspend.data.activeRoom, null);
  assert.ok(
    staffMeAfterSuspend.data.membershipNotices.some(
      (n: any) => n.room_id === roomId && n.status === 'SUSPENDED'
    )
  );
  assert.equal(
    (await api('GET', `/api/rooms/${roomId}/halls`, { cookie: staffCandidate.cookie })).status,
    403
  );

  // Sole Owner attempting to delete personal account is blocked until ownership transferred
  const blockedDeleteAcc = await api('DELETE', '/api/auth/account', {
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(blockedDeleteAcc.status, 400);
  assert.equal(blockedDeleteAcc.data.error, 'SOLE_OWNER_CANNOT_DELETE_ACCOUNT');

  // Transfer ownership to Manager (requires confirm: true)
  const transferNoConfirm = await api('POST', `/api/rooms/${roomId}/transfer-ownership`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { newOwnerUserId: managerCandidate.user.id },
  });
  assert.equal(transferNoConfirm.status, 400);

  const transferOk = await api('POST', `/api/rooms/${roomId}/transfer-ownership`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { newOwnerUserId: managerCandidate.user.id, confirm: true },
  });
  assert.equal(transferOk.status, 200);

  // Previous owner can now delete their account cleanly -> session immediately invalidated
  const deleteAccOk = await api('DELETE', '/api/auth/account', {
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(deleteAccOk.status, 200);
  assert.equal((await api('GET', '/api/auth/me', { cookie: owner.cookie })).status, 401);

  // New Owner exports room backup JSON and then soft-deletes the room
  await api('POST', '/api/rooms/switch', {
    cookie: managerCandidate.cookie,
    csrf: managerCandidate.csrf,
    body: { roomId },
  });
  const exportRes = await api('GET', `/api/rooms/${roomId}/export-data`, {
    cookie: managerCandidate.cookie,
  });
  assert.equal(exportRes.status, 200);
  assert.equal(exportRes.data.room.id, roomId);

  const delRoomRes = await api('DELETE', `/api/rooms/${roomId}`, {
    cookie: managerCandidate.cookie,
    csrf: managerCandidate.csrf,
  });
  assert.equal(delRoomRes.status, 200);
  assert.equal(
    (await api('GET', '/api/auth/me', { cookie: managerCandidate.cookie })).data.activeRoom,
    null
  );
});

test('Phase C #8–#14: Concurrent Slot Conflict Race, Idempotency Deduplication, Home Cost Toggle, AES-256-GCM Encryption at Rest, Audit Log Secret Masking & 426 Version Gate', async () => {
  const owner = await loginTestUser('owner-sec');
  const staff = await loginTestUser('staff-sec');
  const viewer = await loginTestUser('viewer-sec');

  // Idempotent Room Creation (sending twice with same X-Idempotency-Key creates ONLY 1 room)
  const roomKey = `idem-room-${crypto.randomUUID()}`;
  const [rA, rB] = await Promise.all([
    api('POST', '/api/rooms', {
      cookie: owner.cookie,
      csrf: owner.csrf,
      headers: { 'X-Idempotency-Key': roomKey },
      body: { name: 'Idempotent Hall', address: 'Chattogram', phone: '01955666622' },
    }),
    api('POST', '/api/rooms', {
      cookie: owner.cookie,
      csrf: owner.csrf,
      headers: { 'X-Idempotency-Key': roomKey },
      body: { name: 'Idempotent Hall', address: 'Chattogram', phone: '01955666622' },
    }),
  ]);
  // Whether serialized or replayed, owner has only 1 room!
  const ownerRooms = await api('GET', '/api/rooms', { cookie: owner.cookie });
  assert.equal(ownerRooms.data.rooms.length, 1);
  const roomId = ownerRooms.data.rooms[0].id;
  const joinCode = ownerRooms.data.rooms[0].join_code;
  assert.ok([200, 201].includes(rA.status) && [200, 201].includes(rB.status));

  // Join & approve Staff + Viewer
  await api('POST', '/api/rooms/join', {
    cookie: staff.cookie,
    csrf: staff.csrf,
    headers: { 'x-forwarded-for': '10.88.1.1' },
    body: { joinCode },
  });
  await api('POST', '/api/rooms/join', {
    cookie: viewer.cookie,
    csrf: viewer.csrf,
    headers: { 'x-forwarded-for': '10.88.1.2' },
    body: { joinCode },
  });
  await api('POST', `/api/rooms/${roomId}/requests/${staff.user.id}/approve`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { role: 'STAFF' },
  });
  await api('POST', `/api/rooms/${roomId}/requests/${viewer.user.id}/approve`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { role: 'VIEWER' },
  });

  // Create Hall
  const hallRes = await api('POST', `/api/rooms/${roomId}/halls`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      name: 'Shapla Ballroom',
      capacity: 500,
      day_price: 40000,
      night_price: 50000,
      full_price: 80000,
      is_active: true,
    },
  });
  assert.equal(hallRes.status, 201);
  const hallId = hallRes.data.hall.id;

  // Idempotent Customer Creation + AES-256-GCM Field Encryption Verification on Disk
  const custKey = `idem-cust-${crypto.randomUUID()}`;
  const cRes1 = await api('POST', `/api/rooms/${roomId}/customers`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    headers: { 'X-Idempotency-Key': custKey },
    body: {
      name: 'Encrypted Bridegroom',
      phone: '01819-554433',
      alt_phone: '01711-998877',
      address: 'House 12, Road 4, Halishahar',
    },
  });
  const cRes2 = await api('POST', `/api/rooms/${roomId}/customers`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    headers: { 'X-Idempotency-Key': custKey },
    body: {
      name: 'Encrypted Bridegroom',
      phone: '01819-554433',
      alt_phone: '01711-998877',
      address: 'House 12, Road 4, Halishahar',
    },
  });
  assert.equal(cRes1.status, 201);
  assert.equal(cRes2.status, 201);
  assert.equal(cRes1.data.customer.id, cRes2.data.customer.id);
  const customerId = cRes1.data.customer.id;

  // Inspect raw SQLite row directly to prove phone, alt_phone & address are encrypted with AES-256-GCM!
  const rawCust = getDb()
    .prepare('SELECT phone, alt_phone, address, phone_hash FROM customers WHERE id = ?')
    .get(customerId) as any;
  assert.ok(rawCust.phone.startsWith('enc:v1:'), 'Customer phone must be encrypted at rest');
  assert.ok(!rawCust.phone.includes('554433'), 'Plaintext phone must never appear in DB row');
  assert.ok(rawCust.alt_phone.startsWith('enc:v1:'), 'Alt phone must be encrypted at rest');
  assert.ok(rawCust.address.startsWith('enc:v1:'), 'Customer address must be encrypted at rest');
  assert.ok(!rawCust.address.includes('Halishahar'), 'Plaintext address must never appear in DB row');
  assert.equal(rawCust.phone_hash.length, 64, 'Blind index HMAC-SHA256 hash stored for phone lookup');

  // Authorized API read returns decrypted fields seamlessly
  assert.equal(cRes1.data.customer.phone, '01819-554433');
  assert.equal(cRes1.data.customer.address, 'House 12, Road 4, Halishahar');

  // Simultaneous / Concurrent Booking Conflict Test (two requests for same Hall + Date + DAY slot)
  const raceDate = getTodayDhakaYMD();
  const [race1, race2] = await Promise.all([
    api('POST', `/api/rooms/${roomId}/bookings`, {
      cookie: owner.cookie,
      csrf: owner.csrf,
      body: {
        customer_id: customerId,
        hall_id: hallId,
        event_type: 'WEDDING',
        event_date: raceDate,
        slot: 'DAY',
        start_time: '08:00',
        end_time: '16:00',
        guest_count: 300,
        hall_rent: 40000,
        advance_amount: 10000,
        status: 'CONFIRMED',
      },
    }),
    api('POST', `/api/rooms/${roomId}/bookings`, {
      cookie: staff.cookie,
      csrf: staff.csrf,
      body: {
        customer_id: customerId,
        hall_id: hallId,
        event_type: 'HOLUD',
        event_date: raceDate,
        slot: 'DAY',
        start_time: '08:00',
        end_time: '16:00',
        guest_count: 250,
        hall_rent: 40000,
        advance_amount: 0,
        status: 'CONFIRMED',
      },
    }),
  ]);
  const statuses = [race1.status, race2.status].sort();
  assert.deepEqual(statuses, [201, 409], 'Exactly one concurrent booking succeeds and the other gets 409 conflict');

  // NIGHT slot on same Hall + Date remains independently bookable!
  const nightBooking = await api('POST', `/api/rooms/${roomId}/bookings`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: {
      customer_id: customerId,
      hall_id: hallId,
      event_type: 'RECEPTION',
      event_date: raceDate,
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '00:00',
      guest_count: 350,
      hall_rent: 50000,
      advance_amount: 0,
      status: 'CONFIRMED',
    },
  });
  assert.equal(nightBooking.status, 201);
  const bookingId = nightBooking.data.booking.id;

  // Idempotent Payment Creation + Reference Number Encryption at Rest
  const payKey = `idem-pay-${crypto.randomUUID()}`;
  const pay1 = await api('POST', `/api/rooms/${roomId}/bookings/${bookingId}/payments`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    headers: { 'X-Idempotency-Key': payKey },
    body: {
      payment_type: 'PARTIAL',
      amount: 15000,
      payment_date: raceDate,
      method: 'BKASH',
      reference_number: 'BKASH-TRX-998877',
      idempotency_key: payKey,
    },
  });
  const pay2 = await api('POST', `/api/rooms/${roomId}/bookings/${bookingId}/payments`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    headers: { 'X-Idempotency-Key': payKey },
    body: {
      payment_type: 'PARTIAL',
      amount: 15000,
      payment_date: raceDate,
      method: 'BKASH',
      reference_number: 'BKASH-TRX-998877',
      idempotency_key: payKey,
    },
  });
  assert.equal(pay1.status, 201);
  assert.ok([200, 201].includes(pay2.status));
  assert.equal(pay1.data.payment.id, pay2.data.payment.id);
  assert.equal(pay1.data.payment.receipt_number, pay2.data.payment.receipt_number);

  const rawPay = getDb()
    .prepare('SELECT reference_number FROM payments WHERE id = ?')
    .get(pay1.data.payment.id) as any;
  assert.ok(rawPay.reference_number.startsWith('enc:v1:'), 'Payment reference_number encrypted at rest');
  assert.ok(!rawPay.reference_number.includes('998877'));

  // Home Cost Button RBAC: Staff blocked by default -> Owner enables allow_staff_costs -> Staff succeeds (idempotent) -> Viewer blocked
  const staffCostBlocked = await api('POST', `/api/rooms/${roomId}/expenses`, {
    cookie: staff.cookie,
    csrf: staff.csrf,
    body: {
      category: 'CLEANING',
      amount: 1500,
      expense_date: raceDate,
      note: 'Detergent',
    },
  });
  assert.equal(staffCostBlocked.status, 403);
  assert.equal(staffCostBlocked.data.error, 'STAFF_COSTS_DISABLED');

  const enableStaffCosts = await api('PATCH', `/api/rooms/${roomId}/settings`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { allow_staff_costs: true },
  });
  assert.equal(enableStaffCosts.status, 200);

  const expKey = `idem-exp-${crypto.randomUUID()}`;
  const staffCostOk1 = await api('POST', `/api/rooms/${roomId}/expenses`, {
    cookie: staff.cookie,
    csrf: staff.csrf,
    headers: { 'X-Idempotency-Key': expKey },
    body: {
      category: 'CLEANING',
      amount: 1500,
      expense_date: raceDate,
      note: 'Detergent',
      idempotency_key: expKey,
    },
  });
  const staffCostOk2 = await api('POST', `/api/rooms/${roomId}/expenses`, {
    cookie: staff.cookie,
    csrf: staff.csrf,
    headers: { 'X-Idempotency-Key': expKey },
    body: {
      category: 'CLEANING',
      amount: 1500,
      expense_date: raceDate,
      note: 'Detergent',
      idempotency_key: expKey,
    },
  });
  assert.equal(staffCostOk1.status, 201);
  assert.ok([200, 201].includes(staffCostOk2.status));
  assert.equal(staffCostOk1.data.expense.id, staffCostOk2.data.expense.id);
  assert.equal(staffCostOk1.data.expense.expense_number, staffCostOk2.data.expense.expense_number);

  const viewerCostBlocked = await api('POST', `/api/rooms/${roomId}/expenses`, {
    cookie: viewer.cookie,
    csrf: viewer.csrf,
    body: {
      category: 'OTHER',
      amount: 500,
      expense_date: raceDate,
    },
  });
  assert.equal(viewerCostBlocked.status, 403);

  // Verify joinCode NEVER appears in plaintext in audit_logs
  const auditLogs = getDb()
    .prepare('SELECT details FROM audit_logs WHERE room_id = ?')
    .all(roomId) as Array<{ details: string }>;
  for (const row of auditLogs) {
    assert.ok(!row.details.includes(joinCode), 'Room join_code must never be stored in audit_logs');
  }

  // Server-side 426 Upgrade Required enforcement for outdated client versions
  const appVer = await api('GET', '/api/app-version', {
    headers: { 'X-Client-Version': '0.8.0' },
  });
  assert.equal(appVer.status, 200);
  assert.equal(appVer.data.minSupportedVersion, '1.0.0');

  const outdatedBlocked = await api('GET', '/api/rooms', {
    cookie: owner.cookie,
    headers: { 'X-Client-Version': '0.8.0' },
  });
  assert.equal(outdatedBlocked.status, 426);
  assert.equal(outdatedBlocked.data.error, 'UPDATE_REQUIRED');
});

test('Teardown Phase C Comprehensive Verification Server', async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
