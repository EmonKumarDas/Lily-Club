import type { Request, Response, NextFunction } from 'express';
import { validateSessionRequest, CSRF_COOKIE_NAME } from './auth.js';
import { getConfig } from './config.js';
import {
  getRoomById,
  getRoomMember,
  getIdempotentResponse,
  saveIdempotentResponse,
  type UserRow,
  type SessionRow,
  type RoomRow,
  type RoomMemberRow,
  type RoleType,
} from './db.js';
import { getSessionReauthInfo, isDeviceRevoked } from './memberAuth.js';

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      user?: UserRow;
      session?: SessionRow;
      room?: RoomRow;
      roomMember?: RoomMemberRow;
    }
  }
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
}

/**
 * Minimum Supported Client Version Enforcement Middleware (Section 5):
 * Rejects outdated clients that may lack security patches with HTTP 426 Upgrade Required.
 */
export function enforceMinClientVersion(req: Request, res: Response, next: NextFunction): void {
  const fullPath = req.originalUrl || req.path;
  if (fullPath.startsWith('/api/health') || fullPath.startsWith('/api/app-version')) {
    return next();
  }

  const clientVer = (req.headers['x-client-version'] as string | undefined)?.trim();
  if (!clientVer) {
    return next();
  }

  if (!/^\d+\.\d+\.\d+$/.test(clientVer)) {
    res.status(426).json({
      error: 'UPDATE_REQUIRED',
      messageBn: 'আপনার অ্যাপের সংস্করণটি পুরোনো বা অবৈধ। অনুগ্রহ করে এখনই আপডেট করুন।',
      messageEn: 'Your app version is invalid or unsupported. Please update to continue.',
    });
    return;
  }

  const config = getConfig();
  if (compareSemver(clientVer, config.APP_MIN_SUPPORTED_VERSION) < 0) {
    res.status(426).json({
      error: 'UPDATE_REQUIRED',
      minSupportedVersion: config.APP_MIN_SUPPORTED_VERSION,
      latestVersion: config.APP_LATEST_VERSION,
      updateUrl: config.APP_UPDATE_URL,
      messageBn: `নিরাপত্তার স্বার্থে অ্যাপটি আপডেট করা আবশ্যক (সর্বনিম্ন সংস্করণ: ${config.APP_MIN_SUPPORTED_VERSION})।`,
      messageEn: `Update required to continue (minimum supported version: ${config.APP_MIN_SUPPORTED_VERSION}).`,
    });
    return;
  }

  next();
}

/**
 * Unified Server-Side Idempotency Middleware (Section 4):
 * Deduplicates retries, double-clicks, slow networks, and offline replays across mutating endpoints.
 */
const inFlightIdempotency = new Map<string, Promise<{ statusCode: number; body: any } | null>>();

