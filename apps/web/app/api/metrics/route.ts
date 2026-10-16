import { readFileSync } from 'node:fs';

import { NextResponse } from 'next/server';

import { getPool, installationCounts, queueStatus } from '@ekbill/db';

import { logRequest, requestId } from '../../../server/log';
import { family } from '../../../server/metrics-text';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Stage 10: the installation in Prometheus text format. Totals and states only (no business's
 * rows, no names, no phones): the process, the database pool, the queue (waiting and the oldest
 * job's age per kind), what the installation holds, model calls and their cost, the last backup.
 */
const line = (name: string, help: string, value: number) => family(name, help, [{ value }]);

function backupAgeSeconds(): number {
  try {
    const state = JSON.parse(readFileSync(process.env.BACKUP_STATE_FILE ?? '/app/state/last-backup.json', 'utf8')) as {
      at: string;
    };
    return Math.round((Date.now() - Date.parse(state.at)) / 1000);
  } catch {
    return -1;
  }
}

/**
 * Who may read them (Stage 11 review: anyone could): a scraper with METRICS_TOKEN as its bearer token, or, with no
 * token set, only a request made on the VM itself to the app's own port. Caddy stamps X-Forwarded-For on every
 * request it passes in, so a request from outside never arrives without it.
 */
function allowed(request: Request): boolean {
  const token = process.env.METRICS_TOKEN;
  if (token) return request.headers.get('authorization') === `Bearer ${token}`;
  return !request.headers.get('x-forwarded-for');
}

export async function GET(request: Request) {
  const id = requestId(request);
  if (!allowed(request)) {
    logRequest('GET /api/metrics', id, { allowed: false });
    return new NextResponse(null, { status: 404, headers: { 'x-request-id': id } });
  }
  const pool = getPool();
  const [counts, queue] = await Promise.all([installationCounts().catch(() => ({})), queueStatus()]);
  const mem = process.memoryUsage();
  const out = [
    line('ekbill_up', 'The web process answers.', 1),
    line('ekbill_process_uptime_seconds', 'Seconds since the web process started.', Math.round(process.uptime())),
    line('ekbill_process_rss_bytes', 'Resident memory of the web process.', mem.rss),
    line('ekbill_db_pool_total', 'Database connections open.', pool.totalCount),
    line('ekbill_db_pool_idle', 'Database connections idle.', pool.idleCount),
    line('ekbill_db_pool_waiting', 'Requests waiting for a database connection.', pool.waitingCount),
    line('ekbill_backup_age_seconds', 'Age of the last backup (-1: none yet).', backupAgeSeconds()),
    ...Object.entries(counts).map(([k, v]) => line(`ekbill_${k}`, `Installation total: ${k.replace(/_/g, ' ')}.`, v)),
    family(
      'ekbill_queue_waiting',
      'Jobs waiting, per kind.',
      queue.map((q) => ({ value: q.waiting, labels: { queue: q.name } })),
    ),
    family(
      'ekbill_queue_oldest_seconds',
      'Age of the oldest waiting job, per kind.',
      queue.map((q) => ({ value: q.oldestSeconds, labels: { queue: q.name } })),
    ),
  ];
  logRequest('GET /api/metrics', id, { queues: queue.length });
  return new NextResponse(`${out.join('\n')}\n`, {
    headers: { 'content-type': 'text/plain; version=0.0.4', 'x-request-id': id, 'cache-control': 'no-store' },
  });
}
