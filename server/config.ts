import dotenv from 'dotenv';
import path from 'path';

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
  SESSION_IDLE_TIMEOUT_MINUTES: number;
  SESSION_ABSOLUTE_TIMEOUT_HOURS: number;
  JOIN_RATE_LIMIT_MAX_ATTEMPTS: number;
  JOIN_LOCKOUT_MINUTES: number;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  DEV_LOGIN_ENABLED: boolean;
}

const PLACEHOLDER_PATTERNS = [
  /placeholder/i,
  /replace_with/i,
  /example/i,
  /changeme/i,
  /change-me/i,
  /dummy/i,
  /your[_-]secret/i,
  /12345678/i,
  /secret_key_here/i,
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
  // Ensure digits only
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

  // DEV_LOGIN_ENABLED
  const devLoginEnabled = isDevelopment && (env.DEV_LOGIN_ENABLED === 'true' || env.DEV_LOGIN_ENABLED === '1');

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
    SESSION_IDLE_TIMEOUT_MINUTES: sessionIdleTimeoutMinutes,
    SESSION_ABSOLUTE_TIMEOUT_HOURS: sessionAbsoluteTimeoutHours,
    JOIN_RATE_LIMIT_MAX_ATTEMPTS: joinRateLimitMaxAttempts,
    JOIN_LOCKOUT_MINUTES: joinLockoutMinutes,
    GOOGLE_CLIENT_ID: googleClientId,
    GOOGLE_CLIENT_SECRET: googleClientSecret,
    DEV_LOGIN_ENABLED: devLoginEnabled,
  };
}

let activeConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!activeConfig) {
    activeConfig = validateConfig();
  }
  return activeConfig;
}
