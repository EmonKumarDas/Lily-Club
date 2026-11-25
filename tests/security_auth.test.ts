import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDb,
  upsertGoogleUser,
  createSession,
  getSessionByToken,
  deleteSession,
  deleteAllUserSessions,
  touchSession,
  hashToken,
} from '../server/db.js';
import { validateSessionRequest, generateSecureToken } from '../server/auth.js';

// Setup fresh memory or test DB
test('Auth & Session: Double login never creates duplicate user', () => {
  const googleId = 'google-unique-12345';
  const email = 'testuser@lilycc.local';

  // First login
  const u1 = upsertGoogleUser({
    google_id: googleId,
    email,
    name: 'Lily Staff',
    picture: 'https://example.com/avatar1.jpg',
  });

  assert.ok(u1.id);
  assert.equal(u1.email, email);
  assert.equal(u1.name, 'Lily Staff');

  // Second login with updated name/picture
  const u2 = upsertGoogleUser({
    google_id: googleId,
    email,
    name: 'Lily Staff Senior',
    picture: 'https://example.com/avatar2.jpg',
  });

  // Must have same user ID!
  assert.equal(u1.id, u2.id);
  assert.equal(u2.name, 'Lily Staff Senior');

  // Verify only 1 record exists in DB
  const db = getDb();
  const count = db.prepare('SELECT COUNT(*) as count FROM users WHERE email = ?').get(email) as { count: number };
  assert.equal(count.count, 1);
});

test('Auth & Session: Idle and Absolute timeout enforcement', () => {
  const u = upsertGoogleUser({
    google_id: 'google-timeout-test',
    email: 'timeout@lilycc.local',
    name: 'Timeout User',
  });

  const token = generateSecureToken();
  const session = createSession({
    userId: u.id,
    token,
  });

  // Valid session retrieval
  const sessionFound = getSessionByToken(token);
  assert.ok(sessionFound);
  assert.equal(sessionFound.user.id, u.id);

  // Simulate Idle Timeout by winding back last_activity_at by 31 minutes (default 30 min)
  const db = getDb();
  const thirtyOneMinAgo = Date.now() - 31 * 60 * 1000;
  db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?').run(thirtyOneMinAgo, session.id);

  const mockReqIdle: any = { cookies: { lily_session: token } };
  const mockResIdle: any = { clearCookie: () => {} };

  const authIdleResult = validateSessionRequest(mockReqIdle, mockResIdle);
  assert.equal(authIdleResult, null, 'Session should be invalidated due to idle timeout');

  // Session must be removed from DB
  const sessionAfterIdle = getSessionByToken(token);
  assert.equal(sessionAfterIdle, null);

  // Test Absolute Timeout: create new session and wind back created_at by 13 hours (default 12 hours)
  const token2 = generateSecureToken();
  const session2 = createSession({
    userId: u.id,
    token: token2,
  });

  const thirteenHoursAgo = Date.now() - 13 * 60 * 60 * 1000;
  db.prepare('UPDATE sessions SET created_at = ?, last_activity_at = ? WHERE id = ?').run(
    thirteenHoursAgo,
    Date.now(), // Active just now, but lifespan exceeded!
    session2.id
  );

  const mockReqAbs: any = { cookies: { lily_session: token2 } };
  const mockResAbs: any = { clearCookie: () => {} };

  const authAbsResult = validateSessionRequest(mockReqAbs, mockResAbs);
  assert.equal(authAbsResult, null, 'Session should be invalidated due to absolute timeout');

  const sessionAfterAbs = getSessionByToken(token2);
  assert.equal(sessionAfterAbs, null);
});

test('Auth & Session: Logout invalidates current session; Logout All invalidates all sessions', () => {
  const u = upsertGoogleUser({
    google_id: 'google-logout-test',
    email: 'logout@lilycc.local',
    name: 'Logout User',
  });

  // Create two devices/sessions for same user
  const tokenDev1 = generateSecureToken();
  const tokenDev2 = generateSecureToken();

  const sess1 = createSession({ userId: u.id, token: tokenDev1, userAgent: 'Mobile Safari' });
  const sess2 = createSession({ userId: u.id, token: tokenDev2, userAgent: 'Desktop Chrome' });

  assert.ok(getSessionByToken(tokenDev1));
  assert.ok(getSessionByToken(tokenDev2));

  // Single logout on Device 1
  deleteSession(sess1.id);
  assert.equal(getSessionByToken(tokenDev1), null);
  assert.ok(getSessionByToken(tokenDev2), 'Device 2 should still be valid after single device logout');

  // Sign out of all devices
  deleteAllUserSessions(u.id);
  assert.equal(getSessionByToken(tokenDev2), null, 'Device 2 should be invalidated after sign out of all devices');
});
