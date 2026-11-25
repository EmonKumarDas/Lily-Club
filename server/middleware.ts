import type { Request, Response, NextFunction } from 'express';
import { validateSessionRequest, CSRF_COOKIE_NAME } from './auth.js';
import {
  getRoomById,
  getRoomMember,
  type UserRow,
  type SessionRow,
  type RoomRow,
  type RoomMemberRow,
  type RoleType,
} from './db.js';

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
  // Safe HTTP methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Exempt auth callback or public endpoints if necessary
  const fullPath = req.originalUrl || req.path;
  if (fullPath.includes('/auth/google') || fullPath.includes('/auth/dev-login')) {
    return next();
  }

  // Mobile clients (React Native / Expo Go) authenticating via Bearer token are immune to browser CSRF
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
 * Every request is checked on the server:
 * - Logged in?
 * - Member of THIS room?
 * - Active status?
 * Role changes and removals take effect immediately!
 * Blocks cross-room access (IDOR).
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

  // Resolve target room ID: URL param takes precedence, then header, then session active_room_id
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
  if (!room) {
    res.status(404).json({
      error: 'ROOM_NOT_FOUND',
      messageBn: 'রুমটি খুঁজে পাওয়া যায়নি।',
      messageEn: 'Room not found.',
    });
    return;
  }

  // Check membership in this room directly from database
  const member = getRoomMember(room.id, req.user.id);

  if (!member || member.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'ACCESS_DENIED',
      messageBn: 'আপনি এই রুমের অনুমোদিত সক্রিয় সদস্য নন।',
      messageEn: 'You are not an active member of this room.',
    });
    return;
  }

  req.room = room;
  req.roomMember = member;
  next();
}

/**
 * Role-Based Access Control (RBAC) middleware:
 * Ensures the authenticated user's active room role matches allowed roles.
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
export function sanitizeBody(reservedKeys: string[] = ['role', 'status', 'id', 'created_by_user_id', 'created_at', 'updated_at']) {
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
