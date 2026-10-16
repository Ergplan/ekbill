import 'server-only';

import { customers, documents, items } from '@ekbill/db';
import { t } from '@ekbill/copy';

import { FIXTURE, type Fixture } from '../fixtures';
import { scopeOf } from '../live';
import type { Viewer } from '../viewer';

export interface AskData {
  ask: Fixture['ask'];
  state: 'empty' | 'answered';
  /** True when the question goes to the business's own records (a session). */
  live: boolean;
}

/**
 * Poocho: the examples and, for a look, the fixture's answer. A session asks
 * its own records (actions/ask.ts); its examples name its own customers and
 * items: the one who owes most, the last billed, the first item.
 */
export async function loadAsk(viewer: Viewer, opts: { state: string | null }): Promise<AskData | null> {
  if (!viewer.business) return null;
  const scope = scopeOf(viewer);
  if (!scope) return { ask: FIXTURE.ask, state: opts.state === 'answered' ? 'answered' : 'empty', live: false };
  const [due, people, things] = await Promise.all([
    documents.listBills(scope, { status: 'due', limit: 50 }),
    customers.listCustomers(scope),
    items.listItems(scope),
  ]);
  const owes = [...due].sort((a, b) => b.balance.duePaise - a.balance.duePaise)[0]?.customerName;
  const examples = [
    owes ? t('ask.example.due', { name: owes }) : null,
    people[0] ? t('ask.example.last', { name: people[0].name }) : null,
    things[0] ? t('ask.example.rate', { item: things[0].name }) : null,
  ].filter((e): e is string => Boolean(e));
  return {
    ask: { examples, answer: { question: '', text: '', sources: [] } },
    state: 'empty',
    live: true,
  };
}
