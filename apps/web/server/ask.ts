import 'server-only';

import { aiCalls, search, type SearchHit, type TenantScope } from '@ekbill/db';
import { AiUnavailableError, askAnswer, callText, embedTexts, type Recorder } from '@ekbill/ai';
import { citationsIn, recordsMessage, renumberCitations } from '@ekbill/engine';

import { log } from './log';

/**
 * "Poocho" (Stage 9): an answer from the owner's own records. The index is
 * brought up to date first (a payment a minute ago is in the answer), the
 * question is searched by words and by meaning, and the best records go to
 * the text model numbered, with the versioned prompt that answers only from
 * them and cites what it used. Without a model, or when it fails, the owner
 * gets the matching records themselves. The voice's ask_records tool is this
 * same function.
 */
export interface AskSource {
  title: string;
  href: string;
  kind: SearchHit['kind'];
}
export interface AskResult {
  question: string;
  /** Null when no model answered: the sources are the best matches instead. */
  answer: string | null;
  sources: AskSource[];
  mode: 'answer' | 'not-found' | 'search' | 'nothing';
}

const source = (h: SearchHit): AskSource => ({ title: h.title, href: h.href, kind: h.kind });

export async function askRecords(scope: TenantScope, question: string): Promise<AskResult> {
  const q = question.trim().slice(0, 500);
  const record: Recorder = (row) => aiCalls.recordAiCall(scope, row);
  await search.refreshIndex(scope, { limit: 300 }).catch((e: unknown) => {
    log.warn({ requestId: scope.requestId, err: (e as Error).message }, 'search index refresh failed');
  });
  const [vector] = (await embedTexts({ purpose: 'ask-embed', texts: [q], record })) ?? [];
  const hits = await search.search(scope, { question: q, vector: vector ?? null });
  if (!hits.length) return { question: q, answer: null, sources: [], mode: 'nothing' };
  try {
    const { value } = await callText({
      purpose: 'ask',
      prompt: { name: 'ask', version: 1 },
      text: recordsMessage(q, hits),
      key: 'ask',
      output: askAnswer,
      record,
      timeoutMs: 20_000,
      retries: 1,
    });
    if (!value.found) return { question: q, answer: value.answer, sources: [], mode: 'not-found' };
    const cited = citationsIn(value.answer, hits.length);
    return {
      question: q,
      answer: renumberCitations(value.answer, cited),
      sources: (cited.length ? cited.map((n) => hits[n - 1]!) : hits.slice(0, 3)).map(source),
      mode: 'answer',
    };
  } catch (e) {
    if (!(e instanceof AiUnavailableError))
      log.warn({ requestId: scope.requestId, err: (e as Error).message }, 'ask fell back to search results');
    return { question: q, answer: null, sources: hits.slice(0, 5).map(source), mode: 'search' };
  }
}
