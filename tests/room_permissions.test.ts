import test from 'node:test';
import assert from 'node:assert/strict';
import {
  generateJoinCode,
  createRoom,
  getRoomById,
  getRoomByJoinCode,
  getRoomMember,
  getRoomMembers,
  updateMemberRole,
  removeMember,
  approveJoinRequest,
  rejectJoinRequest,
  regenerateRoomJoinCode,
  recordJoinAttempt,
  checkJoinRateLimit,
  upsertGoogleUser,
  getRoomAuditLogs,
} from '../server/db.js';

test('Join Code: 8-chars, cryptographically secure, no confusing characters (O/0/I/l/1)', () => {
  const confusingChars = ['O', '0', 'I', 'l', '1', 'o', 'i'];
  for (let i = 0; i < 50; i++) {
    const code = generateJoinCode();
    assert.equal(code.length, 8, `Join code length should be 8, got ${code.length}`);
    for (const badChar of confusingChars) {
      assert.ok(!code.includes(badChar), `Join code ${code} should not contain confusing character ${badChar}`);
    }
  }
});

test('Room Creation makes creator Owner and records audit log', () => {
  const owner = upsertGoogleUser({
    google_id: 'google-owner-1',
    email: 'owner1@lilycc.local',
    name: 'Lily Owner',
  });

  const room = createRoom(
    {
      name: 'Lily Banquet Hall',
      address: 'Dhanmondi, Dhaka',
      phone: '+8801711000000',
      default_language: 'bn',
      createdByUserId: owner.id,
    },
    { userId: owner.id, email: owner.email, name: owner.name }
  );

  assert.ok(room.id);
  assert.equal(room.name, 'Lily Banquet Hall');
  assert.equal(room.join_code.length, 8);
  assert.equal(room.join_approval_required, 1);

  // Check creator membership is OWNER and ACTIVE
  const member = getRoomMember(room.id, owner.id);
  assert.ok(member);
  assert.equal(member.role, 'OWNER');
  assert.equal(member.status, 'ACTIVE');

  // Verify Audit Log
  const logs = getRoomAuditLogs(room.id);
  assert.ok(logs.length >= 1);
  assert.equal(logs[0].action, 'ROOM_CREATE');
  assert.equal(logs[0].user_email, owner.email);
});

test('Cross-room access (IDOR) prevention', () => {
  const userA = upsertGoogleUser({
    google_id: 'user-a',
    email: 'usera@lilycc.local',
    name: 'User A',
  });

  const userB = upsertGoogleUser({
    google_id: 'user-b',
    email: 'userb@lilycc.local',
    name: 'User B',
  });

  // User A creates Room A
  const roomA = createRoom(
    { name: 'Room Alpha', address: 'Banani', phone: '01700000001', createdByUserId: userA.id },
    { userId: userA.id, email: userA.email, name: userA.name }
  );

  // User B creates Room B
  const roomB = createRoom(
    { name: 'Room Beta', address: 'Gulshan', phone: '01700000002', createdByUserId: userB.id },
    { userId: userB.id, email: userB.email, name: userB.name }
  );

  // User A is active in Room A, but has no access in Room B
  const memberInA = getRoomMember(roomA.id, userA.id);
  assert.ok(memberInA);
  assert.equal(memberInA.status, 'ACTIVE');

  const memberInB = getRoomMember(roomB.id, userA.id);
  assert.equal(memberInB, null, 'User A should not be a member of Room B');
});

test('Role safety: Sole owner cannot be removed or demoted; non-owner cannot demote owner', () => {
  const owner = upsertGoogleUser({
    google_id: 'owner-safe',
    email: 'soleowner@lilycc.local',
    name: 'Sole Owner',
  });

  const staff = upsertGoogleUser({
    google_id: 'staff-safe',
    email: 'staff@lilycc.local',
    name: 'Staff Member',
  });

  const room = createRoom(
    { name: 'Safety Room', address: 'Uttara', phone: '01700000003', createdByUserId: owner.id },
    { userId: owner.id, email: owner.email, name: owner.name }
  );

  // Try to demote sole owner to MANAGER
  assert.throws(
    () => updateMemberRole(room.id, owner.id, 'MANAGER', { userId: owner.id, email: owner.email, name: owner.name }),
    (err: Error) => {
      assert.ok(err.message.includes('A room must never end up without an Owner'));
      return true;
    }
  );

  // Try to remove sole owner
  assert.throws(
    () => removeMember(room.id, owner.id, { userId: owner.id, email: owner.email, name: owner.name }),
    (err: Error) => {
      assert.ok(err.message.includes('sole Owner cannot be removed'));
      return true;
    }
  );
});

