import test from 'node:test';
import assert from 'node:assert/strict';
import { validateConfig } from '../server/config.js';

test('Valid configuration passes validation', () => {
  const validEnv: Record<string, string> = {
    APP_ENV: 'development',
    PORT: '3000',
    PUBLIC_APP_URL: 'http://localhost:3000',
    DATABASE_URL: './data/lilycc.db',
    SESSION_SECRET: '12345678901234567890123456789012abcdef',
    SESSION_IDLE_TIMEOUT_MINUTES: '30',
    SESSION_ABSOLUTE_TIMEOUT_HOURS: '12',
    JOIN_RATE_LIMIT_MAX_ATTEMPTS: '5',
    JOIN_LOCKOUT_MINUTES: '15',
    GOOGLE_CLIENT_ID: 'dev-google-client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'dev-secret-string',
  };

  const config = validateConfig(validEnv);
  assert.equal(config.APP_ENV, 'development');
  assert.equal(config.PORT, 3000);
  assert.equal(config.SESSION_IDLE_TIMEOUT_MINUTES, 30);
  assert.equal(config.SESSION_ABSOLUTE_TIMEOUT_HOURS, 12);
  assert.equal(config.JOIN_RATE_LIMIT_MAX_ATTEMPTS, 5);
  assert.equal(config.JOIN_LOCKOUT_MINUTES, 15);
});

test('Missing required variables fail with safe error messages', () => {
  assert.throws(
    () => validateConfig({}),
    (err: Error) => {
      assert.ok(err.message.includes('APP_ENV'));
      assert.ok(err.message.includes('PUBLIC_APP_URL'));
      assert.ok(err.message.includes('DATABASE_URL'));
      assert.ok(err.message.includes('SESSION_SECRET'));
      assert.ok(err.message.includes('GOOGLE_CLIENT_ID'));
      assert.ok(err.message.includes('GOOGLE_CLIENT_SECRET'));
      // Ensure no actual secret is printed
      return true;
    }
  );
});

test('Invalid numerical values (zero, negative, text) are rejected', () => {
  const baseEnv: Record<string, string> = {
    APP_ENV: 'development',
    PORT: 'not-a-number',
    PUBLIC_APP_URL: 'http://localhost:3000',
    DATABASE_URL: './data/lilycc.db',
    SESSION_SECRET: '12345678901234567890123456789012abcdef',
    SESSION_IDLE_TIMEOUT_MINUTES: '0',
    SESSION_ABSOLUTE_TIMEOUT_HOURS: '-5',
    JOIN_RATE_LIMIT_MAX_ATTEMPTS: 'abc',
    JOIN_LOCKOUT_MINUTES: '-1',
    GOOGLE_CLIENT_ID: 'dev-id',
    GOOGLE_CLIENT_SECRET: 'dev-secret',
  };

  assert.throws(
    () => validateConfig(baseEnv),
    (err: Error) => {
      assert.ok(err.message.includes('PORT'));
      assert.ok(err.message.includes('SESSION_IDLE_TIMEOUT_MINUTES'));
      assert.ok(err.message.includes('SESSION_ABSOLUTE_TIMEOUT_HOURS'));
      assert.ok(err.message.includes('JOIN_RATE_LIMIT_MAX_ATTEMPTS'));
      assert.ok(err.message.includes('JOIN_LOCKOUT_MINUTES'));
      return true;
    }
  );
});

test('Production environment rejects placeholder and short secrets', () => {
  const prodEnvWithPlaceholder: Record<string, string> = {
    APP_ENV: 'production',
    PORT: '443',
    PUBLIC_APP_URL: 'https://lily.example.com',
    DATABASE_URL: './data/prod.db',
    SESSION_SECRET: 'example_placeholder_secret_for_app_123456789',
    GOOGLE_CLIENT_ID: 'real-prod-client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'real-prod-secret',
  };

  assert.throws(
    () => validateConfig(prodEnvWithPlaceholder),
    (err: Error) => {
      assert.ok(err.message.includes('placeholder'));
      // Verify the secret value itself is never leaked in the error
      assert.ok(!err.message.includes('example_placeholder_secret'));
      return true;
    }
  );

  const prodEnvWithShortSecret: Record<string, string> = {
    ...prodEnvWithPlaceholder,
    SESSION_SECRET: 'short-secret-123',
  };

  assert.throws(
    () => validateConfig(prodEnvWithShortSecret),
    (err: Error) => {
      assert.ok(err.message.includes('at least 32 characters long'));
      assert.ok(!err.message.includes('short-secret-123'));
      return true;
    }
  );
});

test('Production environment requires HTTPS public URL', () => {
  const prodEnvHttp: Record<string, string> = {
    APP_ENV: 'production',
    PORT: '80',
    PUBLIC_APP_URL: 'http://lily.example.com',
    DATABASE_URL: './data/prod.db',
    SESSION_SECRET: 'a09f834ecbd2849182348c90123ef456789012345678901234567890abcdef',
    GOOGLE_CLIENT_ID: 'real-prod-client-id.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'real-prod-secret',
  };

  assert.throws(
    () => validateConfig(prodEnvHttp),
    (err: Error) => {
      assert.ok(err.message.includes('HTTPS protocol'));
      return true;
    }
  );
});
