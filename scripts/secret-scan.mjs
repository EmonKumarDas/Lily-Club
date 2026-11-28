import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'dist-server',
  'build',
  'android',
  '.expo',
  'data',
]);
const IGNORE_FILES = new Set(['.env', '.env.local', 'package-lock.json']);

const SECRET_PATTERNS = [
  { name: 'PRIVATE_KEY_BLOCK', regex: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/ },
  { name: 'FIREBASE_ADMIN_SDK_PRIVATE_KEY', regex: /"private_key"\s*:\s*"-----BEGIN/ },
  { name: 'GOOGLE_API_KEY_LITERAL', regex: /AIzaSy[0-9A-Za-z_-]{33}/ },
  { name: 'GOOGLE_OAUTH_CLIENT_SECRET', regex: /GOCSPX-[0-9A-Za-z_-]{20,}/ },
  { name: 'HARDCODED_SYNC_PASSWORD', regex: /LilyCC_Sync_\d+/ },
  { name: 'AWS_ACCESS_KEY', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'GITHUB_TOKEN', regex: /ghp_[0-9A-Za-z]{36}/ },
];

const findings = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
    } else if (entry.isFile()) {
      if (IGNORE_FILES.has(entry.name)) continue;
      if (
        /\.(png|jpg|jpeg|webp|ico|pdf|docx|db|sqlite|woff2?|ttf|jar|keystore|apk)$/i.test(
          entry.name
        )
      ) {
        continue;
      }
      const content = fs.readFileSync(full, 'utf8');
      const rel = path.relative(ROOT, full);
      for (const pat of SECRET_PATTERNS) {
        if (pat.regex.test(content)) {
          findings.push({ location: `worktree:${rel}`, pattern: pat.name });
        }
      }
    }
  }
}

walk(ROOT);

// Also scan full Git commit history (never prints secret values — only commit SHA + pattern name)
let gitCommitsScanned = 0;
if (fs.existsSync(path.join(ROOT, '.git'))) {
  try {
    const revsRaw = execFileSync('git', ['rev-list', '--all'], {
      cwd: ROOT,
      encoding: 'utf8',
    }).trim();
    const commits = revsRaw ? revsRaw.split(/\r?\n/).filter(Boolean) : [];
    gitCommitsScanned = commits.length;

    for (const sha of commits) {
      const patch = execFileSync(
        'git',
        ['show', '--format=', '--unified=0', sha, '--', '.', ':!package-lock.json'],
        {
          cwd: ROOT,
          encoding: 'utf8',
          maxBuffer: 64 * 1024 * 1024,
        }
      );
      for (const pat of SECRET_PATTERNS) {
        if (pat.regex.test(patch)) {
          findings.push({
            location: `git-history:${sha.slice(0, 8)}`,
            pattern: pat.name,
          });
        }
      }
    }
  } catch (err) {
    console.warn('[SECRET SCAN] Warning: could not inspect git history:', err.message);
  }
}

if (findings.length > 0) {
  console.error('[SECRET SCAN FAILED] Potential secrets detected (values redacted):');
  for (const f of findings) {
    console.error(` - ${f.location}: ${f.pattern}`);
  }
  process.exit(1);
}

console.log(
  `[SECRET SCAN PASSED] Zero hard-coded secrets found in working tree and ${gitCommitsScanned} git commit(s).`
);