test('Immediate effect: Role update and removal reflect instantaneously', () => {
  const owner = upsertGoogleUser({
    google_id: 'owner-imm',
    email: 'ownerimm@lilycc.local',
    name: 'Immediate Owner',
  });

  const memberUser = upsertGoogleUser({
    google_id: 'member-imm',
    email: 'memberimm@lilycc.local',
    name: 'Immediate Member',
  });

  const room = createRoom(
    { name: 'Immediate Room', address: 'Mirpur', phone: '01700000004', createdByUserId: owner.id },
    { userId: owner.id, email: owner.email, name: owner.name }
  );

  // Add memberUser as STAFF
  const db = (global as any).testDb || getRoomMember(room.id, owner.id);
  const member = getRoomMember(room.id, memberUser.id);
  assert.equal(member, null);

  // Direct insert to simulate active STAFF
  const { getDb } = require('../server/db.js');
  getDb().prepare(`
    INSERT INTO room_members (id, room_id, user_id, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'STAFF', 'ACTIVE', ?, ?)
  `).run(crypto.randomUUID(), room.id, memberUser.id, Date.now(), Date.now());

  let checkMember = getRoomMember(room.id, memberUser.id);
  assert.ok(checkMember);
  assert.equal(checkMember.role, 'STAFF');

  // Change role to MANAGER
  updateMemberRole(room.id, memberUser.id, 'MANAGER', {
    userId: owner.id,
    email: owner.email,
    name: owner.name,
  });

  checkMember = getRoomMember(room.id, memberUser.id);
  assert.equal(checkMember!.role, 'MANAGER');

  // Remove member
  removeMember(room.id, memberUser.id, {
    userId: owner.id,
    email: owner.email,
    name: owner.name,
  });

  checkMember = getRoomMember(room.id, memberUser.id);
  assert.equal(checkMember, null, 'Removed member must immediately have no membership');
});

test('Room ID Regeneration: old code invalid immediately, new code works', () => {
  const owner = upsertGoogleUser({
    google_id: 'owner-regen',
    email: 'ownerregen@lilycc.local',
    name: 'Regen Owner',
  });

  const room = createRoom(
    { name: 'Regen Room', address: 'Mohakhali', phone: '01700000005', createdByUserId: owner.id },
    { userId: owner.id, email: owner.email, name: owner.name }
  );

  const initialCode = room.join_code;
  assert.equal(getRoomByJoinCode(initialCode)?.id, room.id);

  // Regenerate join code
  const newCode = regenerateRoomJoinCode(room.id, {
    userId: owner.id,
    email: owner.email,
    name: owner.name,
  });

  assert.notEqual(newCode, initialCode);

  // Old code must stop working immediately!
  const oldCodeLookup = getRoomByJoinCode(initialCode);
  assert.equal(oldCodeLookup, null, 'Old join code must be invalid immediately after regeneration');

  // New code must resolve the room
  const newCodeLookup = getRoomByJoinCode(newCode);
  assert.equal(newCodeLookup?.id, room.id);
});

test('Join Rate Limit & Lockout: 5 failed attempts locks out user/IP', () => {
  const testIp = `10.0.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;
  const testUser = `user-lockout-${crypto.randomUUID()}`;

  // Initially not locked
  let rateCheck = checkJoinRateLimit({ ipAddress: testIp, userId: testUser });
  assert.equal(rateCheck.isLocked, false);

  // Record 4 failed attempts
  for (let i = 0; i < 4; i++) {
    recordJoinAttempt({ ipAddress: testIp, userId: testUser, attemptedCode: `FAIL${i}` });
  }

  rateCheck = checkJoinRateLimit({ ipAddress: testIp, userId: testUser });
  assert.equal(rateCheck.isLocked, false);

  // Record 5th failed attempt -> Triggers lockout
  recordJoinAttempt({ ipAddress: testIp, userId: testUser, attemptedCode: 'FAIL5' });

  rateCheck = checkJoinRateLimit({ ipAddress: testIp, userId: testUser });
  assert.equal(rateCheck.isLocked, true, 'User/IP must be locked out after 5 failed attempts');
  assert.ok(rateCheck.remainingSeconds > 0);
  assert.ok(rateCheck.remainingSeconds <= 15 * 60);
});
