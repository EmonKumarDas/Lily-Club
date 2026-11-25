/**
 * Lily Community Center - Secure API Client
 */

export interface ApiResponse<T = any> {
  data?: T;
  error?: string;
  messageBn?: string;
  messageEn?: string;
  status: number;
}

function getCsrfTokenFromCookie(): string | null {
  const match = document.cookie.match(new RegExp('(^|;\\s*)lily_csrf=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const headers = new Headers(options.headers || {});

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

  // Handle empty or JSON response
  let json: any = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    json = await response.json();
  }

  if (!response.ok) {
    const error = new Error(json?.messageEn || json?.error || 'Request failed');
    (error as any).status = response.status;
    (error as any).data = json;
    (error as any).messageBn = json?.messageBn;
    (error as any).messageEn = json?.messageEn;
    throw error;
  }

  return json as T;
}
