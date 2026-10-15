import 'server-only';

import { randomUUID } from 'node:crypto';

import pino from 'pino';

/**
 * One logger for the web process (I7). Every request carries a request id:
 * apps/web/proxy.ts stamps x-request-id on the way in (the caller's when it
 * sends a sane one, else a fresh UUID), the routes and actions read it here,
 * the log line and the audit row carry it. Secrets never reach a log line:
 * phone numbers are masked, callers pass state words, not values.
 */
export const log = pino({
  name: 'ekbill-web',
  level: process.env.LOG_LEVEL ?? 'info',
  redact: {
    paths: ['phone', 'phoneE164', '*.phone', '*.phoneE164', 'cookie', 'headers.cookie'],
    censor: (v) => mask(v),
  },
});

export function mask(value: unknown): string {
  const s = String(value ?? '');
  return s.length > 4 ? `${'*'.repeat(s.length - 4)}${s.slice(-4)}` : '****';
}

export function requestId(request?: Request): string {
  const given = request?.headers.get('x-request-id')?.trim();
  return given && given.length <= 128 && /^[\w.-]+$/.test(given) ? given : randomUUID();
}

export function logRequest(
  route: string,
  id: string,
  fields: Record<string, string | number | boolean | null> = {},
): void {
  log.info({ route, requestId: id, ...fields }, 'request');
}
