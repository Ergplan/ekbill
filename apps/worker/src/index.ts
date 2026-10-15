import { writeFileSync } from 'node:fs';

import { PgBoss } from 'pg-boss';
import pino from 'pino';

import { READ_IMPORT, runReadImport, type ReadImportJob } from './import/job';

/**
 * The worker: pg-boss on the same Postgres, one queue per job kind. Stage 0
 * started it with a heartbeat; Stage 5 adds read-import (old bills and
 * party lists into staging rows); later stages add read-bill,
 * render-other-sizes, index-search, reminders-due, backup-check.
 */
const ALIVE_FILE = process.env.WORKER_ALIVE_FILE ?? '/tmp/ekbill-worker-alive';
const log = pino({ name: 'ekbill-worker', level: process.env.LOG_LEVEL ?? 'info' });

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  const boss = new PgBoss({ connectionString: url, schema: 'pgboss' });
  boss.on('error', (error: unknown) => log.error({ err: error }, 'queue error'));
  await boss.start();
  // The container's health check (docker-compose.yml) reads this file's age: written every 30 s while the queue runs.
  const alive = () => {
    try {
      writeFileSync(ALIVE_FILE, String(Date.now()));
    } catch (error) {
      log.warn({ err: error }, 'could not write the alive file');
    }
  };
  alive();
  const ticker = setInterval(alive, 30_000);
  await boss.createQueue('heartbeat');
  await boss.work('heartbeat', async () => {
    log.info('heartbeat');
  });
  await boss.schedule('heartbeat', '*/15 * * * *');
  await boss.createQueue(READ_IMPORT, { retryLimit: 2, retryDelay: 5, expireInSeconds: 600 });
  await boss.work<ReadImportJob>(READ_IMPORT, async (jobs) => {
    for (const job of jobs) {
      const { found } = await runReadImport(job.data);
      log.info({ requestId: job.data.requestId, importId: job.data.importId, found }, 'import read');
    }
  });
  log.info('worker started');
  const stop = async () => {
    log.info('worker stopping');
    clearInterval(ticker);
    await boss.stop({ graceful: true, timeout: 10_000 });
    process.exit(0);
  };
  process.on('SIGTERM', () => void stop());
  process.on('SIGINT', () => void stop());
}

main().catch((error) => {
  log.error({ err: error }, 'worker failed to start');
  process.exit(1);
});
