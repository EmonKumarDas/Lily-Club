import dotenv from 'dotenv';

// Load .env file
dotenv.config();

export interface AppConfig {
  APP_ENV: 'production' | 'development';
  isProduction: boolean;
  isDevelopment: boolean;
  PORT: number;
  PUBLIC_APP_URL: string;
  DATABASE_URL: string;
  SESSION_SECRET: string;
  INVITE_CODE_SECRET: string;
  FIELD_ENCRYPTION_KEY: string;
  CLOUD_KMS_KEY_NAME: string;
  SESSION_IDLE_TIMEOUT_MINUTES: number;
  SESSION_ABSOLUTE_TIMEOUT_HOURS: number;
  REAUTH_WINDOW_MINUTES: number;
  JOIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  JOIN_LOCKOUT_MINUTES: number;
  ALLOWED_OWNER_EMAILS: string[];
  MAX_ROOMS_PER_OWNER: number;
  APP_LATEST_VERSION: string;
  APP_MIN_SUPPORTED_VERSION: string;
  APP_UPDATE_URL: string;
  APP_RELEASE_NOTES_BN: string;
  APP_RELEASE_NOTES_EN: string;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DEV_LOGIN_ENABLED: boolean;
  ENFORCE_FIREBASE_APP_CHECK: boolean;
}

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /replace_with/i,
  /example/i,
  /changeme/i,
  /change-me/i,
  /dummy/i,
  /your[_-]secret/i,
  /^dev-google/i,
  /12345678/i,
  /secret_key_here/i,
  /^0{32,}$/,
];

function isLikelyPlaceholder(val: string): boolean {
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(val));
}

function parsePositiveInteger(name: string, value: string | undefined, defaultValue?: number): number {
  if (value === undefined || value.trim() === '') {
    if (defaultValue !== undefined) return defaultValue;
    throw new Error(`Configuration error: '${name}' is required.`);
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(`Configuration error: '${name}' must be a valid positive integer. Received: "${trimmed}".`);
  }

  const num = parseInt(trimmed, 10);
  if (isNaN(num) || num <= 0) {
    throw new Error(`Configuration error: '${name}' must be greater than zero.`);
  }

  return num;
}

