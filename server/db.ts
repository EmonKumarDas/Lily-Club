import { DatabaseSync } from 'node:sqlite';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { getConfig } from './config.js';
import {
  formatDualDateFromYMD,
  formatTimeString12,
  formatCurrency,
  toBanglaDigits,
} from './dateUtils.js';

let dbInstance: DatabaseSync | null = null;

export function getDb(customPath?: string): DatabaseSync {
  if (dbInstance && !customPath) return dbInstance;

  const config = getConfig();
  const dbPath = customPath || config.DATABASE_URL;

  if (dbPath !== ':memory:') {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new DatabaseSync(dbPath);

  // WAL mode for concurrency, foreign keys for relational integrity, and busy_timeout for concurrent processes
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA busy_timeout = 5000;');
  if (dbPath !== ':memory:') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  initSchema(db);

  if (!customPath) {
    dbInstance = db;
  }
  return db;
}

export function closeDb(): void {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
}

function initSchema(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      picture TEXT,
      preferred_language TEXT NOT NULL DEFAULT 'bn',
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_google_id ON users(google_id);

    CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      logo TEXT,
      address TEXT NOT NULL,
      phone TEXT NOT NULL,
      default_language TEXT NOT NULL DEFAULT 'bn',
      join_code TEXT UNIQUE NOT NULL,
      join_approval_required INTEGER NOT NULL DEFAULT 1,
      created_by_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_rooms_join_code ON rooms(join_code);

    CREATE TABLE IF NOT EXISTS room_members (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('OWNER', 'MANAGER', 'STAFF', 'VIEWER')),
      status TEXT NOT NULL CHECK(status IN ('ACTIVE', 'PENDING', 'REJECTED')),
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(room_id, user_id)
    );

    CREATE INDEX IF NOT EXISTS idx_room_members_user ON room_members(user_id);
    CREATE INDEX IF NOT EXISTS idx_room_members_room_user ON room_members(room_id, user_id);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_token_hash TEXT UNIQUE NOT NULL,
      active_room_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_hash ON sessions(session_token_hash);
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

    CREATE TABLE IF NOT EXISTS join_attempts (
      id TEXT PRIMARY KEY,
      ip_address TEXT NOT NULL,
      user_id TEXT,
      attempted_code TEXT NOT NULL,
      attempt_time INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_join_attempts_ip_time ON join_attempts(ip_address, attempt_time);
    CREATE INDEX IF NOT EXISTS idx_join_attempts_user_time ON join_attempts(user_id, attempt_time);

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_email TEXT NOT NULL,
      user_name TEXT NOT NULL,
      action TEXT NOT NULL,
      details TEXT NOT NULL,
      ip_address TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_audit_logs_room_time ON audit_logs(room_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS halls (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 100,
      day_price REAL NOT NULL DEFAULT 0,
      night_price REAL NOT NULL DEFAULT 0,
      full_price REAL NOT NULL DEFAULT 0,
      photos TEXT NOT NULL DEFAULT '[]',
      facilities TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_halls_room ON halls(room_id, is_active);

    CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      alt_phone TEXT,
      address TEXT,
      notes TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_customers_room_phone ON customers(room_id, phone);
    CREATE INDEX IF NOT EXISTS idx_customers_room_name ON customers(room_id, name);

    CREATE TABLE IF NOT EXISTS bookings (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      booking_number TEXT UNIQUE NOT NULL,
      customer_id TEXT NOT NULL,
      hall_id TEXT NOT NULL,
      event_type TEXT NOT NULL CHECK(event_type IN ('WEDDING', 'HOLUD', 'RECEPTION', 'ENGAGEMENT', 'BIRTHDAY', 'AQIQAH', 'MEETING', 'OTHER')),
      event_date TEXT NOT NULL,
      slot TEXT NOT NULL CHECK(slot IN ('DAY', 'NIGHT', 'FULL')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      guest_count INTEGER NOT NULL CHECK(guest_count >= 1),
      package_name TEXT,
      extra_services TEXT NOT NULL DEFAULT '[]',
      base_price REAL NOT NULL DEFAULT 0,
      hall_rent REAL NOT NULL DEFAULT 0,
      extra_services_amount REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL CHECK(total_amount >= 0),
      advance_amount REAL NOT NULL DEFAULT 0 CHECK(advance_amount >= 0),
      due_amount REAL NOT NULL CHECK(due_amount >= 0),
      status TEXT NOT NULL CHECK(status IN ('TENTATIVE', 'CONFIRMED', 'COMPLETED', 'CANCELLED', 'NO_SHOW')),
      hold_expires_at INTEGER,
      cancel_reason TEXT,
      cancelled_at INTEGER,
      cancelled_by_user_id TEXT,
      notes TEXT,
      idempotency_key TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_by_user_id TEXT NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE RESTRICT,
      FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE RESTRICT,
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_room_date ON bookings(room_id, event_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_room_hall_date ON bookings(room_id, hall_id, event_date);
    CREATE INDEX IF NOT EXISTS idx_bookings_room_status ON bookings(room_id, status);
    CREATE INDEX IF NOT EXISTS idx_bookings_room_customer ON bookings(room_id, customer_id);
    CREATE INDEX IF NOT EXISTS idx_bookings_room_number ON bookings(room_id, booking_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_bookings_idempotency ON bookings(room_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

    CREATE TABLE IF NOT EXISTS booking_slot_locks (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      hall_id TEXT NOT NULL,
      event_date TEXT NOT NULL,
      locked_slot TEXT NOT NULL CHECK(locked_slot IN ('DAY', 'NIGHT')),
      booking_id TEXT NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (hall_id) REFERENCES halls(id) ON DELETE CASCADE,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      UNIQUE(hall_id, event_date, locked_slot)
    );

    CREATE INDEX IF NOT EXISTS idx_slot_locks_booking ON booking_slot_locks(booking_id);
    CREATE INDEX IF NOT EXISTS idx_slot_locks_hall_date ON booking_slot_locks(hall_id, event_date);

    CREATE TABLE IF NOT EXISTS booking_history (
      id TEXT PRIMARY KEY,
      booking_id TEXT NOT NULL,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      user_name TEXT NOT NULL,
      user_email TEXT NOT NULL,
      action TEXT NOT NULL,
      changes TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_booking_history_booking ON booking_history(booking_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS booking_counters (
      room_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (room_id, year),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS receipt_counters (
      room_id TEXT NOT NULL,
      year INTEGER NOT NULL,
      last_seq INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (room_id, year),
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      booking_id TEXT NOT NULL,
      receipt_number TEXT UNIQUE NOT NULL,
      payment_type TEXT NOT NULL CHECK(payment_type IN ('ADVANCE', 'PARTIAL', 'FINAL', 'REFUND', 'REVERSAL')),
      amount REAL NOT NULL,
      payment_date TEXT NOT NULL,
      method TEXT NOT NULL CHECK(method IN ('CASH', 'BKASH', 'NAGAD', 'BANK', 'OTHER')),
      reference_number TEXT,
      received_by_user_id TEXT NOT NULL,
      received_by_name TEXT NOT NULL,
      note TEXT,
      reverses_payment_id TEXT,
      is_reversed INTEGER NOT NULL DEFAULT 0,
      reversed_by_payment_id TEXT,
      idempotency_key TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_payments_room_booking ON payments(room_id, booking_id, created_at ASC);
    CREATE INDEX IF NOT EXISTS idx_payments_room_date ON payments(room_id, payment_date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_idempotency ON payments(room_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_reversal_once ON payments(reverses_payment_id) WHERE reverses_payment_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      expense_number TEXT UNIQUE NOT NULL,
      category TEXT NOT NULL CHECK(category IN ('ELECTRICITY', 'SALARY', 'REPAIR', 'CLEANING', 'DECORATION_MATERIAL', 'FOOD', 'OTHER')),
      entry_type TEXT NOT NULL DEFAULT 'EXPENSE' CHECK(entry_type IN ('EXPENSE', 'REVERSAL')),
      amount REAL NOT NULL,
      expense_date TEXT NOT NULL,
      note TEXT,
      receipt_photo TEXT,
      reverses_expense_id TEXT,
      is_reversed INTEGER NOT NULL DEFAULT 0,
      reversed_by_expense_id TEXT,
      idempotency_key TEXT,
      is_demo INTEGER NOT NULL DEFAULT 0,
      recorded_by_user_id TEXT NOT NULL,
      recorded_by_name TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_expenses_room_date ON expenses(room_id, expense_date DESC, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_expenses_room_category ON expenses(room_id, category);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_idempotency ON expenses(room_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_expenses_reversal_once ON expenses(reverses_expense_id) WHERE reverses_expense_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      room_id TEXT NOT NULL,
      dedup_key TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('NEW_BOOKING', 'PAYMENT_RECEIVED', 'HOLD_EXPIRING_SOON', 'EVENT_TOMORROW', 'DUE_WITHIN_7_DAYS', 'JOIN_REQUEST_PENDING')),
      is_money INTEGER NOT NULL DEFAULT 0,
      owner_only INTEGER NOT NULL DEFAULT 0,
      booking_id TEXT,
      slot TEXT,
      title_bn TEXT NOT NULL,
      title_en TEXT NOT NULL,
      message_bn TEXT NOT NULL,
      message_en TEXT NOT NULL,
      event_date TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
      UNIQUE(room_id, dedup_key)
    );

    CREATE INDEX IF NOT EXISTS idx_notifications_room_time ON notifications(room_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS notification_reads (
      notification_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      read_at INTEGER NOT NULL,
      PRIMARY KEY (notification_id, user_id),
      FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // Safe migration for Part 2 columns on existing rooms table
  const roomCols = (db.prepare("PRAGMA table_info(rooms)").all() as Array<{ name: string }>).map(c => c.name);
  if (!roomCols.includes('day_start_time')) {
    db.exec("ALTER TABLE rooms ADD COLUMN day_start_time TEXT NOT NULL DEFAULT '08:00'");
  }
  if (!roomCols.includes('day_end_time')) {
    db.exec("ALTER TABLE rooms ADD COLUMN day_end_time TEXT NOT NULL DEFAULT '16:00'");
  }
  if (!roomCols.includes('night_start_time')) {
    db.exec("ALTER TABLE rooms ADD COLUMN night_start_time TEXT NOT NULL DEFAULT '18:00'");
  }
  if (!roomCols.includes('night_end_time')) {
    db.exec("ALTER TABLE rooms ADD COLUMN night_end_time TEXT NOT NULL DEFAULT '00:00'");
  }
  if (!roomCols.includes('buffer_enabled')) {
    db.exec("ALTER TABLE rooms ADD COLUMN buffer_enabled INTEGER NOT NULL DEFAULT 0");
  }
  if (!roomCols.includes('buffer_minutes')) {
    db.exec("ALTER TABLE rooms ADD COLUMN buffer_minutes INTEGER NOT NULL DEFAULT 60");
  }
  if (!roomCols.includes('email')) {
    db.exec("ALTER TABLE rooms ADD COLUMN email TEXT");
  }
  if (!roomCols.includes('primary_color')) {
    db.exec("ALTER TABLE rooms ADD COLUMN primary_color TEXT");
  }
  if (!roomCols.includes('logo_scale')) {
    db.exec("ALTER TABLE rooms ADD COLUMN logo_scale REAL NOT NULL DEFAULT 1.0");
  }
}

/**
 * Generates an 8-character cryptographically secure Room Join Code.
 * Strictly excludes confusing characters: O, 0, I, l, 1.
 */
const UNAMBIGUOUS_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

export function generateJoinCode(): string {
  const chars = UNAMBIGUOUS_CHARS;
  let code = '';
  for (let i = 0; i < 8; i++) {
    const randomIndex = crypto.randomInt(0, chars.length);
    code += chars[randomIndex];
  }
  return code;
}

export function hashToken(token: string): string {
  const config = getConfig();
  return crypto.createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex');
}

// ======================== User Repository ========================

export interface UserRow {
  id: string;
  google_id: string;
  email: string;
  name: string;
  picture: string | null;
  preferred_language: 'bn' | 'en';
  created_at: number;
  updated_at: number;
}

export function upsertGoogleUser(data: {
  google_id: string;
  email: string;
  name: string;
  picture?: string | null;
  preferred_language?: 'bn' | 'en';
}): UserRow {
  const db = getDb();
  const now = Date.now();
  const emailNormalized = data.email.trim().toLowerCase();

  // Check if user exists by google_id or email
  const existingStmt = db.prepare('SELECT * FROM users WHERE google_id = ? OR email = ? LIMIT 1');
  const existing = existingStmt.get(data.google_id, emailNormalized) as UserRow | undefined;

  if (existing) {
    // Update name, picture and google_id (in case logged in via email first)
    const updateStmt = db.prepare(`
      UPDATE users 
      SET google_id = ?, name = ?, picture = COALESCE(?, picture), updated_at = ?
      WHERE id = ?
    `);
    updateStmt.run(data.google_id, data.name, data.picture || null, now, existing.id);

    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(existing.id) as UserRow;
    return updated;
  }

  const id = crypto.randomUUID();
  const insertStmt = db.prepare(`
    INSERT INTO users (id, google_id, email, name, picture, preferred_language, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(
    id,
    data.google_id,
    emailNormalized,
    data.name,
    data.picture || null,
    data.preferred_language || 'bn',
    now,
    now
  );

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow;
}

export function getUserById(id: string): UserRow | null {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return user || null;
}

export function updateUserLanguage(userId: string, language: 'bn' | 'en'): void {
  const db = getDb();
  db.prepare('UPDATE users SET preferred_language = ?, updated_at = ? WHERE id = ?').run(
    language,
    Date.now(),
    userId
  );
}

export function updateUserProfile(
  userId: string,
  data: { name?: string; picture?: string | null }
): UserRow | undefined {
  const db = getDb();
  const current = getUserById(userId);
  if (!current) return undefined;
  const name = data.name !== undefined ? data.name.trim() : current.name;
  const picture = data.picture !== undefined ? data.picture : current.picture;
  const now = Date.now();
  db.prepare('UPDATE users SET name = ?, picture = ?, updated_at = ? WHERE id = ?').run(
    name,
    picture,
    now,
    userId
  );
  return getUserById(userId);
}

// ======================== Session Repository ========================

export interface SessionRow {
  id: string;
  user_id: string;
  session_token_hash: string;
  active_room_id: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: number;
  last_activity_at: number;
}

export function createSession(data: {
  userId: string;
  token: string;
  activeRoomId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}): SessionRow {
  const db = getDb();
  const now = Date.now();
  const id = crypto.randomUUID();
  const tokenHash = hashToken(data.token);

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, session_token_hash, active_room_id, ip_address, user_agent, created_at, last_activity_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(
    id,
    data.userId,
    tokenHash,
    data.activeRoomId || null,
    data.ipAddress || null,
    data.userAgent || null,
    now,
    now
  );

  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow;
}

export function getSessionByToken(token: string): (SessionRow & { user: UserRow }) | null {
  const db = getDb();
  const tokenHash = hashToken(token);
  const row = db.prepare(`
    SELECT 
      s.id, s.user_id, s.session_token_hash, s.active_room_id, s.ip_address, s.user_agent, s.created_at, s.last_activity_at,
      u.id as u_id, u.google_id, u.email, u.name, u.picture, u.preferred_language, u.created_at as u_created_at, u.updated_at as u_updated_at
    FROM sessions s
    JOIN users u ON s.user_id = u.id
    WHERE s.session_token_hash = ?
  `).get(tokenHash) as any;

  if (!row) return null;

  return {
    id: row.id,
    user_id: row.user_id,
    session_token_hash: row.session_token_hash,
    active_room_id: row.active_room_id,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    created_at: row.created_at,
    last_activity_at: row.last_activity_at,
    user: {
      id: row.u_id,
      google_id: row.google_id,
      email: row.email,
      name: row.name,
      picture: row.picture,
      preferred_language: row.preferred_language,
      created_at: row.u_created_at,
      updated_at: row.u_updated_at,
    },
  };
}

export function touchSession(sessionId: string): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET last_activity_at = ? WHERE id = ?').run(Date.now(), sessionId);
}

export function setSessionActiveRoom(sessionId: string, roomId: string | null): void {
  const db = getDb();
  db.prepare('UPDATE sessions SET active_room_id = ?, last_activity_at = ? WHERE id = ?').run(
    roomId,
    Date.now(),
    sessionId
  );
}

export function deleteSession(sessionId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

export function deleteAllUserSessions(userId: string): void {
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// ======================== Room Repository ========================

export interface RoomRow {
  id: string;
  name: string;
  logo: string | null;
  address: string;
  phone: string;
  default_language: 'bn' | 'en';
  join_code: string;
  join_approval_required: number;
  day_start_time: string;
  day_end_time: string;
  night_start_time: string;
  night_end_time: string;
  buffer_enabled: number;
  buffer_minutes: number;
  email?: string | null;
  primary_color?: string | null;
  logo_scale?: number;
  created_by_user_id: string;
  created_at: number;
  updated_at: number;
}

export type RoleType = 'OWNER' | 'MANAGER' | 'STAFF' | 'VIEWER';
export type MemberStatus = 'ACTIVE' | 'PENDING' | 'REJECTED';

export interface RoomMemberRow {
  id: string;
  room_id: string;
  user_id: string;
  role: RoleType;
  status: MemberStatus;
  created_at: number;
  updated_at: number;
  user_name?: string;
  user_email?: string;
  user_picture?: string | null;
}

export function createRoom(
  data: {
    name: string;
    logo?: string | null;
    address: string;
    phone: string;
    default_language?: 'bn' | 'en';
    createdByUserId?: string;
  },
  actor: { userId?: string; email: string; name: string; ip?: string }
): RoomRow {
  const db = getDb();
  const now = Date.now();
  const roomId = crypto.randomUUID();
  const creatorId = data.createdByUserId || actor.userId;
  if (!creatorId) {
    throw new Error('Room creator user ID is required');
  }

  // Generate unique join code
  let joinCode = generateJoinCode();
  while (db.prepare('SELECT 1 FROM rooms WHERE join_code = ?').get(joinCode)) {
    joinCode = generateJoinCode();
  }

  // Insert room
  const insertRoom = db.prepare(`
    INSERT INTO rooms (id, name, logo, address, phone, default_language, join_code, join_approval_required, created_by_user_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertRoom.run(
    roomId,
    data.name.trim(),
    data.logo ?? null,
    data.address.trim(),
    data.phone.trim(),
    data.default_language || 'bn',
    joinCode,
    1, // Default requires owner approval
    creatorId,
    now,
    now
  );

  // Add user as OWNER with status ACTIVE
  const memberId = crypto.randomUUID();
  db.prepare(`
    INSERT INTO room_members (id, room_id, user_id, role, status, created_at, updated_at)
    VALUES (?, ?, ?, 'OWNER', 'ACTIVE', ?, ?)
  `).run(memberId, roomId, creatorId, now, now);

  // Audit log
  addAuditLog({
    roomId,
    userId: creatorId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'ROOM_CREATE',
    details: { roomName: data.name, joinCode },
    ipAddress: actor.ip ?? null,
  });

  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow;
}

export function getRoomById(roomId: string): RoomRow | null {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId) as RoomRow | undefined;
  return room || null;
}

export function getRoomByJoinCode(joinCode: string): RoomRow | null {
  const db = getDb();
  const room = db.prepare('SELECT * FROM rooms WHERE join_code = ?').get(joinCode.trim().toUpperCase()) as RoomRow | undefined;
  return room || null;
}

export function getUserRooms(userId: string): Array<RoomRow & { role: RoleType; member_status: MemberStatus }> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT r.*, rm.role, rm.status as member_status
    FROM rooms r
    JOIN room_members rm ON r.id = rm.room_id
    WHERE rm.user_id = ?
    ORDER BY rm.created_at DESC
  `).all(userId) as any[];

  return rows.map((r) => ({
    ...r,
    join_approval_required: Number(r.join_approval_required),
  }));
}

export function getRoomMember(roomId: string, userId: string): RoomMemberRow | null {
  const db = getDb();
  const member = db.prepare(`
    SELECT rm.*, u.name as user_name, u.email as user_email, u.picture as user_picture
    FROM room_members rm
    JOIN users u ON rm.user_id = u.id
    WHERE rm.room_id = ? AND rm.user_id = ?
  `).get(roomId, userId) as RoomMemberRow | undefined;
  return member || null;
}

export function getRoomMembers(roomId: string): RoomMemberRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT rm.*, u.name as user_name, u.email as user_email, u.picture as user_picture
    FROM room_members rm
    JOIN users u ON rm.user_id = u.id
    WHERE rm.room_id = ?
    ORDER BY 
      CASE rm.role 
        WHEN 'OWNER' THEN 1 
        WHEN 'MANAGER' THEN 2 
        WHEN 'STAFF' THEN 3 
        WHEN 'VIEWER' THEN 4 
      END,
      rm.created_at ASC
  `).all(roomId) as any[];
  return rows;
}

export function regenerateRoomJoinCode(
  roomId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): string {
  const db = getDb();
  let newCode = generateJoinCode();
  while (db.prepare('SELECT 1 FROM rooms WHERE join_code = ?').get(newCode)) {
    newCode = generateJoinCode();
  }

  const now = Date.now();
  db.prepare('UPDATE rooms SET join_code = ?, updated_at = ? WHERE id = ?').run(newCode, now, roomId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'ROOM_ID_REGENERATE',
    details: { newJoinCode: newCode },
    ipAddress: actor.ip,
  });

  return newCode;
}

export function updateRoomSettings(
  roomId: string,
  data: {
    name?: string;
    logo?: string | null;
    address?: string;
    phone?: string;
    default_language?: 'bn' | 'en';
    join_approval_required?: boolean;
    day_start_time?: string;
    day_end_time?: string;
    night_start_time?: string;
    night_end_time?: string;
    buffer_enabled?: boolean;
    buffer_minutes?: number;
    email?: string | null;
    primary_color?: string | null;
    logo_scale?: number;
  },
  actor: { userId: string; email: string; name: string; ip?: string }
): RoomRow {
  const db = getDb();
  const current = getRoomById(roomId);
  if (!current) throw new Error('Room not found');

  const name = data.name !== undefined ? data.name.trim() : current.name;
  const logo = data.logo !== undefined ? data.logo : current.logo;
  const address = data.address !== undefined ? data.address.trim() : current.address;
  const phone = data.phone !== undefined ? data.phone.trim() : current.phone;
  const email = data.email !== undefined ? (data.email ? data.email.trim() : null) : (current.email ?? null);
  const primaryColor = data.primary_color !== undefined ? (data.primary_color ? data.primary_color.trim() : null) : (current.primary_color ?? null);
  const logoScale = data.logo_scale !== undefined ? Number(data.logo_scale) : (current.logo_scale ?? 1.0);
  const defaultLang = data.default_language !== undefined ? data.default_language : current.default_language;
  const approvalRequired =
    data.join_approval_required !== undefined
      ? data.join_approval_required ? 1 : 0
      : current.join_approval_required;

  const dayStart = data.day_start_time !== undefined ? data.day_start_time : (current.day_start_time || '08:00');
  const dayEnd = data.day_end_time !== undefined ? data.day_end_time : (current.day_end_time || '16:00');
  const nightStart = data.night_start_time !== undefined ? data.night_start_time : (current.night_start_time || '18:00');
  const nightEnd = data.night_end_time !== undefined ? data.night_end_time : (current.night_end_time || '00:00');
  const bufferEnabled =
    data.buffer_enabled !== undefined
      ? data.buffer_enabled ? 1 : 0
      : (current.buffer_enabled ?? 0);
  const bufferMinutes = data.buffer_minutes !== undefined ? data.buffer_minutes : (current.buffer_minutes ?? 60);

  const now = Date.now();
  db.prepare(`
    UPDATE rooms 
    SET name = ?, logo = ?, address = ?, phone = ?, email = ?, primary_color = ?, logo_scale = ?, default_language = ?, join_approval_required = ?,
        day_start_time = ?, day_end_time = ?, night_start_time = ?, night_end_time = ?,
        buffer_enabled = ?, buffer_minutes = ?, updated_at = ?
    WHERE id = ?
  `).run(
    name, logo, address, phone, email, primaryColor, logoScale, defaultLang, approvalRequired,
    dayStart, dayEnd, nightStart, nightEnd,
    bufferEnabled, bufferMinutes, now, roomId
  );

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'SETTINGS_UPDATE',
    details: {
      name,
      address,
      phone,
      default_language: defaultLang,
      join_approval_required: Boolean(approvalRequired),
      day_start_time: dayStart,
      day_end_time: dayEnd,
      night_start_time: nightStart,
      night_end_time: nightEnd,
      buffer_enabled: Boolean(bufferEnabled),
      buffer_minutes: bufferMinutes,
    },
    ipAddress: actor.ip,
  });

  return getRoomById(roomId)!;
}

// ======================== Member Actions & Safety ========================

export function updateMemberRole(
  roomId: string,
  targetUserId: string,
  newRole: RoleType,
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  const db = getDb();
  const targetMember = getRoomMember(roomId, targetUserId);
  if (!targetMember) throw new Error('Member not found in this room');

  // Safety: A room must never end up without an Owner!
  // If target is OWNER and newRole is not OWNER, check how many owners exist
  if (targetMember.role === 'OWNER' && newRole !== 'OWNER') {
    const ownerCount = db.prepare(`
      SELECT COUNT(*) as count FROM room_members 
      WHERE room_id = ? AND role = 'OWNER' AND status = 'ACTIVE'
    `).get(roomId) as { count: number };

    if (ownerCount.count <= 1) {
      throw new Error('Safety violation: A room must never end up without an Owner.');
    }
  }

  // Safety: The Owner cannot be demoted by anyone else
  if (targetMember.role === 'OWNER' && targetUserId !== actor.userId) {
    throw new Error('Permission denied: The Owner cannot be demoted by another member.');
  }

  const now = Date.now();
  db.prepare(`
    UPDATE room_members 
    SET role = ?, updated_at = ? 
    WHERE room_id = ? AND user_id = ?
  `).run(newRole, now, roomId, targetUserId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'ROLE_CHANGE',
    details: {
      targetUserId,
      targetUserEmail: targetMember.user_email,
      targetUserName: targetMember.user_name,
      previousRole: targetMember.role,
      newRole,
    },
    ipAddress: actor.ip,
  });
}

export function removeMember(
  roomId: string,
  targetUserId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  const db = getDb();
  const targetMember = getRoomMember(roomId, targetUserId);
  if (!targetMember) throw new Error('Member not found in this room');

  // Safety: The Owner cannot be removed by anyone else, and room cannot lose sole owner
  if (targetMember.role === 'OWNER') {
    const ownerCount = db.prepare(`
      SELECT COUNT(*) as count FROM room_members 
      WHERE room_id = ? AND role = 'OWNER' AND status = 'ACTIVE'
    `).get(roomId) as { count: number };

    if (ownerCount.count <= 1) {
      throw new Error('Safety violation: The sole Owner cannot be removed from the room.');
    }
    if (targetUserId !== actor.userId) {
      throw new Error('Permission denied: The Owner cannot be removed by another member.');
    }
  }

  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'MEMBER_REMOVE',
    details: {
      targetUserId,
      targetUserEmail: targetMember.user_email,
      targetUserName: targetMember.user_name,
      role: targetMember.role,
    },
    ipAddress: actor.ip,
  });
}

export function approveJoinRequest(
  roomId: string,
  targetUserId: string,
  assignedRole: RoleType = 'STAFF',
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  const db = getDb();
  const targetMember = getRoomMember(roomId, targetUserId);
  if (!targetMember) throw new Error('Join request not found');

  const now = Date.now();
  db.prepare(`
    UPDATE room_members 
    SET status = 'ACTIVE', role = ?, updated_at = ?
    WHERE room_id = ? AND user_id = ?
  `).run(assignedRole, now, roomId, targetUserId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'JOIN_APPROVE',
    details: {
      targetUserId,
      targetUserEmail: targetMember.user_email,
      targetUserName: targetMember.user_name,
      assignedRole,
    },
    ipAddress: actor.ip,
  });
}

export function rejectJoinRequest(
  roomId: string,
  targetUserId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  const db = getDb();
  const targetMember = getRoomMember(roomId, targetUserId);
  if (!targetMember) throw new Error('Join request not found');

  db.prepare('DELETE FROM room_members WHERE room_id = ? AND user_id = ?').run(roomId, targetUserId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'JOIN_REJECT',
    details: {
      targetUserId,
      targetUserEmail: targetMember.user_email,
      targetUserName: targetMember.user_name,
    },
    ipAddress: actor.ip,
  });
}

// ======================== Rate Limiting ========================

export function recordJoinAttempt(data: {
  ipAddress: string;
  userId?: string | null;
  attemptedCode: string;
}): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO join_attempts (id, ip_address, user_id, attempted_code, attempt_time)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, data.ipAddress, data.userId || null, data.attemptedCode.trim().toUpperCase(), Date.now());
}

export function checkJoinRateLimit(data: {
  ipAddress: string;
  userId?: string | null;
}): { isLocked: boolean; remainingSeconds: number } {
  const db = getDb();
  const config = getConfig();
  const maxAttempts = config.JOIN_RATE_LIMIT_MAX_ATTEMPTS;
  const lockoutMs = config.JOIN_LOCKOUT_MINUTES * 60 * 1000;
  const cutoffTime = Date.now() - lockoutMs;

  let query = 'SELECT attempt_time FROM join_attempts WHERE attempt_time > ? AND (ip_address = ?';
  const params: any[] = [cutoffTime, data.ipAddress];

  if (data.userId) {
    query += ' OR user_id = ?';
    params.push(data.userId);
  }
  query += ') ORDER BY attempt_time DESC';

  const rows = db.prepare(query).all(...params) as { attempt_time: number }[];

  if (rows.length >= maxAttempts) {
    const oldestInWindow = rows[rows.length - 1].attempt_time;
    const lockoutExpiresAt = oldestInWindow + lockoutMs;
    const remainingMs = lockoutExpiresAt - Date.now();
    const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));

    return { isLocked: true, remainingSeconds };
  }

  return { isLocked: false, remainingSeconds: 0 };
}

// ======================== Audit Logs ========================

export interface AuditLogRow {
  id: string;
  room_id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  action: string;
  details: string;
  ip_address: string | null;
  created_at: number;
}

export function addAuditLog(data: {
  roomId: string;
  userId: string;
  userEmail: string;
  userName: string;
  action: string;
  details: Record<string, any>;
  ipAddress?: string | null;
}): void {
  const db = getDb();
  const id = crypto.randomUUID();
  const safeDetails = sanitizeAuditDetails(data.details || {});
  db.prepare(`
    INSERT INTO audit_logs (id, room_id, user_id, user_email, user_name, action, details, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    data.roomId,
    data.userId,
    data.userEmail,
    data.userName,
    data.action,
    JSON.stringify(safeDetails),
    data.ipAddress || null,
    Date.now()
  );
}

export function maskSensitiveValue(key: string, val: any): any {
  if (typeof val !== 'string') return val;
  const lowerKey = key.toLowerCase();
  if (lowerKey.includes('phone') || lowerKey.includes('mobile')) {
    const clean = val.trim();
    if (clean.length <= 4) return '****';
    return `****${clean.slice(-4)}`;
  }
  if (lowerKey.includes('reference') || lowerKey === 'ref' || lowerKey.includes('trx')) {
    const clean = val.trim();
    if (!clean) return clean;
    if (clean.length <= 3) return '***';
    return `***${clean.slice(-3)}`;
  }
  return val;
}

export function sanitizeAuditDetails(obj: Record<string, any>): Record<string, any> {
  if (!obj || typeof obj !== 'object') return obj;
  const out: Record<string, any> = Array.isArray(obj) ? [] : {};
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object') {
      out[k] = sanitizeAuditDetails(v);
    } else {
      out[k] = maskSensitiveValue(k, v);
    }
  }
  return out;
}

export interface AuditLogFilter {
  userId?: string;
  action?: string;
  dateFrom?: string; // YYYY-MM-DD in Asia/Dhaka
  dateTo?: string;   // YYYY-MM-DD in Asia/Dhaka
  limit?: number;
  offset?: number;
}

export function getRoomAuditLogs(
  roomId: string,
  limitOrFilter: number | AuditLogFilter = 50,
  offsetArg = 0
): AuditLogRow[] {
  const db = getDb();
  const filter: AuditLogFilter =
    typeof limitOrFilter === 'number'
      ? { limit: limitOrFilter, offset: offsetArg }
      : limitOrFilter;

  let where = 'WHERE room_id = ?';
  const params: any[] = [roomId];

  if (filter.userId && filter.userId.trim()) {
    where += ' AND user_id = ?';
    params.push(filter.userId.trim());
  }

  if (filter.action && filter.action.trim()) {
    where += ' AND action = ?';
    params.push(filter.action.trim());
  }

  if (filter.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(filter.dateFrom)) {
    const startMs = new Date(`${filter.dateFrom}T00:00:00.000+06:00`).getTime();
    where += ' AND created_at >= ?';
    params.push(startMs);
  }

  if (filter.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filter.dateTo)) {
    const endMs = new Date(`${filter.dateTo}T23:59:59.999+06:00`).getTime();
    where += ' AND created_at <= ?';
    params.push(endMs);
  }

  const limit = Math.min(200, Math.max(1, filter.limit || 50));
  const offset = Math.max(0, filter.offset || 0);

  const rows = db.prepare(`
    SELECT * FROM audit_logs 
    ${where}
    ORDER BY created_at DESC 
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as AuditLogRow[];
  return rows;
}

// ======================== Part 2: Halls, Customers, Bookings & Slot System ========================

export type SlotType = 'DAY' | 'NIGHT' | 'FULL';
export type EventType = 'WEDDING' | 'HOLUD' | 'RECEPTION' | 'ENGAGEMENT' | 'BIRTHDAY' | 'AQIQAH' | 'MEETING' | 'OTHER';
export type BookingStatus = 'TENTATIVE' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';

export interface HallRow {
  id: string;
  room_id: string;
  name: string;
  capacity: number;
  day_price: number;
  night_price: number;
  full_price: number;
  photos: string[];
  facilities: string[];
  is_active: number;
  is_demo: number;
  created_at: number;
  updated_at: number;
  booking_count?: number;
}

export interface CustomerRow {
  id: string;
  room_id: string;
  name: string;
  phone: string;
  alt_phone: string | null;
  address: string | null;
  notes: string | null;
  is_demo: number;
  created_at: number;
  updated_at: number;
  booking_count?: number;
}

export interface ExtraServiceItem {
  type: 'CATERING' | 'DECORATION' | 'SOUND' | 'LIGHTING' | 'OTHER';
  label: string;
  amount: number;
}

export interface BookingRow {
  id: string;
  room_id: string;
  booking_number: string;
  customer_id: string;
  hall_id: string;
  event_type: EventType;
  event_date: string; // YYYY-MM-DD
  slot: SlotType;
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
  guest_count: number;
  package_name: string | null;
  extra_services: ExtraServiceItem[];
  base_price: number;
  hall_rent: number;
  extra_services_amount: number;
  total_amount: number;
  advance_amount: number;
  due_amount: number;
  status: BookingStatus;
  hold_expires_at: number | null;
  cancel_reason: string | null;
  cancelled_at: number | null;
  cancelled_by_user_id: string | null;
  notes: string | null;
  idempotency_key: string | null;
  is_demo: number;
  created_by_user_id: string;
  created_by_name: string;
  created_at: number;
  updated_at: number;
  customer_name?: string;
  customer_phone?: string;
  customer_alt_phone?: string | null;
  customer_address?: string | null;
  hall_name?: string;
  hall_capacity?: number;
}

export interface BookingHistoryRow {
  id: string;
  booking_id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  action: string;
  changes: Record<string, any>;
  created_at: number;
}

function parseJsonArray<T = any>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mapHallRow(r: any): HallRow {
  return {
    ...r,
    capacity: Number(r.capacity),
    day_price: Number(r.day_price),
    night_price: Number(r.night_price),
    full_price: Number(r.full_price),
    photos: parseJsonArray<string>(r.photos),
    facilities: parseJsonArray<string>(r.facilities),
    is_active: Number(r.is_active),
    is_demo: Number(r.is_demo || 0),
    booking_count: r.booking_count !== undefined ? Number(r.booking_count) : undefined,
  };
}

function mapBookingRow(r: any): BookingRow {
  return {
    ...r,
    guest_count: Number(r.guest_count),
    extra_services: parseJsonArray<ExtraServiceItem>(r.extra_services),
    base_price: Number(r.base_price),
    hall_rent: Number(r.hall_rent),
    extra_services_amount: Number(r.extra_services_amount),
    total_amount: Number(r.total_amount),
    advance_amount: Number(r.advance_amount),
    due_amount: Number(r.due_amount),
    hold_expires_at: r.hold_expires_at ? Number(r.hold_expires_at) : null,
    cancelled_at: r.cancelled_at ? Number(r.cancelled_at) : null,
    is_demo: Number(r.is_demo || 0),
  };
}

export function stripMoneyFromBooking(booking: BookingRow, role: RoleType): Partial<BookingRow> {
  if (role === 'OWNER' || role === 'MANAGER') {
    return booking;
  }
  const copy: any = { ...booking };
  delete copy.base_price;
  delete copy.hall_rent;
  delete copy.extra_services_amount;
  delete copy.total_amount;
  delete copy.advance_amount;
  delete copy.due_amount;
  if (Array.isArray(copy.extra_services)) {
    copy.extra_services = copy.extra_services.map((s: any) => ({ type: s.type, label: s.label }));
  }
  return copy;
}

export function stripMoneyFromCustomerBookings(bookings: BookingRow[], role: RoleType): any[] {
  if (role === 'OWNER' || role === 'MANAGER') {
    return bookings;
  }
  return bookings.map((b) => {
    const copy: any = { ...b };
    delete copy.base_price;
    delete copy.hall_rent;
    delete copy.extra_services_amount;
    delete copy.total_amount;
    delete copy.advance_amount;
    delete copy.due_amount;
    if (Array.isArray(copy.extra_services)) {
      copy.extra_services = copy.extra_services.map((s: any) => ({ type: s.type, label: s.label }));
    }
    return copy;
  });
}

// ======================== Halls Repository ========================

export function createHall(
  roomId: string,
  data: {
    name: string;
    capacity: number;
    day_price: number;
    night_price: number;
    full_price: number;
    photos?: string[];
    facilities?: string[];
    is_active?: boolean;
    is_demo?: boolean;
  },
  actor: { userId: string; email: string; name: string; ip?: string }
): HallRow {
  const db = getDb();
  const now = Date.now();
  const id = crypto.randomUUID();

  db.prepare(`
    INSERT INTO halls (id, room_id, name, capacity, day_price, night_price, full_price, photos, facilities, is_active, is_demo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    roomId,
    data.name.trim(),
    Math.max(1, Math.floor(data.capacity)),
    Math.max(0, data.day_price),
    Math.max(0, data.night_price),
    Math.max(0, data.full_price),
    JSON.stringify(data.photos || []),
    JSON.stringify(data.facilities || []),
    data.is_active !== false ? 1 : 0,
    data.is_demo ? 1 : 0,
    now,
    now
  );

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'HALL_CREATE',
    details: { hallId: id, name: data.name, capacity: data.capacity, day_price: data.day_price, night_price: data.night_price, full_price: data.full_price },
    ipAddress: actor.ip,
  });

  return getHallById(roomId, id)!;
}

export function getHallById(roomId: string, hallId: string): HallRow | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT h.*, (SELECT COUNT(*) FROM bookings b WHERE b.hall_id = h.id) as booking_count
    FROM halls h
    WHERE h.id = ? AND h.room_id = ?
  `).get(hallId, roomId) as any;
  return row ? mapHallRow(row) : null;
}

export function getRoomHalls(roomId: string, includeInactive = true): HallRow[] {
  const db = getDb();
  let query = `
    SELECT h.*, (SELECT COUNT(*) FROM bookings b WHERE b.hall_id = h.id) as booking_count
    FROM halls h
    WHERE h.room_id = ?
  `;
  if (!includeInactive) {
    query += ' AND h.is_active = 1';
  }
  query += ' ORDER BY h.is_active DESC, h.created_at ASC';
  const rows = db.prepare(query).all(roomId) as any[];
  return rows.map(mapHallRow);
}

export function updateHall(
  roomId: string,
  hallId: string,
  data: {
    name?: string;
    capacity?: number;
    day_price?: number;
    night_price?: number;
    full_price?: number;
    photos?: string[];
    facilities?: string[];
    is_active?: boolean;
  },
  actor: { userId: string; email: string; name: string; ip?: string }
): HallRow {
  const db = getDb();
  const current = getHallById(roomId, hallId);
  if (!current) {
    throw new Error('HALL_NOT_FOUND');
  }

  const name = data.name !== undefined ? data.name.trim() : current.name;
  const capacity = data.capacity !== undefined ? Math.max(1, Math.floor(data.capacity)) : current.capacity;
  const dayPrice = data.day_price !== undefined ? Math.max(0, data.day_price) : current.day_price;
  const nightPrice = data.night_price !== undefined ? Math.max(0, data.night_price) : current.night_price;
  const fullPrice = data.full_price !== undefined ? Math.max(0, data.full_price) : current.full_price;
  const photos = data.photos !== undefined ? data.photos : current.photos;
  const facilities = data.facilities !== undefined ? data.facilities : current.facilities;
  const isActive = data.is_active !== undefined ? (data.is_active ? 1 : 0) : current.is_active;

  const now = Date.now();
  db.prepare(`
    UPDATE halls
    SET name = ?, capacity = ?, day_price = ?, night_price = ?, full_price = ?, photos = ?, facilities = ?, is_active = ?, updated_at = ?
    WHERE id = ? AND room_id = ?
  `).run(
    name,
    capacity,
    dayPrice,
    nightPrice,
    fullPrice,
    JSON.stringify(photos),
    JSON.stringify(facilities),
    isActive,
    now,
    hallId,
    roomId
  );

  const priceChanged =
    dayPrice !== current.day_price ||
    nightPrice !== current.night_price ||
    fullPrice !== current.full_price;

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: priceChanged ? 'HALL_PRICE_CHANGE' : 'HALL_UPDATE',
    details: {
      hallId,
      name,
      previousPrices: { day: current.day_price, night: current.night_price, full: current.full_price },
      newPrices: { day: dayPrice, night: nightPrice, full: fullPrice },
      is_active: Boolean(isActive),
    },
    ipAddress: actor.ip,
  });

  return getHallById(roomId, hallId)!;
}

export function deleteOrDeactivateHall(
  roomId: string,
  hallId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): { deleted: boolean; deactivated: boolean } {
  const db = getDb();
  const hall = getHallById(roomId, hallId);
  if (!hall) throw new Error('HALL_NOT_FOUND');

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM bookings WHERE hall_id = ? AND room_id = ?').get(hallId, roomId) as { cnt: number };
  if (countRow.cnt > 0) {
    // Rule: A hall with bookings can NEVER be hard-deleted (deactivate instead)
    db.prepare('UPDATE halls SET is_active = 0, updated_at = ? WHERE id = ? AND room_id = ?').run(Date.now(), hallId, roomId);
    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'HALL_DEACTIVATE',
      details: { hallId, name: hall.name, reason: 'Hall has existing bookings; soft-deactivated instead of hard delete.' },
      ipAddress: actor.ip,
    });
    return { deleted: false, deactivated: true };
  }

  db.prepare('DELETE FROM halls WHERE id = ? AND room_id = ?').run(hallId, roomId);
  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'HALL_DELETE',
    details: { hallId, name: hall.name },
    ipAddress: actor.ip,
  });
  return { deleted: true, deactivated: false };
}

