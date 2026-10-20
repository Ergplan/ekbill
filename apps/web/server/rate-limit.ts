/**
 * Rate limits (Stage 10, master prompt 4.3): 60 writes a minute per session, 30 sign-in attempts a
 * minute per address. A sliding window of one minute in this process (the VM runs one web
 * process; a restart forgets, which errs on the side of letting the owner work). Pure apart from
 * the map it keeps, so the tests drive it with their own clock.
 */
export interface Limit {
  /** Requests allowed per window; 0 turns the limit off. */
  max: number;
  windowMs: number;
}
export type Verdict = { ok: true } | { ok: false; retryAfterSeconds: number };

export class Limiter {
  private hits = new Map<string, number[]>();
  constructor(private readonly maxKeys = 50_000) {}

  hit(key: string, limit: Limit, now = Date.now()): Verdict {
    if (limit.max <= 0) return { ok: true };
    const since = now - limit.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= limit.max) {
      this.hits.set(key, recent);
      return { ok: false, retryAfterSeconds: Math.max(1, Math.ceil((recent[0]! + limit.windowMs - now) / 1000)) };
    }
    recent.push(now);
    this.hits.delete(key);
    this.hits.set(key, recent);
    // The oldest keys go first when the map grows past its bound (a flood of new keys cannot fill memory).
    while (this.hits.size > this.maxKeys) this.hits.delete(this.hits.keys().next().value!);
    return { ok: true };
  }
}

export const MINUTE = 60_000;
export function limitsFromEnv(env: Record<string, string | undefined> = process.env) {
  const n = (v: string | undefined, d: number) => (v === undefined || v === '' ? d : Math.max(0, Number(v) || 0));
  return {
    writes: { max: n(env.RATE_WRITES_PER_MIN, 60), windowMs: MINUTE },
    signIn: { max: n(env.RATE_SIGNIN_PER_MIN, 30), windowMs: MINUTE },
    // Stage 11 review: a bill's file and the CA pack start Chromium on a GET; a loop of them was unlimited.
    renders: { max: n(env.RATE_RENDERS_PER_MIN, 30), windowMs: MINUTE },
  };
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** The sign-in doors: the switcher during the build, the OTP routes from Stage 10. */
export const isSignIn = (path: string) => path.startsWith('/dev/switch') || path.startsWith('/api/auth/');
export const isWrite = (method: string) => WRITE_METHODS.has(method.toUpperCase());
/** The GETs that may start Chromium: a bill's file, and the CA pack (every PDF of the period). */
export const isRender = (method: string, path: string) =>
  method.toUpperCase() === 'GET' &&
  (/^\/api\/documents\/[^/]+\/file$/.test(path) || /^\/b\/[^/]+\/file$/.test(path) || path === '/api/gst/pack');

/** The address a request came from: the first hop Caddy records, else what the connection says. */
export function clientAddress(headers: Headers): string {
  const fwd = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return fwd || headers.get('x-real-ip')?.trim() || 'unknown';
}
