import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  createRoom,
  getUserRooms,
  getRoomById,
  getRoomByJoinCode,
  getRoomMember,
  getRoomMembers,
  updateMemberRole,
  removeMember,
  approveJoinRequest,
  rejectJoinRequest,
  regenerateRoomJoinCode,
  updateRoomSettings,
  recordJoinAttempt,
  checkJoinRateLimit,
  getRoomAuditLogs,
  setSessionActiveRoom,
  addAuditLog,
  getDb,
  createHall,
  getHallById,
  getRoomHalls,
  updateHall,
  deleteOrDeactivateHall,
  createCustomer,
  getCustomerById,
  getRoomCustomers,
  updateCustomer,
  deleteCustomer,
  findCustomerByPhone,
  checkHallDateAvailability,
  createBooking,
  getBookingById,
  getBookingHistory,
  updateBooking,
  cancelBooking,
  listRoomBookings,
  stripMoneyFromBooking,
  stripMoneyFromCustomerBookings,
  seedPart2DemoData,
  clearPart2DemoData,
  getBookingPayments,
  createPayment,
  reversePayment,
  listRoomExpenses,
  createExpense,
  reverseExpense,
  getUserNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  generateRoomReport,
  generateRoomDashboard,
  type RoleType,
  type SlotType,
  type EventType,
  type BookingStatus,
  type PaymentMethod,
  type ExpenseCategory,
} from '../db.js';
import {
  getTodayDhakaYMD,
  formatDualDateFromYMD,
  formatCurrency,
  toBanglaDigits,
} from '../dateUtils.js';
import { requireAuth, requireRoomMember, requireRole, sanitizeBody } from '../middleware.js';

// Per-user create endpoint rate limiter (max 60 create calls per minute per user)
const createRateMap = new Map<string, number[]>();
function checkCreateRateLimit(userId: string, ip: string): boolean {
  const key = `${userId}:${ip}`;
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (createRateMap.get(key) || []).filter((t) => t > windowStart);
  if (recent.length >= 60) {
    createRateMap.set(key, recent);
    return false;
  }
  recent.push(now);
  createRateMap.set(key, recent);
  return true;
}

// Per-user export endpoint rate limiter (max 20 export calls per minute per user)
const exportRateMap = new Map<string, number[]>();
function checkExportRateLimit(userId: string, ip: string): boolean {
  const key = `exp:${userId}:${ip}`;
  const now = Date.now();
  const windowStart = now - 60_000;
  const recent = (exportRateMap.get(key) || []).filter((t) => t > windowStart);
  if (recent.length >= 20) {
    exportRateMap.set(key, recent);
    return false;
  }
  recent.push(now);
  exportRateMap.set(key, recent);
  return true;
}

/**
 * Validates and saves a base64 receipt image with magic-byte verification,
 * strict 2MB limit, and a cryptographically random file name.
 */
function validateAndSaveReceiptImage(dataUrl: string): string {
  const match = dataUrl.match(/^data:(image\/(png|jpeg|jpg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    const err: any = new Error('Only valid PNG, JPEG, or WebP images are allowed');
    err.code = 'INVALID_IMAGE_TYPE';
    err.status = 400;
    err.messageBn = 'রশিদের ছবি শুধুমাত্র PNG, JPG বা WEBP ফরম্যাটের হতে হবে। অন্য কোনো ফাইল অনুমোদিত নয়।';
    err.messageEn = 'Receipt photo must be a valid PNG, JPEG, or WebP image. Other file types are rejected.';
    throw err;
  }

  const mime = match[1];
  const base64Payload = match[3];
  const buf = Buffer.from(base64Payload, 'base64');

  // Max 2 MB limit
  if (buf.length === 0 || buf.length > 2 * 1024 * 1024) {
    const err: any = new Error('Receipt image exceeds 2MB size limit');
    err.code = 'IMAGE_TOO_LARGE';
    err.status = 400;
    err.messageBn = 'রশিদের ছবির আকার সর্বোচ্চ ২ মেগাবাইট (2MB) হতে পারবে।';
    err.messageEn = 'Receipt photo size must not exceed 2 MB.';
    throw err;
  }

  // Magic-byte signature verification (never trust extension or MIME header alone!)
  const isPng =
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47;
  const isJpeg =
    buf.length >= 3 &&
    buf[0] === 0xff &&
    buf[1] === 0xd8 &&
    buf[2] === 0xff;
  const isWebp =
    buf.length >= 12 &&
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isPng && !isJpeg && !isWebp) {
    const err: any = new Error('File magic bytes do not match a valid image');
    err.code = 'INVALID_IMAGE_MAGIC';
    err.status = 400;
    err.messageBn = 'প্রদত্ত ফাইলটি আসল ছবি নয়। নিরাপত্তার স্বার্থে এটি বাতিল করা হয়েছে।';
    err.messageEn = 'Uploaded file failed image signature verification.';
    throw err;
  }

  const ext = isPng ? 'png' : isJpeg ? 'jpg' : 'webp';
  const randomFileName = `receipt-${crypto.randomUUID()}.${ext}`;
  const uploadsDir = path.resolve(process.cwd(), 'data/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  fs.writeFileSync(path.join(uploadsDir, randomFileName), buf);
  return `/api/uploads/${randomFileName}`;
}

const router = Router();

// Create a new Room
router.post(
  '/',
  requireAuth,
  sanitizeBody(),
  (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(2, 'Room name must be at least 2 characters').max(100),
      logo: z.string().optional().nullable(),
      address: z.string().min(2, 'Address is required').max(250),
      phone: z.string().min(6, 'Valid phone number is required').max(25),
      default_language: z.enum(['bn', 'en']).optional().default('bn'),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'প্রদত্ত তথ্য সঠিক নয়। অনুগ্রহ করে সকল ঘর পূরণ করুন।',
        messageEn: 'Validation failed. Please check required fields.',
        details: parsed.error.issues,
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const room = createRoom(
      {
        name: parsed.data.name,
        logo: parsed.data.logo,
        address: parsed.data.address,
        phone: parsed.data.phone,
        default_language: parsed.data.default_language,
        createdByUserId: req.user!.id,
      },
      {
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      }
    );

    // Set this as the active room in the user's session
    setSessionActiveRoom(req.session!.id, room.id);

    res.status(201).json({
      success: true,
      room,
      role: 'OWNER',
    });
  }
);

// Get all rooms the current user is a member of
router.get('/', requireAuth, (req: Request, res: Response) => {
  const rooms = getUserRooms(req.user!.id);
  res.json({ rooms });
});

// Switch active room
router.post('/switch', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    roomId: z.string().uuid(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'INVALID_ROOM_ID' });
    return;
  }

  const targetRoomId = parsed.data.roomId;
  const member = getRoomMember(targetRoomId, req.user!.id);

  if (!member || member.status !== 'ACTIVE') {
    res.status(403).json({
      error: 'ACCESS_DENIED',
      messageBn: 'আপনি এই রুমে প্রবেশ করতে পারবেন না।',
      messageEn: 'You do not have active access to this room.',
    });
    return;
  }

  const room = getRoomById(targetRoomId);
  setSessionActiveRoom(req.session!.id, targetRoomId);

  res.json({
    success: true,
    activeRoom: room,
    activeMember: member,
  });
});

