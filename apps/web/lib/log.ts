import 'server-only';

import { randomUUID } from 'node:crypto';

import pino from 'pino';

/**
 * One logger for the web process. Every request handled by a route or
 * action gets a request id (the caller's x-request-id when it sends one,
 * else a fresh UUID) that goes into the log line and, from Stage 2, into
 * the audit row (I7). Secrets never reach a log line: callers pass state
 * words, not values.
 */
export const log = pino({ name: 'ekbill-web', level: process.env.LOG_LEVEL ?? 'info' });

export function requestId(request?: Request): string {
  const given = request?.headers.get('x-request-id')?.trim();
  return given && given.length <= 128 ? given : randomUUID();
}

export function logRequest(
  route: string,
  id: string,
  fields: Record<string, string | number | boolean | null> = {},
): void {
  log.info({ route, requestId: id, ...fields }, 'request');
}
