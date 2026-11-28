import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { validateConfig, getConfig } from './config.js';
import { getDb, closeDb } from './db.js';
import { ensureMemberAuthTables } from './memberAuth.js';
import { isFirestoreEnabled, getFirebaseProjectId, syncAllSqliteToFirestore, hydrateSqliteFromFirestore } from './firebaseAdmin.js';
import { csrfProtection, enforceMinClientVersion, idempotencyGuard } from './middleware.js';
import authRoutes from './routes/authRoutes.js';
import roomRoutes from './routes/roomRoutes.js';

// 1. Strict Configuration Validation at Startup
let config;
try {
  config = validateConfig();
} catch (err: any) {
  // Safe startup error output - never prints secrets
  console.error('\n' + '='.repeat(70));
  console.error(err.message);
  console.error('='.repeat(70) + '\n');
  process.exit(1);
}

// 2. Initialize Database & Schema
getDb();

// 3. Create Express Application
const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://accounts.google.com',
          'https://apis.google.com',
          'https://www.google.com',
          'https://www.gstatic.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        connectSrc: [
          "'self'",
          'https://accounts.google.com',
          'https://oauth2.googleapis.com',
          'https://*.googleapis.com',
          'https://*.firebaseio.com',
        ],
        frameSrc: ["'self'", 'https://accounts.google.com', 'https://www.google.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: config.isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

app.use(
  cors({
    origin: (origin, callback) => {
      const liveCfg = getConfig();
      if (
        !origin ||
        origin === liveCfg.PUBLIC_APP_URL ||
        (liveCfg.isDevelopment &&
          (origin.startsWith('exp://') ||
            /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)))
      ) {
        return callback(null, true);
      }
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Serve uploaded receipt images safely (no script execution, strict Static serving)
const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use(
  '/api/uploads',
  express.static(uploadsDir, {
    setHeaders: (res) => {
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self' data:;");
    },
  })
);

// Public read-only App Version endpoint (Section 5: In-App Update Notification)
app.get('/api/app-version', (_req: Request, res: Response) => {
  const liveCfg = getConfig();
  res.json({
    latestVersion: liveCfg.APP_LATEST_VERSION,
    minSupportedVersion: liveCfg.APP_MIN_SUPPORTED_VERSION,
    updateUrl: liveCfg.APP_UPDATE_URL,
    releaseNotesBn: liveCfg.APP_RELEASE_NOTES_BN,
    releaseNotesEn: liveCfg.APP_RELEASE_NOTES_EN,
    distribution: 'pwa-and-apk',
  });
});

// Enforce minimum supported client version on all API endpoints
app.use('/api', enforceMinClientVersion);

// Apply CSRF Protection and Server-Side Idempotency Guard to all API routes
app.use('/api', csrfProtection);
app.use('/api', idempotencyGuard);

// Auto-sync SQLite mutations to Cloud Firestore (debounced, non-blocking, Admin SDK only)
let fsSyncTimer: NodeJS.Timeout | null = null;
function scheduleFirestoreSync() {
  if (process.env.NODE_TEST_CONTEXT || process.argv.includes('--test')) return;
  if (!isFirestoreEnabled()) return;
  if (fsSyncTimer) clearTimeout(fsSyncTimer);
  fsSyncTimer = setTimeout(() => {
    void syncAllSqliteToFirestore(getDb());
  }, 500);
}

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
    res.on('finish', () => {
      if (res.statusCode >= 200 && res.statusCode < 400) {
        scheduleFirestoreSync();
      }
    });
  }
  next();
});

// API Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check endpoint (never leaks sensitive config)
app.get('/api/health', (_req: Request, res: Response) => {
  const liveCfg = getConfig();
  res.json({
    status: 'healthy',
    environment: liveCfg.APP_ENV,
    firebaseProjectId: getFirebaseProjectId(),
    firebaseEnabled: isFirestoreEnabled(),
    minSupportedVersion: liveCfg.APP_MIN_SUPPORTED_VERSION,
    latestVersion: liveCfg.APP_LATEST_VERSION,
    timestamp: Date.now(),
  });
});

// Static Client Serving (Production or Built Client)
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith('/api')) {
      return next();
    }
    if (req.method === 'GET') {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

// Centralized Safe Error Handling Middleware (never leaks stack traces or PII in production)
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const isProd = getConfig().isProduction;

  if (!isProd) {
    console.error('[SERVER ERROR DEBUG]:', err?.message || 'Error');
  }

  res.status(err.status || 500).json({
    error: err.code || 'SERVER_ERROR',
    messageBn: err.messageBn || 'সার্ভারে একটি ত্রুটি ঘটেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    messageEn: err.messageEn || 'An unexpected server error occurred. Please try again later.',
    ...(isProd ? {} : { debug: err.message }),
  });
});

// Start Server only when not running under automated node:test runner
let server: any = null;
if (!process.env.NODE_TEST_CONTEXT && !process.argv.includes('--test')) {
  server = app.listen(config.PORT, '0.0.0.0', () => {
    console.log(`[LilyCC Server] Running in ${config.APP_ENV} mode on port ${config.PORT} (0.0.0.0)`);
    console.log(`[LilyCC Server] Public App URL: ${config.PUBLIC_APP_URL}`);
    ensureMemberAuthTables();
    void hydrateSqliteFromFirestore(getDb()).then(() => syncAllSqliteToFirestore(getDb()));
  });
}

// Graceful Shutdown
function handleShutdown(signal: string) {
  console.log(`\nReceived ${signal}. Gracefully closing server and database...`);
  if (server) {
    server.close(() => {
      closeDb();
      console.log('Server and database closed. Clean exit.');
      process.exit(0);
    });
  } else {
    closeDb();
    process.exit(0);
  }
}

process.on('SIGINT', () => handleShutdown('SIGINT'));
process.on('SIGTERM', () => handleShutdown('SIGTERM'));

export { app, server };
