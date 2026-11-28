/**
 * Lily Community Center - Secure API Client
 * Includes CSRF protection, Client Version enforcement, Idempotency Keys, and Session Expiry notifications.
 */

export const CLIENT_APP_VERSION = '1.0.0';

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  messageBn?: string;
  messageEn?: string;
  status: number;
}

export function generateIdempotencyKey(prefix = 'req'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(new RegExp('(^|;\\s*)lily_csrf=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export interface ApiRequestOptions extends RequestInit {
  idempotencyKey?: string;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: ApiRequestOptions = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('X-Client-Version', CLIENT_APP_VERSION);

  if (options.idempotencyKey) {
    headers.set('X-Idempotency-Key', options.idempotencyKey);
  }

  // Add JSON Content-Type if body is present and not FormData
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // Include CSRF token for mutating requests
  const method = (options.method || 'GET').toUpperCase();
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
    const csrf = getCsrfTokenFromCookie();
    if (csrf) {
      headers.set('x-csrf-token', csrf);
    }
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
    credentials: 'include', // Mandates HttpOnly session cookies
  });

  let json: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    json = await response.json();
  }

  if (!response.ok) {
    if (response.status === 426 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('lily:update-required', {
          detail: json || {},
        })
      );
    } else if (
      response.status === 401 &&
      typeof window !== 'undefined' &&
      !endpoint.startsWith('/api/auth/me')
    ) {
      window.dispatchEvent(new CustomEvent('lily:session-expired'));
    }

    const error = new Error(json?.messageEn || json?.error || 'Request failed');
    (error as any).status = response.status;
    (error as any).data = json;
    (error as any).messageBn = json?.messageBn;
    (error as any).messageEn = json?.messageEn;
    throw error;
  }

  return json as T;
}
