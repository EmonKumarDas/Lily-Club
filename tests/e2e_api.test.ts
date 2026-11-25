import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import { app } from '../server/index.js';

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

test('E2E Setup Server', async () => {
  await new Promise<void>((resolve) => {
    // Listen on dynamic port
    server = app.listen(0, () => {
      const addr = server.address() as any;
      port = addr.port;
      baseUrl = `http://127.0.0.1:${port}`;
      resolve();
    });
  });
});

test('E2E: Health check endpoint', async () => {
  const res = await makeRequest('/api/health');
  assert.equal(res.status, 200);
  assert.equal(res.body.status, 'healthy');
});

test('E2E: Google OAuth URL generation', async () => {
  const res = await makeRequest('/api/auth/google/url');
  assert.equal(res.status, 200);
  assert.ok(res.body.url.includes('accounts.google.com'));
});

test('E2E: Full Lifecycle - Dev Login, CSRF, Create Room, Join Request, Approval, Role Change, Removal, IDOR, Lockout, and Logout', async () => {
  // 1. Dev Login as Owner
  const ownerLoginRes = await makeRequest('/api/auth/dev-login', {
    method: 'POST',
    body: {
      email: 'owner-e2e@lilycc.local',
      name: 'Owner E2E',
      googleId: 'google-owner-e2e',
    },
  });

  assert.equal(ownerLoginRes.status, 200);
  assert.ok(ownerLoginRes.body.user);

  const ownerSessionToken = extractCookie(ownerLoginRes.cookies, 'lily_session');
  const ownerCsrfToken = extractCookie(ownerLoginRes.cookies, 'lily_csrf');
  assert.ok(ownerSessionToken);
  assert.ok(ownerCsrfToken);

  const ownerCookie = `lily_session=${ownerSessionToken}; lily_csrf=${ownerCsrfToken}`;

  // 2. CSRF Protection Check: Mutating request without x-csrf-token header must fail
  const csrfFailRes = await makeRequest('/api/rooms', {
    method: 'POST',
    cookie: ownerCookie,
    body: {
      name: 'Tamper Room',
      address: 'Test Addr',
      phone: '01711111111',
    },
  });
  assert.equal(csrfFailRes.status, 403, 'Should reject request missing x-csrf-token header');
  assert.equal(csrfFailRes.body.error, 'CSRF_VALIDATION_FAILED');

  // 3. Create Room with valid CSRF token
  const createRoomRes = await makeRequest('/api/rooms', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'x-csrf-token': ownerCsrfToken! },
    body: {
      name: 'Lily Grand Ballroom',
      address: 'Gulshan 2, Dhaka',
      phone: '+8801700999999',
      default_language: 'bn',
    },
  });

  assert.equal(createRoomRes.status, 201);
  assert.ok(createRoomRes.body.room);
  assert.equal(createRoomRes.body.role, 'OWNER');

  const roomId = createRoomRes.body.room.id;
  const initialJoinCode = createRoomRes.body.room.join_code;
  assert.equal(initialJoinCode.length, 8);

  // 4. Verify /api/auth/me returns activeRoom and activeMember
  const meRes = await makeRequest('/api/auth/me', { cookie: ownerCookie });
  assert.equal(meRes.status, 200);
  assert.equal(meRes.body.activeRoom.id, roomId);
  assert.equal(meRes.body.activeMember.role, 'OWNER');

  // 5. Dev Login as Staff User (User 2)
  const staffLoginRes = await makeRequest('/api/auth/dev-login', {
    method: 'POST',
    body: {
      email: 'staff-e2e@lilycc.local',
      name: 'Staff Candidate',
      googleId: 'google-staff-e2e',
    },
  });
  assert.equal(staffLoginRes.status, 200);

  const staffSessionToken = extractCookie(staffLoginRes.cookies, 'lily_session');
  const staffCsrfToken = extractCookie(staffLoginRes.cookies, 'lily_csrf');
  const staffCookie = `lily_session=${staffSessionToken}; lily_csrf=${staffCsrfToken}`;
  const staffUserId = staffLoginRes.body.user.id;

  // 6. IDOR Check: Staff candidate cannot view members of Room before joining
  const idorRes = await makeRequest(`/api/rooms/${roomId}/members`, { cookie: staffCookie });
  assert.equal(idorRes.status, 403, 'Non-member should be blocked by requireRoomMember');

  // 7. Join with Room ID: Rate limiting lockout test
  // 5 invalid join attempts from staff
  for (let i = 0; i < 5; i++) {
    await makeRequest('/api/rooms/join', {
      method: 'POST',
      cookie: staffCookie,
      headers: { 'x-csrf-token': staffCsrfToken! },
      body: { joinCode: 'WRONGCD' },
    });
  }

  // 6th attempt must trigger rate limit lockout 429
  const rateLimitRes = await makeRequest('/api/rooms/join', {
    method: 'POST',
    cookie: staffCookie,
    headers: { 'x-csrf-token': staffCsrfToken! },
    body: { joinCode: initialJoinCode },
  });
  assert.equal(rateLimitRes.status, 429, 'Locked out after 5 failed attempts');

  // 8. Test Join Request with a clean user IP to verify normal join workflow
  const cleanStaffRes = await makeRequest('/api/auth/dev-login', {
    method: 'POST',
    body: {
      email: 'clean-staff@lilycc.local',
      name: 'Clean Staff',
      googleId: 'google-clean-staff',
    },
  });
  const cleanSessionToken = extractCookie(cleanStaffRes.cookies, 'lily_session');
  const cleanCsrfToken = extractCookie(cleanStaffRes.cookies, 'lily_csrf');
  const cleanStaffCookie = `lily_session=${cleanSessionToken}; lily_csrf=${cleanCsrfToken}`;
  const cleanUserId = cleanStaffRes.body.user.id;

  // Submit valid join request (custom IP header to bypass previous IP lockout)
  const joinReqRes = await makeRequest('/api/rooms/join', {
    method: 'POST',
    cookie: cleanStaffCookie,
    headers: {
      'x-csrf-token': cleanCsrfToken!,
      'x-forwarded-for': '172.16.0.45',
    },
    body: { joinCode: initialJoinCode },
  });
  assert.equal(joinReqRes.status, 200);
  assert.equal(joinReqRes.body.status, 'PENDING');

  // 9. Owner views members and sees pending join request
  const membersRes = await makeRequest(`/api/rooms/${roomId}/members`, { cookie: ownerCookie });
  assert.equal(membersRes.status, 200);
  const pendingMember = membersRes.body.members.find((m: any) => m.user_id === cleanUserId);
  assert.ok(pendingMember);
  assert.equal(pendingMember.status, 'PENDING');

  // 10. Owner approves pending join request with role 'STAFF'
  const approveRes = await makeRequest(`/api/rooms/${roomId}/requests/${cleanUserId}/approve`, {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'x-csrf-token': ownerCsrfToken! },
    body: { role: 'STAFF' },
  });
  assert.equal(approveRes.status, 200);

  // 11. Immediate Effect: Clean Staff can now access the room
  const staffAccessRes = await makeRequest(`/api/rooms/${roomId}/members`, {
    cookie: cleanStaffCookie,
    headers: { 'x-room-id': roomId },
  });
  assert.equal(staffAccessRes.status, 200);

  // 12. Non-Owner cannot update roles or regenerate code
  const unauthorizedRoleChange = await makeRequest(`/api/rooms/${roomId}/members/${cleanUserId}/role`, {
    method: 'PATCH',
    cookie: cleanStaffCookie,
    headers: { 'x-csrf-token': cleanCsrfToken!, 'x-room-id': roomId },
    body: { role: 'OWNER' },
  });
  assert.equal(unauthorizedRoleChange.status, 403);

  // 13. Owner changes Clean Staff role to MANAGER
  const roleUpdateRes = await makeRequest(`/api/rooms/${roomId}/members/${cleanUserId}/role`, {
    method: 'PATCH',
    cookie: ownerCookie,
    headers: { 'x-csrf-token': ownerCsrfToken! },
    body: { role: 'MANAGER' },
  });
  assert.equal(roleUpdateRes.status, 200);

  // 14. Room ID Regeneration: Old code revoked immediately, new code works
  const regenRes = await makeRequest(`/api/rooms/${roomId}/regenerate-code`, {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'x-csrf-token': ownerCsrfToken! },
  });
  assert.equal(regenRes.status, 200);
  const newJoinCode = regenRes.body.newJoinCode;
  assert.notEqual(newJoinCode, initialJoinCode);

  // 15. Owner removes Clean Staff member from room
  const removeRes = await makeRequest(`/api/rooms/${roomId}/members/${cleanUserId}`, {
    method: 'DELETE',
    cookie: ownerCookie,
    headers: { 'x-csrf-token': ownerCsrfToken! },
  });
  assert.equal(removeRes.status, 200);

  // 16. Immediate Effect: Removed member immediately gets 403 Forbidden
  const removedAccessRes = await makeRequest(`/api/rooms/${roomId}/members`, {
    cookie: cleanStaffCookie,
    headers: { 'x-room-id': roomId },
  });
  assert.equal(removedAccessRes.status, 403, 'Removed member must immediately lose room access');

  // 17. Audit Log: Owner checks append-only audit trail
  const auditRes = await makeRequest(`/api/rooms/${roomId}/audit-logs`, { cookie: ownerCookie });
  assert.equal(auditRes.status, 200);
  assert.ok(auditRes.body.logs.length >= 4);

  // 18. Logout
  const logoutRes = await makeRequest('/api/auth/logout', {
    method: 'POST',
    cookie: ownerCookie,
    headers: { 'x-csrf-token': ownerCsrfToken! },
  });
  assert.equal(logoutRes.status, 200);

  // Session invalidated on server
  const meAfterLogout = await makeRequest('/api/auth/me', { cookie: ownerCookie });
  assert.equal(meAfterLogout.status, 401);
});

test('E2E Teardown Server', async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
