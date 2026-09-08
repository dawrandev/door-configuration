/**
 * The one place the SPA talks to the backend.
 *
 * Same-origin by construction: Laravel serves this app and `/storage` from its
 * own public directory, and in dev Vite proxies both (see `vite.config.ts`).
 * That is not a convenience — `render/recolor.ts` reads every door back out of
 * a canvas with `getImageData`, and a canvas that has had a cross-origin image
 * drawn into it is tainted, so every read would throw. Session cookies work
 * for the same reason, which is why there is no token to store anywhere.
 */

/** Laravel's own name for the readable half of the CSRF pair. It is set on
 *  any response from the `web` group, so the showroom's first catalogue fetch
 *  is enough to arm every later write. */
const CSRF_COOKIE = 'XSRF-TOKEN';

function csrfToken(): string | null {
  const hit = document.cookie.split('; ').find((c) => c.startsWith(CSRF_COOKIE + '='));
  return hit ? decodeURIComponent(hit.slice(CSRF_COOKIE.length + 1)) : null;
}

/**
 * A failed request, with the status kept so callers can tell apart the three
 * that mean genuinely different things: 401 "sign in", 419 "your session
 * expired, sign in again", 422 "what you sent is wrong, here is where".
 */
export class ApiError extends Error {
  readonly status: number;
  /** Laravel's validation bag, field path -> messages. */
  readonly errors?: Record<string, string[]>;

  constructor(status: number, message: string, errors?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
  }

  /** Not signed in, or signed out from under us. Both send the bench back to
   *  its login screen; nothing else does. */
  get needsLogin(): boolean {
    return this.status === 401 || this.status === 419;
  }
}

async function toError(res: Response): Promise<ApiError> {
  let message = res.statusText || `HTTP ${res.status}`;
  let errors: Record<string, string[]> | undefined;
  try {
    const body = await res.json();
    if (typeof body?.message === 'string' && body.message) message = body.message;
    if (body?.errors && typeof body.errors === 'object') errors = body.errors;
  } catch {
    // A non-JSON body (a proxy's HTML error page, an empty 419) leaves the
    // status line as the message rather than throwing a second time here.
  }
  return new ApiError(res.status, message, errors);
}

export interface ApiInit {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  /** Sent as JSON. Mutually exclusive with `form`. */
  body?: unknown;
  /** Sent as multipart — the only way images reach the backend. */
  form?: FormData;
  signal?: AbortSignal;
  /** Extra request headers, e.g. a conditional `If-None-Match`. */
  headers?: Record<string, string>;
}

/**
 * `null` is returned for 204 and for a 304, so a caller polling with an ETag
 * can tell "nothing changed" from a real payload without inspecting statuses.
 */
export async function api<T>(path: string, init: ApiInit = {}): Promise<T | null> {
  const method = init.method ?? 'GET';
  const headers: Record<string, string> = { Accept: 'application/json', ...init.headers };

  // Without this Laravel answers an unauthenticated request with a redirect
  // to a login route that does not exist here, and the SPA would see a 404
  // where it should see a 401.
  headers['X-Requested-With'] = 'XMLHttpRequest';

  let body: BodyInit | undefined;
  if (init.form) {
    body = init.form; // no Content-Type: the browser must add its own boundary
  } else if (init.body !== undefined) {
    body = JSON.stringify(init.body);
    headers['Content-Type'] = 'application/json';
  }

  if (method !== 'GET') {
    const token = csrfToken();
    if (token) headers['X-XSRF-TOKEN'] = token;
  }

  const res = await fetch('/api/' + path.replace(/^\/+/, ''), {
    method,
    headers,
    body,
    credentials: 'same-origin',
    signal: init.signal,
  });

  if (res.status === 204 || res.status === 304) return null;
  if (!res.ok) throw await toError(res);
  return (await res.json()) as T;
}
