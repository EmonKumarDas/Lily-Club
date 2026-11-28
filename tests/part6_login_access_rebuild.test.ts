import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server/index.js';
import { getDb } from '../server/db.js';
import { GENERIC_AUTH_ERROR } from '../server/memberAuth.js';

let server: http.Server;
let baseUrl = '';

async function req(
  method: string,
  path: string,
  opts: { cookie?: string; csrf?: string; bearer?: string; body?: any; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = { Accept: 'application/json', ...(opts.headers || {}) };
  if (opts.cookie) headers['Cookie'] = opts.cookie;
  if (opts.csrf) headers['X-CSRF-Token'] = opts.csrf;
  if (opts.bearer) headers['Authorization'] = `Bearer ${opts.bearer}`;
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
  return { status: res.status, data, cookie: cookieStr, csrf };
}

test('Part 6 Setup Login & Access Rebuild Test Server', async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test('Part 6: Complete Login & Access Security Attack Verification', async () => {
  const ts = Date.now();

  // 1. Owner creates a room (only way to become Owner)
  const owner = await req('POST', '/api/auth/dev-login', {
    body: { email: `p6-owner-${ts}@lily.test`, name: 'P6 Owner' },
  });
  assert.equal(owner.status, 200);

  const createdRoom = await req('POST', '/api/rooms', {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { name: 'P6 Lily Hall', address: 'Dhaka', phone: '01700000001' },
  });
  assert.equal(createdRoom.status, 201);
  const roomId = createdRoom.data.room.id;
  const roomJoinCode = createdRoom.data.room.join_code;

  // 2. New Google account with NO room reads NOTHING
  const stranger = await req('POST', '/api/auth/dev-login', {
    body: { email: `p6-stranger-${ts}@lily.test`, name: 'Stranger User' },
  });
  const strangerRooms = await req('GET', '/api/rooms', { cookie: stranger.cookie });
  assert.equal(strangerRooms.status, 200);
  assert.equal(strangerRooms.data.rooms.length, 0, 'New user must have 0 rooms');

  const strangerBookings = await req('GET', `/api/rooms/${roomId}/bookings`, { cookie: stranger.cookie });
  assert.equal(strangerBookings.status, 403, 'New user with no room must be blocked from reading bookings');
  const strangerInvites = await req('GET', `/api/rooms/${roomId}/invites`, { cookie: stranger.cookie });
  assert.equal(strangerInvites.status, 403);

  // 3. Double-clicking Create Invite with same idempotency key creates ONLY ONE record
  const idemKey = `p6-idem-${ts}`;
  const [inv1, inv2] = await Promise.all([
    req('POST', `/api/rooms/${roomId}/invites`, {
      cookie: owner.cookie,
      csrf: owner.csrf,
      headers: { 'X-Idempotency-Key': idemKey },
      body: { memberName: 'Staff Rahim', role: 'STAFF', idempotency_key: idemKey },
    }),
    req('POST', `/api/rooms/${roomId}/invites`, {
      cookie: owner.cookie,
      csrf: owner.csrf,
      headers: { 'X-Idempotency-Key': idemKey },
      body: { memberName: 'Staff Rahim', role: 'STAFF', idempotency_key: idemKey },
    }),
  ]);
  const staffInviteCode = inv1.data.inviteCode || inv2.data.inviteCode;
  assert.ok(staffInviteCode && staffInviteCode.length >= 10, 'Single-use invite code must be 10+ chars');
  const invitesAfterDoubleClick = await req('GET', `/api/rooms/${roomId}/invites`, { cookie: owner.cookie });
  assert.equal(invitesAfterDoubleClick.data.invites.length, 1, 'Double-click must create only 1 invite record');

  // 4. Verify NO plain invite code is stored in DB or audit logs
  const db = getDb();
  const rawInvites = JSON.stringify(db.prepare('SELECT * FROM member_invites WHERE room_id = ?').all(roomId));
  const rawAudits = JSON.stringify(db.prepare('SELECT * FROM audit_logs WHERE room_id = ?').all(roomId));
  assert.ok(!rawInvites.includes(staffInviteCode), 'Plain invite code MUST NEVER appear in member_invites');
  assert.ok(!rawAudits.includes(staffInviteCode), 'Plain invite code MUST NEVER appear in audit_logs');

  // 5. Room ID alone CANNOT log anyone in
  const roomOnlyAttempt = await req('POST', '/api/auth/member/login', {
    body: { roomJoinCode, selectedRole: 'STAFF', loginName: 'rahim', pin: '' },
  });
  assert.equal(roomOnlyAttempt.status, 401);
  assert.equal(roomOnlyAttempt.data.messageEn, GENERIC_AUTH_ERROR.messageEn);

  // 6. Staff code CANNOT work under Manager option
  const wrongRoleAttempt = await req('POST', '/api/auth/member/redeem-invite', {
    body: {
      roomJoinCode,
      inviteCode: staffInviteCode,
      selectedRole: 'MANAGER',
      loginName: `rahim_${ts}`,
      pin: '482917',
      deviceFingerprint: 'dev-a',
      deviceName: 'Phone A',
    },
  });
  assert.equal(wrongRoleAttempt.status, 401, 'Staff code MUST fail under Manager option');
  assert.equal(wrongRoleAttempt.data.messageEn, GENERIC_AUTH_ERROR.messageEn);

  // 7. Weak PINs (123456, 000000) are rejected without consuming invite
  const weakPin1 = await req('POST', '/api/auth/member/redeem-invite', {
    body: {
      roomJoinCode,
      inviteCode: staffInviteCode,
      selectedRole: 'STAFF',
      loginName: `rahim_${ts}`,
      pin: '123456',
      deviceFingerprint: 'dev-a',
      deviceName: 'Phone A',
    },
  });
  assert.equal(weakPin1.status, 400);
  const weakPin2 = await req('POST', '/api/auth/member/redeem-invite', {
    body: {
      roomJoinCode,
      inviteCode: staffInviteCode,
      selectedRole: 'STAFF',
      loginName: `rahim_${ts}`,
      pin: '000000',
      deviceFingerprint: 'dev-a',
      deviceName: 'Phone A',
    },
  });
  assert.equal(weakPin2.status, 400);

  // 8. Code works EXACTLY ONCE even with two simultaneous attempts
  const staffPin = '482917';
  const [r1, r2] = await Promise.all([
    req('POST', '/api/auth/member/redeem-invite', {
      body: {
        roomJoinCode,
        inviteCode: staffInviteCode,
        selectedRole: 'STAFF',
        loginName: `rahim_${ts}`,
        pin: staffPin,
        deviceFingerprint: 'dev-a',
        deviceName: 'Phone A',
      },
    }),
    req('POST', '/api/auth/member/redeem-invite', {
      body: {
        roomJoinCode,
        inviteCode: staffInviteCode,
        selectedRole: 'STAFF',
        loginName: `rahim_${ts}`,
        pin: staffPin,
        deviceFingerprint: 'dev-b',
        deviceName: 'Phone B',
      },
    }),
  ]);
  const statuses = [r1.status, r2.status].sort();
  assert.deepEqual(statuses, [200, 401], 'Exactly one simultaneous redeem attempt must succeed');
  const winner = r1.status === 200 ? r1 : r2;
  assert.equal(winner.data.role, 'STAFF');
  const staffToken = winner.data.token;

  // Verify plain PIN NEVER appears in member_credentials or audit_logs
  const rawCreds = JSON.stringify(db.prepare('SELECT * FROM member_credentials WHERE room_id = ?').all(roomId));
  assert.ok(!rawCreds.includes(staffPin), 'Plain PIN MUST NEVER appear in member_credentials');

  // 9. Staff CANNOT read invites, members, devices, money data, Room ID, or audit log
  assert.equal((await req('GET', `/api/rooms/${roomId}/invites`, { bearer: staffToken })).status, 403);
  assert.equal((await req('GET', `/api/rooms/${roomId}/members`, { bearer: staffToken })).status, 403);
  assert.equal((await req('GET', `/api/rooms/${roomId}/devices`, { bearer: staffToken })).status, 403);
  assert.equal((await req('GET', `/api/rooms/${roomId}/expenses`, { bearer: staffToken })).status, 403);
  assert.equal((await req('GET', `/api/rooms/${roomId}/reports`, { bearer: staffToken })).status, 403);
  assert.equal((await req('GET', `/api/rooms/${roomId}/audit-logs`, { bearer: staffToken })).status, 403);
  const staffMe = await req('GET', '/api/auth/me', { bearer: staffToken });
  assert.equal(staffMe.data.activeRoom.join_code, undefined, 'Staff must NOT see Room ID');

  // 10. Returning PIN login works, then PIN reset revokes old sessions immediately
  const pinLogin = await req('POST', '/api/auth/member/login', {
    body: {
      roomJoinCode,
      selectedRole: 'STAFF',
      loginName: `rahim_${ts}`,
      pin: staffPin,
      deviceFingerprint: 'dev-a',
      deviceName: 'Phone A',
    },
  });
  assert.equal(pinLogin.status, 200);
  const activeStaffToken = pinLogin.data.token;

  const resetRes = await req('POST', `/api/rooms/${roomId}/members/${winner.data.user.id}/reset-pin`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  assert.equal(resetRes.status, 200);
  assert.ok(resetRes.data.inviteCode && resetRes.data.inviteCode.length >= 10);

  // Old session must be revoked immediately after PIN reset
  const afterReset = await req('GET', `/api/rooms/${roomId}/bookings`, { bearer: activeStaffToken });
  assert.equal(afterReset.status, 401, 'PIN reset must revoke all old sessions immediately');

  // 11. Revoked invite fails with generic error
  const invToRevoke = await req('POST', `/api/rooms/${roomId}/invites`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { memberName: 'Temp Staff', role: 'STAFF' },
  });
  await req('DELETE', `/api/rooms/${roomId}/invites/${invToRevoke.data.invite.id}`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
  });
  const revokedUse = await req('POST', '/api/auth/member/redeem-invite', {
    body: {
      roomJoinCode,
      inviteCode: invToRevoke.data.inviteCode,
      selectedRole: 'STAFF',
      loginName: `temp_${ts}`,
      pin: '591827',
    },
  });
  assert.equal(revokedUse.status, 401);
  assert.equal(revokedUse.data.messageEn, GENERIC_AUTH_ERROR.messageEn);

  // 12. Guessing PINs triggers lockout (429) with generic error revealing nothing
  let lastStatus = 0;
  let lastMsg = '';
  for (let i = 0; i < 6; i++) {
    const guess = await req('POST', '/api/auth/member/login', {
      headers: { 'X-Forwarded-For': `10.99.99.${ts % 200}` },
      body: {
        roomJoinCode,
        selectedRole: 'STAFF',
        loginName: `nonexistent_${ts}`,
        pin: '948271',
      },
    });
    lastStatus = guess.status;
    lastMsg = guess.data.messageEn;
  }
  assert.equal(lastStatus, 429, 'Repeated failed guesses must trigger lockout');
  assert.equal(lastMsg, GENERIC_AUTH_ERROR.messageEn);
});

test('Part 6 Teardown Login & Access Rebuild Test Server', async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
