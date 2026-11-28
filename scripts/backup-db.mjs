/**
 * Lily Community Center - Automated Hot SQLite Backup & Verification Script (Section 9)
 * Uses SQLite's online VACUUM INTO command to create a consistent, atomic backup
 * even while the WAL-mode database is actively serving live traffic, then runs
 * PRAGMA integrity_check on the backup artifact.
 *
 * Usage:
 *   npm run db:backup
 */

import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const dbPath = path.resolve(ROOT, process.env.DATABASE_PATH || './data/lilycc.db');
const backupDir = path.resolve(ROOT, process.env.BACKUP_DIR || './data/backups');

if (!fs.existsSync(dbPath)) {
  console.error(`[BACKUP FAILED] Database file not found at ${dbPath}`);
  process.exit(1);
}

if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetFile = path.join(backupDir, `lilycc-backup-${stamp}.db`);
const escapedTarget = targetFile.replace(/'/g, "''");

const srcDb = new DatabaseSync(dbPath);
srcDb.exec(`VACUUM INTO '${escapedTarget}';`);
srcDb.close();

// Verify backup integrity before reporting success
const verifyDb = new DatabaseSync(targetFile, { readOnly: true });
const check = verifyDb.prepare('PRAGMA integrity_check;').get();
const roomsCount = verifyDb.prepare('SELECT COUNT(*) as c FROM rooms').get();
verifyDb.close();

if (!check || check.integrity_check !== 'ok') {
  console.error('[BACKUP FAILED] Integrity check failed on generated backup.');
  process.exit(1);
}

// Retain last 30 backups automatically
const files = fs
  .readdirSync(backupDir)
  .filter((f) => f.startsWith('lilycc-backup-') && f.endsWith('.db'))
  .sort();

if (files.length > 30) {
  for (const oldFile of files.slice(0, files.length - 30)) {
    fs.unlinkSync(path.join(backupDir, oldFile));
  }
}

console.log(
  `[BACKUP OK] Verified SQLite snapshot written to ${path.relative(ROOT, targetFile)} (rooms=${roomsCount.c}, integrity=ok)`
);
