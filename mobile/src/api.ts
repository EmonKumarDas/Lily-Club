import AsyncStorage from '@react-native-async-storage/async-storage';
import { NativeModules } from 'react-native';

function detectExpoHostUrl(): string | null {
  try {
    const scriptURL: string | undefined = NativeModules?.SourceCode?.scriptURL;
    if (typeof scriptURL === 'string') {
      const match = scriptURL.match(/^https?:\/\/([^/:]+)(?::\d+)?/i);
      const host = match?.[1];
      if (host && host !== 'localhost' && host !== '127.0.0.1') {
        if (host.includes('exp.direct') || host.includes('ngrok') || host.includes('loca.lt')) {
          return null;
        }
        return `http://${host}:3000`;
      }
    }
  } catch {}
  return null;
}

const ENV_SERVER_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim();
export const DEFAULT_SERVER_URL = ENV_SERVER_URL || detectExpoHostUrl() || 'http://localhost:3000';
const KEY_SERVER_URL = 'lily_mobile_server_url';
const KEY_AUTH_TOKEN = 'lily_mobile_auth_token';
export const CLIENT_APP_VERSION = '1.0.0';

export class ApiError extends Error {
  status: number;
  isOffline: boolean;
  code?: string;
  data?: any;
  constructor(
    message: string,
    opts: { status?: number; isOffline?: boolean; code?: string; data?: any } = {}
  ) {
    super(message);
    this.status = opts.status || 0;
    this.isOffline = Boolean(opts.isOffline);
    this.code = opts.code;
    this.data = opts.data;
  }
}

export async function getServerUrl(): Promise<string> {
  const saved = await AsyncStorage.getItem(KEY_SERVER_URL);
  if (saved) {
    return saved.replace(/\/+$/, '');
  }
  return DEFAULT_SERVER_URL.replace(/\/+$/, '');
}

export async function setServerUrl(url: string): Promise<void> {
  await AsyncStorage.setItem(KEY_SERVER_URL, url.trim().replace(/\/+$/, ''));
}

export async function getAuthToken(): Promise<string | null> {
  return AsyncStorage.getItem(KEY_AUTH_TOKEN);
}

export async function setAuthToken(token: string | null): Promise<void> {
  if (token) {
    await AsyncStorage.setItem(KEY_AUTH_TOKEN, token);
  } else {
    await AsyncStorage.removeItem(KEY_AUTH_TOKEN);
  }
}

export async function clearAllMobileCachedData(): Promise<void> {
  const keys = await AsyncStorage.getAllKeys();
  const removable = keys.filter((k) => k !== 'lily_mobile_theme' && k !== KEY_SERVER_URL);
  if (removable.length > 0) {
    await AsyncStorage.multiRemove(removable);
  }
}

export function generateIdempotencyKey(prefix = 'mob'): string {
  const rand = Math.random().toString(36).slice(2, 12);
  return `${prefix}-${Date.now()}-${rand}`;
}

export async function apiFetch<T = any>(
  endpoint: string,
  options: RequestInit & { idempotencyKey?: string } = {},
  timeoutMs = 15000
): Promise<T> {
  const baseUrl = await getServerUrl();
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'X-Client-Version': CLIENT_APP_VERSION,
    ...((options.headers as Record<string, string>) || {}),
  };

  if (options.idempotencyKey) {
    headers['X-Idempotency-Key'] = options.idempotencyKey;
  }

  if (options.body && !(options.body instanceof FormData) && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}${endpoint}`, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timer);

    const text = await res.text();
    let data: any = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { messageEn: text };
    }

    if (!res.ok) {
      throw new ApiError(data.messageBn || data.messageEn || data.error || `HTTP ${res.status}`, {
        status: res.status,
        code: data.error,
        isOffline: false,
        data,
      });
    }
    return data as T;
  } catch (err: any) {
    clearTimeout(timer);
    if (err instanceof ApiError) throw err;

    throw new ApiError(
      err?.name === 'AbortError'
        ? 'সার্ভার থেকে উত্তর পাওয়া যাচ্ছে না (Timeout)'
        : 'ইন্টারনেট বা সার্ভারের সাথে সংযোগ নেই',
      { isOffline: true, status: 0 }
    );
  }
}
