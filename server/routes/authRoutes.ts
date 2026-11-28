import { Router, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { getConfig } from '../config.js';
import {
  generateGoogleOAuthUrl,
  verifyGoogleAuthCode,
  handleUserLoginSession,
  performLogout,
  performLogoutAllDevices,
  validateSessionRequest,
  generateSecureToken,
} from '../auth.js';
import {
  getUserRooms,
  getUserMembershipNotices,
  dismissMembershipNotice,
  deleteUserAccount,
  getRoomById,
  getRoomMember,
  updateUserLanguage,
  updateUserProfile,
  addAuditLog,
  setSessionActiveRoom,
} from '../db.js';
import { requireAuth, requireAppCheck } from '../middleware.js';
import {
  redeemMemberInviteAndSetPin,
  loginMemberWithPin,
  bindSessionDeviceAndReauth,
  checkAuthLockout,
  GENERIC_AUTH_ERROR,
} from '../memberAuth.js';
import { createSession } from '../db.js';
import { SESSION_COOKIE_NAME, CSRF_COOKIE_NAME, getSessionCookieOptions, getCsrfCookieOptions } from '../auth.js';

const router = Router();

// Store temporary OAuth states in memory with short TTL
const oauthStates = new Map<string, number>();

function isLoopbackAddress(addr: string | undefined): boolean {
  if (!addr) return false;
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}

router.get('/google/url', (_req: Request, res: Response) => {
  const state = generateSecureToken(16);
  oauthStates.set(state, Date.now() + 10 * 60 * 1000); // 10 min TTL

  const now = Date.now();
  for (const [s, exp] of oauthStates.entries()) {
    if (exp < now) oauthStates.delete(s);
  }

  const url = generateGoogleOAuthUrl(state);
  res.json({ url });
});

router.get('/google/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const state = req.query.state as string;

  if (!code || !state || !oauthStates.has(state)) {
    res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>Security Validation Failed</h2>
          <p>Invalid or expired OAuth state parameter. Please return to the login page and try again.</p>
          <a href="/login" style="display: inline-block; padding: 10px 20px; background: #4a2545; color: white; text-decoration: none; border-radius: 10px;">Return to Login</a>
        </body>
      </html>
    `);
    return;
  }

  oauthStates.delete(state);

  try {
    const profile = await verifyGoogleAuthCode(code);
    const { user, session } = handleUserLoginSession(req, res, {
      google_id: profile.googleId,
      email: profile.email,
      name: profile.name,
      picture: profile.picture,
    });

    // Check existing rooms for user (signing in proves identity ONLY; grants zero access without active membership)
    const rooms = getUserRooms(user.id);
    if (rooms.length > 0 && !session.active_room_id) {
      const activeRoom = rooms.find((r) => r.member_status === 'ACTIVE');
      if (activeRoom) {
        setSessionActiveRoom(session.id, activeRoom.id);
        addAuditLog({
          roomId: activeRoom.id,
          userId: user.id,
          userEmail: user.email,
          userName: user.name,
          action: 'LOGIN',
          details: { method: 'GOOGLE_OAUTH' },
          ipAddress: (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress,
        });
      }
    }

    res.redirect('/');
  } catch {
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>Authentication Failed</h2>
          <p>Could not verify sign-in with Google. Please try again.</p>
          <a href="/login" style="display: inline-block; padding: 10px 20px; background: #4a2545; color: white; text-decoration: none; border-radius: 10px;">Return to Login</a>
        </body>
      </html>
    `);
  }
});

/**
 * Loopback Automated Test Login Helper:
 * - Strictly blocked in production (APP_ENV=production)
 * - Strictly blocked in normal runs when DEV_LOGIN_ENABLED=false
 * - Strictly blocked for any non-loopback socket or proxied/tunneled request (x-forwarded-for)
 * - Never accepts any role, room_id, or owner field (proves identity only, identical to OAuth!)
 */
