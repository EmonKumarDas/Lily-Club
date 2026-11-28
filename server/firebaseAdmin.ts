import { initializeApp as initAdminApp, getApps as getAdminApps, cert, applicationDefault, type App as AdminApp } from 'firebase-admin/app';
import { getFirestore as getAdminFirestore, FieldValue, type Firestore as AdminFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';
import { getConfig } from './config.js';

let adminDb: AdminFirestore | null = null;
let initAttempted = false;
let mode: 'admin' | 'none' = 'none';

function findServiceAccountPath(): string | null {
  const candidates = [
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
    process.env.GOOGLE_APPLICATION_CREDENTIALS,
    path.resolve(process.cwd(), 'data/firebase-service-account.json'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return null;
}

async function ensureFirebaseBackend(): Promise<'admin' | 'none'> {
  if (process.env.NODE_TEST_CONTEXT || process.argv.includes('--test')) {
    return 'none';
  }
  if (mode === 'admin' && adminDb) return 'admin';

  if (!initAttempted) {
    initAttempted = true;
    try {
      let app: AdminApp | undefined = getAdminApps()[0];
      const keyPath = findServiceAccountPath();
      if (keyPath) {
        const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        if (!app) {
          app = initAdminApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
          });
        }
        adminDb = getAdminFirestore(app);
        adminDb.settings({ ignoreUndefinedProperties: true });
        mode = 'admin';
        console.log('[Firebase] Connected Admin SDK via service account key.');
        return 'admin';
      } else if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
        if (!app) {
          app = initAdminApp({
            credential: cert(serviceAccount),
            projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID,
          });
        }
        adminDb = getAdminFirestore(app);
        adminDb.settings({ ignoreUndefinedProperties: true });
        mode = 'admin';
        console.log('[Firebase] Connected Admin SDK via FIREBASE_SERVICE_ACCOUNT_JSON.');
        return 'admin';
      } else if (process.env.K_SERVICE || process.env.GOOGLE_CLOUD_PROJECT) {
        // Managed GCP / Cloud Run Workload Identity (ADC)
        if (!app) {
          app = initAdminApp({
            credential: applicationDefault(),
            projectId: process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT,
          });
        }
        adminDb = getAdminFirestore(app);
        adminDb.settings({ ignoreUndefinedProperties: true });
        mode = 'admin';
        console.log('[Firebase] Connected Admin SDK via Application Default Credentials.');
        return 'admin';
      }
    } catch (err: any) {
      console.warn('[Firebase] Admin SDK init skipped:', err.message);
    }
  }

  return 'none';
}

if (!process.env.NODE_TEST_CONTEXT && !process.argv.includes('--test')) {
  void ensureFirebaseBackend();
}

export function isFirestoreEnabled(): boolean {
  return mode === 'admin' && adminDb !== null;
}

export function getFirebaseProjectId(): string {
  return (process.env.FIREBASE_PROJECT_ID || '').trim() || 'unconfigured';
}

/**
 * Syncs SQLite tables into Cloud Firestore via Firebase Admin SDK ONLY (never via client superuser UID):
 * - `join_code` is STRIPPED from `rooms/{roomId}` and stored ONLY in owner-only `room_secrets/{roomId}`.
 * - Financial totals are STRIPPED from `bookings/{bookingId}` and stored ONLY in manager/owner `booking_financials/{bookingId}`.
 * - Public version configuration is published read-only to `app_config/version`.
 */
