/**
 * Run by global-setup in its own Node (react-server conditions, as the
 * server runs the repositories): the build's people and fixture bills, and
 * today's bills from earlier runs cancelled, so a journey that repeats a
 * bill does not meet the duplicate guard ("bana tha 0 din pehle") left by
 * the run before it, and money recorded today on fixture bills reversed so
 * their dues are due again. Test data only: the dev database.
 */
import { closePool } from '../../packages/db/src/pool';
import * as documents from '../../packages/db/src/repos/documents';
import * as payments from '../../packages/db/src/repos/payments';
import { SEED, seedBuild, seedUser } from '../../packages/db/src/seed';
import fixture from '../fixtures/v2.json';
import { todayIst } from '../../packages/engine/src/index';

async function main() {
  const url = process.env.DATABASE_URL ?? 'postgres://postgres@127.0.0.1:5440/ekbill2_dev';
  process.env.DATABASE_URL = url;
  await seedBuild(url, { log: () => undefined });
  const today = todayIst(new Date());
  const fixtureNumbers = new Set(fixture.bills.map((b) => b.number));
  for (const b of SEED.businesses) {
    const owner = seedUser(b.owner);
    if (!owner) continue;
    const scope = {
      businessId: b.id,
      userId: owner.id,
      role: 'owner' as const,
      requestId: 'e2e-prepare',
      actorKind: 'system' as const,
    };
    for (const row of await documents.listBills(scope)) {
      // (A bill corrected by a credit note stays: it cannot be cancelled on top.)
      if (row.issueDate === today && row.status === 'issued' && !fixtureNumbers.has(row.number))
        await documents.cancelDocument(scope, { id: row.id, reason: 'Test run reset' }).catch((e: unknown) => {
          if (!(e instanceof documents.DocumentStateError)) throw e;
        });
      // Money a journey recorded today on a fixture bill is reversed, so the fixture's dues are due again.
      if (fixtureNumbers.has(row.number) && row.status === 'issued')
        for (const p of await payments.listPayments(scope, row.id))
          if (p.date === today && !p.reversedAt)
            await payments.reversePayment(scope, { paymentId: p.id, reason: 'Test run reset' });
    }
  }
  await closePool();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