// Join Room using Join Code (Rate limited & lockout protected)
router.post('/join', requireAuth, (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const userId = req.user!.id;

  // 1. Check rate limit & lockout
  const rateLimitStatus = checkJoinRateLimit({ ipAddress: clientIp, userId });
  if (rateLimitStatus.isLocked) {
    const minutesLeft = Math.ceil(rateLimitStatus.remainingSeconds / 60);
    res.status(429).json({
      error: 'RATE_LIMIT_EXCEEDED',
      messageBn: `অতিরিক্ত ভুল চেষ্টার কারণে আপনার অ্যাক্সেস সাময়িকভাবে বন্ধ আছে। অনুগ্রহ করে ${minutesLeft} মিনিট পর চেষ্টা করুন।`,
      messageEn: `Too many failed join attempts. You are temporarily locked out. Please try again in ${minutesLeft} minutes.`,
      remainingSeconds: rateLimitStatus.remainingSeconds,
    });
    return;
  }

  const schema = z.object({
    joinCode: z.string().min(1).max(20),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    recordJoinAttempt({ ipAddress: clientIp, userId, attemptedCode: 'INVALID' });
    res.status(400).json({
      error: 'INVALID_CODE',
      messageBn: 'ভুল কোড বা প্রবেশের অনুমতি নেই।',
      messageEn: 'Invalid code or request not allowed.',
    });
    return;
  }

  const sanitizedCode = parsed.data.joinCode.trim().toUpperCase();
  const room = getRoomByJoinCode(sanitizedCode);

  if (!room) {
    // Record failed attempt
    recordJoinAttempt({ ipAddress: clientIp, userId, attemptedCode: sanitizedCode });
    // Generic error: never reveal whether room exists!
    res.status(400).json({
      error: 'INVALID_CODE',
      messageBn: 'ভুল কোড বা প্রবেশের অনুমতি নেই।',
      messageEn: 'Invalid code or request not allowed.',
    });
    return;
  }

  // Check if user is already a member
  const existingMember = getRoomMember(room.id, userId);
  if (existingMember) {
    if (existingMember.status === 'ACTIVE') {
      setSessionActiveRoom(req.session!.id, room.id);
      res.json({
        success: true,
        status: 'ACTIVE',
        room,
        messageBn: 'আপনি ইতোমধ্যে এই রুমের সক্রিয় সদস্য।',
        messageEn: 'You are already an active member of this room.',
      });
      return;
    } else if (existingMember.status === 'PENDING') {
      res.json({
        success: true,
        status: 'PENDING',
        room: { id: room.id, name: room.name },
        messageBn: 'আপনার যোগদানের আবেদনটি ইতোমধ্যে অনুমোদনের অপেক্ষায় রয়েছে।',
        messageEn: 'Your join request is already pending Owner approval.',
      });
      return;
    } else if (existingMember.status === 'REJECTED') {
      // Re-applying resets request to pending
      const db = getDb();
      db.prepare(`
        UPDATE room_members 
        SET status = 'PENDING', role = 'VIEWER', updated_at = ? 
        WHERE room_id = ? AND user_id = ?
      `).run(Date.now(), room.id, userId);

      addAuditLog({
        roomId: room.id,
        userId: req.user!.id,
        userEmail: req.user!.email,
        userName: req.user!.name,
        action: 'JOIN_REQUEST',
        details: { reapplication: true },
        ipAddress: clientIp,
      });

      res.json({
        success: true,
        status: 'PENDING',
        room: { id: room.id, name: room.name },
        messageBn: 'আপনার যোগদানের আবেদনটি ওনারের অনুমোদনের জন্য পাঠানো হয়েছে।',
        messageEn: 'Your join request has been sent for Owner approval.',
      });
      return;
    }
  }

  const db = getDb();
  const now = Date.now();
  const memberId = crypto.randomUUID();

  // If join approval is required by room settings:
  if (room.join_approval_required === 1) {
    db.prepare(`
      INSERT INTO room_members (id, room_id, user_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'VIEWER', 'PENDING', ?, ?)
    `).run(memberId, room.id, userId, now, now);

    addAuditLog({
      roomId: room.id,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userName: req.user!.name,
      action: 'JOIN_REQUEST',
      details: { joinCode: sanitizedCode },
      ipAddress: clientIp,
    });

    res.json({
      success: true,
      status: 'PENDING',
      room: { id: room.id, name: room.name },
      messageBn: 'যোগদানের আবেদন সফলভাবে জমা হয়েছে। ওনার অনুমোদন দিলে আপনি প্রবেশ করতে পারবেন।',
      messageEn: 'Join request submitted successfully. You can enter once the Owner approves.',
    });
  } else {
    // Direct join enabled
    db.prepare(`
      INSERT INTO room_members (id, room_id, user_id, role, status, created_at, updated_at)
      VALUES (?, ?, ?, 'STAFF', 'ACTIVE', ?, ?)
    `).run(memberId, room.id, userId, now, now);

    setSessionActiveRoom(req.session!.id, room.id);

    addAuditLog({
      roomId: room.id,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userName: req.user!.name,
      action: 'JOIN_DIRECT',
      details: { joinCode: sanitizedCode, assignedRole: 'STAFF' },
      ipAddress: clientIp,
    });

    res.json({
      success: true,
      status: 'ACTIVE',
      room,
      messageBn: 'রুমে সফলভাবে যোগদান সম্পন্ন হয়েছে।',
      messageEn: 'Successfully joined the room.',
    });
  }
});

// ======================== Owner-Only Room Management ========================

// Get members and pending requests for the room (Owner, Manager, Staff can view list; Owner has full management)
router.get(
  '/:roomId/members',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const members = getRoomMembers(req.room!.id);
    res.json({ members });
  }
);

// Update member role (Owner only)
router.patch(
  '/:roomId/members/:userId/role',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER']),
  (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(['OWNER', 'MANAGER', 'STAFF', 'VIEWER']),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'INVALID_ROLE' });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    try {
      updateMemberRole(req.room!.id, req.params.userId, parsed.data.role as RoleType, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });

      res.json({
        success: true,
        messageBn: 'সদস্যের পদবি সফলভাবে পরিবর্তন করা হয়েছে।',
        messageEn: 'Member role updated successfully.',
      });
    } catch (err: any) {
      res.status(400).json({
        error: 'ROLE_UPDATE_FAILED',
        messageBn: err.message,
        messageEn: err.message,
      });
    }
  }
);

// Remove member (Owner only)
router.delete(
  '/:roomId/members/:userId',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    try {
      removeMember(req.room!.id, req.params.userId, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });

      res.json({
        success: true,
        messageBn: 'সদস্যকে রুম থেকে অপসারণ করা হয়েছে।',
        messageEn: 'Member removed from room successfully.',
      });
    } catch (err: any) {
      res.status(400).json({
        error: 'REMOVE_MEMBER_FAILED',
        messageBn: err.message,
        messageEn: err.message,
      });
    }
  }
);

