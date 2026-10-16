import { aiCalls, businessesWithBills, search, type TenantScope } from '@ekbill/db';
import { embedModelName, embedTexts } from '@ekbill/ai';

/**
 * Poocho's index in the worker (Stage 9): after a bill is issued (for that
 * business) and nightly (every business with bills), the rows of the records
 * that changed are rewritten and the embeddings filled for the rows behind
 * their text, in batches, each batch one ai_calls row. With no embedding
 * model set up the text is still indexed and search runs on words.
 */
export const INDEX_SEARCH = 'index-search';

export interface IndexSearchJob {
  businessId?: string;
  userId?: string;
  requestId?: string;
}

const BATCH = 64;
const MAX_BATCHES = 20;

export async function indexBusiness(scope: TenantScope): Promise<{ written: number; embedded: number }> {
  const written = await search.refreshIndex(scope, { limit: 2000 });
  const model = embedModelName();
  let embedded = 0;
  if (!model) return { written, embedded };
  for (let i = 0; i < MAX_BATCHES; i += 1) {
    const pending = await search.pendingEmbeddings(scope, BATCH, model);
    if (!pending.length) break;
    const vectors = await embedTexts({
      purpose: 'index-embed',
      texts: pending.map((p) => p.text),
      record: (row) => aiCalls.recordAiCall(scope, row),
    });
    if (!vectors) break;
    embedded += await search.storeEmbeddings(
      scope,
      pending.map((p, n) => ({ id: p.id, version: p.version, vector: vectors[n]! })),
      model,
    );
  }
  return { written, embedded };
}

export async function runIndexSearch(
  job: IndexSearchJob,
): Promise<Array<{ businessId: string; written: number; embedded: number }>> {
  const targets =
    job.businessId && job.userId ? [{ businessId: job.businessId, ownerId: job.userId }] : await businessesWithBills();
  const out = [];
  for (const b of targets) {
    const scope: TenantScope = {
      businessId: b.businessId,
      userId: b.ownerId,
      // Indexing is derived from what every member may read; the job acts as the system.
      role: 'owner',
      requestId: job.requestId ?? `index-search-${new Date().toISOString().slice(0, 10)}`,
      actorKind: 'system',
    };
    out.push({ businessId: b.businessId, ...(await indexBusiness(scope)) });
  }
  return out;
}
