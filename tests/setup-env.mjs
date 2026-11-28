// Isolated in-memory SQLite database for automated test runs so live ./data/lilycc.db is never modified.
process.env.DATABASE_URL = ':memory:';
process.env.APP_MIN_SUPPORTED_VERSION = '1.0.0';
process.env.APP_LATEST_VERSION = '1.1.0';