router.post('/dev-login', (req: Request, res: Response) => {
  const config = getConfig();
  const isAutomatedTest = Boolean(
    process.env.NODE_TEST_CONTEXT || process.argv.includes('--test')
  );
  const remoteAddr = req.socket?.remoteAddress;
  const isProxied = Boolean(req.headers['x-forwarded-for']);

  if (
    config.isProduction ||
    (!config.DEV_LOGIN_ENABLED && !isAutomatedTest) ||
    isProxied ||
    !isLoopbackAddress(remoteAddr)
  ) {
    res.status(403).json({
      error: 'DEV_LOGIN_DISABLED',
      messageBn: 'অনুমোদিত লগইন পদ্ধতি শুধুমাত্র Google Sign-In।',
      messageEn: 'Only Google Sign-In is permitted.',
    });
    return;
  }

  // Reject any attempt to pass role or roomId in login payload
  if (req.body && ('role' in req.body || 'roomId' in req.body || 'room_id' in req.body || 'isOwner' in req.body)) {
    res.status(400).json({
      error: 'ROLE_SELECTION_FORBIDDEN',
      messageBn: 'ব্যবহারকারী নিজে কোনো পদবি (Role) নির্বাচন করতে পারবেন না।',
      messageEn: 'Roles can never be chosen during sign-in.',
    });
    return;
  }

  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(120),
    picture: z.string().optional(),
    googleId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid login payload' });
    return;
  }

  const googleId = parsed.data.googleId || `dev-google-${crypto.randomUUID()}`;
  const { user, session, token } = handleUserLoginSession(req, res, {
    google_id: googleId,
    email: parsed.data.email,
    name: parsed.data.name,
    picture: parsed.data.picture || null,
  });

  const rooms = getUserRooms(user.id);
  const activeRoom = rooms.find((r) => r.member_status === 'ACTIVE');
  if (activeRoom) {
    setSessionActiveRoom(session.id, activeRoom.id);
    addAuditLog({
      roomId: activeRoom.id,
      userId: user.id,
      userEmail: user.email,
      userName: user.name,
      action: 'LOGIN',
      details: { method: 'TEST_LOOPBACK' },
      ipAddress: remoteAddr,
    });
  }

  res.json({
    success: true,
    token,
    user,
    session,
  });
});

// Current User & Active Session Info (checked live against DB on every call)
router.get('/me', (req: Request, res: Response) => {
  const auth = validateSessionRequest(req, res);
  if (!auth) {
    res.status(401).json({ authenticated: false });
    return;
  }

  const { user, session } = auth;
  const userRooms = getUserRooms(user.id).map((r: any) => {
    if (r.role === 'OWNER' && r.member_status === 'ACTIVE') return r;
    const { join_code: _omit, ...safeRoom } = r;
    return safeRoom;
  });

  const membershipNotices = getUserMembershipNotices(user.id);

  let activeRoom: any = null;
  let activeMember = null;

  if (session.active_room_id) {
    const rawRoom = getRoomById(session.active_room_id);
    if (!rawRoom) {
      // Room was deleted — clear session room immediately
      setSessionActiveRoom(session.id, null);
    } else {
      activeMember = getRoomMember(rawRoom.id, user.id);
      if (!activeMember || activeMember.status !== 'ACTIVE') {
        activeRoom = null;
        activeMember = null;
        setSessionActiveRoom(session.id, null);
      } else if (activeMember.role === 'OWNER') {
        activeRoom = rawRoom;
      } else {
        const { join_code: _omit, ...safeActiveRoom } = rawRoom as any;
        activeRoom = safeActiveRoom;
      }
    }
  }

  res.json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      preferred_language: user.preferred_language,
    },
    activeRoom,
    activeMember,
    userRooms,
    membershipNotices,
  });
});

