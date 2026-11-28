import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

const ROOM_A = 'room_alpha';
const ROOM_B = 'room_beta';

test('Setup Firestore Rules Emulator Environment & Seed Canonical Fixtures', async () => {
  const rules = fs.readFileSync(path.resolve(process.cwd(), 'firestore.rules'), 'utf8');
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-lily-rules-test',
    firestore: { rules },
  });

  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const now = Timestamp.now();

    // Version config
    await setDoc(doc(db, 'app_config', 'version'), {
      latestVersion: '1.1.0',
      minSupportedVersion: '1.0.0',
      updateUrl: 'https://lily-4149d.web.app',
      releaseNotesBn: 'নিরাপত্তা আপডেট',
      releaseNotesEn: 'Security update',
    });

    // Users
    await setDoc(doc(db, 'users', 'uid_owner_a'), {
      id: 'uid_owner_a',
      email: 'owner.a@lily.test',
      name: 'Owner A',
      preferred_language: 'bn',
      created_at: now,
      updated_at: now,
    });
    await setDoc(doc(db, 'users', 'uid_noroom'), {
      id: 'uid_noroom',
      email: 'noroom@lily.test',
      name: 'No Room User',
      preferred_language: 'en',
      created_at: now,
      updated_at: now,
    });

    // Room A & Room B
    await setDoc(doc(db, 'rooms', ROOM_A), {
      id: ROOM_A,
      name: 'Lily Community Center Hall A',
      address: 'Halishahar, Chattogram',
      phone: '01955666622',
      default_language: 'bn',
      join_approval_required: true,
      allow_staff_costs: false,
      created_by: 'uid_owner_a',
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });
    await setDoc(doc(db, 'rooms', ROOM_B), {
      id: ROOM_B,
      name: 'Other Club Room B',
      address: 'Agrabad, Chattogram',
      phone: '01700000000',
      default_language: 'en',
      join_approval_required: true,
      allow_staff_costs: false,
      created_by: 'uid_owner_b',
      created_at: now,
      updated_at: now,
      is_deleted: false,
    });

    // Owner-only Room Secrets
    await setDoc(doc(db, 'room_secrets', ROOM_A), {
      room_id: ROOM_A,
      join_code: 'ABCD2345',
      updated_at: now,
    });
    await setDoc(doc(db, 'room_secrets', ROOM_B), {
      room_id: ROOM_B,
      join_code: 'WXYZ6789',
      updated_at: now,
    });

    // Memberships across all roles & states
    const memberships = [
      { id: `${ROOM_A}_uid_owner_a`, room_id: ROOM_A, user_id: 'uid_owner_a', role: 'OWNER', status: 'ACTIVE' },
      { id: `${ROOM_A}_uid_manager_a`, room_id: ROOM_A, user_id: 'uid_manager_a', role: 'MANAGER', status: 'ACTIVE' },
      { id: `${ROOM_A}_uid_staff_a`, room_id: ROOM_A, user_id: 'uid_staff_a', role: 'STAFF', status: 'ACTIVE' },
      { id: `${ROOM_A}_uid_viewer_a`, room_id: ROOM_A, user_id: 'uid_viewer_a', role: 'VIEWER', status: 'ACTIVE' },
      { id: `${ROOM_A}_uid_pending`, room_id: ROOM_A, user_id: 'uid_pending', role: 'VIEWER', status: 'PENDING' },
      { id: `${ROOM_A}_uid_rejected`, room_id: ROOM_A, user_id: 'uid_rejected', role: 'VIEWER', status: 'REJECTED' },
      { id: `${ROOM_A}_uid_removed`, room_id: ROOM_A, user_id: 'uid_removed', role: 'STAFF', status: 'REMOVED' },
      { id: `${ROOM_A}_uid_suspended`, room_id: ROOM_A, user_id: 'uid_suspended', role: 'STAFF', status: 'SUSPENDED' },
      { id: `${ROOM_B}_uid_owner_b`, room_id: ROOM_B, user_id: 'uid_owner_b', role: 'OWNER', status: 'ACTIVE' },
    ];
    for (const m of memberships) {
      await setDoc(doc(db, 'memberships', m.id), {
        room_id: m.room_id,
        user_id: m.user_id,
        role: m.role,
        status: m.status,
        created_at: now,
        updated_at: now,
      });
    }

    // Room A operational & financial records
    await setDoc(doc(db, 'halls', 'hall_a1'), {
      id: 'hall_a1',
      room_id: ROOM_A,
      name: 'Shapla Hall',
      capacity: 400,
      day_price: 35000,
      night_price: 45000,
      full_price: 75000,
      is_active: true,
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    await setDoc(doc(db, 'customers', 'cust_a1'), {
      id: 'cust_a1',
      room_id: ROOM_A,
      name: 'Rahim Uddin',
      phone: 'enc:v1:cipher',
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    await setDoc(doc(db, 'bookings', 'book_a1'), {
      id: 'book_a1',
      room_id: ROOM_A,
      hall_id: 'hall_a1',
      customer_id: 'cust_a1',
      booking_number: 'LCC-2026-0001',
      event_type: 'WEDDING',
      event_date: '2026-12-01',
      slot: 'DAY',
      start_time: '08:00',
      end_time: '16:00',
      guest_count: 300,
      status: 'CONFIRMED',
      is_deleted: false,
      created_at: now,
      updated_at: now,
    });

    await setDoc(doc(db, 'booking_financials', 'book_a1'), {
      booking_id: 'book_a1',
      room_id: ROOM_A,
      total_amount: 45000,
      advance_amount: 20000,
      due_amount: 25000,
      updated_at: now,
    });

    await setDoc(doc(db, 'payments', 'pay_a1'), {
      id: 'pay_a1',
      room_id: ROOM_A,
      booking_id: 'book_a1',
      receipt_number: 'MR-2026-0001',
      payment_type: 'ADVANCE',
      amount: 20000,
      payment_date: '2026-11-26',
      method: 'CASH',
      received_by_user_id: 'uid_owner_a',
      is_reversed: false,
      created_at: now,
    });

    await setDoc(doc(db, 'expenses', 'exp_a1'), {
      id: 'exp_a1',
      room_id: ROOM_A,
      category: 'ELECTRICITY',
      entry_type: 'EXPENSE',
      amount: 5000,
      expense_date: '2026-11-26',
      recorded_by_user_id: 'uid_owner_a',
      is_reversed: false,
      created_at: now,
    });

    await setDoc(doc(db, 'audit_logs', 'log_a1'), {
      id: 'log_a1',
      room_id: ROOM_A,
      user_id: 'uid_owner_a',
      action: 'ROOM_CREATE',
      details: '{}',
      created_at: now,
    });
  });
});