// Approve Join Request (Owner only)
router.post(
  '/:roomId/requests/:userId/approve',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER']),
  (req: Request, res: Response) => {
    const schema = z.object({
      role: z.enum(['STAFF', 'MANAGER', 'VIEWER']).optional().default('STAFF'),
    });

    const parsed = schema.safeParse(req.body);
    const assignedRole = parsed.success ? parsed.data.role : 'STAFF';
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    try {
      approveJoinRequest(req.room!.id, req.params.userId, assignedRole as RoleType, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });

      res.json({
        success: true,
        messageBn: 'যোগদানের আবেদন অনুমোদন করা হয়েছে।',
        messageEn: 'Join request approved successfully.',
      });
    } catch (err: any) {
      res.status(400).json({
        error: 'APPROVE_FAILED',
        messageBn: err.message,
        messageEn: err.message,
      });
    }
  }
);

// Reject Join Request (Owner only)
router.post(
  '/:roomId/requests/:userId/reject',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;

    try {
      rejectJoinRequest(req.room!.id, req.params.userId, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });

      res.json({
        success: true,
        messageBn: 'যোগদানের আবেদন প্রত্যাখ্যান করা হয়েছে।',
        messageEn: 'Join request rejected.',
      });
    } catch (err: any) {
      res.status(400).json({
        error: 'REJECT_FAILED',
        messageBn: err.message,
        messageEn: err.message,
      });
    }
  }
);

// Regenerate Room ID / Join Code (Owner only)
router.post(
  '/:roomId/regenerate-code',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const newCode = regenerateRoomJoinCode(req.room!.id, {
      userId: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      ip: clientIp,
    });

    res.json({
      success: true,
      newJoinCode: newCode,
      messageBn: 'রুম কোড সফলভাবে পুনর্নবীকরণ করা হয়েছে। পূর্বের কোডটি বাতিল করা হয়েছে।',
      messageEn: 'Room ID regenerated successfully. The previous code was revoked immediately.',
    });
  }
);

// Update Room Settings (Owner and Manager can configure slot timing & buffer; only Owner can change join policy or room name/phone/address)
router.patch(
  '/:roomId/settings',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  sanitizeBody(),
  (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(2).max(100).optional(),
      logo: z
        .string()
        .max(2_500_000)
        .refine(
          (val) => /^data:image\/(png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]+$/i.test(val) || /^https?:\/\/.+/i.test(val),
          { message: 'Only valid image files (PNG, JPG, WEBP) are allowed for logo' }
        )
        .nullable()
        .optional(),
      address: z.string().min(2).max(250).optional(),
      phone: z.string().min(6).max(120).optional(),
      email: z.string().max(150).nullable().optional(),
      primary_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable().optional(),
      logo_scale: z.number().min(0.5).max(2.0).optional(),
      default_language: z.enum(['bn', 'en']).optional(),
      join_approval_required: z.boolean().optional(),
      day_start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      day_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      night_start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      night_end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      buffer_enabled: z.boolean().optional(),
      buffer_minutes: z.number().int().min(0).max(360).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_FAILED', details: parsed.error.issues });
      return;
    }

    // If Manager, only allow updating slot timing and buffer fields
    const payload = { ...parsed.data };
    if (req.roomMember!.role === 'MANAGER') {
      delete payload.name;
      delete payload.logo;
      delete payload.address;
      delete payload.phone;
      delete payload.email;
      delete payload.primary_color;
      delete payload.logo_scale;
      delete payload.default_language;
      delete payload.join_approval_required;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const updated = updateRoomSettings(req.room!.id, payload, {
      userId: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      ip: clientIp,
    });

    res.json({
      success: true,
      room: updated,
      messageBn: 'রুমের তথ্য ও স্লট সেটিংস সফলভাবে আপডেট করা হয়েছে।',
      messageEn: 'Room and slot settings updated successfully.',
    });
  }
);

// Audit Logs (Owner only, append-only with user, action, and date range filters)
router.get(
  '/:roomId/audit-logs',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER']),
  (req: Request, res: Response) => {
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '100', 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));
    const userId = (req.query.userId as string) || '';
    const action = (req.query.action as string) || '';
    const dateFrom = (req.query.dateFrom as string) || '';
    const dateTo = (req.query.dateTo as string) || '';

    const logs = getRoomAuditLogs(req.room!.id, {
      userId,
      action,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    res.json({ logs });
  }
);

// ======================== Part 2: Halls / Spaces Routes ========================

// List all halls in room (All active room members can view)
router.get(
  '/:roomId/halls',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const activeOnly = req.query.activeOnly === 'true';
    const halls = getRoomHalls(req.room!.id, !activeOnly);
    res.json({ halls });
  }
);

// Create hall (Owner and Manager only)
router.post(
  '/:roomId/halls',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  sanitizeBody(['id', 'room_id', 'created_at', 'updated_at', 'booking_count']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkCreateRateLimit(req.user!.id, clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        messageBn: 'অতিরিক্ত অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।',
        messageEn: 'Too many create requests. Please wait a moment.',
      });
      return;
    }

    const schema = z.object({
      name: z.string().min(2).max(120),
      capacity: z.number().int().min(1).max(50000),
      day_price: z.number().min(0),
      night_price: z.number().min(0),
      full_price: z.number().min(0),
      photos: z.array(z.string()).optional().default([]),
      facilities: z.array(z.string()).optional().default([]),
      is_active: z.boolean().optional().default(true),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'হলের তথ্য সঠিক নয়। অনুগ্রহ করে নাম, ধারণক্ষমতা এবং মূল্য সঠিকভাবে পূরণ করুন।',
        messageEn: 'Invalid hall data. Please check name, capacity, and slot prices.',
        details: parsed.error.issues,
      });
      return;
    }

    const hall = createHall(req.room!.id, parsed.data, {
      userId: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      ip: clientIp,
    });

    res.status(201).json({
      success: true,
      hall,
      messageBn: 'হল সফলভাবে যুক্ত করা হয়েছে।',
      messageEn: 'Hall created successfully.',
    });
  }
);

// Update hall (Owner and Manager only)
router.patch(
  '/:roomId/halls/:hallId',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  sanitizeBody(['id', 'room_id', 'created_at', 'updated_at', 'booking_count']),
  (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(2).max(120).optional(),
      capacity: z.number().int().min(1).max(50000).optional(),
      day_price: z.number().min(0).optional(),
      night_price: z.number().min(0).optional(),
      full_price: z.number().min(0).optional(),
      photos: z.array(z.string()).optional(),
      facilities: z.array(z.string()).optional(),
      is_active: z.boolean().optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_FAILED', details: parsed.error.issues });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const hall = updateHall(req.room!.id, req.params.hallId, parsed.data, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });
      res.json({
        success: true,
        hall,
        messageBn: 'হলের তথ্য সফলভাবে আপডেট করা হয়েছে।',
        messageEn: 'Hall updated successfully.',
      });
    } catch (err: any) {
      res.status(404).json({
        error: 'HALL_NOT_FOUND',
        messageBn: 'হলটি এই রুমে খুঁজে পাওয়া যায়নি।',
        messageEn: 'Hall not found in this room.',
      });
    }
  }
);

