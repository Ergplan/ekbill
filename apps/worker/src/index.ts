import { writeFileSync } from 'node:fs';

import { PgBoss } from 'pg-boss';
import pino from 'pino';

import {
  DUES_TODAY,
  RENDER_OTHER_SIZES,
  runDuesToday,
  runRenderOtherSizes,
  type RenderOtherSizesJob,
} from './bills/jobs';
import { READ_IMPORT, runReadImport, type ReadImportJob } from './import/job';
import { READ_BILL, runReadBill, type ReadBillJob } from './read-bill/job';

/**
 * The worker: pg-boss on the same Postgres, one queue per job kind. Stage 0
 * started it with a heartbeat; Stage 5 adds read-import (old bills and
 * party lists into staging rows); Stage 6 render-other-sizes and the daily
 * dues-today listing (search is a generated column, no job); Stage 7
 * read-bill (a photographed bill into an extraction); later, backup-check.
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
  await boss.createQueue(READ_BILL, { retryLimit: 1, retryDelay: 10, expireInSeconds: 300 });
  await boss.work<ReadBillJob>(READ_BILL, async (jobs) => {
    for (const job of jobs) {
      const outcome = await runReadBill(job.data);
      log.info({ requestId: job.data.requestId, extractionId: job.data.extractionId, outcome }, 'bill read');
    }
  });
  await boss.createQueue(RENDER_OTHER_SIZES, { retryLimit: 2, retryDelay: 10, expireInSeconds: 600 });
  await boss.work<RenderOtherSizesJob>(RENDER_OTHER_SIZES, async (jobs) => {
    for (const job of jobs) {
      const made = await runRenderOtherSizes(job.data);
      log.info({ requestId: job.data.requestId, documentId: job.data.documentId, made }, 'other sizes printed');
    }
  });
  await boss.createQueue(DUES_TODAY);
  await boss.work(DUES_TODAY, async () => {
    for (const line of await runDuesToday()) log.info(line, 'dues today');
  });
  // 08:00 in India (02:30 UTC), before the shop opens.
  await boss.schedule(DUES_TODAY, '30 2 * * *');
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