test('1. Signed-out user: denied everywhere except public get /app_config/version', async () => {
  const unauth = testEnv.unauthenticatedContext().firestore();

  await assertSucceeds(getDoc(doc(unauth, 'app_config', 'version')));
  await assertFails(getDocs(collection(unauth, 'app_config')));
  await assertFails(setDoc(doc(unauth, 'app_config', 'version'), { latestVersion: '9.9.9' }));

  await assertFails(getDoc(doc(unauth, 'users', 'uid_owner_a')));
  await assertFails(getDoc(doc(unauth, 'rooms', ROOM_A)));
  await assertFails(getDocs(collection(unauth, 'rooms')));
  await assertFails(getDoc(doc(unauth, 'room_secrets', ROOM_A)));
  await assertFails(getDoc(doc(unauth, 'bookings', 'book_a1')));
  await assertFails(getDoc(doc(unauth, 'booking_financials', 'book_a1')));
  await assertFails(getDoc(doc(unauth, 'payments', 'pay_a1')));
  await assertFails(getDoc(doc(unauth, 'expenses', 'exp_a1')));
  await assertFails(getDoc(doc(unauth, 'audit_logs', 'log_a1')));
});

test('2. Signed-in user with NO room: reads/updates own profile only, cannot self-assign role or read any room', async () => {
  const noRoomDb = testEnv.authenticatedContext('uid_noroom').firestore();

  await assertSucceeds(getDoc(doc(noRoomDb, 'users', 'uid_noroom')));
  await assertFails(getDoc(doc(noRoomDb, 'users', 'uid_owner_a')));
  await assertFails(getDocs(collection(noRoomDb, 'users')));

  // Cannot inject role/ownerId onto own user document
  await assertFails(
    updateDoc(doc(noRoomDb, 'users', 'uid_noroom'), {
      role: 'OWNER',
      updated_at: serverTimestamp(),
    })
  );

  // Valid profile update with serverTimestamp succeeds
  await assertSucceeds(
    updateDoc(doc(noRoomDb, 'users', 'uid_noroom'), {
      name: 'No Room Updated',
      updated_at: serverTimestamp(),
    })
  );

  // Cannot list or read rooms, secrets, bookings, or self-write memberships
  await assertFails(getDoc(doc(noRoomDb, 'rooms', ROOM_A)));
  await assertFails(getDocs(collection(noRoomDb, 'rooms')));
  await assertFails(getDoc(doc(noRoomDb, 'room_secrets', ROOM_A)));
  await assertFails(
    setDoc(doc(noRoomDb, 'memberships', `${ROOM_A}_uid_noroom`), {
      room_id: ROOM_A,
      user_id: 'uid_noroom',
      role: 'OWNER',
      status: 'ACTIVE',
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  );
  await assertFails(getDoc(doc(noRoomDb, 'bookings', 'book_a1')));
});

test('3. PENDING, REJECTED, REMOVED, and SUSPENDED users: zero access to room data', async () => {
  for (const uid of ['uid_pending', 'uid_rejected', 'uid_removed', 'uid_suspended']) {
    const db = testEnv.authenticatedContext(uid).firestore();

    // Can read own membership status record so UI displays Pending / Rejected / Removed / Suspended screen
    await assertSucceeds(getDoc(doc(db, 'memberships', `${ROOM_A}_${uid}`)));

    // Cannot read other users' memberships or any room data
    await assertFails(getDoc(doc(db, 'memberships', `${ROOM_A}_uid_owner_a`)));
    await assertFails(getDoc(doc(db, 'rooms', ROOM_A)));
    await assertFails(getDoc(doc(db, 'room_secrets', ROOM_A)));
    await assertFails(getDoc(doc(db, 'halls', 'hall_a1')));
    await assertFails(getDoc(doc(db, 'customers', 'cust_a1')));
    await assertFails(getDoc(doc(db, 'bookings', 'book_a1')));
    await assertFails(getDoc(doc(db, 'booking_financials', 'book_a1')));
    await assertFails(getDoc(doc(db, 'payments', 'pay_a1')));
    await assertFails(getDoc(doc(db, 'expenses', 'exp_a1')));
    await assertFails(getDoc(doc(db, 'audit_logs', 'log_a1')));
  }
});

test('4. VIEWER and STAFF: operational reads allowed; money, secrets, audit logs & unauthorized writes denied; Staff cost toggle enforced', async () => {
  const viewerDb = testEnv.authenticatedContext('uid_viewer_a').firestore();
  const staffDb = testEnv.authenticatedContext('uid_staff_a').firestore();

  // Both can read operational room, hall, customer, booking
  for (const db of [viewerDb, staffDb]) {
    await assertSucceeds(getDoc(doc(db, 'rooms', ROOM_A)));
    await assertSucceeds(getDoc(doc(db, 'halls', 'hall_a1')));
    await assertSucceeds(getDoc(doc(db, 'customers', 'cust_a1')));
    await assertSucceeds(getDoc(doc(db, 'bookings', 'book_a1')));

    // Strictly denied financial, secret, audit, and other members' docs
    await assertFails(getDoc(doc(db, 'room_secrets', ROOM_A)));
    await assertFails(getDoc(doc(db, 'booking_financials', 'book_a1')));
    await assertFails(getDoc(doc(db, 'payments', 'pay_a1')));
    await assertFails(getDoc(doc(db, 'expenses', 'exp_a1')));
    await assertFails(getDoc(doc(db, 'audit_logs', 'log_a1')));
    await assertFails(getDoc(doc(db, 'memberships', `${ROOM_A}_uid_owner_a`)));
  }

  // Viewer cannot create customers; Staff CAN create valid customer with serverTimestamp
  await assertFails(
    setDoc(doc(viewerDb, 'customers', 'cust_v1'), {
      id: 'cust_v1',
      room_id: ROOM_A,
      name: 'Viewer Cust',
      phone: '01700000000',
      is_deleted: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  );

  await assertSucceeds(
    setDoc(doc(staffDb, 'customers', 'cust_s1'), {
      id: 'cust_s1',
      room_id: ROOM_A,
      name: 'Staff Cust',
      phone: '01711223344',
      is_deleted: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  );

  // Staff CANNOT soft-delete customer (Manager/Owner only)
  await assertFails(
    updateDoc(doc(staffDb, 'customers', 'cust_s1'), {
      is_deleted: true,
      updated_at: serverTimestamp(),
    })
  );

  // Staff CANNOT create expense when allow_staff_costs == false (default)
  await assertFails(
    setDoc(doc(staffDb, 'expenses', 'exp_staff_blocked'), {
      id: 'exp_staff_blocked',
      room_id: ROOM_A,
      category: 'CLEANING',
      entry_type: 'EXPENSE',
      amount: 1200,
      expense_date: '2026-11-26',
      recorded_by_user_id: 'uid_staff_a',
      is_reversed: false,
      created_at: serverTimestamp(),
    })
  );

  // Enable allow_staff_costs on Room A -> Staff CAN create valid expense, still CANNOT read/delete expenses
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await updateDoc(doc(ctx.firestore(), 'rooms', ROOM_A), { allow_staff_costs: true });
  });

  await assertSucceeds(
    setDoc(doc(staffDb, 'expenses', 'exp_staff_allowed'), {
      id: 'exp_staff_allowed',
      room_id: ROOM_A,
      category: 'CLEANING',
      entry_type: 'EXPENSE',
      amount: 1200,
      expense_date: '2026-11-26',
      recorded_by_user_id: 'uid_staff_a',
      is_reversed: false,
      created_at: serverTimestamp(),
    })
  );

  await assertFails(getDoc(doc(staffDb, 'expenses', 'exp_staff_allowed')));
  await assertFails(deleteDoc(doc(staffDb, 'expenses', 'exp_staff_allowed')));
});

test('5. MANAGER vs OWNER boundaries & Cross-Room ID Tampering (Room B Owner -> Room A)', async () => {
  const managerDb = testEnv.authenticatedContext('uid_manager_a').firestore();
  const ownerADb = testEnv.authenticatedContext('uid_owner_a').firestore();
  const ownerBDb = testEnv.authenticatedContext('uid_owner_b').firestore();

  // Manager CAN read financials, payments, expenses, memberships, and create halls
  await assertSucceeds(getDoc(doc(managerDb, 'booking_financials', 'book_a1')));
  await assertSucceeds(getDoc(doc(managerDb, 'payments', 'pay_a1')));
  await assertSucceeds(getDoc(doc(managerDb, 'expenses', 'exp_a1')));
  await assertSucceeds(getDoc(doc(managerDb, 'memberships', `${ROOM_A}_uid_staff_a`)));

  // Manager CANNOT read room_secrets, audit_logs, or update room settings
  await assertFails(getDoc(doc(managerDb, 'room_secrets', ROOM_A)));
  await assertFails(getDoc(doc(managerDb, 'audit_logs', 'log_a1')));
  await assertFails(
    updateDoc(doc(managerDb, 'rooms', ROOM_A), {
      name: 'Manager Hijack',
      updated_at: serverTimestamp(),
    })
  );

  // Owner A CAN read room_secrets and audit_logs, and update Room A (without join_code)
  await assertSucceeds(getDoc(doc(ownerADb, 'room_secrets', ROOM_A)));
  await assertSucceeds(getDoc(doc(ownerADb, 'audit_logs', 'log_a1')));
  await assertSucceeds(
    updateDoc(doc(ownerADb, 'rooms', ROOM_A), {
      name: 'Lily Community Center Main',
      updated_at: serverTimestamp(),
    })
  );

  // Even Owner A CANNOT write join_code into /rooms, or mutate room_secrets, memberships, bookings, payments, audit_logs from client
  await assertFails(
    updateDoc(doc(ownerADb, 'rooms', ROOM_A), {
      join_code: 'LEAKED12',
      updated_at: serverTimestamp(),
    })
  );
  await assertFails(setDoc(doc(ownerADb, 'room_secrets', ROOM_A), { join_code: 'HACKED99' }));
  await assertFails(deleteDoc(doc(ownerADb, 'audit_logs', 'log_a1')));
  await assertFails(deleteDoc(doc(ownerADb, 'payments', 'pay_a1')));

  // Cross-Room ID Tampering: Owner of Room B attempting to read/write Room A documents -> ALL DENIED
  await assertFails(getDoc(doc(ownerBDb, 'rooms', ROOM_A)));
  await assertFails(getDoc(doc(ownerBDb, 'room_secrets', ROOM_A)));
  await assertFails(getDoc(doc(ownerBDb, 'halls', 'hall_a1')));
  await assertFails(getDoc(doc(ownerBDb, 'customers', 'cust_a1')));
  await assertFails(getDoc(doc(ownerBDb, 'bookings', 'book_a1')));
  await assertFails(getDoc(doc(ownerBDb, 'booking_financials', 'book_a1')));
  await assertFails(getDoc(doc(ownerBDb, 'payments', 'pay_a1')));
  await assertFails(getDoc(doc(ownerBDb, 'expenses', 'exp_a1')));
  await assertFails(getDoc(doc(ownerBDb, 'audit_logs', 'log_a1')));
  await assertFails(
    getDocs(query(collection(ownerBDb, 'bookings'), where('room_id', '==', ROOM_A)))
  );
  await assertFails(
    setDoc(doc(ownerBDb, 'customers', 'tamper_cust'), {
      id: 'tamper_cust',
      room_id: ROOM_A,
      name: 'Tamper',
      phone: '01700000000',
      is_deleted: false,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    })
  );
});

test('Teardown Firestore Rules Emulator Environment', async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});