// Delete or deactivate hall (Owner and Manager only)
router.delete(
  '/:roomId/halls/:hallId',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const result = deleteOrDeactivateHall(req.room!.id, req.params.hallId, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });

      res.json({
        success: true,
        ...result,
        messageBn: result.deactivated
          ? 'এই হলে পূর্বে বুকিং থাকায় এটি সম্পূর্ণ না মুছে নিষ্ক্রিয় (Deactivated) করা হয়েছে যাতে বুকিংয়ের রেকর্ড অক্ষুণ্ণ থাকে।'
          : 'হলটি সফলভাবে মুছে ফেলা হয়েছে।',
        messageEn: result.deactivated
          ? 'This hall has existing bookings, so it was safely deactivated instead of hard-deleted.'
          : 'Hall deleted successfully.',
      });
    } catch (err: any) {
      res.status(404).json({
        error: 'HALL_NOT_FOUND',
        messageBn: 'হলটি খুঁজে পাওয়া যায়নি।',
        messageEn: 'Hall not found.',
      });
    }
  }
);

// ======================== Part 2: Customers Routes ========================

// List / search customers
router.get(
  '/:roomId/customers',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const search = (req.query.search as string) || '';
    const limit = Math.min(200, Math.max(1, parseInt((req.query.limit as string) || '100', 10)));
    const offset = Math.max(0, parseInt((req.query.offset as string) || '0', 10));

    const result = getRoomCustomers(req.room!.id, search, limit, offset);
    res.json(result);
  }
);

// Check duplicate phone before creating customer
router.get(
  '/:roomId/customers/check-phone',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const phone = (req.query.phone as string) || '';
    const existing = findCustomerByPhone(req.room!.id, phone);
    res.json({ exists: Boolean(existing), customer: existing });
  }
);

// Get Customer Profile + Booking History (Money columns hidden from Staff and Viewer!)
router.get(
  '/:roomId/customers/:customerId',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const customer = getCustomerById(req.room!.id, req.params.customerId);
    if (!customer) {
      res.status(404).json({
        error: 'CUSTOMER_NOT_FOUND',
        messageBn: 'গ্রাহককে এই রুমে খুঁজে পাওয়া যায়নি।',
        messageEn: 'Customer not found in this room.',
      });
      return;
    }

    const { bookings } = listRoomBookings(req.room!.id, {
      customerId: customer.id,
      limit: 100,
    });

    const sanitizedBookings = stripMoneyFromCustomerBookings(bookings, req.roomMember!.role);

    res.json({
      customer,
      bookings: sanitizedBookings,
      hideMoneyColumns: req.roomMember!.role === 'STAFF' || req.roomMember!.role === 'VIEWER',
    });
  }
);

// Create Customer (Owner, Manager, Staff)
router.post(
  '/:roomId/customers',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER', 'STAFF']),
  sanitizeBody(['id', 'room_id', 'created_at', 'updated_at', 'booking_count']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkCreateRateLimit(req.user!.id, clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        messageBn: 'অতিরিক্ত অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।',
        messageEn: 'Too many create requests. Please wait a moment.',
      });
      return;
    }

    const schema = z.object({
      name: z.string().min(2).max(150),
      phone: z.string().min(5).max(30),
      alt_phone: z.string().max(30).optional().nullable(),
      address: z.string().max(300).optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
      forceCreate: z.boolean().optional().default(false),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'গ্রাহকের নাম ও সঠিক ফোন নম্বর প্রদান করুন।',
        messageEn: 'Please provide valid customer name and phone number.',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const { customer } = createCustomer(req.room!.id, parsed.data, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });

      res.status(201).json({
        success: true,
        customer,
        messageBn: 'নতুন গ্রাহক সফলভাবে যুক্ত করা হয়েছে।',
        messageEn: 'Customer created successfully.',
      });
    } catch (err: any) {
      if (err.message === 'DUPLICATE_CUSTOMER_PHONE') {
        res.status(409).json({
          error: 'DUPLICATE_CUSTOMER_PHONE',
          existingCustomer: err.existingCustomer,
          messageBn: `এই ফোন নম্বরে (${parsed.data.phone}) ইতোমধ্যে একজন গ্রাহক "${err.existingCustomer.name}" নিবন্ধিত আছেন। ডুপ্লিকেট তৈরির পরিবর্তে বিদ্যমান গ্রাহককে নির্বাচন করুন।`,
          messageEn: `A customer "${err.existingCustomer.name}" already exists with phone number ${parsed.data.phone}. Suggesting existing customer instead of creating a duplicate.`,
        });
        return;
      }
      throw err;
    }
  }
);

// Update Customer (Owner, Manager, Staff)
router.patch(
  '/:roomId/customers/:customerId',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER', 'STAFF']),
  sanitizeBody(['id', 'room_id', 'created_at', 'updated_at', 'booking_count']),
  (req: Request, res: Response) => {
    const schema = z.object({
      name: z.string().min(2).max(150).optional(),
      phone: z.string().min(5).max(30).optional(),
      alt_phone: z.string().max(30).optional().nullable(),
      address: z.string().max(300).optional().nullable(),
      notes: z.string().max(1000).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'VALIDATION_FAILED', details: parsed.error.issues });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const customer = updateCustomer(req.room!.id, req.params.customerId, parsed.data, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });
      res.json({
        success: true,
        customer,
        messageBn: 'গ্রাহকের তথ্য আপডেট করা হয়েছে।',
        messageEn: 'Customer updated successfully.',
      });
    } catch (err: any) {
      if (err.message === 'DUPLICATE_CUSTOMER_PHONE') {
        res.status(409).json({
          error: 'DUPLICATE_CUSTOMER_PHONE',
          existingCustomer: err.existingCustomer,
          messageBn: `এই ফোন নম্বরে ইতোমধ্যে "${err.existingCustomer.name}" নিবন্ধিত আছেন।`,
          messageEn: `Phone number already belongs to existing customer "${err.existingCustomer.name}".`,
        });
        return;
      }
      res.status(404).json({
        error: 'CUSTOMER_NOT_FOUND',
        messageBn: 'গ্রাহককে খুঁজে পাওয়া যায়নি।',
        messageEn: 'Customer not found.',
      });
    }
  }
);

// Delete Customer (Owner and Manager only; blocked if customer has bookings)
router.delete(
  '/:roomId/customers/:customerId',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      deleteCustomer(req.room!.id, req.params.customerId, {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        ip: clientIp,
      });
      res.json({
        success: true,
        messageBn: 'গ্রাহক মুছে ফেলা হয়েছে।',
        messageEn: 'Customer deleted successfully.',
      });
    } catch (err: any) {
      if (err.message === 'CUSTOMER_HAS_BOOKINGS') {
        res.status(400).json({
          error: 'CUSTOMER_HAS_BOOKINGS',
          messageBn: 'এই গ্রাহকের নামে বুকিং রয়েছে। বুকিং থাকা কোনো গ্রাহককে মুছে ফেলা যাবে না।',
          messageEn: 'A customer with existing bookings cannot be deleted.',
        });
        return;
      }
      res.status(404).json({
        error: 'CUSTOMER_NOT_FOUND',
        messageBn: 'গ্রাহককে খুঁজে পাওয়া যায়নি।',
        messageEn: 'Customer not found.',
      });
    }
  }
);

