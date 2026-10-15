import 'server-only';

import { PgBoss } from 'pg-boss';

import { log } from './log';

/**
 * The web server's side of the queue: it only sends (the worker works).
 * One pg-boss per process, started on first use with supervision and
 * scheduling off: maintenance is the worker's job.
 */
let boss: Promise<PgBoss> | null = null;

function client(): Promise<PgBoss> {
  if (!boss) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    const b = new PgBoss({ connectionString: url, schema: 'pgboss', supervise: false, schedule: false, migrate: true });
    b.on('error', (error: unknown) => log.error({ err: error }, 'queue error'));
    boss = b.start().then(() => b);
    boss.catch(() => {
      boss = null;
    });
  }
  return boss;
}

export async function enqueue(name: string, data: object): Promise<string | null> {
  const b = await client();
  await b.createQueue(name).catch(() => undefined);
  return b.send(name, data);
}
