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
import { LOAD_REMOVE, LOAD_SEED, runLoadRemove, runLoadSeed, type LoadSeedJob } from './load/job';
import { INDEX_SEARCH, runIndexSearch, type IndexSearchJob } from './search/job';

/**
 * The worker: pg-boss on the same Postgres, one queue per job kind. Stage 0
 * started it with a heartbeat; Stage 5 adds read-import (old bills and
 * party lists into staging rows); Stage 6 render-other-sizes and the daily
 * dues-today listing (search is a generated column, no job); Stage 7
 * read-bill (a photographed bill into an extraction); Stage 9 index-search
 * (Poocho's index and embeddings, after an issue and nightly); later, backup-check.
 */
/**
 * Stage 10: how many jobs of a kind run at once in this worker. A photo read waits mostly on the
 * model, a render on Chromium (memory); everything else runs one at a time. WORKER_<KIND>_CONCURRENCY overrides.
 */
function concurrency(kind: string, d: number): number {
  return Math.min(8, Math.max(1, Number(process.env[`WORKER_${kind}_CONCURRENCY`]) || d));
}

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
  // The worker's options are the queue's, whoever created it first (Stage 11 review: the web or the load CLI could
  // create a queue with pg-boss's defaults, and createQueue never changes an existing one).
  const ensureQueue = async (
    name: string,
    options?: { retryLimit?: number; retryDelay?: number; expireInSeconds?: number },
  ) => {
    await boss.createQueue(name, options);
    if (options) await boss.updateQueue(name, options);
  };
  await ensureQueue('heartbeat');
  await boss.work('heartbeat', async () => {
    log.info('heartbeat');
  });
  await boss.schedule('heartbeat', '*/15 * * * *');
  // Expiry above the longest a run can take (Stage 11 review: an expired job is retried while the first still runs):
  // 20 files at Docling's 180 s each.
  await ensureQueue(READ_IMPORT, { retryLimit: 2, retryDelay: 5, expireInSeconds: 3900 });
  await boss.work<ReadImportJob, unknown, { includeMetadata: true }>(
    READ_IMPORT,
    { includeMetadata: true },
    async (jobs) => {
      for (const job of jobs) {
        const { found } = await runReadImport(job.data, { final: job.retryCount >= job.retryLimit });
        log.info({ requestId: job.data.requestId, importId: job.data.importId, found }, 'import read');
      }
    },
  );
  // Docling (180 s) and three vision attempts (3 × 60 s), with room.
  await ensureQueue(READ_BILL, { retryLimit: 1, retryDelay: 10, expireInSeconds: 600 });
  await boss.work<ReadBillJob>(READ_BILL, { localConcurrency: concurrency('READ_BILL', 2) }, async (jobs) => {
    for (const job of jobs) {
      const outcome = await runReadBill(job.data);
      log.info({ requestId: job.data.requestId, extractionId: job.data.extractionId, outcome }, 'bill read');
    }
  });
  await ensureQueue(RENDER_OTHER_SIZES, { retryLimit: 2, retryDelay: 10, expireInSeconds: 600 });
  await boss.work<RenderOtherSizesJob>(
    RENDER_OTHER_SIZES,
    { localConcurrency: concurrency('RENDER', 2) },
    async (jobs) => {
      for (const job of jobs) {
        const made = await runRenderOtherSizes(job.data);
        log.info({ requestId: job.data.requestId, documentId: job.data.documentId, made }, 'other sizes printed');
      }
    },
  );
  await ensureQueue(DUES_TODAY);
  await boss.work(DUES_TODAY, async () => {
    for (const line of await runDuesToday()) log.info(line, 'dues today');
  });
  // 08:00 in India (02:30 UTC), before the shop opens.
  await boss.schedule(DUES_TODAY, '30 2 * * *');
  // Every business in turn, nightly.
  await ensureQueue(INDEX_SEARCH, { retryLimit: 1, retryDelay: 30, expireInSeconds: 3 * 3600 });
  await boss.work<IndexSearchJob>(INDEX_SEARCH, async (jobs) => {
    for (const job of jobs)
      for (const line of await runIndexSearch(job.data))
        log.info({ requestId: job.data.requestId, ...line }, 'search indexed');
  });
  // 02:30 in India (21:00 UTC), when nobody is billing.
  await boss.schedule(INDEX_SEARCH, '0 21 * * *');
  // Stage 10: the load seed and its removal, sent by hand (apps/worker/src/load/cli.ts); one at a time, never retried.
  await ensureQueue(LOAD_SEED, { retryLimit: 0, expireInSeconds: 6 * 3600 });
  await boss.work<LoadSeedJob>(LOAD_SEED, async (jobs) => {
    for (const job of jobs) log.info(await runLoadSeed(job.data, (s) => log.info(s)), 'load seed finished');
  });
  await ensureQueue(LOAD_REMOVE, { retryLimit: 0, expireInSeconds: 3600 });
  await boss.work(LOAD_REMOVE, async () => {
    log.info({ removed: await runLoadRemove((s) => log.info(s)) }, 'load removed');
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
