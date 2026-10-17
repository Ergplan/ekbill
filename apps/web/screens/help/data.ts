import 'server-only';

import { customers } from '@ekbill/db';
import { selectableRates, todayIst } from '@ekbill/engine';

import { customersOf } from '../common';
import { FIXTURE, TODAY, type Fixture } from '../fixtures';
import { scopeOf } from '../live';
import type { Viewer } from '../viewer';

export interface HelpData {
  help: Fixture['help'];
  /** Whose job it can be: the business's customers (a look: the fixture's). */
  customers: Array<{ id: string; name: string; stateCode: string | null }>;
  chargesGst: boolean;
  /** Today and the business's State: where the helper's bill is made, so its GST is the engine's (computeTax). */
  today: string;
  stateCode: string | null;
  defaultRate: number;
  /** The rule pack's rates today, percent. */
  rates: number[];
}

/** "Mera bill thoda complex hai": the three choices, then the contract's terms for one of the business's customers. */
export async function loadHelp(viewer: Viewer): Promise<HelpData | null> {
  if (!viewer.business || viewer.role === 'accountant') return null;
  const scope = scopeOf(viewer);
  const b = viewer.business;
  const list = scope
    ? (await customers.listCustomers(scope)).map((c) => ({ id: c.id, name: c.name, stateCode: c.stateCode }))
    : customersOf(b).map((c) => ({ id: c.id, name: c.name, stateCode: c.stateCode ?? null }));
  const today = scope ? todayIst(new Date()) : TODAY;
  return {
    help: FIXTURE.help,
    customers: list,
    chargesGst: b.registration === 'regular',
    today,
    stateCode: b.stateCode ?? null,
    defaultRate: b.gstDefaultRate ?? 18,
    rates: selectableRates(today).filter((r) => r > 0),
  };
}