// ======================== Part 2: Availability & Bookings Routes ========================

// Check live slot availability for a date across one or all active halls in the room
router.get(
  '/:roomId/availability',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const eventDate = (req.query.date as string) || getTodayDhakaYMD();
    const hallId = req.query.hallId as string | undefined;
    const excludeBookingId = req.query.excludeBookingId as string | undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
      res.status(400).json({
        error: 'INVALID_DATE',
        messageBn: 'তারিখের ফরম্যাট সঠিক নয় (YYYY-MM-DD প্রয়োজন)।',
        messageEn: 'Invalid date format (YYYY-MM-DD required).',
      });
      return;
    }

    if (hallId) {
      try {
        const availability = checkHallDateAvailability(req.room!.id, hallId, eventDate, excludeBookingId);
        res.json({ date: eventDate, availability });
      } catch {
        res.status(404).json({ error: 'HALL_NOT_FOUND' });
      }
      return;
    }

    const halls = getRoomHalls(req.room!.id, false);
    const byHall = halls.map((h) => checkHallDateAvailability(req.room!.id, h.id, eventDate, excludeBookingId));
    res.json({ date: eventDate, halls: byHall });
  }
);

// List Bookings with search, filters, sorting, and pagination
router.get(
  '/:roomId/bookings',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const result = listRoomBookings(req.room!.id, {
      search: (req.query.search as string) || '',
      status: ((req.query.status as string) || '') as BookingStatus | '',
      dateFrom: (req.query.dateFrom as string) || '',
      dateTo: (req.query.dateTo as string) || '',
      hallId: (req.query.hallId as string) || '',
      eventType: ((req.query.eventType as string) || '') as EventType | '',
      slot: ((req.query.slot as string) || '') as SlotType | '',
      customerId: (req.query.customerId as string) || '',
      sortBy: ((req.query.sortBy as string) || 'event_date_desc') as any,
      page: parseInt((req.query.page as string) || '1', 10),
      limit: parseInt((req.query.limit as string) || '20', 10),
    });

    const role = req.roomMember!.role;
    res.json({
      ...result,
      bookings: stripMoneyFromCustomerBookings(result.bookings, role),
      hideMoneyColumns: role === 'STAFF' || role === 'VIEWER',
    });
  }
);

// Get Single Booking Detail + Full Edit History
router.get(
  '/:roomId/bookings/:bookingId',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const booking = getBookingById(req.room!.id, req.params.bookingId);
    if (!booking) {
      res.status(404).json({
        error: 'BOOKING_NOT_FOUND',
        messageBn: 'বুকিংটি খুঁজে পাওয়া যায়নি।',
        messageEn: 'Booking not found.',
      });
      return;
    }

    const role = req.roomMember!.role;
    const history = getBookingHistory(req.room!.id, booking.id).map((h) => {
      if (role === 'OWNER' || role === 'MANAGER') return h;
      const cleanChanges = { ...h.changes };
      for (const moneyKey of [
        'base_price',
        'hall_rent',
        'extra_services_amount',
        'total_amount',
        'advance_amount',
        'due_amount',
        'amount',
        'new_net_paid',
        'new_due_amount',
        'reversal_amount',
      ]) {
        delete cleanChanges[moneyKey];
      }
      return { ...h, changes: cleanChanges };
    });

    res.json({
      booking: stripMoneyFromBooking(booking, role),
      history,
      hideMoneyColumns: role === 'STAFF' || role === 'VIEWER',
    });
  }
);

