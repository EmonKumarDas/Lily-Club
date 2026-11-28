import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../server/index.js';

let server: http.Server;
let baseUrl = '';

async function req(
  method: string,
  path: string,
  opts: { cookie?: string; csrf?: string; body?: any } = {}
) {
  const headers: Record<string, string> = { Accept: 'application/json' };
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

test('Part 5 Setup Security Hardening Server', async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, '127.0.0.1', () => {
      const addr = server.address() as any;
      baseUrl = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });
});

test('Part 5: Security Headers, Signed-Out Block, and Strict Owner-Only join_code Redaction', async () => {
  // 1. Security headers check
  const health = await req('GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(health.headers.get('x-frame-options'), 'DENY');
  assert.equal(health.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.ok(health.headers.get('permissions-policy')?.includes('camera=()'));

  // 2. Signed-out user must get 401 on protected routes
  const unauthRooms = await req('GET', '/api/rooms');
  assert.equal(unauthRooms.status, 401);

  // 3. Owner creates room -> Owner sees join_code
  const owner = await req('POST', '/api/auth/dev-login', {
    body: { email: `p5-owner-${Date.now()}@lily.test`, name: 'P5 Owner' },
  });
  assert.equal(owner.status, 200);

  const created = await req('POST', '/api/rooms', {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { name: 'P5 Security Hall', address: 'Dhaka', phone: '01711000001' },
  });
  assert.equal(created.status, 201);
  const roomId = created.data.room.id;
  const joinCode = created.data.room.join_code;
  assert.ok(joinCode && joinCode.length >= 8, 'Owner must receive join_code on creation');

  const ownerMe = await req('GET', '/api/auth/me', { cookie: owner.cookie });
  assert.equal(ownerMe.data.activeRoom.join_code, joinCode, 'Owner must see join_code in /api/auth/me');

  // 4. Staff joins and is approved -> Staff MUST NOT see join_code anywhere
  const staff = await req('POST', '/api/auth/dev-login', {
    body: { email: `p5-staff-${Date.now()}@lily.test`, name: 'P5 Staff' },
  });
  const joinRes = await req('POST', '/api/rooms/join', {
    cookie: staff.cookie,
    csrf: staff.csrf,
    body: { joinCode },
  });
  assert.equal(joinRes.status, 200);

  const pending = await req('GET', `/api/rooms/${roomId}/members`, { cookie: owner.cookie });
  const staffMember = pending.data.members.find((m: any) => m.status === 'PENDING');
  assert.ok(staffMember);

  const approve = await req('POST', `/api/rooms/${roomId}/requests/${staffMember.user_id}/approve`, {
    cookie: owner.cookie,
    csrf: owner.csrf,
    body: { role: 'STAFF' },
  });
  assert.equal(approve.status, 200);

  const staffRooms = await req('GET', '/api/rooms', { cookie: staff.cookie });
  assert.equal(staffRooms.status, 200);
  const staffRoomItem = staffRooms.data.rooms.find((r: any) => r.id === roomId);
  assert.ok(staffRoomItem);
  assert.equal(staffRoomItem.join_code, undefined, 'Non-owner MUST NOT receive join_code in GET /api/rooms');

  const staffSwitch = await req('POST', '/api/rooms/switch', {
    cookie: staff.cookie,
    csrf: staff.csrf,
    body: { roomId },
  });
  assert.equal(staffSwitch.status, 200);
  assert.equal(staffSwitch.data.activeRoom.join_code, undefined, 'Non-owner MUST NOT receive join_code in POST /api/rooms/switch');

  const staffMe = await req('GET', '/api/auth/me', { cookie: staff.cookie });
  assert.equal(staffMe.data.activeRoom.join_code, undefined, 'Non-owner MUST NOT receive join_code in GET /api/auth/me');
  assert.equal(
    staffMe.data.userRooms.find((r: any) => r.id === roomId)?.join_code,
    undefined,
    'Non-owner MUST NOT receive join_code in userRooms'
  );
});

test('Part 5 Teardown Security Hardening Server', async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
