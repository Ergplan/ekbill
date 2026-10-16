import { describe, expect, it } from 'vitest';

import { closePool } from '../../packages/db/src/pool';
import { seeded } from './helpers';

/**
 * Stage 10: /api/metrics in Prometheus text, and the queue in /api/health. Totals and states
 * only: no business's name, no phone, no connection string.
 */
seeded();

describe('GET /api/metrics', () => {
  it('answers Prometheus gauges for the process, the pool, the installation and the backup', async () => {
    const { GET } = await import('../../apps/web/app/api/metrics/route');
    const res = await GET(new Request('http://127.0.0.1:3000/api/metrics'));
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    const text = await res.text();
    for (const name of [
      'ekbill_up 1',
      'ekbill_db_pool_total',
      'ekbill_businesses',
      'ekbill_documents_issued',
      'ekbill_ai_calls_last_hour',
      'ekbill_backup_age_seconds -1',
    ])
      expect(text).toContain(name);
    // Every sample line is a name, optional labels and a number.
    for (const l of text.split('\n').filter((x) => x && !x.startsWith('#')))
      expect(l).toMatch(/^ekbill_[a-z_]+(\{[a-z]+="[^"]*"\})? -?\d+(\.\d+)?$/);
    expect(text).not.toMatch(/postgres:\/\/|\+91\d|Sharma/);
  });

  it('reports a waiting job and its age, here and in /api/health', async () => {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      schema: 'pgboss',
      supervise: false,
      schedule: false,
    });
    await boss.start();
    try {
      await boss.createQueue('metrics-probe');
      await boss.send('metrics-probe', { x: 1 });
      const { GET } = await import('../../apps/web/app/api/metrics/route');
      const text = await (await GET(new Request('http://127.0.0.1:3000/api/metrics'))).text();
      expect(text).toMatch(/ekbill_queue_waiting\{queue="metrics-probe"\} 1/);
      const health = await (
        await import('../../apps/web/app/api/health/route')
      ).GET(new Request('http://127.0.0.1:3000/api/health'));
      const body = await health.json();
      expect(body.queue.waiting).toBeGreaterThanOrEqual(1);
      expect(body.queue.byKind.map((q: { name: string }) => q.name)).toContain('metrics-probe');
    } finally {
      await boss.stop({ graceful: false });
      await closePool();
    }
  });

  // Stage 11 review: anyone could read them through Caddy.
  it('answers only on the VM itself, or to the scraper holding METRICS_TOKEN', async () => {
    const { GET } = await import('../../apps/web/app/api/metrics/route');
    const viaCaddy = { 'x-forwarded-for': '203.0.113.9' };
    expect((await GET(new Request('http://127.0.0.1:3000/api/metrics', { headers: viaCaddy }))).status).toBe(404);
    process.env.METRICS_TOKEN = 'm-token';
    try {
      expect((await GET(new Request('http://127.0.0.1:3000/api/metrics'))).status).toBe(404);
      const ok = await GET(
        new Request('http://127.0.0.1:3000/api/metrics', { headers: { ...viaCaddy, authorization: 'Bearer m-token' } }),
      );
      expect(ok.status).toBe(200);
    } finally {
      delete process.env.METRICS_TOKEN;
    }
  });
});