// ======================== Customers Repository ========================

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s\-()]/g, '').trim();
}

export function findCustomerByPhone(roomId: string, phone: string): CustomerRow | null {
  const db = getDb();
  const norm = normalizePhone(phone);
  if (!norm) return null;
  const rows = db.prepare('SELECT * FROM customers WHERE room_id = ?').all(roomId) as CustomerRow[];
  const match = rows.find((c) => normalizePhone(c.phone) === norm || (c.alt_phone && normalizePhone(c.alt_phone) === norm));
  return match || null;
}

export function createCustomer(
  roomId: string,
  data: {
    name: string;
    phone: string;
    alt_phone?: string | null;
    address?: string | null;
    notes?: string | null;
    is_demo?: boolean;
    forceCreate?: boolean;
  },
  actor: { userId: string; email: string; name: string; ip?: string }
): { customer: CustomerRow; existingSuggested: boolean } {
  const db = getDb();
  const existing = findCustomerByPhone(roomId, data.phone);
  if (existing && !data.forceCreate) {
    const err: any = new Error('DUPLICATE_CUSTOMER_PHONE');
    err.existingCustomer = existing;
    throw err;
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO customers (id, room_id, name, phone, alt_phone, address, notes, is_demo, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    roomId,
    data.name.trim(),
    data.phone.trim(),
    data.alt_phone ? data.alt_phone.trim() : null,
    data.address ? data.address.trim() : null,
    data.notes ? data.notes.trim() : null,
    data.is_demo ? 1 : 0,
    now,
    now
  );

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'CUSTOMER_CREATE',
    details: { customerId: id, name: data.name, phone: data.phone },
    ipAddress: actor.ip,
  });

  return { customer: getCustomerById(roomId, id)!, existingSuggested: false };
}

