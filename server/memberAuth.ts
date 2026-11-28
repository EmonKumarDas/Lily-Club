import crypto from 'node:crypto';
import { getConfig } from './config.js';
import {
  getDb,
  getRoomByJoinCode,
  getRoomMember,
  addAuditLog,
  deleteAllUserSessions,
  type RoleType,
  type UserRow,
} from './db.js';

const INVITE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O/0/I/l/1
const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

export const GENERIC_AUTH_ERROR = {
  error: 'AUTH_DENIED',
  messageBn: 'ভুল তথ্য অথবা প্রবেশাধিকার অনুমোদিত নয়।',
  messageEn: 'Invalid details or access not allowed.',
};

let tablesInitialized = false;

export function ensureMemberAuthTables(): void {
  const db = getDb();
  if (tablesInitialized) return;

  db.exec(`
    CREATE TABLE IF NOT EXISTS member_invites (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      member_user_id TEXT NOT NULL,
      member_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('MANAGER', 'STAFF')),
      code_hash TEXT NOT NULL,
      idempotency_key TEXT UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      revoked_at INTEGER,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (member_user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_member_invites_room ON member_invites(room_id);
    CREATE INDEX IF NOT EXISTS idx_member_invites_hash ON member_invites(code_hash);

    CREATE TABLE IF NOT EXISTS member_credentials (
      user_id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      login_name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      pin_salt TEXT NOT NULL,
      pin_set_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      UNIQUE(room_id, login_name),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS member_devices (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      device_fingerprint TEXT NOT NULL,
      device_name TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('PENDING', 'APPROVED', 'REVOKED')) DEFAULT 'APPROVED',
      last_ip TEXT,
      last_seen_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(room_id, user_id, device_fingerprint),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_lockouts (
      lock_key TEXT PRIMARY KEY,
      attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER,
      updated_at INTEGER NOT NULL
    );
  `);

  // Safe migration: add reauth_at and device_id columns to sessions if missing
  const sessionCols = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  const colNames = new Set(sessionCols.map((c) => c.name));
  if (!colNames.has('reauth_at')) {
    db.exec('ALTER TABLE sessions ADD COLUMN reauth_at INTEGER');
    db.exec('UPDATE sessions SET reauth_at = created_at WHERE reauth_at IS NULL');
  }
  if (!colNames.has('device_id')) {
    db.exec('ALTER TABLE sessions ADD COLUMN device_id TEXT');
  }

  tablesInitialized = true;
}

export function resetMemberAuthInitForTests(): void {
  tablesInitialized = false;
}

export function generateSingleUseInviteCode(length = 12): string {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += INVITE_ALPHABET[bytes[i] % INVITE_ALPHABET.length];
  }
  return out;
}

export function hashInviteCode(plainCode: string): string {
  const config = getConfig();
  return crypto
    .createHmac('sha256', config.INVITE_CODE_SECRET)
    .update(plainCode.trim().toUpperCase())
    .digest('hex');
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'));
  } catch {
    return false;
  }
}

export function validatePinStrength(pin: string): { valid: boolean; reasonBn?: string; reasonEn?: string } {
  const trimmed = (pin || '').trim();
  if (!/^\d{6,12}$/.test(trimmed)) {
    return {
      valid: false,
      reasonBn: 'পিন অবশ্যই কমপক্ষে ৬ ডিজিটের সংখ্যা হতে হবে।',
      reasonEn: 'PIN must be at least 6 digits (numbers only).',
    };
  }
  // Reject all identical digits (000000, 111111, etc.)
  if (/^(\d)\1+$/.test(trimmed)) {
    return {
      valid: false,
      reasonBn: 'একই সংখ্যা বারবার ব্যবহার করা দুর্বল পিন গ্রহণযোগ্য নয়।',
      reasonEn: 'Repeated digits PIN is not allowed.',
    };
  }
  // Reject sequential ascending or descending digits (123456, 654321, 012345, etc.)
  const asc = '01234567890123456789';
  const desc = '98765432109876543210';
  if (asc.includes(trimmed) || desc.includes(trimmed)) {
    return {
      valid: false,
      reasonBn: 'ধারাবাহিক সংখ্যার পিন (যেমন 123456 বা 654321) গ্রহণযোগ্য নয়।',
      reasonEn: 'Sequential PINs (e.g. 123456 or 654321) are not allowed.',
    };
  }
  // Reject simple repeating 2-digit or 3-digit patterns (121212, 123123) or pairs (112233)
  if (/^(\d{2,3})\1+$/.test(trimmed) || /^(\d)\1(\d)\2(\d)\3$/.test(trimmed)) {
    return {
      valid: false,
      reasonBn: 'সহজে অনুমানযোগ্য প্যাটার্ন পিন গ্রহণযোগ্য নয়।',
      reasonEn: 'Easily guessable pattern PIN is not allowed.',
    };
  }
  return { valid: true };
}