export function validateConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const errors: string[] = [];

  // APP_ENV
  const rawEnv = (env.APP_ENV || '').trim().toLowerCase();
  if (rawEnv !== 'production' && rawEnv !== 'development') {
    errors.push("Configuration error: 'APP_ENV' must be either 'production' or 'development'.");
  }
  const isProduction = rawEnv === 'production';
  const isDevelopment = !isProduction;

  // PORT
  let port = 3000;
  try {
    port = parsePositiveInteger('PORT', env.PORT, 3000);
  } catch (err: any) {
    errors.push(err.message);
  }

  // PUBLIC_APP_URL
  const publicAppUrl = (env.PUBLIC_APP_URL || '').trim();
  if (!publicAppUrl) {
    errors.push("Configuration error: 'PUBLIC_APP_URL' is required.");
  } else {
    try {
      const parsed = new URL(publicAppUrl);
      if (isProduction && parsed.protocol !== 'https:') {
        errors.push("Configuration error: 'PUBLIC_APP_URL' must use HTTPS protocol in production.");
      }
    } catch {
      errors.push("Configuration error: 'PUBLIC_APP_URL' must be a valid absolute URL.");
    }
  }

  // DATABASE_URL
  const databaseUrl = (env.DATABASE_URL || '').trim();
  if (!databaseUrl) {
    errors.push("Configuration error: 'DATABASE_URL' is required.");
  }

  // SESSION_SECRET
  const sessionSecret = (env.SESSION_SECRET || '').trim();
  if (!sessionSecret) {
    errors.push("Configuration error: 'SESSION_SECRET' is required.");
  } else {
    if (sessionSecret.length < 32) {
      errors.push("Configuration error: 'SESSION_SECRET' must be at least 32 characters long for cryptographic security.");
    }
    if (isProduction && isLikelyPlaceholder(sessionSecret)) {
      errors.push("Configuration error: 'SESSION_SECRET' appears to be a placeholder or example value, which is not permitted in production.");
    }
  }

  // FIELD_ENCRYPTION_KEY & CLOUD_KMS_KEY_NAME
  const fieldEncryptionKey = (env.FIELD_ENCRYPTION_KEY || '').trim();
  const cloudKmsKeyName = (env.CLOUD_KMS_KEY_NAME || '').trim();
  if (isProduction && fieldEncryptionKey && isLikelyPlaceholder(fieldEncryptionKey)) {
    errors.push("Configuration error: 'FIELD_ENCRYPTION_KEY' must not be a placeholder in production.");
  }

  // SESSION_IDLE_TIMEOUT_MINUTES
  let sessionIdleTimeoutMinutes = 30;
  try {
    sessionIdleTimeoutMinutes = parsePositiveInteger(
      'SESSION_IDLE_TIMEOUT_MINUTES',
      env.SESSION_IDLE_TIMEOUT_MINUTES,
      30
    );
  } catch (err: any) {
    errors.push(err.message);
  }

  // SESSION_ABSOLUTE_TIMEOUT_HOURS
  let sessionAbsoluteTimeoutHours = 12;
  try {
    sessionAbsoluteTimeoutHours = parsePositiveInteger(
      'SESSION_ABSOLUTE_TIMEOUT_HOURS',
      env.SESSION_ABSOLUTE_TIMEOUT_HOURS,
      12
    );
  } catch (err: any) {
    errors.push(err.message);
  }

  // JOIN_RATE_LIMIT_MAX_ATTEMPTS
  let joinRateLimitMaxAttempts = 5;
  try {
    joinRateLimitMaxAttempts = parsePositiveInteger(
      'JOIN_RATE_LIMIT_MAX_ATTEMPTS',
      env.JOIN_RATE_LIMIT_MAX_ATTEMPTS,
      5
    );
  } catch (err: any) {
    errors.push(err.message);
  }

  // JOIN_LOCKOUT_MINUTES
  let joinLockoutMinutes = 15;
  try {
    joinLockoutMinutes = parsePositiveInteger(
      'JOIN_LOCKOUT_MINUTES',
      env.JOIN_LOCKOUT_MINUTES,
      15
    );
  } catch (err: any) {
    errors.push(err.message);
  }

  // MAX_ROOMS_PER_OWNER & ALLOWED_OWNER_EMAILS
  let maxRoomsPerOwner = 3;
  try {
    maxRoomsPerOwner = parsePositiveInteger('MAX_ROOMS_PER_OWNER', env.MAX_ROOMS_PER_OWNER, 3);
  } catch (err: any) {
    errors.push(err.message);
  }

  const allowedOwnerEmails = (env.ALLOWED_OWNER_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  // Version config
  const semverPattern = /^\d+\.\d+\.\d+$/;
  const appLatestVersion = (env.APP_LATEST_VERSION || '1.0.0').trim();
  const appMinSupportedVersion = (env.APP_MIN_SUPPORTED_VERSION || '1.0.0').trim();
  if (!semverPattern.test(appLatestVersion)) {
    errors.push("Configuration error: 'APP_LATEST_VERSION' must be valid semver (e.g. 1.0.0).");
  }
  if (!semverPattern.test(appMinSupportedVersion)) {
    errors.push("Configuration error: 'APP_MIN_SUPPORTED_VERSION' must be valid semver (e.g. 1.0.0).");
  }

  const appUpdateUrl = (env.APP_UPDATE_URL || publicAppUrl || 'https://localhost:3000').trim();
  const appReleaseNotesBn = (
    env.APP_RELEASE_NOTES_BN || 'নিরাপত্তা জোরদার এবং নতুন সুবিধা যুক্ত করা হয়েছে।'
  ).trim();
  const appReleaseNotesEn = (
    env.APP_RELEASE_NOTES_EN || 'Security improvements, dual calendar updates, and performance fixes.'
  ).trim();

  // GOOGLE_CLIENT_ID & GOOGLE_CLIENT_SECRET
  const googleClientId = (env.GOOGLE_CLIENT_ID || '').trim();
  const googleClientSecret = (env.GOOGLE_CLIENT_SECRET || '').trim();

  if (!googleClientId) {
    errors.push("Configuration error: 'GOOGLE_CLIENT_ID' is required.");
  }
  if (!googleClientSecret) {
    errors.push("Configuration error: 'GOOGLE_CLIENT_SECRET' is required.");
  }

  if (isProduction) {
    if (isLikelyPlaceholder(googleClientId)) {
      errors.push("Configuration error: 'GOOGLE_CLIENT_ID' must not be a placeholder in production.");
    }
    if (isLikelyPlaceholder(googleClientSecret)) {
      errors.push("Configuration error: 'GOOGLE_CLIENT_SECRET' must not be a placeholder in production.");
    }
  }

  // DEV_LOGIN_ENABLED — strictly blocked in production
  const devLoginEnabled =
    isDevelopment && (env.DEV_LOGIN_ENABLED === 'true' || env.DEV_LOGIN_ENABLED === '1');
  const enforceFirebaseAppCheck =
    env.ENFORCE_FIREBASE_APP_CHECK === 'true' || env.ENFORCE_FIREBASE_APP_CHECK === '1';

  // INVITE_CODE_SECRET (defaults to SESSION_SECRET if omitted)
  const inviteCodeSecret = (env.INVITE_CODE_SECRET || sessionSecret).trim();
  if (isProduction && (inviteCodeSecret.length < 32 || isLikelyPlaceholder(inviteCodeSecret))) {
    errors.push("Configuration error: 'INVITE_CODE_SECRET' must be a strong non-placeholder secret in production.");
  }

  // REAUTH_WINDOW_MINUTES (fresh Google re-login window for sensitive Owner actions)
  let reauthWindowMinutes = 15;
  try {
    reauthWindowMinutes = parsePositiveInteger('REAUTH_WINDOW_MINUTES', env.REAUTH_WINDOW_MINUTES, 15);
  } catch (err: any) {
    errors.push(err.message);
  }

  if (errors.length > 0) {
    const errorOutput = errors.join('\n - ');
    throw new Error(`[STARTUP FAILURE] Environment configuration validation failed:\n - ${errorOutput}`);
  }

  return {
    APP_ENV: rawEnv as 'production' | 'development',
    isProduction,
    isDevelopment,
    PORT: port,
    PUBLIC_APP_URL: publicAppUrl,
    DATABASE_URL: databaseUrl,
    SESSION_SECRET: sessionSecret,
    INVITE_CODE_SECRET: inviteCodeSecret,
    FIELD_ENCRYPTION_KEY: fieldEncryptionKey,
    CLOUD_KMS_KEY_NAME: cloudKmsKeyName,
    SESSION_IDLE_TIMEOUT_MINUTES: sessionIdleTimeoutMinutes,
    SESSION_ABSOLUTE_TIMEOUT_HOURS: sessionAbsoluteTimeoutHours,
    REAUTH_WINDOW_MINUTES: reauthWindowMinutes,
    JOIN_RATE_LIMIT_MAX_ATTEMPTS: joinRateLimitMaxAttempts,
    JOIN_LOCKOUT_MINUTES: joinLockoutMinutes,
    ALLOWED_OWNER_EMAILS: allowedOwnerEmails,
    MAX_ROOMS_PER_OWNER: maxRoomsPerOwner,
    APP_LATEST_VERSION: appLatestVersion,
    APP_MIN_SUPPORTED_VERSION: appMinSupportedVersion,
    APP_UPDATE_URL: appUpdateUrl,
    APP_RELEASE_NOTES_BN: appReleaseNotesBn,
    APP_RELEASE_NOTES_EN: appReleaseNotesEn,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    DEV_LOGIN_ENABLED: devLoginEnabled,
    ENFORCE_FIREBASE_APP_CHECK: enforceFirebaseAppCheck,
  };
}

let activeConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!activeConfig) {
    activeConfig = validateConfig();
  }
  return activeConfig;
}

export function resetConfigCacheForTests(): void {
  activeConfig = null;
}
