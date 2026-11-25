import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { validateConfig, getConfig } from './config.js';
import { getDb, closeDb } from './db.js';
import { csrfProtection } from './middleware.js';
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
          "'unsafe-inline'", // Allowed for Vite dev & dynamic hydration
          'https://accounts.google.com',
          'https://apis.google.com',
        ],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
        imgSrc: ["'self'", 'data:', 'https:', 'http:'],
        connectSrc: ["'self'", 'https://accounts.google.com', 'https://oauth2.googleapis.com'],
        frameSrc: ["'self'", 'https://accounts.google.com'],
        objectSrc: ["'none'"],
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'deny' },
    hsts: config.isProduction
      ? { maxAge: 31536000, includeSubDomains: true, preload: true }
      : false,
  })
);

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      origin === config.PUBLIC_APP_URL ||
      (config.isDevelopment &&
        (origin.startsWith('exp://') ||
          /^http:\/\/(localhost|127\.0\.0\.1|192\.168\.|10\.|172\.)/.test(origin)))
    ) {
      return callback(null, true);
    }
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

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

// Apply CSRF Protection to API routes
app.use('/api', csrfProtection);

// API Route Handlers
app.use('/api/auth', authRoutes);
app.use('/api/rooms', roomRoutes);

// Health check endpoint
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    environment: config.APP_ENV,
    timestamp: Date.now(),
  });
});

// Static Client Serving (Production or Built Client)
const clientDistPath = path.resolve(process.cwd(), 'dist/client');
if (fs.existsSync(clientDistPath)) {
  app.use(express.static(clientDistPath));
  app.use((req: Request, res: Response, next: NextFunction) => {
    // If request is for an API route, don't serve index.html
    if (req.path.startsWith('/api')) {
      return next();
    }
    if (req.method === 'GET') {
      return res.sendFile(path.join(clientDistPath, 'index.html'));
    }
    next();
  });
}

// Centralized Safe Error Handling Middleware
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const isProd = config.isProduction;

  if (!isProd) {
    console.error('[SERVER ERROR DEBUG]:', err);
  }

  // Never leak secrets or stack traces in production
  res.status(err.status || 500).json({
    error: 'SERVER_ERROR',
    messageBn: 'সার্ভারে একটি ত্রুটি ঘটেছে। কিছুক্ষণ পর আবার চেষ্টা করুন।',
    messageEn: 'An unexpected server error occurred. Please try again later.',
    ...(isProd ? {} : { debug: err.message, stack: err.stack }),
  });
});

// Start Server only when not running under automated node:test runner
let server: any = null;
if (!process.env.NODE_TEST_CONTEXT && !process.argv.includes('--test')) {
  server = app.listen(config.PORT, () => {
    console.log(`[LilyCC Server] Running in ${config.APP_ENV} mode on port ${config.PORT}`);
    console.log(`[LilyCC Server] Public App URL: ${config.PUBLIC_APP_URL}`);
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
