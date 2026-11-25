import { Router, type Request, type Response } from 'express';
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
  getRoomById,
  getRoomMember,
  updateUserLanguage,
  updateUserProfile,
  addAuditLog,
  setSessionActiveRoom,
} from '../db.js';
import { requireAuth } from '../middleware.js';

const router = Router();

// Store temporary OAuth states in memory with short TTL
const oauthStates = new Map<string, number>();

router.get('/google/url', (_req: Request, res: Response) => {
  const state = generateSecureToken(16);
  oauthStates.set(state, Date.now() + 10 * 60 * 1000); // 10 min TTL

  // Cleanup old states
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
          <a href="/login" style="display: inline-block; padding: 10px 20px; background: #582c4d; color: white; text-decoration: none; border-radius: 6px;">Return to Login</a>
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

    // Check existing rooms for user
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

    res.redirect('/rooms');
  } catch (err: any) {
    console.error('Google OAuth callback processing error:', err.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Authentication Error</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h2>Authentication Failed</h2>
          <p>Could not verify sign-in with Google. Please try again.</p>
          <a href="/login" style="display: inline-block; padding: 10px 20px; background: #582c4d; color: white; text-decoration: none; border-radius: 6px;">Return to Login</a>
        </body>
      </html>
    `);
  }
});

// Dev Login (strictly development only)
router.post('/dev-login', (req: Request, res: Response) => {
  const config = getConfig();
  if (!config.isDevelopment || !config.DEV_LOGIN_ENABLED) {
    res.status(403).json({ error: 'Dev login is disabled.' });
    return;
  }

  const schema = z.object({
    email: z.string().email(),
    name: z.string().min(1),
    picture: z.string().optional(),
    googleId: z.string().optional(),
  });

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Invalid dev login payload', details: parsed.error });
    return;
  }

  const googleId = parsed.data.googleId || `dev-google-${crypto.randomUUID()}`;
  const { user, session, token } = handleUserLoginSession(req, res, {
    google_id: googleId,
    email: parsed.data.email,
    name: parsed.data.name,
    picture: parsed.data.picture || null,
  });

  // If user belongs to a room, attach active room
  const rooms = getUserRooms(user.id);
  const activeRoom = rooms.find((r) => r.member_status === 'ACTIVE');
  if (activeRoom) {
    setSessionActiveRoom(session.id, activeRoom.id);
  }

  res.json({
    success: true,
    token,
    user,
    session,
  });
});

// Current User & Active Session Info
router.get('/me', (req: Request, res: Response) => {
  const auth = validateSessionRequest(req, res);
  if (!auth) {
    res.status(401).json({ authenticated: false });
    return;
  }

  const { user, session } = auth;
  const userRooms = getUserRooms(user.id);

  let activeRoom = null;
  let activeMember = null;

  if (session.active_room_id) {
    activeRoom = getRoomById(session.active_room_id);
    if (activeRoom) {
      activeMember = getRoomMember(activeRoom.id, user.id);
      // If member is no longer active in active room, clear active room
      if (!activeMember || activeMember.status !== 'ACTIVE') {
        activeRoom = null;
        activeMember = null;
        setSessionActiveRoom(session.id, null);
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
  });
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