export async function idempotencyGuard(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    next();
    return;
  }

  const rawKey =
    (req.headers['x-idempotency-key'] as string | undefined) ||
    (req.body && typeof req.body === 'object' ? req.body.idempotency_key : undefined);

  if (!rawKey || typeof rawKey !== 'string' || !rawKey.trim()) {
    next();
    return;
  }

  // Endpoints with domain-level transactional idempotency handle their own key inside SQLite transactions,
  // while all other mutating routes (rooms, join, approvals, customers, halls, settings) are guarded here!
  const p = req.originalUrl || req.path;
  if (
    /\/bookings\/?$/.test(p) ||
    /\/payments\/?$/.test(p) ||
    /\/expenses\/?$/.test(p)
  ) {
    if (req.body && typeof req.body === 'object' && !req.body.idempotency_key) {
      req.body.idempotency_key = rawKey.trim().slice(0, 100);
    }
    next();
    return;
  }

  const scopeUser =
    req.user?.id ||
    (typeof req.cookies?.lily_session === 'string'
      ? req.cookies.lily_session.slice(0, 24)
      : 'anon');
  const compositeKey = `${scopeUser}:${req.method}:${p}:${rawKey.trim().slice(0, 100)}`;

  const cached = getIdempotentResponse(compositeKey);
  if (cached) {
    res.status(cached.statusCode).json({
      ...cached.body,
      deduplicated: true,
    });
    return;
  }

  const existingInFlight = inFlightIdempotency.get(compositeKey);
  if (existingInFlight) {
    const resolved = await existingInFlight;
    if (resolved) {
      res.status(resolved.statusCode).json({
        ...resolved.body,
        deduplicated: true,
      });
      return;
    }
  }

  let resolveInFlight!: (val: { statusCode: number; body: any } | null) => void;
  const flightPromise = new Promise<{ statusCode: number; body: any } | null>((resolve) => {
    resolveInFlight = resolve;
  });
  inFlightIdempotency.set(compositeKey, flightPromise);

  let settled = false;
  const settle = (val: { statusCode: number; body: any } | null) => {
    if (settled) return;
    settled = true;
    inFlightIdempotency.delete(compositeKey);
    resolveInFlight(val);
  };

  res.on('finish', () => settle(null));
  res.on('close', () => settle(null));

  const origJson = res.json.bind(res);
  res.json = ((body: any) => {
    if (res.statusCode >= 200 && res.statusCode < 300 && body && typeof body === 'object') {
      try {
        saveIdempotentResponse(compositeKey, res.statusCode, body);
      } catch {
        // Ignore duplicate race if already stored
      }
      settle({ statusCode: res.statusCode, body });
    } else {
      settle(null);
    }
    return origJson(body);
  }) as any;

  next();
}

/**
 * Authentication middleware: ensures valid active session
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = validateSessionRequest(req, res);
  if (!auth) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      messageBn: 'অনুগ্রহ করে পুনরায় লগইন করুন।',
      messageEn: 'Please sign in to continue.',
    });
    return;
  }

  req.user = auth.user;
  req.session = auth.session;
  next();
}

/**
 * CSRF Protection Middleware for state-mutating requests
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const fullPath = req.originalUrl || req.path;
  if (
    fullPath.includes('/auth/google') ||
    fullPath.includes('/auth/dev-login') ||
    fullPath.includes('/auth/member/')
  ) {
    return next();
  }

  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers['x-csrf-token'];

  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    res.status(403).json({
      error: 'CSRF_VALIDATION_FAILED',
      messageBn: 'নিরাপত্তা যাচাই ব্যর্থ হয়েছে। অনুগ্রহ করে পেজটি রিফ্রেশ করুন।',
      messageEn: 'Security validation failed (CSRF). Please refresh the page.',
    });
    return;
  }

  next();
}

/**
 * Room Membership Middleware:
 * Checks on every single request:
 * - Signed in?
 * - Room exists and not deleted?
 * - Member of THIS room with ACTIVE status?
 * Role changes, suspensions, and removals take effect immediately and block cross-room IDOR.
 */
export function requireRoomMember(req: Request, res: Response, next: NextFunction): void {
  if (!req.user || !req.session) {
    res.status(401).json({
      error: 'UNAUTHORIZED',
      messageBn: 'অনুগ্রহ করে প্রথমে লগইন করুন।',
      messageEn: 'Please sign in first.',
    });
    return;
  }

  const roomId =
    req.params.roomId ||
    (req.headers['x-room-id'] as string) ||
    req.session.active_room_id;

  if (!roomId || typeof roomId !== 'string') {
    res.status(400).json({
      error: 'ROOM_REQUIRED',
      messageBn: 'রুম নির্বাচন করা আবশ্যক।',
      messageEn: 'Room context is required.',
    });
    return;
  }

  const room = getRoomById(roomId);
  if (!room || (room as any).is_deleted === 1) {
    res.status(404).json({
      error: 'ROOM_NOT_FOUND',
      messageBn: 'রুমটি খুঁজে পাওয়া যায়নি বা মুছে ফেলা হয়েছে।',
      messageEn: 'Room not found or has been deleted.',
    });
    return;
  }

  const member = getRoomMember(room.id, req.user.id);

  if (!member || member.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'ACCESS_DENIED',
      memberStatus: member?.status || 'NONE',
      messageBn: 'আপনি এই রুমের অনুমোদিত সক্রিয় সদস্য নন।',
      messageEn: 'You are not an active member of this room.',
    });
    return;
  }

  // Enforce immediate device revocation on every request
  const sessInfo = getSessionReauthInfo(req.session.id);
  if (isDeviceRevoked(sessInfo.device_id)) {
    res.status(401).json({
      error: 'DEVICE_REVOKED',
      messageBn: 'মালিক এই ডিভাইসটির অ্যাক্সেস বাতিল করেছেন।',
      messageEn: 'This device has been revoked by the room Owner.',
    });
    return;
  }

  req.room = room;
  req.roomMember = member;
  next();
}