router.post('/notices/:roomId/dismiss', requireAuth, (req: Request, res: Response) => {
  dismissMembershipNotice(String(req.params.roomId), req.user!.id);
  res.json({ success: true });
});

// Update Language Preference
router.patch('/preferences/language', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    language: z.enum(['bn', 'en']),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid language' });
    return;
  }

  updateUserLanguage(req.user!.id, parsed.data.language);
  res.json({ success: true, language: parsed.data.language });
});

// Update Logged-in User Personal Profile (Name & Picture)
router.patch('/profile', requireAuth, (req: Request, res: Response) => {
  const schema = z.object({
    name: z.string().min(2).max(120).optional(),
    picture: z.string().max(500).nullable().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'VALIDATION_FAILED', details: parsed.error.issues });
    return;
  }
  const updated = updateUserProfile(req.user!.id, parsed.data);
  res.json({
    success: true,
    user: updated,
    messageBn: 'প্রোফাইল তথ্য সফলভাবে আপডেট করা হয়েছে।',
    messageEn: 'Profile updated successfully.',
  });
});

// Delete Personal Account (Section 1 #10 & Section 9 Privacy requirement)
router.delete('/account', requireAuth, (req: Request, res: Response) => {
  try {
    deleteUserAccount(req.user!.id);
    performLogout(req, res);
    res.json({
      success: true,
      messageBn: 'আপনার অ্যাকাউন্ট ও সকল সেশন স্থায়ীভাবে মুছে ফেলা হয়েছে।',
      messageEn: 'Your account and all active sessions have been permanently deleted.',
    });
  } catch (err: any) {
    res.status(err.status || 400).json({
      error: err.code || 'ACCOUNT_DELETE_FAILED',
      messageBn: err.messageBn || err.message,
      messageEn: err.messageEn || err.message,
    });
  }
});