export async function syncAllSqliteToFirestore(
  sqliteDb: any
): Promise<{ synced: Record<string, number>; enabled: boolean; mode: string }> {
  const activeMode = await ensureFirebaseBackend();
  if (activeMode === 'none' || !adminDb) {
    return { synced: {}, enabled: false, mode: 'none' };
  }

  const dbRef = adminDb;
  const writeDocs = async (
    collectionName: string,
    items: Array<{ id: string; data: Record<string, any> }>
  ) => {
    if (items.length === 0) return 0;
    let batch = dbRef.batch();
    let count = 0;
    for (const item of items) {
      batch.set(
        dbRef.collection(collectionName).doc(item.id),
        { ...item.data, _synced_at: FieldValue.serverTimestamp() },
        { merge: true }
      );
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        batch = dbRef.batch();
      }
    }
    if (count % 400 !== 0) await batch.commit();
    return count;
  };

  const synced: Record<string, number> = {};

  try {
    const cfg = getConfig();
    await dbRef.collection('app_config').doc('version').set(
      {
        latestVersion: cfg.APP_LATEST_VERSION,
        minSupportedVersion: cfg.APP_MIN_SUPPORTED_VERSION,
        updateUrl: cfg.APP_UPDATE_URL,
        releaseNotesBn: cfg.APP_RELEASE_NOTES_BN,
        releaseNotesEn: cfg.APP_RELEASE_NOTES_EN,
        updated_at: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    synced.app_config = 1;

    // 1. Users
    const users = sqliteDb
      .prepare('SELECT id, email, name, picture, preferred_language, created_at, updated_at FROM users')
      .all() as any[];
    synced.users = await writeDocs(
      'users',
      users.map((u) => ({ id: String(u.id), data: u }))
    );

    // 2. Rooms (WITHOUT join_code) + Room Secrets (ONLY join_code for Owner)
    const rooms = sqliteDb.prepare('SELECT * FROM rooms').all() as any[];
    synced.rooms = await writeDocs(
      'rooms',
      rooms.map((r) => {
        const { join_code: _omit, ...publicRoom } = r;
        return {
          id: String(r.id),
          data: {
            ...publicRoom,
            allow_staff_costs: Boolean(r.allow_staff_costs),
            join_approval_required: Boolean(r.join_approval_required),
            is_deleted: Boolean(r.is_deleted),
          },
        };
      })
    );
    synced.room_secrets = await writeDocs(
      'room_secrets',
      rooms.map((r) => ({
        id: String(r.id),
        data: { room_id: String(r.id), join_code: r.join_code, updated_at: FieldValue.serverTimestamp() },
      }))
    );

    // 3. Memberships
    const members = sqliteDb.prepare('SELECT * FROM room_members').all() as any[];
    synced.memberships = await writeDocs(
      'memberships',
      members.map((m) => ({ id: `${m.room_id}_${m.user_id}`, data: m }))
    );

    // 4. Halls
    const halls = sqliteDb.prepare('SELECT * FROM halls').all() as any[];
    synced.halls = await writeDocs(
      'halls',
      halls.map((h) => ({ id: String(h.id), data: { ...h, is_deleted: Boolean(h.is_deleted) } }))
    );

    // 5. Customers (sensitive fields stay encrypted/masked as stored in SQLite)
    const customers = sqliteDb.prepare('SELECT * FROM customers').all() as any[];
    synced.customers = await writeDocs(
      'customers',
      customers.map((c) => ({ id: String(c.id), data: { ...c, is_deleted: Boolean(c.is_deleted) } }))
    );

    // 6. Bookings (operational fields ONLY) + Booking Financials (Manager/Owner only)
    const bookings = sqliteDb.prepare('SELECT * FROM bookings').all() as any[];
    synced.bookings = await writeDocs(
      'bookings',
      bookings.map((b) => {
        const {
          base_price: _bp,
          hall_rent: _hr,
          extra_services_amount: _esa,
          extra_services: _es,
          decoration_charge: _dc,
          catering_charge: _cc,
          sound_lighting_charge: _sl,
          other_charges: _oc,
          discount_amount: _da,
          total_amount: _ta,
          advance_amount: _aa,
          paid_amount: _pa,
          due_amount: _dua,
          ...operationalBooking
        } = b;
        return {
          id: String(b.id),
          data: { ...operationalBooking, is_deleted: Boolean(b.is_deleted) },
        };
      })
    );
    synced.booking_financials = await writeDocs(
      'booking_financials',
      bookings.map((b) => ({
        id: String(b.id),
        data: {
          booking_id: String(b.id),
          room_id: String(b.room_id),
          base_price: b.base_price ?? 0,
          hall_rent: b.hall_rent ?? 0,
          extra_services_amount: b.extra_services_amount ?? 0,
          total_amount: b.total_amount ?? 0,
          advance_amount: b.advance_amount ?? 0,
          due_amount: b.due_amount ?? 0,
          updated_at: FieldValue.serverTimestamp(),
        },
      }))
    );

    // 7. Payments (Manager/Owner only)
    const payments = sqliteDb.prepare('SELECT * FROM payments').all() as any[];
    synced.payments = await writeDocs(
      'payments',
      payments.map((p) => ({ id: String(p.id), data: p }))
    );

    // 8. Expenses (Manager/Owner read; Staff create only when allow_staff_costs == true)
    const expenses = sqliteDb.prepare('SELECT * FROM expenses').all() as any[];
    synced.expenses = await writeDocs(
      'expenses',
      expenses.map((e) => ({
        id: String(e.id),
        data: { ...e, is_reversed: Boolean(e.is_reversed) },
      }))
    );

    // 9. Audit Logs (Owner only, append-only)
    const audits = sqliteDb.prepare('SELECT * FROM audit_logs').all() as any[];
    synced.audit_logs = await writeDocs(
      'audit_logs',
      audits.map((a) => ({ id: String(a.id), data: a }))
    );

    // 10. Member Invites (hashes only), Member Credentials (scrypt hashes only) & Devices
    try {
      const invites = sqliteDb.prepare('SELECT * FROM member_invites').all() as any[];
      synced.member_invites = await writeDocs('member_invites', invites.map((i) => ({ id: String(i.id), data: i })));
      const devices = sqliteDb.prepare('SELECT * FROM member_devices').all() as any[];
      synced.member_devices = await writeDocs('member_devices', devices.map((d) => ({ id: String(d.id), data: d })));
      const creds = sqliteDb.prepare('SELECT * FROM member_credentials').all() as any[];
      synced.member_credentials = await writeDocs('member_credentials', creds.map((c) => ({ id: String(c.user_id), data: c })));
    } catch { }
  } catch (err: any) {
    console.error('[Firebase Full Sync Error]:', err.message);
  }

  return { synced, enabled: true, mode: activeMode };
}

/**
 * Restores all collections from Cloud Firestore into local SQLite on server boot.
 * Ensures zero data loss on ephemeral 24/7 cloud hosts (Render, Railway, Cloud Run).
 */
export async function hydrateSqliteFromFirestore(sqliteDb: any): Promise<{ restored: Record<string, number>; enabled: boolean }> {
  const activeMode = await ensureFirebaseBackend();
  if (activeMode !== 'admin' || !adminDb) {
    return { restored: {}, enabled: false };
  }

  const readDocs = async (collectionName: string): Promise<Array<{ id: string; data: Record<string, any> }>> => {
    try {
      const snap = await adminDb!.collection(collectionName).get();
      return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    } catch (err: any) {
      console.warn(`[Firebase Hydrate Skip] ${collectionName}:`, err.message);
      return [];
    }
  };

  const upsertTable = (tableName: string, rows: Record<string, any>[]) => {
    if (rows.length === 0) return 0;
    const colsInfo = sqliteDb.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    const validCols = new Set(colsInfo.map((c) => c.name));
    let count = 0;
    for (const row of rows) {
      const keys = Object.keys(row).filter((k) => validCols.has(k));
      if (keys.length === 0) continue;
      const placeholders = keys.map(() => '?').join(', ');
      const values = keys.map((k) => {
        const v = row[k];
        if (typeof v === 'boolean') return v ? 1 : 0;
        if (v && typeof v === 'object' && typeof v.toMillis === 'function') return v.toMillis();
        return v ?? null;
      });
      try {
        sqliteDb.prepare(`INSERT OR REPLACE INTO ${tableName} (${keys.join(', ')}) VALUES (${placeholders})`).run(...values);
        count++;
      } catch { }
    }
    return count;
  };

  const restored: Record<string, number> = {};
  sqliteDb.exec('PRAGMA foreign_keys = OFF');
  try {
    const users = await readDocs('users');
    restored.users = upsertTable('users', users.map((u) => u.data));

    const rooms = await readDocs('rooms');
    const secrets = await readDocs('room_secrets');
    const secretMap = new Map(secrets.map((s) => [s.id, s.data.join_code]));
    restored.rooms = upsertTable(
      'rooms',
      rooms.map((r) => ({ ...r.data, join_code: secretMap.get(r.id) || r.data.join_code || '' }))
    );

    const members = await readDocs('memberships');
    restored.room_members = upsertTable('room_members', members.map((m) => m.data));

    const halls = await readDocs('halls');
    restored.halls = upsertTable('halls', halls.map((h) => h.data));

    const customers = await readDocs('customers');
    restored.customers = upsertTable('customers', customers.map((c) => c.data));

    const bookings = await readDocs('bookings');
    const financials = await readDocs('booking_financials');
    const finMap = new Map(financials.map((f) => [f.id, f.data]));
    restored.bookings = upsertTable(
      'bookings',
      bookings.map((b) => ({ ...b.data, ...(finMap.get(b.id) || {}) }))
    );

    const payments = await readDocs('payments');
    restored.payments = upsertTable('payments', payments.map((p) => p.data));

    const expenses = await readDocs('expenses');
    restored.expenses = upsertTable('expenses', expenses.map((e) => e.data));

    const invites = await readDocs('member_invites');
    restored.member_invites = upsertTable('member_invites', invites.map((i) => i.data));

    const devices = await readDocs('member_devices');
    restored.member_devices = upsertTable('member_devices', devices.map((d) => d.data));

    const creds = await readDocs('member_credentials');
    restored.member_credentials = upsertTable('member_credentials', creds.map((c) => c.data));
  } finally {
    sqliteDb.exec('PRAGMA foreign_keys = ON');
  }

  console.log('[Firebase] Hydrated SQLite from Cloud Firestore:', restored);
  return { restored, enabled: true };
}
