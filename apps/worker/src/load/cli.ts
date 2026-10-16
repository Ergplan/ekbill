/**
 * The load seed by hand (Stage 10), inside the worker's container or the build:
 *
 *   npx tsx --conditions=react-server apps/worker/src/load/cli.ts plan 0.1
 *   npx tsx --conditions=react-server apps/worker/src/load/cli.ts seed 0.1
 *   npx tsx --conditions=react-server apps/worker/src/load/cli.ts remove
 *   npx tsx --conditions=react-server apps/worker/src/load/cli.ts send seed 0.1   # as the worker's job
 *   npx tsx --conditions=react-server apps/worker/src/load/cli.ts send remove
 *
 * The same functions the worker's load-seed and load-remove jobs run; "send" queues the job instead.
 */
import { closePool } from '@ekbill/db';

import { LOAD_REMOVE, LOAD_SEED, planLoad, runLoadRemove, runLoadSeed } from './job';

const [what, arg] = process.argv.slice(2);
const log = (s: string) => console.log(s);
try {
  if (what === 'plan') {
    const p = planLoad(Number(arg ?? 0.1));
    log(JSON.stringify({ ...p, gb: +(p.bytes / 1024 ** 3).toFixed(2), freeGb: +(p.freeBytes / 1024 ** 3).toFixed(1) }));
  } else if (what === 'seed') {
    const started = Date.now();
    const r = await runLoadSeed({ scale: Number(arg ?? 0.1) }, log);
    log(`seeded: ${JSON.stringify(r)} in ${Math.round((Date.now() - started) / 1000)} s`);
  } else if (what === 'send') {
    const { PgBoss } = await import('pg-boss');
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      schema: 'pgboss',
      supervise: false,
      schedule: false,
    });
    await boss.start();
    const kind = arg === 'remove' ? LOAD_REMOVE : LOAD_SEED;
    await boss.createQueue(kind).catch(() => undefined);
    log(
      `queued ${kind}: ${await boss.send(kind, kind === LOAD_SEED ? { scale: Number(process.argv[4] ?? 0.1) } : {})}`,
    );
    await boss.stop({ graceful: true });
  } else if (what === 'remove') {
    await runLoadRemove(log);
  } else {
    log('usage: cli.ts plan <scale> | seed <scale> | remove');
    process.exitCode = 2;
  }
} finally {
  await closePool();
}