// Server-verified Google ID Token Sign-In / Fresh Re-Auth (Owner)
router.post('/google/id-token', requireAppCheck, async (req: Request, res: Response) => {
  const schema = z.object({
    idToken: z.string().min(20),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(GENERIC_AUTH_ERROR);
    return;
  }

  try {
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(parsed.data.idToken)}`
    );
    if (!verifyRes.ok) {
      res.status(401).json(GENERIC_AUTH_ERROR);
      return;
    }
    const payload = (await verifyRes.json()) as any;
    const config = getConfig();
    if (
      !payload.sub ||
      !payload.email ||
      (payload.email_verified !== true && payload.email_verified !== 'true') ||
      (config.GOOGLE_CLIENT_ID && payload.aud && payload.aud !== config.GOOGLE_CLIENT_ID)
    ) {
      res.status(401).json(GENERIC_AUTH_ERROR);
      return;
    }

    const { user, session, token } = handleUserLoginSession(req, res, {
      google_id: payload.sub,
      email: payload.email,
      name: payload.name || payload.email.split('@')[0],
      picture: payload.picture || null,
    });
    bindSessionDeviceAndReauth(session.id, { reauthAt: Date.now() });

    const rooms = getUserRooms(user.id);
    const activeRoom = rooms.find((r) => r.member_status === 'ACTIVE');
    if (activeRoom) {
      setSessionActiveRoom(session.id, activeRoom.id);
    }

    res.json({ success: true, token, user, session });
  } catch {
    res.status(401).json(GENERIC_AUTH_ERROR);
  }
});

// Manager / Staff First-Time Login: Room ID + Single-Use Invite Code + Login Name + New PIN
router.post('/member/redeem-invite', requireAppCheck, async (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const lockState = checkAuthLockout([`ip:${clientIp}`]);
  if (lockState.delayMs > 0) {
    await new Promise((r) => setTimeout(r, lockState.delayMs));
  }

  const schema = z.object({
    roomJoinCode: z.string().min(4).max(32),
    inviteCode: z.string().min(8).max(32),
    selectedRole: z.enum(['MANAGER', 'STAFF']),
    loginName: z.string().min(2).max(60),
    pin: z.string().min(6).max(12),
    deviceFingerprint: z.string().max(128).optional().default('mobile-device'),
    deviceName: z.string().max(120).optional().default('Mobile Device'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json(GENERIC_AUTH_ERROR);
    return;
  }

  try {
    const { user, roomId, role, deviceId } = redeemMemberInviteAndSetPin({
      roomJoinCode: parsed.data.roomJoinCode,
      inviteCode: parsed.data.inviteCode,
      selectedRole: parsed.data.selectedRole,
      loginName: parsed.data.loginName,
      pin: parsed.data.pin,
      deviceFingerprint: parsed.data.deviceFingerprint,
      deviceName: parsed.data.deviceName,
      ip: clientIp,
    });

    const token = generateSecureToken();
    const session = createSession({
      userId: user.id,
      token,
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'] || null,
    });
    setSessionActiveRoom(session.id, roomId);
    bindSessionDeviceAndReauth(session.id, { deviceId });

    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, generateSecureToken(16), getCsrfCookieOptions());

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, preferred_language: user.preferred_language },
      roomId,
      role,
    });
  } catch (err: any) {
    if (!err.status) console.error('[MEMBER_REDEEM_INTERNAL_ERROR]:', err.message);
    res.status(err.status || 401).json({
      error: err.code || GENERIC_AUTH_ERROR.error,
      messageBn: err.messageBn || GENERIC_AUTH_ERROR.messageBn,
      messageEn: err.messageEn || GENERIC_AUTH_ERROR.messageEn,
    });
  }
});

// Manager / Staff Returning Login: Room ID + Login Name + PIN
router.post('/member/login', requireAppCheck, async (req: Request, res: Response) => {
  const clientIp = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown';
  const lockState = checkAuthLockout([`ip:${clientIp}`]);
  if (lockState.delayMs > 0) {
    await new Promise((r) => setTimeout(r, lockState.delayMs));
  }

  const schema = z.object({
    roomJoinCode: z.string().min(4).max(32),
    selectedRole: z.enum(['MANAGER', 'STAFF']),
    loginName: z.string().min(2).max(60),
    pin: z.string().min(6).max(12),
    deviceFingerprint: z.string().max(128).optional().default('mobile-device'),
    deviceName: z.string().max(120).optional().default('Mobile Device'),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(401).json(GENERIC_AUTH_ERROR);
    return;
  }

  try {
    const { user, roomId, role, deviceId } = loginMemberWithPin({
      roomJoinCode: parsed.data.roomJoinCode,
      selectedRole: parsed.data.selectedRole,
      loginName: parsed.data.loginName,
      pin: parsed.data.pin,
      deviceFingerprint: parsed.data.deviceFingerprint,
      deviceName: parsed.data.deviceName,
      ip: clientIp,
    });

    const token = generateSecureToken();
    const session = createSession({
      userId: user.id,
      token,
      ipAddress: clientIp,
      userAgent: req.headers['user-agent'] || null,
    });
    setSessionActiveRoom(session.id, roomId);
    bindSessionDeviceAndReauth(session.id, { deviceId });

    res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());
    res.cookie(CSRF_COOKIE_NAME, generateSecureToken(16), getCsrfCookieOptions());

    res.json({
      success: true,
      token,
      user: { id: user.id, name: user.name, email: user.email, preferred_language: user.preferred_language },
      roomId,
      role,
    });
  } catch (err: any) {
    res.status(err.status || 401).json(GENERIC_AUTH_ERROR);
  }
});

// Logout (current session)
router.post('/logout', (req: Request, res: Response) => {
  performLogout(req, res);
  res.json({ success: true });
});

// Logout from all devices
router.post('/logout-all', requireAuth, (req: Request, res: Response) => {
  performLogoutAllDevices(req.user!.id, res);
  res.json({ success: true, message: 'Signed out of all devices.' });
});

export default router;