export function hashPin(pin: string): { hash: string; salt: string } {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(pin, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return { hash: derived, salt };
}

export function verifyPin(pin: string, storedHash: string, storedSalt: string): boolean {
  const derived = crypto.scryptSync(pin, storedSalt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return timingSafeEqualHex(derived, storedHash);
}

function notifyRoomOwners(roomId: string, titleBn: string, titleEn: string, messageBn: string, messageEn: string): void {
  const db = getDb();
  const now = Date.now();
  try {
    db.prepare(`
      INSERT INTO notifications (id, room_id, dedup_key, type, is_money, owner_only, title_bn, title_en, message_bn, message_en, created_at)
      VALUES (?, ?, ?, 'SECURITY_ALERT', 0, 1, ?, ?, ?, ?, ?)
    `).run(crypto.randomUUID(), roomId, `sec-${roomId}-${now}-${crypto.randomUUID().slice(0, 6)}`, titleBn, titleEn, messageBn, messageEn, now);
  } catch { }
}

export function checkAuthLockout(keys: string[]): { locked: boolean; delayMs: number } {
  ensureMemberAuthTables();
  const db = getDb();
  const now = Date.now();
  let maxAttempts = 0;

  for (const k of keys) {
    if (!k) continue;
    const row = db.prepare('SELECT attempts, locked_until FROM auth_lockouts WHERE lock_key = ?').get(k) as
      | { attempts: number; locked_until: number | null }
      | undefined;
    if (row) {
      if (row.locked_until && row.locked_until > now) {
        return { locked: true, delayMs: 0 };
      }
      if (row.attempts > maxAttempts) maxAttempts = row.attempts;
    }
  }

  // Increasing delay on repeated failures (capped at 1500ms in tests/runtime)
  const delayMs = maxAttempts > 0 ? Math.min(1500, maxAttempts * 150) : 0;
  return { locked: false, delayMs };
}

export function recordAuthFailure(keys: string[], roomId?: string | null, ip?: string): boolean {
  ensureMemberAuthTables();
  const db = getDb();
  const config = getConfig();
  const now = Date.now();
  const lockoutMs = config.JOIN_LOCKOUT_MINUTES * 60 * 1000;
  let triggeredLockout = false;

  for (const k of keys) {
    if (!k) continue;
    const existing = db.prepare('SELECT attempts, locked_until FROM auth_lockouts WHERE lock_key = ?').get(k) as
      | { attempts: number; locked_until: number | null }
      | undefined;
    const prevAttempts = existing && (!existing.locked_until || existing.locked_until <= now) ? existing.attempts : 0;
    const nextAttempts = prevAttempts + 1;
    const lockedUntil = nextAttempts >= config.JOIN_RATE_LIMIT_MAX_ATTEMPTS ? now + lockoutMs : null;
    if (lockedUntil) triggeredLockout = true;

    db.prepare(`
      INSERT INTO auth_lockouts (lock_key, attempts, locked_until, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(lock_key) DO UPDATE SET attempts = excluded.attempts, locked_until = excluded.locked_until, updated_at = excluded.updated_at
    `).run(k, nextAttempts, lockedUntil, now);
  }

  if (triggeredLockout && roomId) {
    notifyRoomOwners(
      roomId,
      'সিকিউরিটি সতর্কতা: লগইন লকআউট',
      'Security Alert: Login Lockout',
      `একাধিক ভুল কোড বা পিন চেষ্টার কারণে একটি অ্যাক্সেস সাময়িকভাবে লক করা হয়েছে।`,
      `Access was temporarily locked after repeated invalid code or PIN attempts.`
    );
    addAuditLog({
      roomId,
      userId: 'system',
      userEmail: 'system@lilycc.local',
      userName: 'Security System',
      action: 'AUTH_LOCKOUT',
      details: { reason: 'MAX_FAILED_ATTEMPTS' },
      ipAddress: ip || null,
    });
  }

  return triggeredLockout;
}

export function clearAuthFailures(keys: string[]): void {
  ensureMemberAuthTables();
  const db = getDb();
  const stmt = db.prepare('DELETE FROM auth_lockouts WHERE lock_key = ?');
  for (const k of keys) {
    if (k) stmt.run(k);
  }
}

export function createMemberInvite(
  roomId: string,
  data: { memberName: string; role: 'MANAGER' | 'STAFF'; idempotencyKey?: string | null },
  actor: { userId: string; email: string; name: string; ip?: string }
): { invite: any; inviteCode: string | null; deduplicated: boolean } {
  ensureMemberAuthTables();
  const db = getDb();

  if (data.role !== 'MANAGER' && data.role !== 'STAFF') {
    const err: any = new Error('Invalid invite role');
    err.status = 400;
    err.messageBn = 'শুধুমাত্র ম্যানেজার বা স্টাফ রোল তৈরি করা যাবে।';
    err.messageEn = 'Only MANAGER or STAFF invites can be created.';
    throw err;
  }

  const idemKey = data.idempotencyKey ? data.idempotencyKey.trim() : null;
  if (idemKey) {
    const existing = db
      .prepare('SELECT id, room_id, member_user_id, member_name, role, expires_at, used_at, revoked_at, created_at FROM member_invites WHERE room_id = ? AND idempotency_key = ?')
      .get(roomId, idemKey) as any;
    if (existing) {
      return { invite: existing, inviteCode: null, deduplicated: true };
    }
  }

  const now = Date.now();
  const memberUserId = crypto.randomUUID();
  const inviteId = crypto.randomUUID();
  const plainCode = generateSingleUseInviteCode(12);
  const codeHash = hashInviteCode(plainCode);
  const expiresAt = now + INVITE_TTL_MS;
  const cleanName = data.memberName.trim();

  db.exec('BEGIN IMMEDIATE');
  try {
    // Create dedicated member user record (no Google required)
    db.prepare(`
      INSERT INTO users (id, google_id, email, name, picture, preferred_language, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 'bn', ?, ?)
    `).run(memberUserId, `member-${memberUserId}`, `member-${memberUserId}@member.lilycc.local`, cleanName, now, now);

    // Create PENDING membership bound to the exact invited role (never OWNER)
    db.prepare(`
      INSERT INTO room_members (id, room_id, user_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'PENDING', ?, ?)
    `).run(crypto.randomUUID(), roomId, memberUserId, data.role, now, now);

    // Store ONLY HMAC hash of the invite code
    db.prepare(`
      INSERT INTO member_invites (
        id, room_id, member_user_id, member_name, role, code_hash, idempotency_key,
        expires_at, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(inviteId, roomId, memberUserId, cleanName, data.role, codeHash, idemKey, expiresAt, actor.userId, now);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'INVITE_CREATED',
    details: { inviteId, memberUserId, memberName: cleanName, role: data.role, expiresAt },
    ipAddress: actor.ip || null,
  });

  return {
    invite: {
      id: inviteId,
      room_id: roomId,
      member_user_id: memberUserId,
      member_name: cleanName,
      role: data.role,
      expires_at: expiresAt,
      used_at: null,
      revoked_at: null,
      created_at: now,
    },
    inviteCode: plainCode,
    deduplicated: false,
  };
}

export function redeemMemberInviteAndSetPin(input: {
  roomJoinCode: string;
  inviteCode: string;
  selectedRole: 'MANAGER' | 'STAFF';
  loginName: string;
  pin: string;
  deviceFingerprint: string;
  deviceName: string;
  ip: string;
}): { user: UserRow; roomId: string; role: 'MANAGER' | 'STAFF'; deviceId: string } {
  ensureMemberAuthTables();
  const db = getDb();
  const now = Date.now();

  const normalizedLogin = input.loginName.trim().toLowerCase();
  const lockKeysBase = [`ip:${input.ip}`];

  const preLock = checkAuthLockout(lockKeysBase);
  if (preLock.locked) {
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 429;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  // Validate PIN strength first (clear UX feedback without revealing room/invite existence)
  const pinCheck = validatePinStrength(input.pin);
  if (!pinCheck.valid) {
    const err: any = new Error(pinCheck.reasonEn);
    err.status = 400;
    err.code = 'WEAK_PIN';
    err.messageBn = pinCheck.reasonBn;
    err.messageEn = pinCheck.reasonEn;
    throw err;
  }

  if (!input.roomJoinCode?.trim() || !input.inviteCode?.trim() || normalizedLogin.length < 2) {
    recordAuthFailure(lockKeysBase, null, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const room = getRoomByJoinCode(input.roomJoinCode.trim().toUpperCase());
  if (!room) {
    recordAuthFailure(lockKeysBase, null, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const allLockKeys = [`ip:${input.ip}`, `room:${room.id}`, `member:${room.id}:${normalizedLogin}`];
  const roomLock = checkAuthLockout(allLockKeys);
  if (roomLock.locked) {
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 429;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const incomingHash = hashInviteCode(input.inviteCode);
  const candidates = db
    .prepare(
      'SELECT * FROM member_invites WHERE room_id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?'
    )
    .all(room.id, now) as any[];

  let matchedInvite: any = null;
  for (const c of candidates) {
    if (timingSafeEqualHex(c.code_hash, incomingHash)) {
      matchedInvite = c;
      break;
    }
  }

  // Verify invite exists AND matches the selected role tab (Staff code can NEVER work under Manager!)
  if (!matchedInvite || matchedInvite.role !== input.selectedRole) {
    recordAuthFailure(allLockKeys, room.id, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  // Ensure login_name is not already taken by a different user in this room
  const existingLogin = db
    .prepare('SELECT user_id FROM member_credentials WHERE room_id = ? AND login_name = ?')
    .get(room.id, normalizedLogin) as { user_id: string } | undefined;
  if (existingLogin && existingLogin.user_id !== matchedInvite.member_user_id) {
    const err: any = new Error('Login name already taken');
    err.status = 409;
    err.messageBn = 'এই লগইন নামটি ইতোমধ্যে ব্যবহৃত হচ্ছে। অন্য একটি নাম দিন।';
    err.messageEn = 'This login name is already in use. Please choose another.';
    throw err;
  }

  const { hash: pinHash, salt: pinSalt } = hashPin(input.pin.trim());
  const deviceId = crypto.randomUUID();
  const fp = (input.deviceFingerprint || 'unknown-device').trim().slice(0, 128);
  const dName = (input.deviceName || 'Mobile Device').trim().slice(0, 120);

  db.exec('BEGIN IMMEDIATE');
  try {
    // Atomic single-use consumption — prevents two simultaneous devices from redeeming the same code!
    const consumeRes = db
      .prepare(
        'UPDATE member_invites SET used_at = ? WHERE id = ? AND used_at IS NULL AND revoked_at IS NULL AND expires_at > ?'
      )
      .run(now, matchedInvite.id, now);

    if (consumeRes.changes !== 1) {
      db.exec('ROLLBACK');
      recordAuthFailure(allLockKeys, room.id, input.ip);
      const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
      err.status = 401;
      Object.assign(err, GENERIC_AUTH_ERROR);
      throw err;
    }

    // Store salted scrypt PIN hash
    db.prepare(`
      INSERT INTO member_credentials (user_id, room_id, login_name, pin_hash, pin_salt, pin_set_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        login_name = excluded.login_name,
        pin_hash = excluded.pin_hash,
        pin_salt = excluded.pin_salt,
        pin_set_at = excluded.pin_set_at,
        updated_at = excluded.updated_at
    `).run(matchedInvite.member_user_id, room.id, normalizedLogin, pinHash, pinSalt, now, now);

    // Activate membership strictly with invite's server-bound role
    db.prepare(`
      UPDATE room_members SET status = 'ACTIVE', role = ?, updated_at = ?
      WHERE room_id = ? AND user_id = ?
    `).run(matchedInvite.role, now, room.id, matchedInvite.member_user_id);

    // Register member's device
    db.prepare(`
      INSERT INTO member_devices (id, room_id, user_id, device_fingerprint, device_name, status, last_ip, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
      ON CONFLICT(room_id, user_id, device_fingerprint) DO UPDATE SET
        device_name = excluded.device_name,
        status = 'APPROVED',
        last_ip = excluded.last_ip,
        last_seen_at = excluded.last_seen_at
    `).run(deviceId, room.id, matchedInvite.member_user_id, fp, dName, input.ip, now, now);

    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch { }
    throw err;
  }

  clearAuthFailures(allLockKeys);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(matchedInvite.member_user_id) as UserRow;
  const actualDevice = db
    .prepare('SELECT id FROM member_devices WHERE room_id = ? AND user_id = ? AND device_fingerprint = ?')
    .get(room.id, matchedInvite.member_user_id, fp) as { id: string };

  notifyRoomOwners(
    room.id,
    'নতুন সদস্য ইনভাইট ব্যবহার করেছেন',
    'Member Activated via Invite',
    `${matchedInvite.member_name} (${matchedInvite.role}) নতুন ডিভাইস (${dName}) থেকে লগইন করেছেন।`,
    `${matchedInvite.member_name} (${matchedInvite.role}) activated their account from ${dName}.`
  );

  addAuditLog({
    roomId: room.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    action: 'INVITE_USED',
    details: { inviteId: matchedInvite.id, role: matchedInvite.role, deviceName: dName },
    ipAddress: input.ip,
  });

  return {
    user,
    roomId: room.id,
    role: matchedInvite.role,
    deviceId: actualDevice.id,
  };
}

export function loginMemberWithPin(input: {
  roomJoinCode: string;
  selectedRole: 'MANAGER' | 'STAFF';
  loginName: string;
  pin: string;
  deviceFingerprint: string;
  deviceName: string;
  ip: string;
}): { user: UserRow; roomId: string; role: 'MANAGER' | 'STAFF'; deviceId: string } {
  ensureMemberAuthTables();
  const db = getDb();
  const now = Date.now();

  const normalizedLogin = (input.loginName || '').trim().toLowerCase();
  const lockKeysBase = [`ip:${input.ip}`];

  if (checkAuthLockout(lockKeysBase).locked) {
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 429;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  if (!input.roomJoinCode?.trim() || !normalizedLogin || !input.pin?.trim()) {
    recordAuthFailure(lockKeysBase, null, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const room = getRoomByJoinCode(input.roomJoinCode.trim().toUpperCase());
  if (!room) {
    recordAuthFailure(lockKeysBase, null, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const allLockKeys = [`ip:${input.ip}`, `room:${room.id}`, `member:${room.id}:${normalizedLogin}`];
  if (checkAuthLockout(allLockKeys).locked) {
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 429;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const cred = db
    .prepare('SELECT * FROM member_credentials WHERE room_id = ? AND login_name = ?')
    .get(room.id, normalizedLogin) as any;

  if (!cred || !verifyPin(input.pin.trim(), cred.pin_hash, cred.pin_salt)) {
    recordAuthFailure(allLockKeys, room.id, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const member = getRoomMember(room.id, cred.user_id);
  if (!member || member.status !== 'ACTIVE' || member.role !== input.selectedRole) {
    recordAuthFailure(allLockKeys, room.id, input.ip);
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 401;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const fp = (input.deviceFingerprint || 'unknown-device').trim().slice(0, 128);
  const dName = (input.deviceName || 'Mobile Device').trim().slice(0, 120);

  let device = db
    .prepare('SELECT * FROM member_devices WHERE room_id = ? AND user_id = ? AND device_fingerprint = ?')
    .get(room.id, cred.user_id, fp) as any;

  if (device && device.status === 'REVOKED') {
    const err: any = new Error(GENERIC_AUTH_ERROR.messageEn);
    err.status = 403;
    Object.assign(err, GENERIC_AUTH_ERROR);
    throw err;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(cred.user_id) as UserRow;

  if (!device) {
    const newDeviceId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO member_devices (id, room_id, user_id, device_fingerprint, device_name, status, last_ip, last_seen_at, created_at)
      VALUES (?, ?, ?, ?, ?, 'APPROVED', ?, ?, ?)
    `).run(newDeviceId, room.id, cred.user_id, fp, dName, input.ip, now, now);
    device = { id: newDeviceId };

    notifyRoomOwners(
      room.id,
      'নতুন ডিভাইস থেকে লগইন',
      'Login from New Device',
      `${user.name} (${member.role}) একটি নতুন ডিভাইস (${dName}) থেকে লগইন করেছেন।`,
      `${user.name} (${member.role}) logged in from a new device (${dName}).`
    );
  } else {
    db.prepare('UPDATE member_devices SET last_ip = ?, last_seen_at = ?, device_name = ? WHERE id = ?').run(
      input.ip,
      now,
      dName,
      device.id
    );
  }

  clearAuthFailures(allLockKeys);

  addAuditLog({
    roomId: room.id,
    userId: user.id,
    userEmail: user.email,
    userName: user.name,
    action: 'MEMBER_PIN_LOGIN',
    details: { role: member.role, deviceId: device.id, deviceName: dName },
    ipAddress: input.ip,
  });

  return {
    user,
    roomId: room.id,
    role: member.role as 'MANAGER' | 'STAFF',
    deviceId: device.id,
  };
}

export function resetMemberPin(
  roomId: string,
  targetUserId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): { invite: any; inviteCode: string } {
  ensureMemberAuthTables();
  const db = getDb();
  const member = getRoomMember(roomId, targetUserId);
  if (!member || member.role === 'OWNER') {
    const err: any = new Error('Cannot reset PIN for this user');
    err.status = 400;
    err.messageBn = 'এই সদস্যের পিন রিসেট করা সম্ভব নয়।';
    err.messageEn = 'Cannot reset PIN for this member.';
    throw err;
  }

  const targetUser = db.prepare('SELECT * FROM users WHERE id = ?').get(targetUserId) as UserRow | undefined;
  const now = Date.now();
  const inviteId = crypto.randomUUID();
  const plainCode = generateSingleUseInviteCode(12);
  const codeHash = hashInviteCode(plainCode);
  const expiresAt = now + INVITE_TTL_MS;

  db.exec('BEGIN IMMEDIATE');
  try {
    // 1. Delete old PIN credentials (forces new PIN)
    db.prepare('DELETE FROM member_credentials WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);
    // 2. Revoke all old unused invites
    db.prepare('UPDATE member_invites SET revoked_at = ? WHERE room_id = ? AND member_user_id = ? AND used_at IS NULL AND revoked_at IS NULL').run(
      now,
      roomId,
      targetUserId
    );
    // 3. Issue a fresh 24h single-use invite code
    db.prepare(`
      INSERT INTO member_invites (
        id, room_id, member_user_id, member_name, role, code_hash, expires_at, created_by_user_id, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      inviteId,
      roomId,
      targetUserId,
      targetUser?.name || 'Member',
      member.role === 'MANAGER' ? 'MANAGER' : 'STAFF',
      codeHash,
      expiresAt,
      actor.userId,
      now
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  // 4. Revoke all active sessions immediately
  deleteAllUserSessions(targetUserId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'PIN_RESET',
    details: { targetUserId, inviteId, expiresAt },
    ipAddress: actor.ip || null,
  });

  return {
    invite: {
      id: inviteId,
      room_id: roomId,
      member_user_id: targetUserId,
      member_name: targetUser?.name || 'Member',
      role: member.role,
      expires_at: expiresAt,
    },
    inviteCode: plainCode,
  };
}

export function listRoomInvites(roomId: string): any[] {
  ensureMemberAuthTables();
  const db = getDb();
  // Never return code_hash or plain code!
  return db
    .prepare(
      'SELECT id, room_id, member_user_id, member_name, role, expires_at, used_at, revoked_at, created_at FROM member_invites WHERE room_id = ? ORDER BY created_at DESC LIMIT 100'
    )
    .all(roomId);
}

export function revokeMemberInvite(
  roomId: string,
  inviteId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  ensureMemberAuthTables();
  const db = getDb();
  const now = Date.now();
  const res = db
    .prepare('UPDATE member_invites SET revoked_at = ? WHERE id = ? AND room_id = ? AND used_at IS NULL AND revoked_at IS NULL')
    .run(now, inviteId, roomId);
  if (res.changes > 0) {
    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'INVITE_REVOKED',
      details: { inviteId },
      ipAddress: actor.ip || null,
    });
  }
}

export function listRoomDevices(roomId: string): any[] {
  ensureMemberAuthTables();
  const db = getDb();
  return db
    .prepare(`
      SELECT d.id, d.room_id, d.user_id, d.device_name, d.status, d.last_ip, d.last_seen_at, d.created_at,
             u.name as user_name, m.role as user_role
      FROM member_devices d
      JOIN users u ON d.user_id = u.id
      LEFT JOIN room_members m ON m.room_id = d.room_id AND m.user_id = d.user_id
      WHERE d.room_id = ?
      ORDER BY d.last_seen_at DESC
    `)
    .all(roomId);
}

export function updateMemberDeviceStatus(
  roomId: string,
  deviceId: string,
  status: 'APPROVED' | 'REVOKED',
  actor: { userId: string; email: string; name: string; ip?: string }
): any {
  ensureMemberAuthTables();
  const db = getDb();
  const device = db.prepare('SELECT * FROM member_devices WHERE id = ? AND room_id = ?').get(deviceId, roomId) as any;
  if (!device) {
    const err: any = new Error('Device not found');
    err.status = 404;
    throw err;
  }

  db.prepare('UPDATE member_devices SET status = ? WHERE id = ?').run(status, deviceId);

  if (status === 'REVOKED') {
    // Immediately revoke sessions bound to this device or user
    db.prepare('DELETE FROM sessions WHERE device_id = ? OR user_id = ?').run(deviceId, device.user_id);
  }

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: status === 'REVOKED' ? 'DEVICE_REVOKED' : 'DEVICE_APPROVED',
    details: { deviceId, targetUserId: device.user_id, deviceName: device.device_name },
    ipAddress: actor.ip || null,
  });

  return { ...device, status };
}

export function isDeviceRevoked(deviceId?: string | null): boolean {
  if (!deviceId) return false;
  ensureMemberAuthTables();
  const db = getDb();
  const row = db.prepare('SELECT status FROM member_devices WHERE id = ?').get(deviceId) as { status: string } | undefined;
  return Boolean(row && row.status === 'REVOKED');
}

export function bindSessionDeviceAndReauth(sessionId: string, opts: { deviceId?: string | null; reauthAt?: number | null }): void {
  ensureMemberAuthTables();
  const db = getDb();
  if (opts.deviceId !== undefined) {
    db.prepare('UPDATE sessions SET device_id = ? WHERE id = ?').run(opts.deviceId, sessionId);
  }
  if (opts.reauthAt !== undefined) {
    db.prepare('UPDATE sessions SET reauth_at = ? WHERE id = ?').run(opts.reauthAt, sessionId);
  }
}

export function getSessionReauthInfo(sessionId: string): { reauth_at: number; device_id: string | null } {
  ensureMemberAuthTables();
  const db = getDb();
  const row = db.prepare('SELECT created_at, reauth_at, device_id FROM sessions WHERE id = ?').get(sessionId) as
    | { created_at: number; reauth_at: number | null; device_id: string | null }
    | undefined;
  return {
    reauth_at: row?.reauth_at ?? row?.created_at ?? 0,
    device_id: row?.device_id ?? null,
  };
}

export function transferRoomOwnership(
  roomId: string,
  targetUserId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  ensureMemberAuthTables();
  const db = getDb();
  const target = getRoomMember(roomId, targetUserId);
  if (!target || target.status !== 'ACTIVE') {
    const err: any = new Error('Target member must be active');
    err.status = 400;
    err.messageBn = 'মালিকানা হস্তান্তরের জন্য সদস্যকে অবশ্যই সক্রিয় হতে হবে।';
    err.messageEn = 'Target member must be an active member of this room.';
    throw err;
  }

  const now = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE room_members SET role = 'OWNER', updated_at = ? WHERE room_id = ? AND user_id = ?").run(
      now,
      roomId,
      targetUserId
    );
    db.prepare("UPDATE room_members SET role = 'MANAGER', updated_at = ? WHERE room_id = ? AND user_id = ?").run(
      now,
      roomId,
      actor.userId
    );
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'OWNERSHIP_TRANSFERRED',
    details: { fromUserId: actor.userId, toUserId: targetUserId },
    ipAddress: actor.ip || null,
  });
}
