import crypto from 'node:crypto';
import type { Request, Response } from 'express';
import { getConfig } from './config.js';
import {
  createSession,
  getSessionByToken,
  touchSession,
  deleteSession,
  deleteAllUserSessions,
  upsertGoogleUser,
  type UserRow,
  type SessionRow,
} from './db.js';

export const SESSION_COOKIE_NAME = 'lily_session';
export const CSRF_COOKIE_NAME = 'lily_csrf';

export interface AuthContext {
  session: SessionRow;
  user: UserRow;
}

export function generateSecureToken(length = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

export function getSessionCookieOptions() {
  const config = getConfig();
  return {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: config.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000,
  };
}

export function getCsrfCookieOptions() {
  const config = getConfig();
  return {
    httpOnly: false, // Accessible to JavaScript to send in x-csrf-token header
    secure: config.isProduction,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: config.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000,
  };
}

export function generateGoogleOAuthUrl(state: string): string {
  const config = getConfig();
  const redirectUri = `${config.PUBLIC_APP_URL}/api/auth/google/callback`;

  const params = new URLSearchParams({
    client_id: config.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
  });

  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function verifyGoogleAuthCode(code: string): Promise<{
  googleId: string;
  email: string;
  name: string;
  picture: string | null;
}> {
  const config = getConfig();
  const redirectUri = `${config.PUBLIC_APP_URL}/api/auth/google/callback`;

  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: config.GOOGLE_CLIENT_ID,
      client_secret: config.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Google token exchange failed: ${tokenResponse.status} - ${errorBody}`);
  }

  const tokenData = (await tokenResponse.json()) as { id_token?: string; access_token?: string };
  if (!tokenData.access_token) {
    throw new Error('Google did not return an access token');
  }

  // Fetch verified userinfo using access_token directly from Google OpenID userinfo endpoint
  const userInfoRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userInfoRes.ok) {
    throw new Error('Failed to retrieve user info from Google');
  }

  const profile = (await userInfoRes.json()) as {
    sub?: string;
    email?: string;
    email_verified?: boolean;
    name?: string;
    picture?: string;
  };

  if (!profile.sub || !profile.email) {
    throw new Error('Google profile missing mandatory subject identifier or email');
  }

  if (profile.email_verified === false) {
    throw new Error('Google email is not verified');
  }

  return {
    googleId: profile.sub,
    email: profile.email,
    name: profile.name || profile.email.split('@')[0],
    picture: profile.picture || null,
  };
}

export function handleUserLoginSession(
  req: Request,
  res: Response,
  userData: { google_id: string; email: string; name: string; picture?: string | null }
): { user: UserRow; session: SessionRow; token: string } {
  // Upsert user (first login creates profile; repeated login updates and never duplicates!)
  const user = upsertGoogleUser(userData);

  // Generate cryptographic session token
  const token = generateSecureToken();
  const ipAddress = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || null;
  const userAgent = req.headers['user-agent'] || null;

  const session = createSession({
    userId: user.id,
    token,
    ipAddress,
    userAgent,
  });

  // Set secure cookie
  res.cookie(SESSION_COOKIE_NAME, token, getSessionCookieOptions());

  // Set CSRF cookie
  const csrfToken = generateSecureToken(16);
  res.cookie(CSRF_COOKIE_NAME, csrfToken, getCsrfCookieOptions());

  return { user, session, token };
}

export function validateSessionRequest(req: Request, res?: Response): AuthContext | null {
  const authHeader = req.headers?.authorization;
  const bearerToken =
    typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
      ? authHeader.slice(7).trim()
      : null;
  const token = bearerToken || req.cookies?.[SESSION_COOKIE_NAME];
  if (!token || typeof token !== 'string') return null;

  const sessionData = getSessionByToken(token);
  if (!sessionData) {
    if (res) res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  const config = getConfig();
  const now = Date.now();

  // Check Absolute Timeout
  const absoluteLifespanMs = config.SESSION_ABSOLUTE_TIMEOUT_HOURS * 60 * 60 * 1000;
  if (now - sessionData.created_at > absoluteLifespanMs) {
    deleteSession(sessionData.id);
    if (res) res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  // Check Idle Timeout
  const idleLifespanMs = config.SESSION_IDLE_TIMEOUT_MINUTES * 60 * 1000;
  if (now - sessionData.last_activity_at > idleLifespanMs) {
    deleteSession(sessionData.id);
    if (res) res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return null;
  }

  // Session is valid -> touch session last_activity_at
  touchSession(sessionData.id);
  sessionData.last_activity_at = now;

  return {
    session: {
      id: sessionData.id,
      user_id: sessionData.user_id,
      session_token_hash: sessionData.session_token_hash,
      active_room_id: sessionData.active_room_id,
      ip_address: sessionData.ip_address,
      user_agent: sessionData.user_agent,
      created_at: sessionData.created_at,
      last_activity_at: sessionData.last_activity_at,
    },
    user: sessionData.user,
  };
}

export function performLogout(req: Request, res: Response): void {
  const token = req.cookies?.[SESSION_COOKIE_NAME];
  if (token && typeof token === 'string') {
    const sessionData = getSessionByToken(token);
    if (sessionData) {
      deleteSession(sessionData.id);
    }
  }
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}

export function performLogoutAllDevices(userId: string, res: Response): void {
  deleteAllUserSessions(userId);
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
  res.clearCookie(CSRF_COOKIE_NAME, { path: '/' });
}