// Create Booking (Owner, Manager, Staff) - Idempotent & Atomic
router.post(
  '/:roomId/bookings',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER', 'STAFF']),
  // Strict mass-assignment protection: strip server-calculated totals, booking_number, created_by, room_id
  sanitizeBody([
    'id',
    'room_id',
    'booking_number',
    'base_price',
    'extra_services_amount',
    'total_amount',
    'due_amount',
    'created_by_user_id',
    'created_by_name',
    'created_at',
    'updated_at',
  ]),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkCreateRateLimit(req.user!.id, clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        messageBn: 'অতিরিক্ত বুকিং অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে কিছুক্ষণ অপেক্ষা করুন।',
        messageEn: 'Too many booking requests. Please wait a moment.',
      });
      return;
    }

    const extraServiceSchema = z.object({
      type: z.enum(['CATERING', 'DECORATION', 'SOUND', 'LIGHTING', 'OTHER']),
      label: z.string().min(1).max(120),
      amount: z.number().min(0),
    });

    const schema = z.object({
      customer_id: z.string().min(1),
      hall_id: z.string().min(1),
      event_type: z.enum(['WEDDING', 'HOLUD', 'RECEPTION', 'ENGAGEMENT', 'BIRTHDAY', 'AQIQAH', 'MEETING', 'OTHER']),
      event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      slot: z.enum(['DAY', 'NIGHT', 'FULL']),
      start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      guest_count: z.number().int().min(1),
      package_name: z.string().max(150).optional().nullable(),
      extra_services: z.array(extraServiceSchema).optional().default([]),
      hall_rent: z.number().min(0).optional(),
      manager_price_approved: z.boolean().optional().default(false),
      advance_amount: z.number().min(0).optional().default(0),
      confirm_past_date: z.boolean().optional().default(false),
      status: z.enum(['TENTATIVE', 'CONFIRMED']).optional().default('TENTATIVE'),
      hold_hours: z.number().min(0).max(720).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
      idempotency_key: z.string().max(100).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'বুকিংয়ের তথ্য সঠিক নয়। অনুগ্রহ করে তারিখ, স্লট, হল, গ্রাহক ও অতিথি সংখ্যা যাচাই করুন।',
        messageEn: 'Invalid booking input. Please check date, slot, hall, customer, and guest count.',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const todayYMD = getTodayDhakaYMD();
      const role = req.roomMember!.role;
      const { booking, deduplicated } = createBooking(
        req.room!.id,
        parsed.data,
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          role,
          ip: clientIp,
        },
        todayYMD
      );

      res.status(deduplicated ? 200 : 201).json({
        success: true,
        deduplicated,
        booking: stripMoneyFromBooking(booking, role),
        messageBn: `বুকিং (${booking.booking_number}) সফলভাবে সংরক্ষিত হয়েছে!`,
        messageEn: `Booking (${booking.booking_number}) saved successfully!`,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'BOOKING_CREATE_FAILED',
        conflictingSlot: err.conflictingSlot,
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

// Update / Edit Booking (Owner, Manager, Staff)
router.patch(
  '/:roomId/bookings/:bookingId',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER', 'STAFF']),
  sanitizeBody([
    'id',
    'room_id',
    'booking_number',
    'base_price',
    'extra_services_amount',
    'total_amount',
    'due_amount',
    'created_by_user_id',
    'created_by_name',
    'created_at',
    'updated_at',
  ]),
  (req: Request, res: Response) => {
    const extraServiceSchema = z.object({
      type: z.enum(['CATERING', 'DECORATION', 'SOUND', 'LIGHTING', 'OTHER']),
      label: z.string().min(1).max(120),
      amount: z.number().min(0),
    });

    const schema = z.object({
      customer_id: z.string().min(1).optional(),
      hall_id: z.string().min(1).optional(),
      event_type: z.enum(['WEDDING', 'HOLUD', 'RECEPTION', 'ENGAGEMENT', 'BIRTHDAY', 'AQIQAH', 'MEETING', 'OTHER']).optional(),
      event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      slot: z.enum(['DAY', 'NIGHT', 'FULL']).optional(),
      start_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      end_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
      guest_count: z.number().int().min(1).optional(),
      package_name: z.string().max(150).optional().nullable(),
      extra_services: z.array(extraServiceSchema).optional(),
      hall_rent: z.number().min(0).optional(),
      manager_price_approved: z.boolean().optional(),
      advance_amount: z.number().min(0).optional(),
      confirm_past_date: z.boolean().optional(),
      status: z.enum(['TENTATIVE', 'CONFIRMED', 'COMPLETED', 'NO_SHOW']).optional(),
      hold_hours: z.number().min(0).max(720).optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'প্রদত্ত তথ্য সঠিক নয়।',
        messageEn: 'Validation failed.',
        details: parsed.error.issues,
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const todayYMD = getTodayDhakaYMD();
      const role = req.roomMember!.role;
      const booking = updateBooking(
        req.room!.id,
        req.params.bookingId,
        parsed.data,
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          role,
          ip: clientIp,
        },
        todayYMD
      );

      res.json({
        success: true,
        booking: stripMoneyFromBooking(booking, role),
        messageBn: 'বুকিং সফলভাবে আপডেট করা হয়েছে।',
        messageEn: 'Booking updated successfully.',
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'BOOKING_UPDATE_FAILED',
        conflictingSlot: err.conflictingSlot,
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

// Cancel Booking (Requires reason; supports optional refund with reason; frees slot immediately; Staff cannot cancel CONFIRMED bookings)
router.post(
  '/:roomId/bookings/:bookingId/cancel',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER', 'STAFF']),
  (req: Request, res: Response) => {
    const schema = z.object({
      reason: z.string().min(2).max(500),
      refund_amount: z.number().min(0).optional(),
      refund_method: z.enum(['CASH', 'BKASH', 'NAGAD', 'BANK', 'OTHER']).optional(),
      refund_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      refund_note: z.string().max(500).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'REASON_REQUIRED',
        messageBn: 'বুকিং বাতিল করার কারণ উল্লেখ করা আবশ্যক।',
        messageEn: 'A cancellation reason is required.',
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const { booking, refundPayment } = cancelBooking(
        req.room!.id,
        req.params.bookingId,
        parsed.data.reason,
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          role: req.roomMember!.role,
          ip: clientIp,
        },
        {
          refund_amount: parsed.data.refund_amount,
          refund_method: parsed.data.refund_method,
          refund_date: parsed.data.refund_date || getTodayDhakaYMD(),
          refund_note: parsed.data.refund_note,
        }
      );

      res.json({
        success: true,
        booking,
        refundPayment,
        messageBn: 'বুকিং বাতিল করা হয়েছে এবং স্লটটি তাৎক্ষণিকভাবে উন্মুক্ত করা হয়েছে।',
        messageEn: 'Booking cancelled and slot freed immediately.',
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'BOOKING_CANCEL_FAILED',
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

// ======================== Part 3: Payments & Money Receipts Routes ========================

// List Payments for a Booking (Owner and Manager only — Staff and Viewer cannot see money totals or payment ledger via direct calls)
router.get(
  '/:roomId/bookings/:bookingId/payments',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const booking = getBookingById(req.room!.id, req.params.bookingId);
    if (!booking) {
      res.status(404).json({
        error: 'BOOKING_NOT_FOUND',
        messageBn: 'বুকিংটি খুঁজে পাওয়া যায়নি।',
        messageEn: 'Booking not found.',
      });
      return;
    }

    const payments = getBookingPayments(req.room!.id, booking.id);
    const netPaid = payments.reduce((s, p) => s + p.amount, 0);
    res.json({
      payments,
      summary: {
        total_amount: booking.total_amount,
        paid_amount: payments.length > 0 ? netPaid : booking.advance_amount,
        due_amount: booking.due_amount,
      },
    });
  }
);

// Record a Payment (Advance, Partial, Final, or Refund) — Idempotent, Rate-limited, Mass-assignment protected
router.post(
  '/:roomId/bookings/:bookingId/payments',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  sanitizeBody([
    'id',
    'room_id',
    'booking_id',
    'receipt_number',
    'received_by_user_id',
    'received_by_name',
    'is_reversed',
    'reversed_by_payment_id',
    'reverses_payment_id',
    'created_at',
    'due_amount',
    'paid_amount',
    'total_amount',
  ]),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkCreateRateLimit(req.user!.id, clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        messageBn: 'অতিরিক্ত পেমেন্ট অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।',
        messageEn: 'Too many payment requests. Please wait a moment.',
      });
      return;
    }

    const schema = z.object({
      payment_type: z.enum(['ADVANCE', 'PARTIAL', 'FINAL', 'REFUND']),
      amount: z.number(),
      payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      method: z.enum(['CASH', 'BKASH', 'NAGAD', 'BANK', 'OTHER']),
      reference_number: z.string().max(100).optional().nullable(),
      note: z.string().max(500).optional().nullable(),
      confirm_overpayment: z.boolean().optional().default(false),
      idempotency_key: z.string().max(100).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'পেমেন্টের তথ্য সঠিক নয়। পরিমাণ, তারিখ ও মাধ্যম যাচাই করুন।',
        messageEn: 'Invalid payment payload. Please check amount, date, and method.',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      const { payment, booking, deduplicated } = createPayment(
        req.room!.id,
        req.params.bookingId,
        {
          ...parsed.data,
          payment_date: parsed.data.payment_date || getTodayDhakaYMD(),
        },
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          role: req.roomMember!.role,
          ip: clientIp,
        }
      );

      res.status(deduplicated ? 200 : 201).json({
        success: true,
        deduplicated,
        payment,
        booking,
        messageBn: `মানি রিসিট (${payment.receipt_number}) সফলভাবে সংরক্ষিত হয়েছে!`,
        messageEn: `Payment recorded with Money Receipt (${payment.receipt_number})!`,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'PAYMENT_FAILED',
        dueAmount: err.dueAmount,
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

// Reverse a Payment (No silent edit or delete; creates an immutable REVERSAL entry keeping original visible)
router.post(
  '/:roomId/bookings/:bookingId/payments/:paymentId/reverse',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const schema = z.object({
      reason: z.string().min(2).max(500),
      payment_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'REASON_REQUIRED',
        messageBn: 'পেমেন্ট রিভার্স করার কারণ উল্লেখ করা আবশ্যক।',
        messageEn: 'A reason is required to reverse a payment.',
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const result = reversePayment(
        req.room!.id,
        req.params.bookingId,
        req.params.paymentId,
        parsed.data.reason,
        parsed.data.payment_date || getTodayDhakaYMD(),
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          role: req.roomMember!.role,
          ip: clientIp,
        }
      );

      res.json({
        success: true,
        ...result,
        messageBn: `পেমেন্টটি সফলভাবে রিভার্স করা হয়েছে (${result.reversalPayment.receipt_number})। মূল এন্ট্রিটি অডিটের জন্য দৃশ্যমান রাখা হয়েছে।`,
        messageEn: `Payment reversed via entry ${result.reversalPayment.receipt_number}. Original entry remains visible.`,
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'PAYMENT_REVERSE_FAILED',
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

// ======================== Part 3: Expenses Routes (Owner & Manager Only) ========================

router.get(
  '/:roomId/expenses',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const category = ((req.query.category as string) || '') as ExpenseCategory | '';
    const dateFrom = (req.query.dateFrom as string) || '';
    const dateTo = (req.query.dateTo as string) || '';
    const limit = parseInt((req.query.limit as string) || '100', 10);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    const result = listRoomExpenses(req.room!.id, {
      category,
      dateFrom,
      dateTo,
      limit,
      offset,
    });
    res.json(result);
  }
);

router.post(
  '/:roomId/expenses',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  sanitizeBody([
    'id',
    'room_id',
    'expense_number',
    'entry_type',
    'is_reversed',
    'reversed_by_expense_id',
    'reverses_expense_id',
    'recorded_by_user_id',
    'recorded_by_name',
    'created_at',
  ]),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkCreateRateLimit(req.user!.id, clientIp)) {
      res.status(429).json({
        error: 'RATE_LIMITED',
        messageBn: 'অতিরিক্ত অনুরোধ পাঠানো হয়েছে।',
        messageEn: 'Too many requests. Please wait a moment.',
      });
      return;
    }

    const schema = z.object({
      category: z.enum(['ELECTRICITY', 'SALARY', 'REPAIR', 'CLEANING', 'DECORATION_MATERIAL', 'FOOD', 'OTHER']),
      amount: z.number(),
      expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      note: z.string().max(1000).optional().nullable(),
      receipt_image_base64: z.string().optional().nullable(),
      idempotency_key: z.string().max(100).optional().nullable(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'VALIDATION_FAILED',
        messageBn: 'খরচের ক্যাটাগরি ও সঠিক পরিমাণ প্রদান করুন।',
        messageEn: 'Invalid expense data. Please check category and amount.',
        details: parsed.error.issues,
      });
      return;
    }

    try {
      let savedPhotoPath: string | null = null;
      if (parsed.data.receipt_image_base64) {
        savedPhotoPath = validateAndSaveReceiptImage(parsed.data.receipt_image_base64);
      }

      const { expense, deduplicated } = createExpense(
        req.room!.id,
        {
          category: parsed.data.category,
          amount: parsed.data.amount,
          expense_date: parsed.data.expense_date || getTodayDhakaYMD(),
          note: parsed.data.note,
          receipt_photo: savedPhotoPath,
          idempotency_key: parsed.data.idempotency_key,
        },
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          ip: clientIp,
        }
      );

      res.status(deduplicated ? 200 : 201).json({
        success: true,
        deduplicated,
        expense,
        messageBn: 'খরচ সফলভাবে রেকর্ড করা হয়েছে।',
        messageEn: 'Expense recorded successfully.',
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'EXPENSE_CREATE_FAILED',
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

router.post(
  '/:roomId/expenses/:expenseId/reverse',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const schema = z.object({
      reason: z.string().min(2).max(500),
      expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    });

    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'REASON_REQUIRED',
        messageBn: 'খরচ রিভার্স করার কারণ উল্লেখ করা আবশ্যক।',
        messageEn: 'A reason is required to reverse an expense.',
      });
      return;
    }

    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    try {
      const result = reverseExpense(
        req.room!.id,
        req.params.expenseId,
        parsed.data.reason,
        parsed.data.expense_date || getTodayDhakaYMD(),
        {
          userId: req.user!.id,
          email: req.user!.email,
          name: req.user!.name,
          ip: clientIp,
        }
      );

      res.json({
        success: true,
        ...result,
        messageBn: 'খরচটি রিভার্সাল এন্ট্রির মাধ্যমে বাতিল করা হয়েছে। মূল এন্ট্রিটি অক্ষুণ্ণ রয়েছে।',
        messageEn: 'Expense reversed via reversal entry. Original record remains visible.',
      });
    } catch (err: any) {
      res.status(err.status || 400).json({
        error: err.code || 'EXPENSE_REVERSE_FAILED',
        messageBn: err.messageBn || err.message,
        messageEn: err.messageEn || err.message,
      });
    }
  }
);

// ======================== Part 3: Reports & Exports (Owner & Manager Only) ========================

router.get(
  '/:roomId/reports',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const today = getTodayDhakaYMD();
    const defaultFrom = `${today.slice(0, 7)}-01`;
    const dateFrom = (req.query.dateFrom as string) || defaultFrom;
    const dateTo = (req.query.dateTo as string) || today;
    const slot = ((req.query.slot as string) || '') as SlotType | '';
    const hallId = (req.query.hallId as string) || undefined;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      res.status(400).json({
        error: 'INVALID_DATE_RANGE',
        messageBn: 'তারিখের সীমা সঠিক নয়।',
        messageEn: 'Invalid date range.',
      });
      return;
    }

    const report = generateRoomReport(req.room!.id, {
      dateFrom,
      dateTo,
      slot,
      hallId,
    });
    res.json({ report });
  }
);

// Export Report (CSV or PDF print metadata) — Rate-limited & logged in Audit Log
router.get(
  '/:roomId/reports/export',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
    if (!checkExportRateLimit(req.user!.id, clientIp)) {
      res.status(429).json({
        error: 'EXPORT_RATE_LIMITED',
        messageBn: 'অতিরিক্ত রিপোর্ট এক্সপোর্ট অনুরোধ পাঠানো হয়েছে। অনুগ্রহ করে একটু পর চেষ্টা করুন।',
        messageEn: 'Too many report export requests. Please wait a moment.',
      });
      return;
    }

    const today = getTodayDhakaYMD();
    const dateFrom = (req.query.dateFrom as string) || `${today.slice(0, 7)}-01`;
    const dateTo = (req.query.dateTo as string) || today;
    const slot = ((req.query.slot as string) || '') as SlotType | '';
    const hallId = (req.query.hallId as string) || undefined;
    const format = ((req.query.format as string) || 'csv').toLowerCase() === 'pdf' ? 'PDF' : 'CSV';
    const lang = ((req.query.lang as string) || 'bn') === 'en' ? 'en' : 'bn';

    const report = generateRoomReport(req.room!.id, {
      dateFrom,
      dateTo,
      slot,
      hallId,
    });

    // Audit log every export!
    addAuditLog({
      roomId: req.room!.id,
      userId: req.user!.id,
      userEmail: req.user!.email,
      userName: req.user!.name,
      action: 'REPORT_EXPORT',
      details: {
        format,
        language: lang,
        dateFrom,
        dateTo,
        slotFilter: slot || 'ALL',
        totalBookings: report.totalBookings,
      },
      ipAddress: clientIp,
    });

    if (format === 'PDF') {
      res.json({
        success: true,
        format: 'PDF',
        report,
        dualDateFrom: formatDualDateFromYMD(dateFrom),
        dualDateTo: formatDualDateFromYMD(dateTo),
      });
      return;
    }

    // Build Bilingual CSV with UTF-8 BOM so Excel renders Bangla characters & both calendar dates cleanly
    const fmtNum = (n: number) => (lang === 'bn' ? toBanglaDigits(String(n)) : String(n));
    const slotLabel = (s: SlotType) =>
      s === 'DAY'
        ? lang === 'bn'
          ? 'দিন (Day)'
          : 'Day (দিন)'
        : s === 'NIGHT'
        ? lang === 'bn'
          ? 'রাত (Night)'
          : 'Night (রাত)'
        : lang === 'bn'
        ? 'দিন ও রাত (Full)'
        : 'Full (দিন ও রাত)';

    const escCsv = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;

    const headers =
      lang === 'bn'
        ? [
            'বুকিং নম্বর',
            'অনুষ্ঠানের তারিখ (বাংলা ও ইংরেজি)',
            'স্লট (দিন/রাত/দিন ও রাত)',
            'সময়সূচি',
            'হল',
            'গ্রাহকের নাম',
            'অনুষ্ঠানের ধরন',
            'অবস্থা',
            'মোট বিল (৳)',
            'জমা (৳)',
            'বকেয়া (৳)',
          ]
        : [
            'Booking No.',
            'Event Date (Bangla & English)',
            'Slot (Day/Night/Full)',
            'Timing',
            'Hall',
            'Customer Name',
            'Event Type',
            'Status',
            'Total Amount (BDT)',
            'Collected (BDT)',
            'Due Amount (BDT)',
          ];

    const lines: string[] = [];
    lines.push(
      escCsv(
        `${req.room!.name} — ${
          lang === 'bn' ? 'আর্থিক ও স্লট প্রতিবেদন' : 'Financial & Slot Report'
        } (${formatDualDateFromYMD(dateFrom)} -> ${formatDualDateFromYMD(dateTo)})`
      )
    );
    lines.push(headers.map(escCsv).join(','));

    for (const b of report.bookingsInReport) {
      lines.push(
        [
          b.booking_number,
          formatDualDateFromYMD(b.event_date),
          slotLabel(b.slot),
          `${b.start_time} - ${b.end_time}`,
          b.hall_name || '',
          b.customer_name || '',
          b.event_type,
          b.status,
          fmtNum(b.status === 'CANCELLED' ? 0 : b.total_amount),
          fmtNum(b.advance_amount),
          fmtNum(b.status === 'CANCELLED' ? 0 : b.due_amount),
        ]
          .map(escCsv)
          .join(',')
      );
    }

    lines.push('');
    lines.push(
      [
        lang === 'bn' ? 'সারসংক্ষেপ (Summary)' : 'Summary',
        `${formatDualDateFromYMD(dateFrom)} - ${formatDualDateFromYMD(dateTo)}`,
        slot ? slotLabel(slot) : lang === 'bn' ? 'সকল স্লট (All)' : 'All Slots',
        '',
        `Day: ${fmtNum(report.slotBreakdown.DAY.count)} (${formatCurrency(report.slotBreakdown.DAY.revenue, lang)})`,
        `Night: ${fmtNum(report.slotBreakdown.NIGHT.count)} (${formatCurrency(report.slotBreakdown.NIGHT.revenue, lang)})`,
        `Full: ${fmtNum(report.slotBreakdown.FULL.count)} (${formatCurrency(report.slotBreakdown.FULL.revenue, lang)})`,
        `Profit: ${formatCurrency(report.profit, lang)}`,
        fmtNum(report.revenue),
        fmtNum(report.collected),
        fmtNum(report.due),
      ]
        .map(escCsv)
        .join(',')
    );

    const csvContent = '\uFEFF' + lines.join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="lilycc-report-${dateFrom}-to-${dateTo}-${lang}.csv"`
    );
    res.send(csvContent);
  }
);

// ======================== Part 3: Notifications Routes ========================

router.get(
  '/:roomId/notifications',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const todayYMD = getTodayDhakaYMD();
    const result = getUserNotifications(
      req.room!.id,
      req.user!.id,
      req.roomMember!.role,
      todayYMD
    );
    res.json(result);
  }
);

router.post(
  '/:roomId/notifications/:notificationId/read',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    markNotificationRead(req.room!.id, req.params.notificationId, req.user!.id);
    res.json({ success: true });
  }
);

router.post(
  '/:roomId/notifications/read-all',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    markAllNotificationsRead(req.room!.id, req.user!.id, req.roomMember!.role);
    res.json({ success: true });
  }
);

// ======================== Part 4: Executive Dashboard Route ========================

router.get(
  '/:roomId/dashboard',
  requireAuth,
  requireRoomMember,
  (req: Request, res: Response) => {
    const todayYMD = getTodayDhakaYMD();
    const dashboard = generateRoomDashboard(
      req.room!.id,
      req.roomMember!.role,
      todayYMD
    );
    res.json({ dashboard });
  }
);

// Seed Part 2/3/4 Demo Data (Owner and Manager)
router.post(
  '/:roomId/demo-data/seed',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const todayYMD = getTodayDhakaYMD();
    const counts = seedPart2DemoData(
      req.room!.id,
      {
        userId: req.user!.id,
        email: req.user!.email,
        name: req.user!.name,
        role: req.roomMember!.role,
        ip: clientIp,
      },
      todayYMD
    );

    res.json({
      success: true,
      ...counts,
      messageBn: 'চিহ্নিত ডেমো ডেটা (হল, গ্রাহক এবং দিন/রাত/দিন ও রাত বুকিং) সফলভাবে যুক্ত করা হয়েছে!',
      messageEn: 'Demo data (Halls, Customers, and Day/Night/Full Bookings) seeded successfully!',
    });
  }
);

// Clear Part 2 Demo Data (Owner and Manager)
router.delete(
  '/:roomId/demo-data',
  requireAuth,
  requireRoomMember,
  requireRole(['OWNER', 'MANAGER']),
  (req: Request, res: Response) => {
    const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress;
    const counts = clearPart2DemoData(req.room!.id, {
      userId: req.user!.id,
      email: req.user!.email,
      name: req.user!.name,
      ip: clientIp,
    });

    res.json({
      success: true,
      ...counts,
      messageBn: 'সকল ডেমো ডেটা সফলভাবে মুছে ফেলা হয়েছে।',
      messageEn: 'All demo data removed successfully.',
    });
  }
);

export default router;
