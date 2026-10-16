import { planLoad, removeLoad, seedLoad } from '@ekbill/db/load';
import { todayIst } from '@ekbill/engine';

/**
 * Stage 10's load jobs. load-seed: the load-test businesses at a scale (0.1 whenever; 1 only when
 * the operator says "go"), idempotent, refusing to leave less than 8 GB free. load-remove: every
 * business tagged load_test, and nothing else.
 */
export const LOAD_SEED = 'load-seed';
export const LOAD_REMOVE = 'load-remove';

export interface LoadSeedJob {
  scale: number;
}

export async function runLoadSeed(job: LoadSeedJob, log: (s: string) => void) {
  const scale = Math.min(1, Math.max(0.002, Number(job.scale) || 0.1));
  return seedLoad({ scale, today: todayIst(new Date()), log });
}

export async function runLoadRemove(log: (s: string) => void) {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return removeLoad(url, log);
}

export { planLoad };