export function getCustomerById(roomId: string, customerId: string): CustomerRow | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) as booking_count
    FROM customers c
    WHERE c.id = ? AND c.room_id = ?
  `).get(customerId, roomId) as any;
  if (!row) return null;
  return {
    ...row,
    is_demo: Number(row.is_demo || 0),
    booking_count: Number(row.booking_count || 0),
  };
}

export function getRoomCustomers(roomId: string, search?: string, limit = 100, offset = 0): { customers: CustomerRow[]; total: number } {
  const db = getDb();
  let where = 'WHERE c.room_id = ?';
  const params: any[] = [roomId];

  if (search && search.trim()) {
    const q = `%${search.trim()}%`;
    where += ' AND (c.name LIKE ? OR c.phone LIKE ? OR c.alt_phone LIKE ?)';
    params.push(q, q, q);
  }

  const totalRow = db.prepare(`SELECT COUNT(*) as cnt FROM customers c ${where}`).get(...params) as { cnt: number };
  const rows = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM bookings b WHERE b.customer_id = c.id) as booking_count
    FROM customers c
    ${where}
    ORDER BY c.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  return {
    total: totalRow.cnt,
    customers: rows.map((r) => ({
      ...r,
      is_demo: Number(r.is_demo || 0),
      booking_count: Number(r.booking_count || 0),
    })),
  };
}

export function updateCustomer(
  roomId: string,
  customerId: string,
  data: {
    name?: string;
    phone?: string;
    alt_phone?: string | null;
    address?: string | null;
    notes?: string | null;
  },
  actor: { userId: string; email: string; name: string; ip?: string }
): CustomerRow {
  const db = getDb();
  const current = getCustomerById(roomId, customerId);
  if (!current) throw new Error('CUSTOMER_NOT_FOUND');

  if (data.phone && normalizePhone(data.phone) !== normalizePhone(current.phone)) {
    const dup = findCustomerByPhone(roomId, data.phone);
    if (dup && dup.id !== customerId) {
      const err: any = new Error('DUPLICATE_CUSTOMER_PHONE');
      err.existingCustomer = dup;
      throw err;
    }
  }

  const name = data.name !== undefined ? data.name.trim() : current.name;
  const phone = data.phone !== undefined ? data.phone.trim() : current.phone;
  const altPhone = data.alt_phone !== undefined ? (data.alt_phone ? data.alt_phone.trim() : null) : current.alt_phone;
  const address = data.address !== undefined ? (data.address ? data.address.trim() : null) : current.address;
  const notes = data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : current.notes;

  db.prepare(`
    UPDATE customers
    SET name = ?, phone = ?, alt_phone = ?, address = ?, notes = ?, updated_at = ?
    WHERE id = ? AND room_id = ?
  `).run(name, phone, altPhone, address, notes, Date.now(), customerId, roomId);

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'CUSTOMER_UPDATE',
    details: { customerId, name, phone },
    ipAddress: actor.ip,
  });

  return getCustomerById(roomId, customerId)!;
}

export function deleteCustomer(
  roomId: string,
  customerId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): void {
  const db = getDb();
  const customer = getCustomerById(roomId, customerId);
  if (!customer) throw new Error('CUSTOMER_NOT_FOUND');

  const countRow = db.prepare('SELECT COUNT(*) as cnt FROM bookings WHERE customer_id = ? AND room_id = ?').get(customerId, roomId) as { cnt: number };
  if (countRow.cnt > 0) {
    throw new Error('CUSTOMER_HAS_BOOKINGS');
  }

  db.prepare('DELETE FROM customers WHERE id = ? AND room_id = ?').run(customerId, roomId);
  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'CUSTOMER_DELETE',
    details: { customerId, name: customer.name, phone: customer.phone },
    ipAddress: actor.ip,
  });
}

// ======================== Bookings & DAY/NIGHT/FULL Slot Engine ========================

/**
 * Releases expired tentative holds in a room before availability checks or queries.
 * When a tentative hold expires, its status becomes CANCELLED (with reason 'Hold Expired'),
 * its booking_slot_locks are deleted, and an audit log + history entry is written.
 */
export function releaseExpiredTentativeBookings(roomId: string): number {
  const db = getDb();
  const now = Date.now();
  const expired = db.prepare(`
    SELECT * FROM bookings
    WHERE room_id = ? AND status = 'TENTATIVE' AND hold_expires_at IS NOT NULL AND hold_expires_at <= ?
  `).all(roomId, now) as any[];

  if (expired.length === 0) return 0;

  for (const b of expired) {
    db.prepare('DELETE FROM booking_slot_locks WHERE booking_id = ?').run(b.id);
    db.prepare(`
      UPDATE bookings
      SET status = 'CANCELLED', cancel_reason = 'Tentative Hold Expired / অস্থায়ী বুকিংয়ের মেয়াদ উত্তীর্ণ', cancelled_at = ?, updated_at = ?
      WHERE id = ?
    `).run(now, now, b.id);

    db.prepare(`
      INSERT INTO booking_history (id, booking_id, room_id, user_id, user_name, user_email, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'HOLD_EXPIRED', ?, ?)
    `).run(
      crypto.randomUUID(),
      b.id,
      roomId,
      b.created_by_user_id,
      'System Auto-Expiry',
      'system@lilycc.local',
      JSON.stringify({ previousStatus: 'TENTATIVE', newStatus: 'CANCELLED', hold_expires_at: b.hold_expires_at }),
      now
    );

    addAuditLog({
      roomId,
      userId: b.created_by_user_id,
      userEmail: 'system@lilycc.local',
      userName: 'System Auto-Expiry',
      action: 'BOOKING_HOLD_EXPIRED',
      details: { bookingId: b.id, bookingNumber: b.booking_number, eventDate: b.event_date, slot: b.slot },
    });
  }

  return expired.length;
}

export function getLockedSlotsForChoice(slot: SlotType): Array<'DAY' | 'NIGHT'> {
  if (slot === 'DAY') return ['DAY'];
  if (slot === 'NIGHT') return ['NIGHT'];
  return ['DAY', 'NIGHT'];
}

export function getHallBasePriceForSlot(hall: HallRow, slot: SlotType): number {
  if (slot === 'DAY') return hall.day_price;
  if (slot === 'NIGHT') return hall.night_price;
  return hall.full_price;
}

export interface SlotAvailabilityInfo {
  hall_id: string;
  hall_name: string;
  event_date: string;
  availability_state: 'BOTH_FREE' | 'DAY_ONLY_FREE' | 'NIGHT_ONLY_FREE' | 'FULLY_BOOKED';
  day_free: boolean;
  night_free: boolean;
  full_free: boolean;
  day_holder: {
    booking_id: string;
    booking_number: string;
    customer_name: string;
    slot: SlotType;
    status: BookingStatus;
    start_time: string;
    end_time: string;
  } | null;
  night_holder: {
    booking_id: string;
    booking_number: string;
    customer_name: string;
    slot: SlotType;
    status: BookingStatus;
    start_time: string;
    end_time: string;
  } | null;
}

export function checkHallDateAvailability(
  roomId: string,
  hallId: string,
  eventDate: string,
  excludeBookingId?: string
): SlotAvailabilityInfo {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();
  const hall = getHallById(roomId, hallId);
  if (!hall) throw new Error('HALL_NOT_FOUND');

  let query = `
    SELECT l.locked_slot, b.id as booking_id, b.booking_number, b.slot, b.status, b.start_time, b.end_time, c.name as customer_name
    FROM booking_slot_locks l
    JOIN bookings b ON l.booking_id = b.id
    JOIN customers c ON b.customer_id = c.id
    WHERE l.room_id = ? AND l.hall_id = ? AND l.event_date = ?
  `;
  const params: any[] = [roomId, hallId, eventDate];
  if (excludeBookingId) {
    query += ' AND l.booking_id != ?';
    params.push(excludeBookingId);
  }

  const locks = db.prepare(query).all(...params) as any[];
  const dayLock = locks.find((l) => l.locked_slot === 'DAY') || null;
  const nightLock = locks.find((l) => l.locked_slot === 'NIGHT') || null;

  const dayFree = !dayLock;
  const nightFree = !nightLock;
  const fullFree = dayFree && nightFree;

  let availabilityState: 'BOTH_FREE' | 'DAY_ONLY_FREE' | 'NIGHT_ONLY_FREE' | 'FULLY_BOOKED';
  if (dayFree && nightFree) {
    availabilityState = 'BOTH_FREE';
  } else if (dayFree && !nightFree) {
    availabilityState = 'DAY_ONLY_FREE';
  } else if (!dayFree && nightFree) {
    availabilityState = 'NIGHT_ONLY_FREE';
  } else {
    availabilityState = 'FULLY_BOOKED';
  }

  return {
    hall_id: hall.id,
    hall_name: hall.name,
    event_date: eventDate,
    availability_state: availabilityState,
    day_free: dayFree,
    night_free: nightFree,
    full_free: fullFree,
    day_holder: dayLock
      ? {
          booking_id: dayLock.booking_id,
          booking_number: dayLock.booking_number,
          customer_name: dayLock.customer_name,
          slot: dayLock.slot,
          status: dayLock.status,
          start_time: dayLock.start_time,
          end_time: dayLock.end_time,
        }
      : null,
    night_holder: nightLock
      ? {
          booking_id: nightLock.booking_id,
          booking_number: nightLock.booking_number,
          customer_name: nightLock.customer_name,
          slot: nightLock.slot,
          status: nightLock.status,
          start_time: nightLock.start_time,
          end_time: nightLock.end_time,
        }
      : null,
  };
}

export function validateBookingTimesAndBuffer(
  room: RoomRow,
  hallId: string,
  eventDate: string,
  slot: SlotType,
  startTime: string,
  endTime: string,
  excludeBookingId?: string
): { valid: boolean; errorBn?: string; errorEn?: string; bufferWarningBn?: string; bufferWarningEn?: string } {
  const [sh, sm] = startTime.split(':').map(Number);
  const [eh, em] = endTime.split(':').map(Number);
  if (isNaN(sh) || isNaN(sm) || isNaN(eh) || isNaN(em)) {
    return {
      valid: false,
      errorBn: 'শুরু এবং শেষের সময় সঠিক নয়।',
      errorEn: 'Invalid start or end time format.',
    };
  }

  const startMins = sh * 60 + sm;
  let endMins = eh * 60 + em;

  if (slot === 'DAY') {
    // Day slot cannot cross midnight and must have end > start
    if (endMins <= startMins) {
      return {
        valid: false,
        errorBn: 'দিনের (Day) স্লটে শেষের সময় অবশ্যই শুরুর সময়ের পরে হতে হবে।',
        errorEn: 'For a Day slot, end time must be after start time.',
      };
    }
  } else {
    // NIGHT or FULL slot may end at midnight (00:00) or after midnight (e.g. 01:00 - 06:00 next day)
    if (endMins <= startMins) {
      // Crossing midnight is valid if end time is up to 06:00 AM next day (360 mins)
      if (endMins <= 360) {
        endMins += 24 * 60;
      } else {
        return {
          valid: false,
          errorBn: 'শেষের সময় অবশ্যই শুরুর সময়ের পরে হতে হবে।',
          errorEn: 'End time must be after start time.',
        };
      }
    }
  }

  // Check optional room buffer setting between Day and Night on the SAME date
  if (room.buffer_enabled === 1 && (slot === 'DAY' || slot === 'NIGHT')) {
    const avail = checkHallDateAvailability(room.id, hallId, eventDate, excludeBookingId);
    const reqBuffer = room.buffer_minutes || 60;

    if (slot === 'DAY' && avail.night_holder) {
      const [nsh, nsm] = avail.night_holder.start_time.split(':').map(Number);
      const nightStartMins = nsh * 60 + nsm;
      const gap = nightStartMins - endMins;
      if (gap < reqBuffer) {
        return {
          valid: false,
          errorBn: `দিন ও রাতের স্লটের মাঝে ন্যূনতম ${reqBuffer} মিনিটের বাফার (পরিষ্কার ও প্রস্তুতি বিরতি) প্রয়োজন। রাতের বুকিং শুরু হচ্ছে ${avail.night_holder.start_time} এ।`,
          errorEn: `A minimum buffer of ${reqBuffer} minutes between Day and Night slots is required. The existing Night booking starts at ${avail.night_holder.start_time}.`,
        };
      }
    } else if (slot === 'NIGHT' && avail.day_holder) {
      const [deh, dem] = avail.day_holder.end_time.split(':').map(Number);
      const dayEndMins = deh * 60 + dem;
      const gap = startMins - dayEndMins;
      if (gap < reqBuffer) {
        return {
          valid: false,
          errorBn: `দিন ও রাতের স্লটের মাঝে ন্যূনতম ${reqBuffer} মিনিটের বাফার (পরিষ্কার ও প্রস্তুতি বিরতি) প্রয়োজন। দিনের বুকিং শেষ হচ্ছে ${avail.day_holder.end_time} এ।`,
          errorEn: `A minimum buffer of ${reqBuffer} minutes between Day and Night slots is required. The existing Day booking ends at ${avail.day_holder.end_time}.`,
        };
      }
    }
  }

  return { valid: true };
}

function buildSlotConflictError(
  requestedSlot: SlotType,
  avail: SlotAvailabilityInfo
): Error {
  const slotNamesBn: Record<SlotType, string> = {
    DAY: 'দিন (Day)',
    NIGHT: 'রাত (Night)',
    FULL: 'দিন ও রাত (Full)',
  };
  const slotNamesEn: Record<SlotType, string> = {
    DAY: 'Day',
    NIGHT: 'Night',
    FULL: 'Full (Day & Night)',
  };

  const conflictingSlotsBn: string[] = [];
  const conflictingSlotsEn: string[] = [];
  const holders: string[] = [];

  if ((requestedSlot === 'DAY' || requestedSlot === 'FULL') && avail.day_holder) {
    conflictingSlotsBn.push(avail.day_holder.slot === 'FULL' ? 'দিন ও রাত (Full)' : 'দিন (Day)');
    conflictingSlotsEn.push(avail.day_holder.slot === 'FULL' ? 'Full (Day & Night)' : 'Day');
    holders.push(`${avail.day_holder.booking_number} (${avail.day_holder.customer_name})`);
  }
  if ((requestedSlot === 'NIGHT' || requestedSlot === 'FULL') && avail.night_holder) {
    if (!avail.day_holder || avail.night_holder.booking_id !== avail.day_holder.booking_id) {
      conflictingSlotsBn.push(avail.night_holder.slot === 'FULL' ? 'দিন ও রাত (Full)' : 'রাত (Night)');
      conflictingSlotsEn.push(avail.night_holder.slot === 'FULL' ? 'Full (Day & Night)' : 'Night');
      holders.push(`${avail.night_holder.booking_number} (${avail.night_holder.customer_name})`);
    }
  }

  const conflictBn = conflictingSlotsBn.join(' এবং ') || slotNamesBn[requestedSlot];
  const conflictEn = conflictingSlotsEn.join(' and ') || slotNamesEn[requestedSlot];
  const holderStr = holders.join(', ');

  const err: any = new Error(`Slot conflict: ${conflictEn} slot is already booked.`);
  err.code = 'SLOT_CONFLICT';
  err.status = 409;
  err.conflictingSlot = conflictEn;
  err.messageBn = `বুকিং সংঘর্ষ! এই হল ও তারিখে ${conflictBn} স্লটটি ইতোমধ্যে বুক করা আছে${holderStr ? ` [${holderStr}]` : ''}। অনুগ্রহ করে অন্য স্লট বা তারিখ নির্বাচন করুন।`;
  err.messageEn = `Slot conflict! The ${conflictEn} slot on this hall and date is already booked${holderStr ? ` by ${holderStr}` : ''}. Please choose another slot or date.`;
  return err;
}

function generateNextBookingNumber(db: DatabaseSync, roomId: string, year: number): string {
  // Atomic increment inside BEGIN IMMEDIATE transaction
  db.prepare(`
    INSERT INTO booking_counters (room_id, year, last_seq)
    VALUES (?, ?, 1)
    ON CONFLICT(room_id, year) DO UPDATE SET last_seq = last_seq + 1
  `).run(roomId, year);

  const row = db.prepare('SELECT last_seq FROM booking_counters WHERE room_id = ? AND year = ?').get(roomId, year) as { last_seq: number };
  let seq = row.last_seq;
  let candidate = `LCC-${year}-${String(seq).padStart(4, '0')}`;
  while (db.prepare('SELECT 1 FROM bookings WHERE booking_number = ?').get(candidate)) {
    seq++;
    db.prepare('UPDATE booking_counters SET last_seq = ? WHERE room_id = ? AND year = ?').run(seq, roomId, year);
    candidate = `LCC-${year}-${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

export function createBooking(
  roomId: string,
  data: {
    customer_id: string;
    hall_id: string;
    event_type: EventType;
    event_date: string;
    slot: SlotType;
    start_time?: string;
    end_time?: string;
    guest_count: number;
    package_name?: string | null;
    extra_services?: ExtraServiceItem[];
    hall_rent?: number;
    manager_price_approved?: boolean;
    advance_amount?: number;
    confirm_high_advance?: boolean;
    confirm_past_date?: boolean;
    status?: 'TENTATIVE' | 'CONFIRMED';
    hold_hours?: number | null;
    notes?: string | null;
    idempotency_key?: string | null;
    is_demo?: boolean;
  },
  actor: { userId: string; email: string; name: string; role: RoleType; ip?: string },
  todayYMD: string
): { booking: BookingRow; deduplicated: boolean } {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();

  // 1. Check idempotency key first (outside or inside transaction)
  const idemKey = data.idempotency_key ? data.idempotency_key.trim() : null;
  if (idemKey) {
    const existingByIdem = db.prepare('SELECT * FROM bookings WHERE room_id = ? AND idempotency_key = ?').get(roomId, idemKey) as any;
    if (existingByIdem) {
      return { booking: getBookingById(roomId, existingByIdem.id)!, deduplicated: true };
    }
  }

  const room = getRoomById(roomId);
  if (!room) throw new Error('ROOM_NOT_FOUND');

  const hall = getHallById(roomId, data.hall_id);
  if (!hall) {
    const err: any = new Error('Hall not found in this room');
    err.status = 404;
    err.messageBn = 'হলটি এই রুমে খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Hall not found in this room.';
    throw err;
  }
  if (hall.is_active !== 1) {
    const err: any = new Error('Hall is inactive');
    err.status = 400;
    err.messageBn = 'নিষ্ক্রিয় হলে নতুন বুকিং নেওয়া যাবে না।';
    err.messageEn = 'Cannot book an inactive hall.';
    throw err;
  }

  const customer = getCustomerById(roomId, data.customer_id);
  if (!customer) {
    const err: any = new Error('Customer not found in this room');
    err.status = 404;
    err.messageBn = 'গ্রাহককে এই রুমে খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Customer not found in this room.';
    throw err;
  }

  // Validate past date warning
  if (data.event_date < todayYMD && !data.confirm_past_date) {
    const err: any = new Error('Past date warning');
    err.code = 'PAST_DATE_WARNING';
    err.status = 400;
    err.messageBn = 'সতর্কতা: নির্বাচিত তারিখটি অতীতের। আপনি কি নিশ্চিতভাবে অতীতের তারিখে বুকিংটি সংরক্ষণ করতে চান?';
    err.messageEn = 'Warning: The selected event date is in the past. Please confirm if you want to proceed with a past date.';
    throw err;
  }

  // Validate guest count
  if (!Number.isInteger(data.guest_count) || data.guest_count < 1) {
    const err: any = new Error('Guest count must be at least 1');
    err.status = 400;
    err.messageBn = 'অতিথি সংখ্যা কমপক্ষে ১ জন হতে হবে।';
    err.messageEn = 'Guest count must be at least 1.';
    throw err;
  }

  // Determine default times from room settings if not provided
  const defaultStart =
    data.slot === 'DAY'
      ? room.day_start_time || '08:00'
      : data.slot === 'NIGHT'
      ? room.night_start_time || '18:00'
      : room.day_start_time || '08:00';
  const defaultEnd =
    data.slot === 'DAY'
      ? room.day_end_time || '16:00'
      : data.slot === 'NIGHT'
      ? room.night_end_time || '00:00'
      : room.night_end_time || '00:00';

  const startTime = data.start_time || defaultStart;
  const endTime = data.end_time || defaultEnd;

  // Server-side Pricing Calculation
  const basePrice = getHallBasePriceForSlot(hall, data.slot);
  const hallRent = data.hall_rent !== undefined ? Number(data.hall_rent) : basePrice;

  if (isNaN(hallRent) || hallRent < 0) {
    const err: any = new Error('Negative amounts are not allowed');
    err.status = 400;
    err.messageBn = 'হল ভাড়া ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Hall rent cannot be negative.';
    throw err;
  }

  // Staff cannot set a price below the base price without Manager approval
  if (hallRent < basePrice && actor.role === 'STAFF' && !data.manager_price_approved) {
    const err: any = new Error('Staff cannot lower price below base price without Manager approval');
    err.code = 'PRICE_BELOW_BASE_NEEDS_APPROVAL';
    err.status = 403;
    err.messageBn = `স্টাফ হিসেবে নির্ধারিত বেস মূল্যের (৳${basePrice}) নিচে ভাড়া কমাতে ম্যানেজারের অনুমোদন প্রয়োজন।`;
    err.messageEn = `Staff cannot set a price below the base price (৳${basePrice}) without Manager approval.`;
    throw err;
  }

  const extraServices: ExtraServiceItem[] = (data.extra_services || []).map((s) => {
    const amt = Number(s.amount);
    if (isNaN(amt) || amt < 0) {
      const err: any = new Error('Negative service amount not allowed');
      err.status = 400;
      err.messageBn = 'অতিরিক্ত সেবার মূল্য ঋণাত্মক হতে পারবে না।';
      err.messageEn = 'Extra service amount cannot be negative.';
      throw err;
    }
    return {
      type: s.type,
      label: (s.label || s.type).trim(),
      amount: amt,
    };
  });

  const extraServicesAmount = extraServices.reduce((sum, item) => sum + item.amount, 0);
  const totalAmount = hallRent + extraServicesAmount;
  const advanceAmount = data.advance_amount !== undefined ? Number(data.advance_amount) : 0;

  if (isNaN(advanceAmount) || advanceAmount < 0) {
    const err: any = new Error('Negative advance amount not allowed');
    err.status = 400;
    err.messageBn = 'অগ্রিম টাকা ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Advance amount cannot be negative.';
    throw err;
  }

  if (advanceAmount > totalAmount) {
    const err: any = new Error('Advance amount cannot exceed total amount');
    err.code = 'ADVANCE_EXCEEDS_TOTAL';
    err.status = 400;
    err.messageBn = 'অগ্রিম জমার পরিমাণ মোট বিলের চেয়ে বেশি হতে পারবে না।';
    err.messageEn = 'Advance amount cannot be larger than the total amount.';
    throw err;
  }

  const dueAmount = Math.max(0, totalAmount - advanceAmount);
  const status: BookingStatus = data.status === 'CONFIRMED' ? 'CONFIRMED' : 'TENTATIVE';
  const now = Date.now();
  const holdExpiresAt =
    status === 'TENTATIVE' && data.hold_hours && data.hold_hours > 0
      ? now + Math.floor(data.hold_hours * 3600 * 1000)
      : null;

  // Execute atomic booking & slot lock insertion inside BEGIN IMMEDIATE transaction
  db.exec('BEGIN IMMEDIATE');
  try {
    // Re-check idempotency inside transaction
    if (idemKey) {
      const existingByIdem = db.prepare('SELECT id FROM bookings WHERE room_id = ? AND idempotency_key = ?').get(roomId, idemKey) as { id: string } | undefined;
      if (existingByIdem) {
        db.exec('COMMIT');
        return { booking: getBookingById(roomId, existingByIdem.id)!, deduplicated: true };
      }
    }

    // Check time and buffer rules inside transaction
    const timeCheck = validateBookingTimesAndBuffer(room, hall.id, data.event_date, data.slot, startTime, endTime);
    if (!timeCheck.valid) {
      const err: any = new Error(timeCheck.errorEn);
      err.status = 400;
      err.messageBn = timeCheck.errorBn;
      err.messageEn = timeCheck.errorEn;
      throw err;
    }

    // Check availability for detailed error message before attempting lock insert
    const avail = checkHallDateAvailability(roomId, hall.id, data.event_date);
    const neededLocks = getLockedSlotsForChoice(data.slot);
    for (const lockSlot of neededLocks) {
      if (lockSlot === 'DAY' && !avail.day_free) {
        throw buildSlotConflictError(data.slot, avail);
      }
      if (lockSlot === 'NIGHT' && !avail.night_free) {
        throw buildSlotConflictError(data.slot, avail);
      }
    }

    const bookingYear = parseInt(data.event_date.slice(0, 4), 10) || new Date().getFullYear();
    const bookingNumber = generateNextBookingNumber(db, roomId, bookingYear);
    const bookingId = crypto.randomUUID();

    db.prepare(`
      INSERT INTO bookings (
        id, room_id, booking_number, customer_id, hall_id, event_type, event_date, slot,
        start_time, end_time, guest_count, package_name, extra_services,
        base_price, hall_rent, extra_services_amount, total_amount, advance_amount, due_amount,
        status, hold_expires_at, notes, idempotency_key, is_demo,
        created_by_user_id, created_by_name, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?
      )
    `).run(
      bookingId,
      roomId,
      bookingNumber,
      customer.id,
      hall.id,
      data.event_type,
      data.event_date,
      data.slot,
      startTime,
      endTime,
      data.guest_count,
      data.package_name ? data.package_name.trim() : null,
      JSON.stringify(extraServices),
      basePrice,
      hallRent,
      extraServicesAmount,
      totalAmount,
      advanceAmount,
      dueAmount,
      status,
      holdExpiresAt,
      data.notes ? data.notes.trim() : null,
      idemKey,
      data.is_demo ? 1 : 0,
      actor.userId,
      actor.name,
      now,
      now
    );

    // Insert slot locks (enforced by UNIQUE(hall_id, event_date, locked_slot) at DB level!)
    const lockStmt = db.prepare(`
      INSERT INTO booking_slot_locks (id, room_id, hall_id, event_date, locked_slot, booking_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    for (const lockSlot of neededLocks) {
      try {
        lockStmt.run(crypto.randomUUID(), roomId, hall.id, data.event_date, lockSlot, bookingId);
      } catch (sqliteErr: any) {
        if (String(sqliteErr.message).includes('UNIQUE constraint failed')) {
          const currentAvail = checkHallDateAvailability(roomId, hall.id, data.event_date, bookingId);
          throw buildSlotConflictError(data.slot, currentAvail);
        }
        throw sqliteErr;
      }
    }

    // Write booking history
    db.prepare(`
      INSERT INTO booking_history (id, booking_id, room_id, user_id, user_name, user_email, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'CREATED', ?, ?)
    `).run(
      crypto.randomUUID(),
      bookingId,
      roomId,
      actor.userId,
      actor.name,
      actor.email,
      JSON.stringify({
        booking_number: bookingNumber,
        event_date: data.event_date,
        slot: data.slot,
        hall_name: hall.name,
        customer_name: customer.name,
        status,
        base_price: basePrice,
        hall_rent: hallRent,
        total_amount: totalAmount,
        advance_amount: advanceAmount,
        due_amount: dueAmount,
      }),
      now
    );

    // Audit Log
    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BOOKING_CREATE',
      details: {
        bookingId,
        bookingNumber,
        customerName: customer.name,
        hallName: hall.name,
        eventDate: data.event_date,
        slot: data.slot,
        status,
        totalAmount,
        advanceAmount,
        dueAmount,
      },
      ipAddress: actor.ip,
    });

    if (hallRent !== basePrice) {
      addAuditLog({
        roomId,
        userId: actor.userId,
        userEmail: actor.email,
        userName: actor.name,
        action: 'PRICE_CHANGE',
        details: {
          bookingId,
          bookingNumber,
          slot: data.slot,
          basePrice,
          adjustedHallRent: hallRent,
          managerApproved: Boolean(data.manager_price_approved),
        },
        ipAddress: actor.ip,
      });
    }

    // Part 3: If advanceAmount > 0 at booking creation, automatically record the official ADVANCE payment & receipt
    if (advanceAmount > 0) {
      const receiptNumber = generateNextReceiptNumber(db, roomId, bookingYear);
      const paymentId = crypto.randomUUID();
      db.prepare(`
        INSERT INTO payments (
          id, room_id, booking_id, receipt_number, payment_type, amount, payment_date,
          method, reference_number, received_by_user_id, received_by_name, note,
          idempotency_key, is_demo, created_at
        ) VALUES (?, ?, ?, ?, 'ADVANCE', ?, ?, 'CASH', NULL, ?, ?, ?, ?, ?, ?)
      `).run(
        paymentId,
        roomId,
        bookingId,
        receiptNumber,
        roundMoney(advanceAmount),
        todayYMD,
        actor.userId,
        actor.name,
        'Initial Booking Advance / বুকিংয়ের প্রাথমিক অগ্রিম জমা',
        idemKey ? `${idemKey}-adv` : null,
        data.is_demo ? 1 : 0,
        now
      );

      recalculateBookingPaymentTotals(db, roomId, bookingId);
    }

    // Part 3: Emit NEW_BOOKING notification naming the slot and time with both dates and Bangla digits
    const slotBn = data.slot === 'DAY' ? 'দিন (Day)' : data.slot === 'NIGHT' ? 'রাত (Night)' : 'দিন ও রাত (Full)';
    const slotEn = data.slot === 'DAY' ? 'Day' : data.slot === 'NIGHT' ? 'Night' : 'Full';
    const dualDate = formatDualDateFromYMD(data.event_date);
    const start12Bn = formatTimeString12(startTime, 'bn');
    const end12Bn = formatTimeString12(endTime, 'bn');
    const start12En = formatTimeString12(startTime, 'en');
    const end12En = formatTimeString12(endTime, 'en');
    createNotificationIfNotExists(db, {
      roomId,
      dedupKey: `NEW_BOOKING:${bookingId}`,
      type: 'NEW_BOOKING',
      isMoney: false,
      ownerOnly: false,
      bookingId,
      slot: data.slot,
      eventDate: data.event_date,
      titleBn: `নতুন ${slotBn} বুকিং (${toBanglaDigits(bookingNumber)})`,
      titleEn: `New ${slotEn} Booking (${bookingNumber})`,
      messageBn: `${hall.name}-এ ${dualDate} তারিখে ${slotBn} (${start12Bn} – ${end12Bn}) স্লটে "${customer.name}" এর বুকিং তৈরি হয়েছে।`,
      messageEn: `${slotEn} booking (${start12En} – ${end12En}) created on ${dualDate} at ${hall.name} for "${customer.name}".`,
    });

    db.exec('COMMIT');
    return { booking: getBookingById(roomId, bookingId)!, deduplicated: false };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

export function getBookingById(roomId: string, bookingId: string): BookingRow | null {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();
  const row = db.prepare(`
    SELECT b.*,
           c.name as customer_name, c.phone as customer_phone, c.alt_phone as customer_alt_phone, c.address as customer_address,
           h.name as hall_name, h.capacity as hall_capacity
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE b.id = ? AND b.room_id = ?
  `).get(bookingId, roomId) as any;

  return row ? mapBookingRow(row) : null;
}

export function getBookingHistory(roomId: string, bookingId: string): BookingHistoryRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM booking_history
    WHERE room_id = ? AND booking_id = ?
    ORDER BY created_at DESC
  `).all(roomId, bookingId) as any[];

  return rows.map((r) => ({
    ...r,
    changes: (() => {
      try {
        return JSON.parse(r.changes);
      } catch {
        return {};
      }
    })(),
  }));
}

export function updateBooking(
  roomId: string,
  bookingId: string,
  data: {
    customer_id?: string;
    hall_id?: string;
    event_type?: EventType;
    event_date?: string;
    slot?: SlotType;
    start_time?: string;
    end_time?: string;
    guest_count?: number;
    package_name?: string | null;
    extra_services?: ExtraServiceItem[];
    hall_rent?: number;
    manager_price_approved?: boolean;
    advance_amount?: number;
    confirm_past_date?: boolean;
    status?: BookingStatus;
    hold_hours?: number | null;
    notes?: string | null;
  },
  actor: { userId: string; email: string; name: string; role: RoleType; ip?: string },
  todayYMD: string
): BookingRow {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();
  const current = getBookingById(roomId, bookingId);
  if (!current) {
    const err: any = new Error('Booking not found');
    err.status = 404;
    err.messageBn = 'বুকিংটি খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Booking not found.';
    throw err;
  }

  if (current.status === 'CANCELLED') {
    const err: any = new Error('Cancelled booking cannot be edited');
    err.status = 400;
    err.messageBn = 'বাতিল করা বুকিং সম্পাদনা করা যাবে না। প্রয়োজনে নতুন বুকিং তৈরি করুন।';
    err.messageEn = 'A cancelled booking cannot be edited. Please create a new booking instead.';
    throw err;
  }

  // Permission rule: Staff cannot cancel confirmed bookings
  if (data.status === 'CANCELLED' && current.status === 'CONFIRMED' && actor.role === 'STAFF') {
    const err: any = new Error('Staff cannot cancel confirmed bookings');
    err.status = 403;
    err.messageBn = 'নিশ্চিত (Confirmed) বুকিং বাতিল করার অনুমতি স্টাফের নেই। অনুগ্রহ করে ম্যানেজার বা ওনারের সাথে যোগাযোগ করুন।';
    err.messageEn = 'Staff cannot cancel confirmed bookings. Please ask a Manager or Owner.';
    throw err;
  }

  const room = getRoomById(roomId)!;
  const targetHallId = data.hall_id !== undefined ? data.hall_id : current.hall_id;
  const hall = getHallById(roomId, targetHallId);
  if (!hall) {
    const err: any = new Error('Hall not found');
    err.status = 404;
    err.messageBn = 'হলটি খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Hall not found.';
    throw err;
  }

  const targetCustomerId = data.customer_id !== undefined ? data.customer_id : current.customer_id;
  const customer = getCustomerById(roomId, targetCustomerId);
  if (!customer) {
    const err: any = new Error('Customer not found');
    err.status = 404;
    err.messageBn = 'গ্রাহককে খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Customer not found.';
    throw err;
  }

  const targetDate = data.event_date !== undefined ? data.event_date : current.event_date;
  if (targetDate !== current.event_date && targetDate < todayYMD && !data.confirm_past_date) {
    const err: any = new Error('Past date warning');
    err.code = 'PAST_DATE_WARNING';
    err.status = 400;
    err.messageBn = 'সতর্কতা: নির্বাচিত তারিখটি অতীতের। আপনি কি নিশ্চিতভাবে অতীতের তারিখে বুকিংটি পরিবর্তন করতে চান?';
    err.messageEn = 'Warning: The selected event date is in the past. Please confirm if you want to proceed.';
    throw err;
  }

  const targetSlot: SlotType = data.slot !== undefined ? data.slot : current.slot;
  const slotOrHallChanged = targetSlot !== current.slot || targetHallId !== current.hall_id;

  // Determine times
  let startTime = data.start_time;
  let endTime = data.end_time;
  if (!startTime || !endTime) {
    if (targetSlot !== current.slot && (!data.start_time || !data.end_time)) {
      startTime =
        targetSlot === 'DAY'
          ? room.day_start_time || '08:00'
          : targetSlot === 'NIGHT'
          ? room.night_start_time || '18:00'
          : room.day_start_time || '08:00';
      endTime =
        targetSlot === 'DAY'
          ? room.day_end_time || '16:00'
          : targetSlot === 'NIGHT'
          ? room.night_end_time || '00:00'
          : room.night_end_time || '00:00';
    } else {
      startTime = startTime || current.start_time;
      endTime = endTime || current.end_time;
    }
  }

  const guestCount = data.guest_count !== undefined ? data.guest_count : current.guest_count;
  if (!Number.isInteger(guestCount) || guestCount < 1) {
    const err: any = new Error('Guest count must be at least 1');
    err.status = 400;
    err.messageBn = 'অতিথি সংখ্যা কমপক্ষে ১ জন হতে হবে।';
    err.messageEn = 'Guest count must be at least 1.';
    throw err;
  }

  // Rule: Changing a booking from Day to Night, or to Full, re-checks availability and conflicts first and re-calculates the price on the server.
  const basePrice = getHallBasePriceForSlot(hall, targetSlot);
  let hallRent: number;
  if (data.hall_rent !== undefined) {
    hallRent = Number(data.hall_rent);
  } else if (slotOrHallChanged) {
    hallRent = basePrice;
  } else {
    hallRent = current.hall_rent;
  }

  if (isNaN(hallRent) || hallRent < 0) {
    const err: any = new Error('Hall rent cannot be negative');
    err.status = 400;
    err.messageBn = 'হল ভাড়া ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Hall rent cannot be negative.';
    throw err;
  }

  if (hallRent < basePrice && actor.role === 'STAFF' && !data.manager_price_approved) {
    const err: any = new Error('Staff cannot set price below base price without Manager approval');
    err.code = 'PRICE_BELOW_BASE_NEEDS_APPROVAL';
    err.status = 403;
    err.messageBn = `স্টাফ হিসেবে নির্ধারিত বেস মূল্যের (৳${basePrice}) নিচে ভাড়া কমাতে ম্যানেজারের অনুমোদন প্রয়োজন।`;
    err.messageEn = `Staff cannot set a price below the base price (৳${basePrice}) without Manager approval.`;
    throw err;
  }

  const extraServices: ExtraServiceItem[] =
    data.extra_services !== undefined
      ? data.extra_services.map((s) => {
          const amt = Number(s.amount);
          if (isNaN(amt) || amt < 0) {
            const err: any = new Error('Extra service amount cannot be negative');
            err.status = 400;
            err.messageBn = 'অতিরিক্ত সেবার মূল্য ঋণাত্মক হতে পারবে না।';
            err.messageEn = 'Extra service amount cannot be negative.';
            throw err;
          }
          return { type: s.type, label: (s.label || s.type).trim(), amount: amt };
        })
      : current.extra_services;

    const extraServicesAmount = roundMoney(extraServices.reduce((sum, item) => sum + item.amount, 0));
  const totalAmount = roundMoney(hallRent + extraServicesAmount);

  // Check if payments exist in payments table for this booking
  const paymentCountRow = db.prepare('SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as net_paid FROM payments WHERE room_id = ? AND booking_id = ?').get(roomId, bookingId) as { cnt: number; net_paid: number };
  const hasRecordedPayments = paymentCountRow.cnt > 0;

  let advanceAmount = hasRecordedPayments
    ? roundMoney(paymentCountRow.net_paid)
    : data.advance_amount !== undefined
    ? roundMoney(Number(data.advance_amount))
    : roundMoney(current.advance_amount);

  if (isNaN(advanceAmount) || (!hasRecordedPayments && advanceAmount < 0)) {
    const err: any = new Error('Advance amount cannot be negative');
    err.status = 400;
    err.messageBn = 'অগ্রিম টাকা ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Advance amount cannot be negative.';
    throw err;
  }

  if (!hasRecordedPayments && advanceAmount > totalAmount) {
    const err: any = new Error('Advance amount cannot exceed total amount');
    err.code = 'ADVANCE_EXCEEDS_TOTAL';
    err.status = 400;
    err.messageBn = 'অগ্রিম জমার পরিমাণ মোট বিলের চেয়ে বেশি হতে পারবে না।';
    err.messageEn = 'Advance amount cannot be larger than the total amount.';
    throw err;
  }

  const dueAmount = Math.max(0, roundMoney(totalAmount - Math.max(0, advanceAmount)));
  const targetStatus: BookingStatus = data.status !== undefined ? data.status : current.status;
  const targetEventType: EventType = data.event_type !== undefined ? data.event_type : current.event_type;
  const targetPackage = data.package_name !== undefined ? (data.package_name ? data.package_name.trim() : null) : current.package_name;
  const targetNotes = data.notes !== undefined ? (data.notes ? data.notes.trim() : null) : current.notes;

  const now = Date.now();
  let holdExpiresAt = current.hold_expires_at;
  if (targetStatus !== 'TENTATIVE') {
    holdExpiresAt = null;
  } else if (data.hold_hours !== undefined) {
    holdExpiresAt = data.hold_hours && data.hold_hours > 0 ? now + Math.floor(data.hold_hours * 3600 * 1000) : null;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    // Validate time and buffer
    const timeCheck = validateBookingTimesAndBuffer(room, hall.id, targetDate, targetSlot, startTime, endTime, bookingId);
    if (!timeCheck.valid) {
      const err: any = new Error(timeCheck.errorEn);
      err.status = 400;
      err.messageBn = timeCheck.errorBn;
      err.messageEn = timeCheck.errorEn;
      throw err;
    }

    // Re-check availability and conflicts excluding this bookingId
    const avail = checkHallDateAvailability(roomId, hall.id, targetDate, bookingId);
    const neededLocks = getLockedSlotsForChoice(targetSlot);
    for (const lockSlot of neededLocks) {
      if (lockSlot === 'DAY' && !avail.day_free) {
        throw buildSlotConflictError(targetSlot, avail);
      }
      if (lockSlot === 'NIGHT' && !avail.night_free) {
        throw buildSlotConflictError(targetSlot, avail);
      }
    }

    // Replace locks if active status
    db.prepare('DELETE FROM booking_slot_locks WHERE booking_id = ?').run(bookingId);

    if (targetStatus !== 'CANCELLED') {
      const lockStmt = db.prepare(`
        INSERT INTO booking_slot_locks (id, room_id, hall_id, event_date, locked_slot, booking_id)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      for (const lockSlot of neededLocks) {
        try {
          lockStmt.run(crypto.randomUUID(), roomId, hall.id, targetDate, lockSlot, bookingId);
        } catch (sqliteErr: any) {
          if (String(sqliteErr.message).includes('UNIQUE constraint failed')) {
            const currentAvail = checkHallDateAvailability(roomId, hall.id, targetDate, bookingId);
            throw buildSlotConflictError(targetSlot, currentAvail);
          }
          throw sqliteErr;
        }
      }
    }

    // Update booking record
    db.prepare(`
      UPDATE bookings
      SET customer_id = ?, hall_id = ?, event_type = ?, event_date = ?, slot = ?,
          start_time = ?, end_time = ?, guest_count = ?, package_name = ?, extra_services = ?,
          base_price = ?, hall_rent = ?, extra_services_amount = ?, total_amount = ?, advance_amount = ?, due_amount = ?,
          status = ?, hold_expires_at = ?, notes = ?, updated_at = ?
      WHERE id = ? AND room_id = ?
    `).run(
      customer.id,
      hall.id,
      targetEventType,
      targetDate,
      targetSlot,
      startTime,
      endTime,
      guestCount,
      targetPackage,
      JSON.stringify(extraServices),
      basePrice,
      hallRent,
      extraServicesAmount,
      totalAmount,
      advanceAmount,
      dueAmount,
      targetStatus,
      holdExpiresAt,
      targetNotes,
      now,
      bookingId,
      roomId
    );

    // Compute diff for history & audit logs
    const diff: Record<string, { from: any; to: any }> = {};
    const fieldsToCompare: Array<[keyof BookingRow, any]> = [
      ['hall_id', hall.id],
      ['customer_id', customer.id],
      ['event_type', targetEventType],
      ['event_date', targetDate],
      ['slot', targetSlot],
      ['start_time', startTime],
      ['end_time', endTime],
      ['guest_count', guestCount],
      ['package_name', targetPackage],
      ['hall_rent', hallRent],
      ['extra_services_amount', extraServicesAmount],
      ['total_amount', totalAmount],
      ['advance_amount', advanceAmount],
      ['due_amount', dueAmount],
      ['status', targetStatus],
      ['notes', targetNotes],
    ];

    for (const [k, newVal] of fieldsToCompare) {
      if (current[k] !== newVal) {
        diff[k] = { from: current[k], to: newVal };
      }
    }

    const historyAction =
      current.slot !== targetSlot
        ? 'SLOT_CHANGED'
        : current.status !== targetStatus
        ? 'STATUS_CHANGED'
        : current.total_amount !== totalAmount || current.hall_rent !== hallRent
        ? 'PRICE_CHANGED'
        : 'UPDATED';

    db.prepare(`
      INSERT INTO booking_history (id, booking_id, room_id, user_id, user_name, user_email, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      bookingId,
      roomId,
      actor.userId,
      actor.name,
      actor.email,
      historyAction,
      JSON.stringify(diff),
      now
    );

    // Specific audit log entries as required by Section 8:
    // "Log create, edit, cancel, slot change, price change and status change in the audit log."
    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BOOKING_EDIT',
      details: { bookingId, bookingNumber: current.booking_number, changes: diff },
      ipAddress: actor.ip,
    });

    if (current.slot !== targetSlot) {
      addAuditLog({
        roomId,
        userId: actor.userId,
        userEmail: actor.email,
        userName: actor.name,
        action: 'SLOT_CHANGE',
        details: {
          bookingId,
          bookingNumber: current.booking_number,
          previousSlot: current.slot,
          newSlot: targetSlot,
          eventDate: targetDate,
          recalculatedBasePrice: basePrice,
          newTotalAmount: totalAmount,
        },
        ipAddress: actor.ip,
      });
    }

    if (current.hall_rent !== hallRent || current.total_amount !== totalAmount) {
      addAuditLog({
        roomId,
        userId: actor.userId,
        userEmail: actor.email,
        userName: actor.name,
        action: 'PRICE_CHANGE',
        details: {
          bookingId,
          bookingNumber: current.booking_number,
          previousHallRent: current.hall_rent,
          newHallRent: hallRent,
          previousTotal: current.total_amount,
          newTotal: totalAmount,
          newDue: dueAmount,
        },
        ipAddress: actor.ip,
      });
    }

    if (current.status !== targetStatus) {
      addAuditLog({
        roomId,
        userId: actor.userId,
        userEmail: actor.email,
        userName: actor.name,
        action: 'STATUS_CHANGE',
        details: {
          bookingId,
          bookingNumber: current.booking_number,
          previousStatus: current.status,
          newStatus: targetStatus,
        },
        ipAddress: actor.ip,
      });
    }

    db.exec('COMMIT');
    return getBookingById(roomId, bookingId)!;
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

export function cancelBooking(
  roomId: string,
  bookingId: string,
  reason: string,
  actor: { userId: string; email: string; name: string; role: RoleType; ip?: string },
  refundOptions?: {
    refund_amount?: number;
    refund_method?: PaymentMethod;
    refund_date?: string;
    refund_note?: string;
  }
): { booking: BookingRow; refundPayment?: PaymentRow | null } {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();
  const current = getBookingById(roomId, bookingId);
  if (!current) {
    const err: any = new Error('Booking not found');
    err.status = 404;
    err.messageBn = 'বুকিংটি খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Booking not found.';
    throw err;
  }

  if (current.status === 'CANCELLED') {
    const err: any = new Error('Booking is already cancelled');
    err.status = 400;
    err.messageBn = 'এই বুকিংটি ইতোমধ্যে বাতিল করা হয়েছে।';
    err.messageEn = 'This booking is already cancelled.';
    throw err;
  }

  // Permission rule: Staff cannot cancel confirmed bookings
  if ((current.status === 'CONFIRMED' || current.status === 'COMPLETED') && actor.role === 'STAFF') {
    const err: any = new Error('Staff cannot cancel confirmed bookings');
    err.status = 403;
    err.messageBn = 'নিশ্চিত (Confirmed) বুকিং বাতিল করার অনুমতি স্টাফের নেই। অনুগ্রহ করে ম্যানেজার বা ওনারের সাহায্য নিন।';
    err.messageEn = 'Staff cannot cancel confirmed bookings. Only Owner or Manager can cancel a confirmed booking.';
    throw err;
  }

  const trimmedReason = (reason || '').trim();
  if (trimmedReason.length < 2) {
    const err: any = new Error('Cancellation reason is required');
    err.status = 400;
    err.messageBn = 'বুকিং বাতিলের কারণ উল্লেখ করা আবশ্যক।';
    err.messageEn = 'Please provide a reason for cancelling this booking.';
    throw err;
  }

  const refundAmt = refundOptions?.refund_amount !== undefined ? roundMoney(Number(refundOptions.refund_amount)) : 0;
  if (isNaN(refundAmt) || refundAmt < 0) {
    const err: any = new Error('Invalid refund amount');
    err.status = 400;
    err.messageBn = 'রিফান্ডের পরিমাণ ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Refund amount cannot be negative.';
    throw err;
  }

  const now = Date.now();
  let refundPaymentRow: PaymentRow | null = null;

  db.exec('BEGIN IMMEDIATE');
  try {
    if (refundAmt > 0) {
      // Check current net paid
      const netPaidRow = db.prepare('SELECT COALESCE(SUM(amount), 0) as net_paid FROM payments WHERE room_id = ? AND booking_id = ?').get(roomId, bookingId) as { net_paid: number };
      const availableToRefund = roundMoney(Math.max(netPaidRow.net_paid, current.advance_amount));
      if (refundAmt > availableToRefund) {
        const err: any = new Error('Refund amount exceeds total collected amount');
        err.status = 400;
        err.messageBn = `রিফান্ডের পরিমাণ (৳${refundAmt}) জমা কৃত অর্থের (৳${availableToRefund}) চেয়ে বেশি হতে পারবে না।`;
        err.messageEn = `Refund amount (৳${refundAmt}) cannot exceed net collected amount (৳${availableToRefund}).`;
        throw err;
      }

      const year = parseInt((refundOptions?.refund_date || current.event_date).slice(0, 4), 10) || new Date().getFullYear();
      const receiptNumber = generateNextReceiptNumber(db, roomId, year);
      const refundId = crypto.randomUUID();
      const rDate = refundOptions?.refund_date || current.event_date;
      const rMethod = refundOptions?.refund_method || 'CASH';
      const rNote = (refundOptions?.refund_note || `Booking Cancellation Refund: ${trimmedReason}`).trim();

      db.prepare(`
        INSERT INTO payments (
          id, room_id, booking_id, receipt_number, payment_type, amount, payment_date,
          method, reference_number, received_by_user_id, received_by_name, note,
          idempotency_key, is_demo, created_at
        ) VALUES (?, ?, ?, ?, 'REFUND', ?, ?, ?, NULL, ?, ?, ?, NULL, ?, ?)
      `).run(
        refundId,
        roomId,
        bookingId,
        receiptNumber,
        -Math.abs(refundAmt),
        rDate,
        rMethod,
        actor.userId,
        actor.name,
        rNote,
        current.is_demo,
        now
      );

      addAuditLog({
        roomId,
        userId: actor.userId,
        userEmail: actor.email,
        userName: actor.name,
        action: 'PAYMENT_REFUND',
        details: {
          bookingId,
          bookingNumber: current.booking_number,
          receiptNumber,
          refundAmount: refundAmt,
          reason: trimmedReason,
        },
        ipAddress: actor.ip,
      });

      refundPaymentRow = getPaymentById(roomId, refundId);
    }

    // Immediately release slot locks so the slot can be rebooked
    db.prepare('DELETE FROM booking_slot_locks WHERE booking_id = ?').run(bookingId);

    db.prepare(`
      UPDATE bookings
      SET status = 'CANCELLED', cancel_reason = ?, cancelled_at = ?, cancelled_by_user_id = ?, hold_expires_at = NULL, updated_at = ?
      WHERE id = ? AND room_id = ?
    `).run(trimmedReason, now, actor.userId, now, bookingId, roomId);

    recalculateBookingPaymentTotals(db, roomId, bookingId);

    db.prepare(`
      INSERT INTO booking_history (id, booking_id, room_id, user_id, user_name, user_email, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'CANCELLED', ?, ?)
    `).run(
      crypto.randomUUID(),
      bookingId,
      roomId,
      actor.userId,
      actor.name,
      actor.email,
      JSON.stringify({
        previousStatus: current.status,
        newStatus: 'CANCELLED',
        cancelReason: trimmedReason,
        refundAmount: refundAmt,
      }),
      now
    );

    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'BOOKING_CANCEL',
      details: {
        bookingId,
        bookingNumber: current.booking_number,
        previousStatus: current.status,
        cancelReason: trimmedReason,
        refundAmount: refundAmt,
        eventDate: current.event_date,
        slot: current.slot,
        hallName: current.hall_name,
      },
      ipAddress: actor.ip,
    });

    db.exec('COMMIT');
    return { booking: getBookingById(roomId, bookingId)!, refundPayment: refundPaymentRow };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

export interface ListBookingsFilter {
  search?: string;
  status?: BookingStatus | '';
  dateFrom?: string;
  dateTo?: string;
  hallId?: string;
  eventType?: EventType | '';
  slot?: SlotType | '';
  customerId?: string;
  sortBy?: 'event_date_asc' | 'event_date_desc' | 'created_desc' | 'booking_number';
  page?: number;
  limit?: number;
}

export function listRoomBookings(
  roomId: string,
  filter: ListBookingsFilter = {}
): { bookings: BookingRow[]; total: number; page: number; limit: number; totalPages: number } {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();

  let where = 'WHERE b.room_id = ?';
  const params: any[] = [roomId];

  if (filter.search && filter.search.trim()) {
    const q = `%${filter.search.trim()}%`;
    where += ' AND (b.booking_number LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR c.alt_phone LIKE ?)';
    params.push(q, q, q, q);
  }
  if (filter.status) {
    where += ' AND b.status = ?';
    params.push(filter.status);
  }
  if (filter.dateFrom) {
    where += ' AND b.event_date >= ?';
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    where += ' AND b.event_date <= ?';
    params.push(filter.dateTo);
  }
  if (filter.hallId) {
    where += ' AND b.hall_id = ?';
    params.push(filter.hallId);
  }
  if (filter.eventType) {
    where += ' AND b.event_type = ?';
    params.push(filter.eventType);
  }
  if (filter.slot) {
    where += ' AND b.slot = ?';
    params.push(filter.slot);
  }
  if (filter.customerId) {
    where += ' AND b.customer_id = ?';
    params.push(filter.customerId);
  }

  let orderBy = 'ORDER BY b.event_date DESC, b.created_at DESC';
  if (filter.sortBy === 'event_date_asc') {
    orderBy = 'ORDER BY b.event_date ASC, b.start_time ASC';
  } else if (filter.sortBy === 'created_desc') {
    orderBy = 'ORDER BY b.created_at DESC';
  } else if (filter.sortBy === 'booking_number') {
    orderBy = 'ORDER BY b.booking_number DESC';
  }

  const page = Math.max(1, filter.page || 1);
  const limit = Math.min(200, Math.max(1, filter.limit || 20));
  const offset = (page - 1) * limit;

  const countQuery = `
    SELECT COUNT(*) as cnt
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    ${where}
  `;
  const totalRow = db.prepare(countQuery).get(...params) as { cnt: number };

  const dataQuery = `
    SELECT b.*,
           c.name as customer_name, c.phone as customer_phone, c.alt_phone as customer_alt_phone, c.address as customer_address,
           h.name as hall_name, h.capacity as hall_capacity
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    ${where}
    ${orderBy}
    LIMIT ? OFFSET ?
  `;
  const rows = db.prepare(dataQuery).all(...params, limit, offset) as any[];

  return {
    bookings: rows.map(mapBookingRow),
    total: totalRow.cnt,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(totalRow.cnt / limit)),
  };
}

// ======================== Demo Data Seeding & Cleanup ========================

export function seedPart2DemoData(
  roomId: string,
  actor: { userId: string; email: string; name: string; role: RoleType; ip?: string },
  todayYMD: string
): { hallsCreated: number; customersCreated: number; bookingsCreated: number } {
  const db = getDb();
  // Remove previous demo data first so re-seeding is clean and idempotent
  clearPart2DemoData(roomId, actor);

  // 1. Seed 3 Bilingual Halls
  const hall1 = createHall(
    roomId,
    {
      name: '[DEMO] শাপলা গ্র্যান্ড বলরুম (Shapla Grand Ballroom)',
      capacity: 600,
      day_price: 45000,
      night_price: 55000,
      full_price: 90000,
      facilities: ['Central AC / কেন্দ্রীয় এসি', 'Bridal Stage / ব্রাইডাল স্টেজ', 'Generator Backup / জেনারেটর ব্যাকআপ', 'VIP Lounge / ভিআইপি লাউঞ্জ', 'Car Parking / পার্কিং'],
      photos: ['https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=800&q=80'],
      is_active: true,
      is_demo: true,
    },
    actor
  );

  const hall2 = createHall(
    roomId,
    {
      name: '[DEMO] রজনীগন্ধা ব্যাংকুয়েট হল (Rojonigondha Banquet Hall)',
      capacity: 350,
      day_price: 28000,
      night_price: 35000,
      full_price: 58000,
      facilities: ['Full AC / পূর্ণ এসি', 'Sound System / সাউন্ড সিস্টেম', 'Prayer Room / নামাজের ঘর', 'Lift / লিফট'],
      photos: ['https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=800&q=80'],
      is_active: true,
      is_demo: true,
    },
    actor
  );

  const hall3 = createHall(
    roomId,
    {
      name: '[DEMO] অপরাজিতা কনফারেন্স লাউঞ্জ (Oporajita Conference Lounge)',
      capacity: 150,
      day_price: 15000,
      night_price: 18000,
      full_price: 30000,
      facilities: ['Projector & Screen / প্রজেক্টর', 'Wi-Fi / ওয়াই-ফাই', 'AC / এসি'],
      photos: ['https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=800&q=80'],
      is_active: true,
      is_demo: true,
    },
    actor
  );

  // 2. Seed 4 Demo Customers (including a long Bangla name test case)
  const { customer: cust1 } = createCustomer(
    roomId,
    {
      name: '[DEMO] আলহাজ্ব মোহাম্মদ মাহমুদুর রহমান চৌধুরী (মাহমুদ)',
      phone: '01711-900101',
      alt_phone: '01819-900102',
      address: 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা, ঢাকা-১২০৯',
      notes: 'ভিআইপি ক্লায়েন্ট — কনের পিতা',
      is_demo: true,
      forceCreate: true,
    },
    actor
  );

  const { customer: cust2 } = createCustomer(
    roomId,
    {
      name: '[DEMO] ফারহানা ইয়াসমিন তন্বী (Farhana Yasmin Tonny)',
      phone: '01712-900202',
      address: 'গুলশান ২, রোড ৪৫, ঢাকা',
      notes: 'গায়ে হলুদ ও রিসেপশন প্যাকেজ',
      is_demo: true,
      forceCreate: true,
    },
    actor
  );

  const { customer: cust3 } = createCustomer(
    roomId,
    {
      name: '[DEMO] তানভীর আহমেদ সিদ্দিকী (Tanvir Ahmed Siddiqui)',
      phone: '01911-900303',
      address: 'উত্তরা সেক্টর ৪, ঢাকা',
      notes: 'ফুল ডে বুকিং',
      is_demo: true,
      forceCreate: true,
    },
    actor
  );

  const { customer: cust4 } = createCustomer(
    roomId,
    {
      name: '[DEMO] ডাঃ নুসরাত জাহান চৌধুরী',
      phone: '01611-900404',
      address: 'বনানী ডিওএইচএস, ঢাকা',
      notes: 'আকিকা ও পারিবারিক মিলনমেলা',
      is_demo: true,
      forceCreate: true,
    },
    actor
  );

  // Helper to get offset dates from todayYMD
  const addDays = (ymd: string, offset: number): string => {
    const [y, m, d] = ymd.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };

  const today = todayYMD;
  const d1 = addDays(todayYMD, 1); // Tomorrow: NIGHT event (triggers EVENT_TOMORROW + DUE_WITHIN_7_DAYS)
  const d2 = addDays(todayYMD, 2); // Both DAY and NIGHT booked on Hall 1
  const d3 = addDays(todayYMD, 4); // FULL booking on Hall 1
  const d4 = addDays(todayYMD, 5); // NIGHT crossing midnight (ends 01:30 AM next day) on Hall 2

  // Booking 0: TODAY DAY slot on Hall 3 (so "Today's Events" and "Today at a glance" have active data immediately!)
  createBooking(
    roomId,
    {
      customer_id: cust4.id,
      hall_id: hall3.id,
      event_type: 'MEETING',
      event_date: today,
      slot: 'DAY',
      start_time: '09:00',
      end_time: '16:00',
      guest_count: 120,
      package_name: 'Corporate Executive Seminar / কর্পোরেট সেমিনার প্যাকেজ',
      extra_services: [{ type: 'CATERING', label: 'টি-ব্রেক ও লাঞ্চ বক্স', amount: 12000 }],
      advance_amount: 15000,
      status: 'CONFIRMED',
      notes: '[DEMO] আজকের দিনের স্লটে কর্পোরেট সভা',
      is_demo: true,
    },
    actor,
    todayYMD
  );

  // Booking 1: DAY slot on d2, Hall 1 (Confirmed)
  createBooking(
    roomId,
    {
      customer_id: cust1.id,
      hall_id: hall1.id,
      event_type: 'WEDDING',
      event_date: d2,
      slot: 'DAY',
      start_time: '08:00',
      end_time: '16:00',
      guest_count: 500,
      package_name: 'Royal Wedding Day Package / রয়েল ওয়েডিং ডে প্যাকেজ',
      extra_services: [
        { type: 'CATERING', label: 'শাহী কাচ্চি ও রোস্ট ক্যাটারিং', amount: 35000 },
        { type: 'DECORATION', label: 'তাজা ফুলের স্টেজ ডেকোরেশন', amount: 15000 },
      ],
      advance_amount: 40000,
      status: 'CONFIRMED',
      notes: '[DEMO] দিনের স্লটে বিয়ের অনুষ্ঠান',
      is_demo: true,
    },
    actor,
    todayYMD
  );

  // Booking 2: NIGHT slot on SAME date d2, SAME Hall 1 (Confirmed - proves Day + Night allowed together)
  createBooking(
    roomId,
    {
      customer_id: cust2.id,
      hall_id: hall1.id,
      event_type: 'HOLUD',
      event_date: d2,
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '23:30',
      guest_count: 350,
      package_name: 'Vibrant Holud Night / গায়ে হলুদ নাইট প্যাকেজ',
      extra_services: [
        { type: 'SOUND', label: 'ডিজে ও লাইভ সাউন্ড সিস্টেম', amount: 8000 },
        { type: 'LIGHTING', label: 'ফেস্টিভ্যাল লাইটিং', amount: 7000 },
      ],
      advance_amount: 25000,
      status: 'CONFIRMED',
      notes: '[DEMO] একই দিনে রাতের স্লটে গায়ে হলুদ',
      is_demo: true,
    },
    actor,
    todayYMD
  );

  // Booking 3: FULL slot (Day + Night) on d3, Hall 1 (Confirmed)
  createBooking(
    roomId,
    {
      customer_id: cust3.id,
      hall_id: hall1.id,
      event_type: 'RECEPTION',
      event_date: d3,
      slot: 'FULL',
      start_time: '08:00',
      end_time: '00:00',
      guest_count: 600,
      package_name: 'Grand Full-Day Reception / সারাদিন ও রাতব্যাপী বৌভাত প্যাকেজ',
      extra_services: [
        { type: 'CATERING', label: 'ভিআইপি ফুল-ডে ক্যাটারিং সার্ভিস', amount: 45000 },
        { type: 'DECORATION', label: 'গ্র্যান্ড ফ্লোরাল এন্ট্রান্স ও স্টেজ', amount: 25000 },
        { type: 'LIGHTING', label: 'রয়েল ঝাড়বাতি ও অ্যাম্বিয়েন্ট লাইট', amount: 10000 },
      ],
      advance_amount: 70000,
      status: 'CONFIRMED',
      notes: '[DEMO] দিন ও রাত (Full) বুকিং — উভয় স্লট সংরক্ষিত',
      is_demo: true,
    },
    actor,
    todayYMD
  );

  // Booking 4: NIGHT slot crossing midnight (18:00 to 01:30 AM next day) on d4, Hall 2
  createBooking(
    roomId,
    {
      customer_id: cust2.id,
      hall_id: hall2.id,
      event_type: 'RECEPTION',
      event_date: d4,
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '01:30',
      guest_count: 320,
      package_name: 'Late Night Reception / লেট নাইট রিসেপশন',
      extra_services: [
        { type: 'SOUND', label: 'মিউজিক্যাল নাইট সাউন্ড', amount: 6000 },
      ],
      advance_amount: 20000,
      status: 'CONFIRMED',
      notes: '[DEMO] মধ্যরাতের পরে (রাত ১:৩০) শেষ হওয়া বুকিং যা শুরুর তারিখেই থাকে',
      is_demo: true,
    },
    actor,
    todayYMD
  );

  // Booking 5: TENTATIVE NIGHT slot on d1 (Tomorrow), Hall 2 with 18-hour hold (triggers EVENT_TOMORROW + HOLD_EXPIRING_SOON + DUE_WITHIN_7_DAYS)
  createBooking(
    roomId,
    {
      customer_id: cust4.id,
      hall_id: hall2.id,
      event_type: 'AQIQAH',
      event_date: d1,
      slot: 'NIGHT',
      start_time: '18:00',
      end_time: '23:00',
      guest_count: 200,
      package_name: 'Family Aqiqah Night Package',
      extra_services: [],
      advance_amount: 5000,
      status: 'TENTATIVE',
      hold_hours: 18,
      notes: '[DEMO] আগামীকালের অস্থায়ী (Tentative) বুকিং',
      is_demo: true,
    },
    actor,
    todayYMD
  );

  // Seed 2 Demo Expenses so Expenses & Reports Profit are also populated out of the box
  createExpense(
    roomId,
    {
      category: 'ELECTRICITY',
      amount: 14500,
      expense_date: today,
      note: '[DEMO] মাসিক বিদ্যুৎ ও জেনারেটর জ্বালানি বিল',
      is_demo: true,
    },
    actor
  );

  createExpense(
    roomId,
    {
      category: 'CLEANING',
      amount: 5500,
      expense_date: today,
      note: '[DEMO] হল পরিষ্কার ও স্যানিটেশন সামগ্রী',
      is_demo: true,
    },
    actor
  );

  return { hallsCreated: 3, customersCreated: 4, bookingsCreated: 6 };
}

export function clearPart2DemoData(
  roomId: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): { bookingsRemoved: number; customersRemoved: number; hallsRemoved: number } {
  const db = getDb();
  db.exec('BEGIN IMMEDIATE');
  try {
    const demoBookings = db.prepare('SELECT id FROM bookings WHERE room_id = ? AND is_demo = 1').all(roomId) as Array<{ id: string }>;
    for (const b of demoBookings) {
      db.prepare('DELETE FROM booking_slot_locks WHERE booking_id = ?').run(b.id);
      db.prepare('DELETE FROM booking_history WHERE booking_id = ?').run(b.id);
    }
    const delB = db.prepare('DELETE FROM bookings WHERE room_id = ? AND is_demo = 1').run(roomId);
    db.prepare('DELETE FROM payments WHERE room_id = ? AND is_demo = 1').run(roomId);
    db.prepare('DELETE FROM expenses WHERE room_id = ? AND is_demo = 1').run(roomId);
    // Only delete demo customers and demo halls that have no remaining non-demo bookings
    const delC = db.prepare(`
      DELETE FROM customers
      WHERE room_id = ? AND is_demo = 1
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.customer_id = customers.id)
    `).run(roomId);
    const delH = db.prepare(`
      DELETE FROM halls
      WHERE room_id = ? AND is_demo = 1
      AND NOT EXISTS (SELECT 1 FROM bookings b WHERE b.hall_id = halls.id)
    `).run(roomId);

    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'DEMO_DATA_CLEARED',
      details: {
        bookingsRemoved: Number(delB.changes),
        customersRemoved: Number(delC.changes),
        hallsRemoved: Number(delH.changes),
      },
      ipAddress: actor.ip,
    });

    db.exec('COMMIT');
    return {
      bookingsRemoved: Number(delB.changes),
      customersRemoved: Number(delC.changes),
      hallsRemoved: Number(delH.changes),
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

// ======================== Part 3: Payments, Expenses, Reports & Notifications ========================

export type PaymentType = 'ADVANCE' | 'PARTIAL' | 'FINAL' | 'REFUND' | 'REVERSAL';
export type PaymentMethod = 'CASH' | 'BKASH' | 'NAGAD' | 'BANK' | 'OTHER';
export type ExpenseCategory = 'ELECTRICITY' | 'SALARY' | 'REPAIR' | 'CLEANING' | 'DECORATION_MATERIAL' | 'FOOD' | 'OTHER';
export type NotificationType =
  | 'NEW_BOOKING'
  | 'PAYMENT_RECEIVED'
  | 'HOLD_EXPIRING_SOON'
  | 'EVENT_TOMORROW'
  | 'DUE_WITHIN_7_DAYS'
  | 'JOIN_REQUEST_PENDING';

export interface PaymentRow {
  id: string;
  room_id: string;
  booking_id: string;
  receipt_number: string;
  payment_type: PaymentType;
  amount: number;
  payment_date: string; // YYYY-MM-DD in Asia/Dhaka
  method: PaymentMethod;
  reference_number: string | null;
  received_by_user_id: string;
  received_by_name: string;
  note: string | null;
  reverses_payment_id: string | null;
  is_reversed: number;
  reversed_by_payment_id: string | null;
  idempotency_key: string | null;
  is_demo: number;
  created_at: number;
  booking_number?: string;
  booking_slot?: SlotType;
  booking_event_date?: string;
  booking_start_time?: string;
  booking_end_time?: string;
  customer_name?: string;
  hall_name?: string;
}

export interface ExpenseRow {
  id: string;
  room_id: string;
  expense_number: string;
  category: ExpenseCategory;
  entry_type: 'EXPENSE' | 'REVERSAL';
  amount: number;
  expense_date: string; // YYYY-MM-DD in Asia/Dhaka
  note: string | null;
  receipt_photo: string | null;
  reverses_expense_id: string | null;
  is_reversed: number;
  reversed_by_expense_id: string | null;
  idempotency_key: string | null;
  is_demo: number;
  recorded_by_user_id: string;
  recorded_by_name: string;
  created_at: number;
}

export interface NotificationRow {
  id: string;
  room_id: string;
  dedup_key: string;
  type: NotificationType;
  is_money: number;
  owner_only: number;
  booking_id: string | null;
  slot: string | null;
  title_bn: string;
  title_en: string;
  message_bn: string;
  message_en: string;
  event_date: string | null;
  created_at: number;
  is_read?: boolean;
}

export function roundMoney(val: number): number {
  const cents = Math.round((Number(val) || 0) * 100);
  return cents / 100;
}

export function generateNextReceiptNumber(db: DatabaseSync, roomId: string, year: number): string {
  db.prepare(`
    INSERT INTO receipt_counters (room_id, year, last_seq)
    VALUES (?, ?, 1)
    ON CONFLICT(room_id, year) DO UPDATE SET last_seq = last_seq + 1
  `).run(roomId, year);

  const row = db.prepare('SELECT last_seq FROM receipt_counters WHERE room_id = ? AND year = ?').get(roomId, year) as { last_seq: number };
  let seq = row.last_seq;
  let candidate = `MR-${year}-${String(seq).padStart(4, '0')}`;
  while (db.prepare('SELECT 1 FROM payments WHERE receipt_number = ?').get(candidate)) {
    seq++;
    db.prepare('UPDATE receipt_counters SET last_seq = ? WHERE room_id = ? AND year = ?').run(seq, roomId, year);
    candidate = `MR-${year}-${String(seq).padStart(4, '0')}`;
  }
  return candidate;
}

export function recalculateBookingPaymentTotals(
  db: DatabaseSync,
  roomId: string,
  bookingId: string
): { total_amount: number; net_paid: number; due_amount: number } {
  const bRow = db.prepare('SELECT total_amount, status FROM bookings WHERE id = ? AND room_id = ?').get(bookingId, roomId) as { total_amount: number; status: BookingStatus } | undefined;
  if (!bRow) {
    return { total_amount: 0, net_paid: 0, due_amount: 0 };
  }

  const pRow = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as net_paid
    FROM payments
    WHERE room_id = ? AND booking_id = ?
  `).get(roomId, bookingId) as { cnt: number; net_paid: number };

  if (pRow.cnt === 0) {
    const existing = db.prepare('SELECT advance_amount, due_amount FROM bookings WHERE id = ? AND room_id = ?').get(bookingId, roomId) as { advance_amount: number; due_amount: number };
    const due = bRow.status === 'CANCELLED' ? 0 : Math.max(0, roundMoney(bRow.total_amount - existing.advance_amount));
    db.prepare('UPDATE bookings SET due_amount = ? WHERE id = ? AND room_id = ?').run(due, bookingId, roomId);
    return { total_amount: roundMoney(bRow.total_amount), net_paid: roundMoney(existing.advance_amount), due_amount: due };
  }

  const netPaid = roundMoney(pRow.net_paid);
  const dueAmount = bRow.status === 'CANCELLED' ? 0 : Math.max(0, roundMoney(bRow.total_amount - netPaid));

  db.prepare(`
    UPDATE bookings
    SET advance_amount = ?, due_amount = ?, updated_at = ?
    WHERE id = ? AND room_id = ?
  `).run(Math.max(0, netPaid), dueAmount, Date.now(), bookingId, roomId);

  return {
    total_amount: roundMoney(bRow.total_amount),
    net_paid: netPaid,
    due_amount: dueAmount,
  };
}

function mapPaymentRow(r: any): PaymentRow {
  return {
    ...r,
    amount: roundMoney(Number(r.amount)),
    is_reversed: Number(r.is_reversed || 0),
    is_demo: Number(r.is_demo || 0),
  };
}

export function getPaymentById(roomId: string, paymentId: string): PaymentRow | null {
  const db = getDb();
  const row = db.prepare(`
    SELECT p.*,
           b.booking_number, b.slot as booking_slot, b.event_date as booking_event_date,
           b.start_time as booking_start_time, b.end_time as booking_end_time,
           c.name as customer_name, h.name as hall_name
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE p.id = ? AND p.room_id = ?
  `).get(paymentId, roomId) as any;
  return row ? mapPaymentRow(row) : null;
}

export function getBookingPayments(roomId: string, bookingId: string): PaymentRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT p.*,
           b.booking_number, b.slot as booking_slot, b.event_date as booking_event_date,
           b.start_time as booking_start_time, b.end_time as booking_end_time,
           c.name as customer_name, h.name as hall_name
    FROM payments p
    JOIN bookings b ON p.booking_id = b.id
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE p.room_id = ? AND p.booking_id = ?
    ORDER BY p.created_at ASC
  `).all(roomId, bookingId) as any[];
  return rows.map(mapPaymentRow);
}

export function createPayment(
  roomId: string,
  bookingId: string,
  data: {
    payment_type: 'ADVANCE' | 'PARTIAL' | 'FINAL' | 'REFUND';
    amount: number;
    payment_date: string; // YYYY-MM-DD
    method: PaymentMethod;
    reference_number?: string | null;
    note?: string | null;
    confirm_overpayment?: boolean;
    idempotency_key?: string | null;
    is_demo?: boolean;
  },
  actor: { userId: string; email: string; name: string; role: RoleType; ip?: string }
): { payment: PaymentRow; booking: BookingRow; deduplicated: boolean } {
  const db = getDb();
  const idemKey = data.idempotency_key ? data.idempotency_key.trim() : null;
  if (idemKey) {
    const existing = db.prepare('SELECT id FROM payments WHERE room_id = ? AND idempotency_key = ?').get(roomId, idemKey) as { id: string } | undefined;
    if (existing) {
      return {
        payment: getPaymentById(roomId, existing.id)!,
        booking: getBookingById(roomId, bookingId)!,
        deduplicated: true,
      };
    }
  }

  const booking = getBookingById(roomId, bookingId);
  if (!booking) {
    const err: any = new Error('Booking not found');
    err.status = 404;
    err.messageBn = 'বুকিংটি খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Booking not found.';
    throw err;
  }

  const rawAmount = roundMoney(Number(data.amount));
  if (isNaN(rawAmount) || rawAmount <= 0) {
    const err: any = new Error('Payment amount must be greater than zero');
    err.code = 'INVALID_PAYMENT_AMOUNT';
    err.status = 400;
    err.messageBn = 'পেমেন্টের পরিমাণ শূন্য বা ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Zero or negative payment amounts are not allowed.';
    throw err;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.payment_date)) {
    const err: any = new Error('Invalid payment date');
    err.status = 400;
    err.messageBn = 'পেমেন্টের তারিখ সঠিক নয়।';
    err.messageEn = 'Invalid payment date format (YYYY-MM-DD required).';
    throw err;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    if (idemKey) {
      const existing = db.prepare('SELECT id FROM payments WHERE room_id = ? AND idempotency_key = ?').get(roomId, idemKey) as { id: string } | undefined;
      if (existing) {
        db.exec('COMMIT');
        return {
          payment: getPaymentById(roomId, existing.id)!,
          booking: getBookingById(roomId, bookingId)!,
          deduplicated: true,
        };
      }
    }

    // Backfill legacy Part 2 booking.advance_amount if no payment rows existed yet
    const existingPaymentsCount = db.prepare('SELECT COUNT(*) as cnt FROM payments WHERE room_id = ? AND booking_id = ?').get(roomId, bookingId) as { cnt: number };
    if (existingPaymentsCount.cnt === 0 && booking.advance_amount > 0) {
      const legacyYear = parseInt(booking.event_date.slice(0, 4), 10) || new Date().getFullYear();
      const legacyReceipt = generateNextReceiptNumber(db, roomId, legacyYear);
      db.prepare(`
        INSERT INTO payments (
          id, room_id, booking_id, receipt_number, payment_type, amount, payment_date,
          method, reference_number, received_by_user_id, received_by_name, note,
          idempotency_key, is_demo, created_at
        ) VALUES (?, ?, ?, ?, 'ADVANCE', ?, ?, 'CASH', NULL, ?, ?, 'Initial Advance', NULL, ?, ?)
      `).run(
        crypto.randomUUID(),
        roomId,
        bookingId,
        legacyReceipt,
        roundMoney(booking.advance_amount),
        booking.event_date,
        booking.created_by_user_id,
        booking.created_by_name,
        booking.is_demo,
        booking.created_at
      );
    }

    const totals = recalculateBookingPaymentTotals(db, roomId, bookingId);

    let signedAmount = rawAmount;
    if (data.payment_type === 'REFUND') {
      if (actor.role !== 'OWNER' && actor.role !== 'MANAGER') {
        const err: any = new Error('Only Owner or Manager can record refunds');
        err.status = 403;
        err.messageBn = 'শুধুমাত্র ওনার বা ম্যানেজার রিফান্ড এন্ট্রি করতে পারবেন।';
        err.messageEn = 'Only Owner or Manager can record a refund.';
        throw err;
      }
      if (rawAmount > totals.net_paid) {
        const err: any = new Error('Refund amount exceeds collected amount');
        err.code = 'REFUND_EXCEEDS_PAID';
        err.status = 400;
        err.messageBn = `রিফান্ডের পরিমাণ (৳${rawAmount}) মোট জমার (৳${totals.net_paid}) চেয়ে বেশি হতে পারবে না।`;
        err.messageEn = `Refund amount (৳${rawAmount}) cannot exceed total collected amount (৳${totals.net_paid}).`;
        throw err;
      }
      if (!data.note || data.note.trim().length < 2) {
        const err: any = new Error('Refund reason is required');
        err.status = 400;
        err.messageBn = 'রিফান্ডের কারণ উল্লেখ করা আবশ্যক।';
        err.messageEn = 'A reason/note is required when recording a refund.';
        throw err;
      }
      signedAmount = -rawAmount;
    } else {
      // ADVANCE, PARTIAL, or FINAL payment
      const remainingDue = Math.max(0, roundMoney(booking.total_amount - totals.net_paid));
      if (rawAmount > remainingDue && !data.confirm_overpayment) {
        const err: any = new Error('Overpayment warning: payment exceeds current due balance');
        err.code = 'OVERPAYMENT_WARNING';
        err.status = 400;
        err.dueAmount = remainingDue;
        err.messageBn = `সতর্কতা: পেমেন্টের পরিমাণ (৳${rawAmount}) বর্তমান বকেয়ার (৳${remainingDue}) চেয়ে বেশি! ওভারপেমেন্ট নিশ্চিত করতে অনুমোদন দিন অথবা সঠিক পরিমাণ লিখুন।`;
        err.messageEn = `Warning: Payment amount (৳${rawAmount}) exceeds the current due balance (৳${remainingDue})! Please confirm overpayment or enter an amount within the due balance.`;
        throw err;
      }
    }

    const year = parseInt(data.payment_date.slice(0, 4), 10) || new Date().getFullYear();
    const receiptNumber = generateNextReceiptNumber(db, roomId, year);
    const paymentId = crypto.randomUUID();
    const now = Date.now();

    db.prepare(`
      INSERT INTO payments (
        id, room_id, booking_id, receipt_number, payment_type, amount, payment_date,
        method, reference_number, received_by_user_id, received_by_name, note,
        idempotency_key, is_demo, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      paymentId,
      roomId,
      bookingId,
      receiptNumber,
      data.payment_type,
      signedAmount,
      data.payment_date,
      data.method,
      data.reference_number ? data.reference_number.trim() : null,
      actor.userId,
      actor.name,
      data.note ? data.note.trim() : null,
      idemKey,
      data.is_demo ? 1 : booking.is_demo,
      now
    );

    const updatedTotals = recalculateBookingPaymentTotals(db, roomId, bookingId);

    // Record in booking_history
    db.prepare(`
      INSERT INTO booking_history (id, booking_id, room_id, user_id, user_name, user_email, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      bookingId,
      roomId,
      actor.userId,
      actor.name,
      actor.email,
      data.payment_type === 'REFUND' ? 'PAYMENT_REFUNDED' : 'PAYMENT_RECORDED',
      JSON.stringify({
        receipt_number: receiptNumber,
        payment_type: data.payment_type,
        amount: signedAmount,
        method: data.method,
        payment_date: data.payment_date,
        new_net_paid: updatedTotals.net_paid,
        new_due_amount: updatedTotals.due_amount,
      }),
      now
    );

    // Audit Log (reference number is automatically masked by sanitizeAuditDetails)
    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: data.payment_type === 'REFUND' ? 'PAYMENT_REFUND' : 'PAYMENT_CREATE',
      details: {
        paymentId,
        receiptNumber,
        bookingId,
        bookingNumber: booking.booking_number,
        paymentType: data.payment_type,
        amount: signedAmount,
        method: data.method,
        referenceNumber: data.reference_number || null,
        newDueAmount: updatedTotals.due_amount,
      },
      ipAddress: actor.ip,
    });

    // Notification: PAYMENT_RECEIVED (isMoney = true -> Staff will not see it)
    const slotBn = booking.slot === 'DAY' ? 'দিন (Day)' : booking.slot === 'NIGHT' ? 'রাত (Night)' : 'দিন ও রাত (Full)';
    const slotEn = booking.slot === 'DAY' ? 'Day' : booking.slot === 'NIGHT' ? 'Night' : 'Full';
    const dualEventDate = formatDualDateFromYMD(booking.event_date);
    const amtBn = formatCurrency(Math.abs(signedAmount), 'bn');
    const amtEn = formatCurrency(Math.abs(signedAmount), 'en');
    const dueBn = formatCurrency(updatedTotals.due_amount, 'bn');
    const dueEn = formatCurrency(updatedTotals.due_amount, 'en');
    createNotificationIfNotExists(db, {
      roomId,
      dedupKey: `PAYMENT:${paymentId}`,
      type: 'PAYMENT_RECEIVED',
      isMoney: true,
      ownerOnly: false,
      bookingId,
      slot: booking.slot,
      eventDate: booking.event_date,
      titleBn:
        data.payment_type === 'REFUND'
          ? `রিফান্ড প্রদান (${toBanglaDigits(receiptNumber)}) — ${slotBn}`
          : `পেমেন্ট গৃহীত (${toBanglaDigits(receiptNumber)}) — ${slotBn}`,
      titleEn:
        data.payment_type === 'REFUND'
          ? `Refund Recorded (${receiptNumber}) — ${slotEn}`
          : `Payment Received (${receiptNumber}) — ${slotEn}`,
      messageBn: `বুকিং ${toBanglaDigits(booking.booking_number)} (${slotBn} স্লট, ${dualEventDate}) এর জন্য ${amtBn} (${data.method}) রেকর্ড হয়েছে। বর্তমান বকেয়া: ${dueBn}।`,
      messageEn: `${amtEn} (${data.method}) recorded for Booking ${booking.booking_number} (${slotEn} slot, ${dualEventDate}). Remaining due: ${dueEn}.`,
    });

    db.exec('COMMIT');
    return {
      payment: getPaymentById(roomId, paymentId)!,
      booking: getBookingById(roomId, bookingId)!,
      deduplicated: false,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

export function reversePayment(
  roomId: string,
  bookingId: string,
  targetPaymentId: string,
  reason: string,
  paymentDate: string,
  actor: { userId: string; email: string; name: string; role: RoleType; ip?: string }
): { reversalPayment: PaymentRow; originalPayment: PaymentRow; booking: BookingRow } {
  const db = getDb();
  const original = getPaymentById(roomId, targetPaymentId);
  if (!original || original.booking_id !== bookingId) {
    const err: any = new Error('Payment not found');
    err.status = 404;
    err.messageBn = 'পেমেন্ট রেকর্ডটি খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Payment record not found.';
    throw err;
  }

  if (original.payment_type === 'REVERSAL') {
    const err: any = new Error('A reversal entry cannot be reversed');
    err.status = 400;
    err.messageBn = 'রিভার্সাল এন্ট্রি পুনরায় রিভার্স করা যাবে না।';
    err.messageEn = 'A reversal entry cannot be reversed again.';
    throw err;
  }

  if (original.is_reversed === 1) {
    const err: any = new Error('Payment has already been reversed');
    err.status = 400;
    err.messageBn = 'এই পেমেন্টটি ইতোমধ্যে রিভার্স (বাতিল) করা হয়েছে।';
    err.messageEn = 'This payment has already been reversed.';
    throw err;
  }

  const trimmedReason = (reason || '').trim();
  if (trimmedReason.length < 2) {
    const err: any = new Error('Reversal reason is required');
    err.status = 400;
    err.messageBn = 'পেমেন্ট রিভার্স করার কারণ উল্লেখ করা আবশ্যক।';
    err.messageEn = 'A reason is required to reverse a payment.';
    throw err;
  }

  db.exec('BEGIN IMMEDIATE');
  try {
    const year = parseInt(paymentDate.slice(0, 4), 10) || new Date().getFullYear();
    const receiptNumber = generateNextReceiptNumber(db, roomId, year);
    const reversalId = crypto.randomUUID();
    const reversalAmount = roundMoney(-original.amount);
    const now = Date.now();

    db.prepare(`
      INSERT INTO payments (
        id, room_id, booking_id, receipt_number, payment_type, amount, payment_date,
        method, reference_number, received_by_user_id, received_by_name, note,
        reverses_payment_id, is_reversed, idempotency_key, is_demo, created_at
      ) VALUES (?, ?, ?, ?, 'REVERSAL', ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)
    `).run(
      reversalId,
      roomId,
      bookingId,
      receiptNumber,
      reversalAmount,
      paymentDate,
      original.method,
      original.reference_number,
      actor.userId,
      actor.name,
      `Reversal of ${original.receipt_number}: ${trimmedReason}`,
      original.id,
      original.is_demo,
      now
    );

    db.prepare(`
      UPDATE payments
      SET is_reversed = 1, reversed_by_payment_id = ?
      WHERE id = ? AND room_id = ?
    `).run(reversalId, original.id, roomId);

    const updatedTotals = recalculateBookingPaymentTotals(db, roomId, bookingId);

    db.prepare(`
      INSERT INTO booking_history (id, booking_id, room_id, user_id, user_name, user_email, action, changes, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'PAYMENT_REVERSED', ?, ?)
    `).run(
      crypto.randomUUID(),
      bookingId,
      roomId,
      actor.userId,
      actor.name,
      actor.email,
      JSON.stringify({
        reversed_receipt: original.receipt_number,
        reversal_receipt: receiptNumber,
        reversal_amount: reversalAmount,
        reason: trimmedReason,
        new_net_paid: updatedTotals.net_paid,
        new_due_amount: updatedTotals.due_amount,
      }),
      now
    );

    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'PAYMENT_REVERSE',
      details: {
        bookingId,
        bookingNumber: original.booking_number,
        originalPaymentId: original.id,
        originalReceiptNumber: original.receipt_number,
        reversalPaymentId: reversalId,
        reversalReceiptNumber: receiptNumber,
        reversalAmount,
        reason: trimmedReason,
        newDueAmount: updatedTotals.due_amount,
      },
      ipAddress: actor.ip,
    });

    db.exec('COMMIT');
    return {
      reversalPayment: getPaymentById(roomId, reversalId)!,
      originalPayment: getPaymentById(roomId, original.id)!,
      booking: getBookingById(roomId, bookingId)!,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

// ======================== Expenses Repository (Owner & Manager Only) ========================

function mapExpenseRow(r: any): ExpenseRow {
  return {
    ...r,
    amount: roundMoney(Number(r.amount)),
    is_reversed: Number(r.is_reversed || 0),
    is_demo: Number(r.is_demo || 0),
  };
}

export function getExpenseById(roomId: string, expenseId: string): ExpenseRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM expenses WHERE id = ? AND room_id = ?').get(expenseId, roomId) as any;
  return row ? mapExpenseRow(row) : null;
}

export function listRoomExpenses(
  roomId: string,
  filter: {
    category?: ExpenseCategory | '';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  } = {}
): { expenses: ExpenseRow[]; total: number; netTotalAmount: number } {
  const db = getDb();
  let where = 'WHERE room_id = ?';
  const params: any[] = [roomId];

  if (filter.category) {
    where += ' AND category = ?';
    params.push(filter.category);
  }
  if (filter.dateFrom) {
    where += ' AND expense_date >= ?';
    params.push(filter.dateFrom);
  }
  if (filter.dateTo) {
    where += ' AND expense_date <= ?';
    params.push(filter.dateTo);
  }

  const statRow = db.prepare(`
    SELECT COUNT(*) as cnt, COALESCE(SUM(amount), 0) as net_total
    FROM expenses
    ${where}
  `).get(...params) as { cnt: number; net_total: number };

  const limit = Math.min(200, Math.max(1, filter.limit || 100));
  const offset = Math.max(0, filter.offset || 0);

  const rows = db.prepare(`
    SELECT * FROM expenses
    ${where}
    ORDER BY expense_date DESC, created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, limit, offset) as any[];

  return {
    expenses: rows.map(mapExpenseRow),
    total: statRow.cnt,
    netTotalAmount: roundMoney(statRow.net_total),
  };
}

export function createExpense(
  roomId: string,
  data: {
    category: ExpenseCategory;
    amount: number;
    expense_date: string;
    note?: string | null;
    receipt_photo?: string | null;
    idempotency_key?: string | null;
    is_demo?: boolean;
  },
  actor: { userId: string; email: string; name: string; ip?: string }
): { expense: ExpenseRow; deduplicated: boolean } {
  const db = getDb();
  const idemKey = data.idempotency_key ? data.idempotency_key.trim() : null;
  if (idemKey) {
    const existing = db.prepare('SELECT id FROM expenses WHERE room_id = ? AND idempotency_key = ?').get(roomId, idemKey) as { id: string } | undefined;
    if (existing) {
      return { expense: getExpenseById(roomId, existing.id)!, deduplicated: true };
    }
  }

  const amount = roundMoney(Number(data.amount));
  if (isNaN(amount) || amount <= 0) {
    const err: any = new Error('Expense amount must be greater than zero');
    err.status = 400;
    err.messageBn = 'খরচের পরিমাণ শূন্য বা ঋণাত্মক হতে পারবে না।';
    err.messageEn = 'Expense amount must be greater than zero.';
    throw err;
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  const year = parseInt(data.expense_date.slice(0, 4), 10) || new Date().getFullYear();
  const expenseNumber = `EXP-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

  db.prepare(`
    INSERT INTO expenses (
      id, room_id, expense_number, category, entry_type, amount, expense_date,
      note, receipt_photo, idempotency_key, is_demo, recorded_by_user_id, recorded_by_name, created_at
    ) VALUES (?, ?, ?, ?, 'EXPENSE', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    roomId,
    expenseNumber,
    data.category,
    amount,
    data.expense_date,
    data.note ? data.note.trim() : null,
    data.receipt_photo || null,
    idemKey,
    data.is_demo ? 1 : 0,
    actor.userId,
    actor.name,
    now
  );

  addAuditLog({
    roomId,
    userId: actor.userId,
    userEmail: actor.email,
    userName: actor.name,
    action: 'EXPENSE_CREATE',
    details: {
      expenseId: id,
      expenseNumber,
      category: data.category,
      amount,
      expenseDate: data.expense_date,
      hasPhoto: Boolean(data.receipt_photo),
    },
    ipAddress: actor.ip,
  });

  return { expense: getExpenseById(roomId, id)!, deduplicated: false };
}

export function reverseExpense(
  roomId: string,
  targetExpenseId: string,
  reason: string,
  expenseDate: string,
  actor: { userId: string; email: string; name: string; ip?: string }
): { reversalExpense: ExpenseRow; originalExpense: ExpenseRow } {
  const db = getDb();
  const original = getExpenseById(roomId, targetExpenseId);
  if (!original) {
    const err: any = new Error('Expense not found');
    err.status = 404;
    err.messageBn = 'খরচের রেকর্ডটি খুঁজে পাওয়া যায়নি।';
    err.messageEn = 'Expense record not found.';
    throw err;
  }

  if (original.entry_type === 'REVERSAL') {
    const err: any = new Error('Reversal entry cannot be reversed again');
    err.status = 400;
    err.messageBn = 'রিভার্সাল এন্ট্রি পুনরায় রিভার্স করা যাবে না।';
    err.messageEn = 'A reversal entry cannot be reversed again.';
    throw err;
  }

  if (original.is_reversed === 1) {
    const err: any = new Error('Expense already reversed');
    err.status = 400;
    err.messageBn = 'এই খরচটি ইতোমধ্যে রিভার্স (বাতিল) করা হয়েছে।';
    err.messageEn = 'This expense has already been reversed.';
    throw err;
  }

  const trimmedReason = (reason || '').trim();
  if (trimmedReason.length < 2) {
    const err: any = new Error('Reason is required to reverse an expense');
    err.status = 400;
    err.messageBn = 'খরচ রিভার্স করার কারণ উল্লেখ করা আবশ্যক।';
    err.messageEn = 'A reason is required to reverse an expense.';
    throw err;
  }

  const reversalId = crypto.randomUUID();
  const now = Date.now();
  const year = parseInt(expenseDate.slice(0, 4), 10) || new Date().getFullYear();
  const expenseNumber = `EXPREV-${year}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const reversalAmount = roundMoney(-original.amount);

  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare(`
      INSERT INTO expenses (
        id, room_id, expense_number, category, entry_type, amount, expense_date,
        note, receipt_photo, reverses_expense_id, is_reversed, is_demo,
        recorded_by_user_id, recorded_by_name, created_at
      ) VALUES (?, ?, ?, ?, 'REVERSAL', ?, ?, ?, NULL, ?, 0, ?, ?, ?, ?)
    `).run(
      reversalId,
      roomId,
      expenseNumber,
      original.category,
      reversalAmount,
      expenseDate,
      `Reversal of ${original.expense_number}: ${trimmedReason}`,
      original.id,
      original.is_demo,
      actor.userId,
      actor.name,
      now
    );

    db.prepare(`
      UPDATE expenses
      SET is_reversed = 1, reversed_by_expense_id = ?
      WHERE id = ? AND room_id = ?
    `).run(reversalId, original.id, roomId);

    addAuditLog({
      roomId,
      userId: actor.userId,
      userEmail: actor.email,
      userName: actor.name,
      action: 'EXPENSE_REVERSE',
      details: {
        originalExpenseId: original.id,
        originalExpenseNumber: original.expense_number,
        reversalExpenseId: reversalId,
        reversalExpenseNumber: expenseNumber,
        reversalAmount,
        reason: trimmedReason,
      },
      ipAddress: actor.ip,
    });

    db.exec('COMMIT');
    return {
      reversalExpense: getExpenseById(roomId, reversalId)!,
      originalExpense: getExpenseById(roomId, original.id)!,
    };
  } catch (err) {
    try {
      db.exec('ROLLBACK');
    } catch {}
    throw err;
  }
}

// ======================== Notifications Centre ========================

export function createNotificationIfNotExists(
  db: DatabaseSync,
  data: {
    roomId: string;
    dedupKey: string;
    type: NotificationType;
    isMoney: boolean;
    ownerOnly: boolean;
    bookingId?: string | null;
    slot?: string | null;
    eventDate?: string | null;
    titleBn: string;
    titleEn: string;
    messageBn: string;
    messageEn: string;
  }
): void {
  db.prepare(`
    INSERT OR IGNORE INTO notifications (
      id, room_id, dedup_key, type, is_money, owner_only,
      booking_id, slot, title_bn, title_en, message_bn, message_en, event_date, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    data.roomId,
    data.dedupKey,
    data.type,
    data.isMoney ? 1 : 0,
    data.ownerOnly ? 1 : 0,
    data.bookingId || null,
    data.slot || null,
    data.titleBn,
    data.titleEn,
    data.messageBn,
    data.messageEn,
    data.eventDate || null,
    Date.now()
  );
}

/**
 * Evaluates time-based and state-based alerts without ever duplicating:
 * - TENTATIVE hold expiring soon (within 24 hours)
 * - EVENT_TOMORROW (names the slot and start time, e.g. "Night event tomorrow, 18:00")
 * - DUE_WITHIN_7_DAYS (money notification for Owner/Manager only)
 * - JOIN_REQUEST_PENDING (Owner only)
 */
export function evaluateRoomNotifications(roomId: string, todayYMD: string): void {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();
  const now = Date.now();

  const [ty, tm, td] = todayYMD.split('-').map(Number);
  const makeOffsetYMD = (days: number) => {
    const dt = new Date(Date.UTC(ty, tm - 1, td + days));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };

  const tomorrowYMD = makeOffsetYMD(1);
  const plus7DaysYMD = makeOffsetYMD(7);

  const slotLabelBn = (s: string) => (s === 'DAY' ? 'দিন (Day)' : s === 'NIGHT' ? 'রাত (Night)' : 'দিন ও রাত (Full)');
  const slotLabelEn = (s: string) => (s === 'DAY' ? 'Day' : s === 'NIGHT' ? 'Night' : 'Full');

  // 1. Event Tomorrow
  const tomorrowBookings = db.prepare(`
    SELECT b.*, c.name as customer_name, h.name as hall_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE b.room_id = ? AND b.event_date = ? AND b.status IN ('CONFIRMED', 'TENTATIVE')
  `).all(roomId, tomorrowYMD) as any[];

  for (const b of tomorrowBookings) {
    const sBn = slotLabelBn(b.slot);
    const sEn = slotLabelEn(b.slot);
    const dualDate = formatDualDateFromYMD(b.event_date);
    const start12Bn = formatTimeString12(b.start_time, 'bn');
    const end12Bn = formatTimeString12(b.end_time, 'bn');
    const start12En = formatTimeString12(b.start_time, 'en');
    const end12En = formatTimeString12(b.end_time, 'en');
    createNotificationIfNotExists(db, {
      roomId,
      dedupKey: `EVENT_TOMORROW:${b.id}:${b.event_date}:${b.slot}`,
      type: 'EVENT_TOMORROW',
      isMoney: false,
      ownerOnly: false,
      bookingId: b.id,
      slot: b.slot,
      eventDate: b.event_date,
      titleBn: `আগামীকাল ${sBn} ইভেন্ট, ${start12Bn}`,
      titleEn: `${sEn} event tomorrow, ${start12En}`,
      messageBn: `আগামীকাল (${dualDate}) ${b.hall_name}-এ ${sBn} স্লটে (${start12Bn} – ${end12Bn}) "${b.customer_name}" এর অনুষ্ঠান (${toBanglaDigits(b.booking_number)}) রয়েছে।`,
      messageEn: `${sEn} event tomorrow (${dualDate}, ${start12En} – ${end12En}) at ${b.hall_name} for "${b.customer_name}" (${b.booking_number}).`,
    });
  }

  // 2. Due Balance for an event within 7 days (Money notification -> Owner & Manager only)
  const upcomingWithDue = db.prepare(`
    SELECT b.*, c.name as customer_name, h.name as hall_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE b.room_id = ? AND b.event_date >= ? AND b.event_date <= ?
      AND b.status IN ('CONFIRMED', 'TENTATIVE') AND b.due_amount > 0
  `).all(roomId, todayYMD, plus7DaysYMD) as any[];

  for (const b of upcomingWithDue) {
    const sBn = slotLabelBn(b.slot);
    const sEn = slotLabelEn(b.slot);
    const dualDate = formatDualDateFromYMD(b.event_date);
    const dueBn = formatCurrency(b.due_amount, 'bn');
    const dueEn = formatCurrency(b.due_amount, 'en');
    createNotificationIfNotExists(db, {
      roomId,
      dedupKey: `DUE_7D:${b.id}:${b.event_date}`,
      type: 'DUE_WITHIN_7_DAYS',
      isMoney: true,
      ownerOnly: false,
      bookingId: b.id,
      slot: b.slot,
      eventDate: b.event_date,
      titleBn: `৭ দিনের মধ্যে ইভেন্টের বকেয়া (${sBn} স্লট)`,
      titleEn: `Due balance for ${sEn} event within 7 days`,
      messageBn: `${dualDate} তারিখে ${b.hall_name}-এর ${sBn} ইভেন্টের (${toBanglaDigits(b.booking_number)}) বকেয়া রয়েছে ${dueBn}।`,
      messageEn: `Booking ${b.booking_number} (${sEn} slot on ${dualDate} at ${b.hall_name}) has an outstanding due balance of ${dueEn}.`,
    });
  }

  // 3. Tentative Hold Expiring Soon (within next 24 hours)
  const soonCutoff = now + 24 * 3600 * 1000;
  const expiringHolds = db.prepare(`
    SELECT b.*, c.name as customer_name, h.name as hall_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE b.room_id = ? AND b.status = 'TENTATIVE' AND b.hold_expires_at IS NOT NULL
      AND b.hold_expires_at > ? AND b.hold_expires_at <= ?
  `).all(roomId, now, soonCutoff) as any[];

  for (const b of expiringHolds) {
    const sBn = slotLabelBn(b.slot);
    const sEn = slotLabelEn(b.slot);
    const dualDate = formatDualDateFromYMD(b.event_date);
    createNotificationIfNotExists(db, {
      roomId,
      dedupKey: `HOLD_EXPIRING:${b.id}`,
      type: 'HOLD_EXPIRING_SOON',
      isMoney: false,
      ownerOnly: false,
      bookingId: b.id,
      slot: b.slot,
      eventDate: b.event_date,
      titleBn: `অস্থায়ী বুকিংয়ের মেয়াদ শীঘ্রই শেষ হচ্ছে (${sBn})`,
      titleEn: `Tentative ${sEn} hold expiring soon (${b.booking_number})`,
      messageBn: `${dualDate} তারিখে ${b.hall_name}-এর ${sBn} স্লটের অস্থায়ী হোল্ড (${toBanglaDigits(b.booking_number)}) শীঘ্রই মেয়াদোত্তীর্ণ হবে।`,
      messageEn: `Tentative hold for ${sEn} slot on ${dualDate} (${b.booking_number}) at ${b.hall_name} is expiring soon.`,
    });
  }

  // 4. Pending Join Requests (Owner only)
  const pendingJoins = db.prepare(`
    SELECT rm.id, rm.user_id, u.name, u.email
    FROM room_members rm
    JOIN users u ON rm.user_id = u.id
    WHERE rm.room_id = ? AND rm.status = 'PENDING'
  `).all(roomId) as any[];

  for (const pj of pendingJoins) {
    createNotificationIfNotExists(db, {
      roomId,
      dedupKey: `JOIN_PENDING:${pj.id}`,
      type: 'JOIN_REQUEST_PENDING',
      isMoney: false,
      ownerOnly: true,
      titleBn: `নতুন সদস্যের যোগদানের আবেদন অপেক্ষমান`,
      titleEn: `Join request pending approval`,
      messageBn: `${pj.name} (${pj.email}) এই রুমে যোগদানের জন্য আবেদন করেছেন।`,
      messageEn: `${pj.name} (${pj.email}) requested to join this room.`,
    });
  }
}

export function getUserNotifications(
  roomId: string,
  userId: string,
  role: RoleType,
  todayYMD: string
): { notifications: NotificationRow[]; unreadCount: number } {
  evaluateRoomNotifications(roomId, todayYMD);
  const db = getDb();

  let roleFilter = '';
  if (role === 'STAFF' || role === 'VIEWER') {
    // Staff and Viewer do NOT get money notifications or owner-only notifications
    roleFilter = 'AND n.is_money = 0 AND n.owner_only = 0';
  } else if (role === 'MANAGER') {
    roleFilter = 'AND n.owner_only = 0';
  }

  const rows = db.prepare(`
    SELECT n.*,
           CASE WHEN nr.notification_id IS NOT NULL THEN 1 ELSE 0 END as is_read_flag
    FROM notifications n
    LEFT JOIN notification_reads nr ON n.id = nr.notification_id AND nr.user_id = ?
    WHERE n.room_id = ? ${roleFilter}
    ORDER BY n.created_at DESC
    LIMIT 100
  `).all(userId, roomId) as any[];

  const notifications: NotificationRow[] = rows.map((r) => ({
    id: r.id,
    room_id: r.room_id,
    dedup_key: r.dedup_key,
    type: r.type,
    is_money: Number(r.is_money),
    owner_only: Number(r.owner_only),
    booking_id: r.booking_id,
    slot: r.slot,
    title_bn: r.title_bn,
    title_en: r.title_en,
    message_bn: r.message_bn,
    message_en: r.message_en,
    event_date: r.event_date,
    created_at: Number(r.created_at),
    is_read: r.is_read_flag === 1,
  }));

  const unreadCount = notifications.filter((n) => !n.is_read).length;
  return { notifications, unreadCount };
}

export function markNotificationRead(roomId: string, notificationId: string, userId: string): void {
  const db = getDb();
  const notif = db.prepare('SELECT id FROM notifications WHERE id = ? AND room_id = ?').get(notificationId, roomId);
  if (!notif) return;
  db.prepare(`
    INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at)
    VALUES (?, ?, ?)
  `).run(notificationId, userId, Date.now());
}

export function markAllNotificationsRead(roomId: string, userId: string, role: RoleType): void {
  const db = getDb();
  let roleFilter = '';
  if (role === 'STAFF' || role === 'VIEWER') {
    roleFilter = 'AND is_money = 0 AND owner_only = 0';
  } else if (role === 'MANAGER') {
    roleFilter = 'AND owner_only = 0';
  }

  const unreadIds = db.prepare(`
    SELECT id FROM notifications
    WHERE room_id = ? ${roleFilter}
  `).all(roomId) as Array<{ id: string }>;

  const now = Date.now();
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at)
    VALUES (?, ?, ?)
  `);
  for (const n of unreadIds) {
    stmt.run(n.id, userId, now);
  }
}

// ======================== Reports & Analytics Engine (Owner & Manager Only) ========================

export interface FinancialReportSummary {
  dateFrom: string;
  dateTo: string;
  slotFilter: SlotType | 'ALL';
  totalBookings: number;
  activeBookingsCount: number;
  cancellationsCount: number;
  revenue: number;
  collected: number;
  refundsTotal: number;
  due: number;
  expenses: number;
  profit: number;
  slotBreakdown: {
    DAY: { count: number; revenue: number; collected: number; due: number };
    NIGHT: { count: number; revenue: number; collected: number; due: number };
    FULL: { count: number; revenue: number; collected: number; due: number };
  };
  occupancyByHall: Array<{
    hall_id: string;
    hall_name: string;
    total_days_in_range: number;
    day_slots_booked: number;
    night_slots_booked: number;
    day_occupancy_pct: number;
    night_occupancy_pct: number;
    overall_occupancy_pct: number;
  }>;
  occupancyByMonth: Array<{
    month: string; // YYYY-MM
    days_in_month_range: number;
    active_halls_count: number;
    day_slots_booked: number;
    night_slots_booked: number;
    day_occupancy_pct: number;
    night_occupancy_pct: number;
  }>;
  busiestMonths: Array<{ month: string; bookingsCount: number; revenue: number }>;
  popularEventTypes: Array<{ event_type: EventType; count: number; revenue: number }>;
  outstandingDuesList: Array<{
    booking_id: string;
    booking_number: string;
    customer_name: string;
    customer_phone: string;
    hall_name: string;
    event_date: string;
    slot: SlotType;
    start_time: string;
    end_time: string;
    total_amount: number;
    paid_amount: number;
    due_amount: number;
    status: BookingStatus;
  }>;
  bookingsInReport: BookingRow[];
}

function countDaysInclusive(dateFrom: string, dateTo: string): number {
  const [y1, m1, d1] = dateFrom.split('-').map(Number);
  const [y2, m2, d2] = dateTo.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1);
  const t2 = Date.UTC(y2, m2 - 1, d2);
  if (t2 < t1) return 1;
  return Math.max(1, Math.round((t2 - t1) / (1000 * 60 * 60 * 24)) + 1);
}

export function generateRoomReport(
  roomId: string,
  options: {
    dateFrom: string;
    dateTo: string;
    slot?: SlotType | '';
    hallId?: string;
  }
): FinancialReportSummary {
  releaseExpiredTentativeBookings(roomId);
  const db = getDb();

  const { dateFrom, dateTo } = options;
  const slotFilter: SlotType | 'ALL' = options.slot ? options.slot : 'ALL';

  let bWhere = 'WHERE b.room_id = ? AND b.event_date >= ? AND b.event_date <= ?';
  const bParams: any[] = [roomId, dateFrom, dateTo];
  if (options.slot) {
    bWhere += ' AND b.slot = ?';
    bParams.push(options.slot);
  }
  if (options.hallId) {
    bWhere += ' AND b.hall_id = ?';
    bParams.push(options.hallId);
  }

  const rawBookings = db.prepare(`
    SELECT b.*,
           c.name as customer_name, c.phone as customer_phone,
           h.name as hall_name, h.capacity as hall_capacity
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    ${bWhere}
    ORDER BY b.event_date ASC, b.start_time ASC
  `).all(...bParams) as any[];

  const bookings = rawBookings.map(mapBookingRow);

  // Sum recorded payments per booking in range
  const paymentSumsByBooking = new Map<string, { netPaid: number; refunds: number }>();
  const allPaymentsForRoom = db.prepare(`
    SELECT booking_id, payment_type, amount
    FROM payments
    WHERE room_id = ?
  `).all(roomId) as Array<{ booking_id: string; payment_type: PaymentType; amount: number }>;

  for (const p of allPaymentsForRoom) {
    const cur = paymentSumsByBooking.get(p.booking_id) || { netPaid: 0, refunds: 0 };
    cur.netPaid = roundMoney(cur.netPaid + Number(p.amount));
    if (p.payment_type === 'REFUND') {
      cur.refunds = roundMoney(cur.refunds + Math.abs(Number(p.amount)));
    }
    paymentSumsByBooking.set(p.booking_id, cur);
  }

  let totalBookings = 0;
  let activeBookingsCount = 0;
  let cancellationsCount = 0;
  let revenue = 0;
  let collected = 0;
  let refundsTotal = 0;
  let due = 0;

  const slotBreakdown = {
    DAY: { count: 0, revenue: 0, collected: 0, due: 0 },
    NIGHT: { count: 0, revenue: 0, collected: 0, due: 0 },
    FULL: { count: 0, revenue: 0, collected: 0, due: 0 },
  };

  const monthMap = new Map<string, { bookingsCount: number; revenue: number; daySlots: number; nightSlots: number }>();
  const eventTypeMap = new Map<EventType, { count: number; revenue: number }>();
  const hallSlotUsageMap = new Map<string, { daySlots: number; nightSlots: number }>();
  const outstandingDuesList: FinancialReportSummary['outstandingDuesList'] = [];

  for (const b of bookings) {
    totalBookings++;
    const pInfo = paymentSumsByBooking.get(b.id);
    const bookingNetPaid = pInfo !== undefined ? roundMoney(pInfo.netPaid) : roundMoney(b.advance_amount);
    const bookingRefunds = pInfo !== undefined ? roundMoney(pInfo.refunds) : 0;

    refundsTotal = roundMoney(refundsTotal + bookingRefunds);
    // Collected includes net payments received for bookings in the range (after subtracting refunds & reversals)
    collected = roundMoney(collected + bookingNetPaid);
    slotBreakdown[b.slot].collected = roundMoney(slotBreakdown[b.slot].collected + bookingNetPaid);

    if (b.status === 'CANCELLED') {
      cancellationsCount++;
      // Rule: Cancelled bookings must NOT count as revenue!
      continue;
    }

    activeBookingsCount++;
    const bRev = roundMoney(b.total_amount);
    const bDue = Math.max(0, roundMoney(bRev - bookingNetPaid));

    revenue = roundMoney(revenue + bRev);
    due = roundMoney(due + bDue);

    slotBreakdown[b.slot].count++;
    slotBreakdown[b.slot].revenue = roundMoney(slotBreakdown[b.slot].revenue + bRev);
    slotBreakdown[b.slot].due = roundMoney(slotBreakdown[b.slot].due + bDue);

    // Monthly aggregation (Night bookings ending after midnight stay on their starting event_date!)
    const ym = b.event_date.slice(0, 7);
    const mStat = monthMap.get(ym) || { bookingsCount: 0, revenue: 0, daySlots: 0, nightSlots: 0 };
    mStat.bookingsCount++;
    mStat.revenue = roundMoney(mStat.revenue + bRev);
    // Rule: A Full booking counts once for Day and once for Night, never double!
    if (b.slot === 'DAY' || b.slot === 'FULL') mStat.daySlots++;
    if (b.slot === 'NIGHT' || b.slot === 'FULL') mStat.nightSlots++;
    monthMap.set(ym, mStat);

    // Hall occupancy aggregation
    const hStat = hallSlotUsageMap.get(b.hall_id) || { daySlots: 0, nightSlots: 0 };
    if (b.slot === 'DAY' || b.slot === 'FULL') hStat.daySlots++;
    if (b.slot === 'NIGHT' || b.slot === 'FULL') hStat.nightSlots++;
    hallSlotUsageMap.set(b.hall_id, hStat);

    // Popular event types
    const eStat = eventTypeMap.get(b.event_type) || { count: 0, revenue: 0 };
    eStat.count++;
    eStat.revenue = roundMoney(eStat.revenue + bRev);
    eventTypeMap.set(b.event_type, eStat);

    if (bDue > 0) {
      outstandingDuesList.push({
        booking_id: b.id,
        booking_number: b.booking_number,
        customer_name: b.customer_name || '',
        customer_phone: b.customer_phone || '',
        hall_name: b.hall_name || '',
        event_date: b.event_date,
        slot: b.slot,
        start_time: b.start_time,
        end_time: b.end_time,
        total_amount: bRev,
        paid_amount: bookingNetPaid,
        due_amount: bDue,
        status: b.status,
      });
    }
  }

  // Expenses in date range
  const expRow = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) as total_exp
    FROM expenses
    WHERE room_id = ? AND expense_date >= ? AND expense_date <= ?
  `).get(roomId, dateFrom, dateTo) as { total_exp: number };
  const expenses = roundMoney(expRow.total_exp);

  // Profit = Revenue - Expenses
  const profit = roundMoney(revenue - expenses);

  // Occupancy per hall
  const totalDaysInRange = countDaysInclusive(dateFrom, dateTo);
  const allHalls = getRoomHalls(roomId, true).filter((h) => !options.hallId || h.id === options.hallId);
  const occupancyByHall = allHalls.map((h) => {
    const usage = hallSlotUsageMap.get(h.id) || { daySlots: 0, nightSlots: 0 };
    const dayPct = Math.min(100, roundMoney((usage.daySlots / totalDaysInRange) * 100));
    const nightPct = Math.min(100, roundMoney((usage.nightSlots / totalDaysInRange) * 100));
    const overallPct = Math.min(100, roundMoney(((usage.daySlots + usage.nightSlots) / (totalDaysInRange * 2)) * 100));
    return {
      hall_id: h.id,
      hall_name: h.name,
      total_days_in_range: totalDaysInRange,
      day_slots_booked: usage.daySlots,
      night_slots_booked: usage.nightSlots,
      day_occupancy_pct: dayPct,
      night_occupancy_pct: nightPct,
      overall_occupancy_pct: overallPct,
    };
  });

  // Occupancy per month
  const activeHallsCount = Math.max(1, allHalls.length);
  const occupancyByMonth = Array.from(monthMap.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([ym, mStat]) => {
      const [yStr, mStr] = ym.split('-');
      const daysInFullMonth = new Date(Date.UTC(Number(yStr), Number(mStr), 0)).getUTCDate();
      const capacityPerSlot = daysInFullMonth * activeHallsCount;
      return {
        month: ym,
        days_in_month_range: daysInFullMonth,
        active_halls_count: activeHallsCount,
        day_slots_booked: mStat.daySlots,
        night_slots_booked: mStat.nightSlots,
        day_occupancy_pct: Math.min(100, roundMoney((mStat.daySlots / capacityPerSlot) * 100)),
        night_occupancy_pct: Math.min(100, roundMoney((mStat.nightSlots / capacityPerSlot) * 100)),
      };
    });

  const busiestMonths = Array.from(monthMap.entries())
    .map(([month, data]) => ({ month, bookingsCount: data.bookingsCount, revenue: data.revenue }))
    .sort((a, b) => b.bookingsCount - a.bookingsCount || b.revenue - a.revenue);

  const popularEventTypes = Array.from(eventTypeMap.entries())
    .map(([event_type, data]) => ({ event_type, count: data.count, revenue: data.revenue }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue);

  return {
    dateFrom,
    dateTo,
    slotFilter,
    totalBookings,
    activeBookingsCount,
    cancellationsCount,
    revenue,
    collected,
    refundsTotal,
    due,
    expenses,
    profit,
    slotBreakdown,
    occupancyByHall,
    occupancyByMonth,
    busiestMonths,
    popularEventTypes,
    outstandingDuesList,
    bookingsInReport: bookings,
  };
}

// ======================== Part 4: Executive Dashboard Engine ========================

export interface DashboardSummary {
  todayYMD: string;
  currentMonthYM: string;
  monthStartYMD: string;
  monthEndYMD: string;
  hideMoney: boolean;
  summaryCards: {
    todaysEventsCount: number;
    upcomingWeekCount: number;
    pendingTentativeCount: number;
    thisMonthRevenue?: number;
    totalDueAmount?: number;
    freeDaySlotsThisMonth: number;
    freeNightSlotsThisMonth: number;
    totalDaySlotsCapacityThisMonth: number;
    totalNightSlotsCapacityThisMonth: number;
  };
  todayAtAGlance: Array<{
    hall_id: string;
    hall_name: string;
    capacity: number;
    day_status: 'FREE' | 'TENTATIVE' | 'CONFIRMED';
    night_status: 'FREE' | 'TENTATIVE' | 'CONFIRMED';
    day_holder: {
      booking_id: string;
      booking_number: string;
      customer_name: string;
      slot: SlotType;
      status: BookingStatus;
      start_time: string;
      end_time: string;
    } | null;
    night_holder: {
      booking_id: string;
      booking_number: string;
      customer_name: string;
      slot: SlotType;
      status: BookingStatus;
      start_time: string;
      end_time: string;
    } | null;
  }>;
  todaysEventsGrouped: {
    DAY: Array<Partial<BookingRow>>;
    NIGHT: Array<Partial<BookingRow>>;
  };
  upcomingNext7Days: Array<Partial<BookingRow>>;
  miniCalendarBookings: Array<{
    id: string;
    booking_number: string;
    event_date: string;
    slot: SlotType;
    status: BookingStatus;
    start_time: string;
    end_time: string;
    customer_name: string;
    hall_id: string;
    hall_name: string;
    event_type: EventType;
  }>;
  alerts: {
    expiringHolds: Array<{
      booking_id: string;
      booking_number: string;
      customer_name: string;
      hall_name: string;
      event_date: string;
      slot: SlotType;
      hold_expires_at: number;
    }>;
    duesWithin7Days?: Array<{
      booking_id: string;
      booking_number: string;
      customer_name: string;
      hall_name: string;
      event_date: string;
      slot: SlotType;
      due_amount: number;
    }>;
    pendingJoinRequests: Array<{
      member_id: string;
      user_id: string;
      user_name: string;
      user_email: string;
      created_at: number;
    }>;
  };
  charts: {
    monthlySeries: Array<{
      month: string; // YYYY-MM
      bookingsCount: number;
      revenue?: number;
    }>;
    eventTypeSplit: Array<{
      event_type: EventType;
      count: number;
      revenue?: number;
    }>;
    slotSplitThisMonth: {
      DAY: { count: number; revenue?: number };
      NIGHT: { count: number; revenue?: number };
      FULL: { count: number; revenue?: number };
    };
  };
  recentActivity: AuditLogRow[];
}

export function generateRoomDashboard(
  roomId: string,
  role: RoleType,
  todayYMD: string
): DashboardSummary {
  releaseExpiredTentativeBookings(roomId);
  evaluateRoomNotifications(roomId, todayYMD);
  const db = getDb();

  const canSeeMoney = role === 'OWNER' || role === 'MANAGER';
  const [ty, tm, td] = todayYMD.split('-').map(Number);
  const currentMonthYM = `${ty}-${String(tm).padStart(2, '0')}`;
  const daysInThisMonth = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  const monthStartYMD = `${currentMonthYM}-01`;
  const monthEndYMD = `${currentMonthYM}-${String(daysInThisMonth).padStart(2, '0')}`;

  const addDaysYMD = (offset: number): string => {
    const dt = new Date(Date.UTC(ty, tm - 1, td + offset));
    return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  };
  const next7DaysEndYMD = addDaysYMD(7);

  // 1. Active halls for "Today at a glance" & free slot calculation
  const activeHalls = getRoomHalls(roomId, false);
  const todayAtAGlance: DashboardSummary['todayAtAGlance'] = activeHalls.map((h) => {
    const avail = checkHallDateAvailability(roomId, h.id, todayYMD);
    const dayStatus: 'FREE' | 'TENTATIVE' | 'CONFIRMED' = !avail.day_holder
      ? 'FREE'
      : avail.day_holder.status === 'TENTATIVE'
      ? 'TENTATIVE'
      : 'CONFIRMED';
    const nightStatus: 'FREE' | 'TENTATIVE' | 'CONFIRMED' = !avail.night_holder
      ? 'FREE'
      : avail.night_holder.status === 'TENTATIVE'
      ? 'TENTATIVE'
      : 'CONFIRMED';

    return {
      hall_id: h.id,
      hall_name: h.name,
      capacity: h.capacity,
      day_status: dayStatus,
      night_status: nightStatus,
      day_holder: avail.day_holder,
      night_holder: avail.night_holder,
    };
  });

  // 2. Reuse generateRoomReport for exact agreement with Reports!
  const monthReport = generateRoomReport(roomId, {
    dateFrom: monthStartYMD,
    dateTo: monthEndYMD,
  });

  // Calculate Free Day Slots and Free Night Slots this month across active halls
  // Note: A FULL booking occupies 1 Day slot and 1 Night slot (via booking_slot_locks)
  const activeHallIds = new Set(activeHalls.map((h) => h.id));
  const monthLocks = db.prepare(`
    SELECT hall_id, locked_slot
    FROM booking_slot_locks
    WHERE room_id = ? AND event_date >= ? AND event_date <= ?
  `).all(roomId, monthStartYMD, monthEndYMD) as Array<{ hall_id: string; locked_slot: 'DAY' | 'NIGHT' }>;

  let bookedDaySlotsInActiveHalls = 0;
  let bookedNightSlotsInActiveHalls = 0;
  for (const lk of monthLocks) {
    if (!activeHallIds.has(lk.hall_id)) continue;
    if (lk.locked_slot === 'DAY') bookedDaySlotsInActiveHalls++;
    if (lk.locked_slot === 'NIGHT') bookedNightSlotsInActiveHalls++;
  }

  const totalDaySlotsCapacityThisMonth = activeHalls.length * daysInThisMonth;
  const totalNightSlotsCapacityThisMonth = activeHalls.length * daysInThisMonth;
  const freeDaySlotsThisMonth = Math.max(0, totalDaySlotsCapacityThisMonth - bookedDaySlotsInActiveHalls);
  const freeNightSlotsThisMonth = Math.max(0, totalNightSlotsCapacityThisMonth - bookedNightSlotsInActiveHalls);

  // 3. Pending (tentative) bookings across room & total due amount across room (or this month)
  const pendingRow = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM bookings
    WHERE room_id = ? AND status = 'TENTATIVE'
  `).get(roomId) as { cnt: number };

  // Total due amount across all active bookings in the room (matches total outstanding dues)
  const allDuesRow = db.prepare(`
    SELECT COALESCE(SUM(due_amount), 0) as total_due
    FROM bookings
    WHERE room_id = ? AND status != 'CANCELLED'
  `).get(roomId) as { total_due: number };
  const totalDueAmount = roundMoney(allDuesRow.total_due);

  // 4. Upcoming events for the next 7 days (todayYMD to next7DaysEndYMD)
  const upcomingRows = db.prepare(`
    SELECT b.*,
           c.name as customer_name, c.phone as customer_phone,
           h.name as hall_name, h.capacity as hall_capacity
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE b.room_id = ? AND b.event_date >= ? AND b.event_date <= ?
      AND b.status != 'CANCELLED'
    ORDER BY b.event_date ASC, b.start_time ASC
  `).all(roomId, todayYMD, next7DaysEndYMD) as any[];

  const upcomingMapped = upcomingRows.map(mapBookingRow);
  const todaysBookings = upcomingMapped.filter((b) => b.event_date === todayYMD);

  // Group today's events into DAY and NIGHT (a FULL booking shows in both Day and Night groups)
  const todaysDayGroup = todaysBookings
    .filter((b) => b.slot === 'DAY' || b.slot === 'FULL')
    .map((b) => stripMoneyFromBooking(b, role));
  const todaysNightGroup = todaysBookings
    .filter((b) => b.slot === 'NIGHT' || b.slot === 'FULL')
    .map((b) => stripMoneyFromBooking(b, role));

  const upcomingSanitized = upcomingMapped.map((b) => stripMoneyFromBooking(b, role));

  // 5. Mini calendar bookings for current month (non-cancelled)
  const miniCalendarBookings = monthReport.bookingsInReport
    .filter((b) => b.status !== 'CANCELLED')
    .map((b) => ({
      id: b.id,
      booking_number: b.booking_number,
      event_date: b.event_date,
      slot: b.slot,
      status: b.status,
      start_time: b.start_time,
      end_time: b.end_time,
      customer_name: b.customer_name || '',
      hall_id: b.hall_id,
      hall_name: b.hall_name || '',
      event_type: b.event_type,
    }));

  // 6. Alerts Panel:
  // a) Tentative holds expiring soon (showing which slot will be released)
  const expiringRows = db.prepare(`
    SELECT b.id as booking_id, b.booking_number, b.event_date, b.slot, b.hold_expires_at,
           c.name as customer_name, h.name as hall_name
    FROM bookings b
    JOIN customers c ON b.customer_id = c.id
    JOIN halls h ON b.hall_id = h.id
    WHERE b.room_id = ? AND b.status = 'TENTATIVE' AND b.hold_expires_at IS NOT NULL
    ORDER BY b.hold_expires_at ASC
    LIMIT 15
  `).all(roomId) as any[];

  // b) Dues for events within 7 days (Owner & Manager only!)
  const dues7DaysRows = canSeeMoney
    ? upcomingMapped
        .filter((b) => b.due_amount > 0)
        .map((b) => ({
          booking_id: b.id,
          booking_number: b.booking_number,
          customer_name: b.customer_name || '',
          hall_name: b.hall_name || '',
          event_date: b.event_date,
          slot: b.slot,
          due_amount: b.due_amount,
        }))
    : undefined;

  // c) Join requests waiting (Owner & Manager can see count/alert; Owner approves)
  const pendingJoinsRows =
    role === 'OWNER' || role === 'MANAGER'
      ? (db.prepare(`
          SELECT rm.id as member_id, rm.user_id, rm.created_at, u.name as user_name, u.email as user_email
          FROM room_members rm
          JOIN users u ON rm.user_id = u.id
          WHERE rm.room_id = ? AND rm.status = 'PENDING'
          ORDER BY rm.created_at ASC
        `).all(roomId) as any[])
      : [];

  // 7. Charts (last 6 months series + current month event type split + current month Day vs Night vs Full)
  const sixMonthsSeries: DashboardSummary['charts']['monthlySeries'] = [];
  for (let i = 5; i >= 0; i--) {
    const dt = new Date(Date.UTC(ty, tm - 1 - i, 1));
    const ym = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}`;
    const mStat = db.prepare(`
      SELECT COUNT(*) as cnt, COALESCE(SUM(total_amount), 0) as rev
      FROM bookings
      WHERE room_id = ? AND status != 'CANCELLED' AND substr(event_date, 1, 7) = ?
    `).get(roomId, ym) as { cnt: number; rev: number };

    sixMonthsSeries.push({
      month: ym,
      bookingsCount: Number(mStat.cnt || 0),
      ...(canSeeMoney ? { revenue: roundMoney(mStat.rev) } : {}),
    });
  }

  const eventTypeSplit = monthReport.popularEventTypes.map((pe) => ({
    event_type: pe.event_type,
    count: pe.count,
    ...(canSeeMoney ? { revenue: pe.revenue } : {}),
  }));

  const slotSplitThisMonth: DashboardSummary['charts']['slotSplitThisMonth'] = {
    DAY: {
      count: monthReport.slotBreakdown.DAY.count,
      ...(canSeeMoney ? { revenue: monthReport.slotBreakdown.DAY.revenue } : {}),
    },
    NIGHT: {
      count: monthReport.slotBreakdown.NIGHT.count,
      ...(canSeeMoney ? { revenue: monthReport.slotBreakdown.NIGHT.revenue } : {}),
    },
    FULL: {
      count: monthReport.slotBreakdown.FULL.count,
      ...(canSeeMoney ? { revenue: monthReport.slotBreakdown.FULL.revenue } : {}),
    },
  };

  // 8. Recent activity: last 10 actions from audit log (Owner and Manager only!)
  const recentActivity = canSeeMoney ? getRoomAuditLogs(roomId, 10, 0) : [];

  return {
    todayYMD,
    currentMonthYM,
    monthStartYMD,
    monthEndYMD,
    hideMoney: !canSeeMoney,
    summaryCards: {
      todaysEventsCount: todaysBookings.length,
      upcomingWeekCount: upcomingMapped.length,
      pendingTentativeCount: pendingRow.cnt,
      ...(canSeeMoney
        ? {
            thisMonthRevenue: monthReport.revenue,
            totalDueAmount,
          }
        : {}),
      freeDaySlotsThisMonth,
      freeNightSlotsThisMonth,
      totalDaySlotsCapacityThisMonth,
      totalNightSlotsCapacityThisMonth,
    },
    todayAtAGlance,
    todaysEventsGrouped: {
      DAY: todaysDayGroup,
      NIGHT: todaysNightGroup,
    },
    upcomingNext7Days: upcomingSanitized,
    miniCalendarBookings,
    alerts: {
      expiringHolds: expiringRows.map((r) => ({
        booking_id: r.booking_id,
        booking_number: r.booking_number,
        customer_name: r.customer_name,
        hall_name: r.hall_name,
        event_date: r.event_date,
        slot: r.slot,
        hold_expires_at: Number(r.hold_expires_at),
      })),
      ...(canSeeMoney ? { duesWithin7Days: dues7DaysRows } : {}),
      pendingJoinRequests: pendingJoinsRows,
    },
    charts: {
      monthlySeries: sixMonthsSeries,
      eventTypeSplit,
      slotSplitThisMonth,
    },
    recentActivity,
  };
}