/**
 * Requires a fresh Google re-login within REAUTH_WINDOW_MINUTES for sensitive Owner actions.
 */
export function requireRecentReauth(req: Request, res: Response, next: NextFunction): void {
  if (!req.session) {
    res.status(401).json({ error: 'UNAUTHORIZED' });
    return;
  }
  const config = getConfig();
  const { reauth_at } = getSessionReauthInfo(req.session.id);
  const windowMs = config.REAUTH_WINDOW_MINUTES * 60 * 1000;
  if (!reauth_at || Date.now() - reauth_at > windowMs) {
    res.status(403).json({
      error: 'REAUTH_REQUIRED',
      messageBn: 'এই সংবেদনশীল কাজটির জন্য পুনরায় Google লগইন (Re-authentication) প্রয়োজন।',
      messageEn: 'A fresh Google sign-in is required before performing this sensitive action.',
    });
    return;
  }
  next();
}

/**
 * Optional Firebase App Check enforcement middleware on sensitive auth endpoints.
 */
export function requireAppCheck(req: Request, res: Response, next: NextFunction): void {
  const config = getConfig();
  if (!config.ENFORCE_FIREBASE_APP_CHECK) {
    return next();
  }
  const appCheckToken = (req.headers['x-firebase-appcheck'] as string | undefined)?.trim();
  if (!appCheckToken || appCheckToken.length < 20) {
    res.status(401).json({
      error: 'APP_CHECK_REQUIRED',
      messageBn: 'বৈধ অ্যাপ যাচাইকরণ (App Check) ব্যর্থ হয়েছে।',
      messageEn: 'Valid Firebase App Check token is required.',
    });
    return;
  }
  next();
}

/**
 * Role-Based Access Control (RBAC) middleware
 */
export function requireRole(allowedRoles: RoleType[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.roomMember) {
      res.status(403).json({
        error: 'FORBIDDEN',
        messageBn: 'রুম সদস্যপদ যাচাই করা যায়নি।',
        messageEn: 'Room membership could not be verified.',
      });
      return;
    }

    if (!allowedRoles.includes(req.roomMember.role)) {
      res.status(403).json({
        error: 'INSUFFICIENT_PERMISSIONS',
        messageBn: 'এই কাজটি সম্পন্ন করার পর্যাপ্ত অনুমতি আপনার নেই।',
        messageEn: 'You do not have permission to perform this action.',
      });
      return;
    }

    next();
  };
}

/**
 * Mass Assignment Protection:
 * Sanitizes input body to prevent client tampering with reserved system fields.
 */
export function sanitizeBody(
  reservedKeys: string[] = [
    'role',
    'status',
    'id',
    'room_id',
    'owner_id',
    'ownerId',
    'created_by_user_id',
    'created_at',
    'updated_at',
  ]
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (req.body && typeof req.body === 'object') {
      for (const key of reservedKeys) {
        if (key in req.body) {
          delete req.body[key];
        }
      }
    }
    next();
  };
}
