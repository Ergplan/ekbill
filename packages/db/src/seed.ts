import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

import fixture from '../../../tests/fixtures/v2.json';

import * as schema from './schema';

/**
 * The build's people and businesses (AUTH_MODE=switcher lists them on
 * /dev/switch). Deterministic ids, so the fixture screens (Stage 1, until
 * Stages 4–9 wire them) can map a session to their persona by key. Three
 * businesses with owner, staff and accountant each, and one owner with no
 * business yet. Idempotent: run it again and nothing changes.
 */
export const SEED = {
  users: [
    {
      key: 'sharma',
      id: '00000000-0000-4000-8000-000000000001',
      phone: '+919822012345',
      name: 'Sharma ji',
      theme: 'narangi',
      language: 'hi-Latn',
    },
    {
      key: 'ravi',
      id: '00000000-0000-4000-8000-000000000002',
      phone: '+919822000002',
      name: 'Ravi',
      theme: 'narangi',
      language: 'hi-Latn',
    },
    {
      key: 'meera',
      id: '00000000-0000-4000-8000-000000000003',
      phone: '+919822000003',
      name: 'Meera (CA)',
      theme: 'narangi',
      language: 'en',
    },
    {
      key: 'gupta',
      id: '00000000-0000-4000-8000-000000000004',
      phone: '+919822000004',
      name: 'Gupta ji',
      theme: 'harmony',
      language: 'hi-Latn',
    },
    {
      key: 'sunita',
      id: '00000000-0000-4000-8000-000000000006',
      phone: '+919822000006',
      name: 'Sunita',
      theme: 'harmony',
      language: 'hi-Latn',
    },
    {
      key: 'rao',
      id: '00000000-0000-4000-8000-000000000007',
      phone: '+919822000007',
      name: 'Rao (CA)',
      theme: 'narangi',
      language: 'en',
    },
    {
      key: 'verma',
      id: '00000000-0000-4000-8000-000000000008',
      phone: '+919822000008',
      name: 'Verma ji',
      theme: 'narangi',
      language: 'hi-Latn',
    },
    {
      key: 'deepak',
      id: '00000000-0000-4000-8000-000000000009',
      phone: '+919822000009',
      name: 'Deepak',
      theme: 'narangi',
      language: 'hi-Latn',
    },
    {
      key: 'iyer',
      id: '00000000-0000-4000-8000-000000000010',
      phone: '+919822000010',
      name: 'Iyer (CA)',
      theme: 'harmony',
      language: 'en',
    },
    {
      key: 'new',
      id: '00000000-0000-4000-8000-000000000005',
      phone: '+919822000005',
      name: 'Naya owner',
      theme: 'narangi',
      language: 'hi-Latn',
    },
  ],
  businesses: [
    {
      key: 'sharma',
      id: '00000000-0000-4000-9000-000000000001',
      legalName: 'Sharma Electricals',
      tradeName: 'Sharma Electricals',
      owner: 'sharma',
      staff: 'ravi',
      accountant: 'meera',
      // A regular registrant in Maharashtra, ₹5 lakh a year, e-invoicing answered "no".
      profile: {
        registrationType: 'regular',
        gstin: '27AAAAA0000A1Z2',
        pan: 'AAAAA0000A',
        stateCode: '27',
        turnoverBand: '40l',
        turnoverPaise: 400000000,
        eInvoicingApplies: false,
        address: '12, Dharampeth, Nagpur 440010',
        city: 'Nagpur',
        phone: '+919822012345',
        upi: 'sharma.electricals@upi',
      },
      // The fixture's series (Stage 6): the seed issues INV-031… and AMC-004… through them, so the next bill is INV-045.
      series: [
        {
          id: '00000000-0000-4000-a000-000000000011',
          name: 'INV',
          kind: 'bill',
          prefix: 'INV-',
          padding: 3,
          includeFy: false,
        },
        {
          id: '00000000-0000-4000-a000-000000000013',
          name: 'AMC',
          kind: 'bill',
          prefix: 'AMC-',
          padding: 3,
          includeFy: false,
        },
        {
          id: '00000000-0000-4000-a000-000000000012',
          name: 'Credit notes',
          kind: 'credit_note',
          prefix: 'CN-',
          padding: 3,
          includeFy: false,
        },
      ],
    },
    {
      key: 'gupta',
      id: '00000000-0000-4000-9000-000000000002',
      legalName: 'Gupta Kirana Stores',
      tradeName: 'Gupta Kirana',
      owner: 'gupta',
      staff: 'sunita',
      accountant: 'rao',
      // The composition business of the fixtures: bills of supply with the legend, never a tax line.
      profile: {
        registrationType: 'composition',
        gstin: '09AAACG1234A1ZC',
        pan: 'AAACG1234A',
        stateCode: '09',
        turnoverBand: null,
        turnoverPaise: null,
        eInvoicingApplies: null,
        compositionLegend: 'composition taxable person, not eligible to collect tax on supplies',
        address: '4, Civil Lines, Kanpur 208001',
        city: 'Kanpur',
        phone: '+919822000004',
        upi: 'guptakirana@upi',
      },
      series: [
        {
          id: '00000000-0000-4000-a000-000000000021',
          name: 'BOS',
          kind: 'bill',
          prefix: 'BOS-',
          padding: 3,
          includeFy: false,
        },
        {
          id: '00000000-0000-4000-a000-000000000022',
          name: 'Credit notes',
          kind: 'credit_note',
          prefix: 'GKCN-',
          padding: 3,
          includeFy: false,
        },
      ],
    },
    {
      key: 'verma',
      id: '00000000-0000-4000-9000-000000000003',
      legalName: 'Verma Traders',
      tradeName: 'Verma Traders',
      owner: 'verma',
      staff: 'deepak',
      accountant: 'iyer',
      // Has not set up yet: no profile, the default series only.
      profile: null,
      series: [
        {
          id: '00000000-0000-4000-a000-000000000031',
          name: 'Bills',
          kind: 'bill',
          prefix: '',
          padding: 3,
          includeFy: false,
        },
        {
          id: '00000000-0000-4000-a000-000000000032',
          name: 'Credit notes',
          kind: 'credit_note',
          prefix: 'CN-',
          padding: 3,
          includeFy: false,
        },
      ],
    },
  ],
} as const;

/** What the seed writes of a business's profile (the Stage 4 columns it fills). */
export interface SeedProfile {
  registrationType: 'regular' | 'composition' | 'not-registered' | 'not-sure';
  gstin: string | null;
  pan: string | null;
  stateCode: string | null;
  turnoverBand: '40l' | '40l-1.5cr' | '1.5-5cr' | '5cr+' | null;
  turnoverPaise: number | null;
  eInvoicingApplies: boolean | null;
  compositionLegend: string | null;
  address: string | null;
  city: string | null;
  phone: string | null;
  upi: string | null;
}

export type SeedUserKey = (typeof SEED.users)[number]['key'];
export type SeedBusinessKey = (typeof SEED.businesses)[number]['key'];

export function seedUser(key: string) {
  return SEED.users.find((u) => u.key === key) ?? null;
}
export function seedUserById(id: string) {
  return SEED.users.find((u) => u.id === id) ?? null;
}
/**
 * The fixture customers and items of the build (tests/fixtures/v2.json),
 * seeded with ids derived from the business and the fixture's position, so
 * the screens that still read fixture bills (Stage 6) find a customer's
 * row by its fixture key and its key by the row.
 */
const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');
export function seedCustomerId(businessKey: string, fixtureId: string): string | null {
  const b = SEED.businesses.findIndex((x) => x.key === businessKey);
  const c = fixture.customers.filter((x) => x.business === businessKey).findIndex((x) => x.id === fixtureId);
  return b < 0 || c < 0 ? null : `00000000-0000-4000-b000-${hex(b + 1, 4)}${hex(c + 1, 8)}`;
}
export function seedCustomerKey(id: string): { business: string; customer: string } | null {
  const m = /^00000000-0000-4000-b000-([0-9a-f]{4})([0-9a-f]{8})$/.exec(id);
  if (!m) return null;
  const business = SEED.businesses[parseInt(m[1]!, 16) - 1]?.key;
  const customer = business
    ? fixture.customers.filter((x) => x.business === business)[parseInt(m[2]!, 16) - 1]?.id
    : undefined;
  return business && customer ? { business, customer } : null;
}
export function seedItemId(businessKey: string, fixtureId: string): string | null {
  const b = SEED.businesses.findIndex((x) => x.key === businessKey);
  const i = fixture.items.filter((x) => x.business === businessKey).findIndex((x) => x.id === fixtureId);
  return b < 0 || i < 0 ? null : `00000000-0000-4000-b100-${hex(b + 1, 4)}${hex(i + 1, 8)}`;
}

export function seedBusinessById(id: string) {
  return SEED.businesses.find((b) => b.id === id) ?? null;
}

/** Which of the build's databases may be seeded: a name that says dev or test, or the build's own instance (sign-in off). */
export function seedAllowed(url: string, env: NodeJS.ProcessEnv = process.env): { ok: boolean; name: string } {
  const name = url.split('/').pop()?.split('?')[0] ?? '';
  return { ok: /dev|test/.test(name) || env.AUTH_MODE === 'switcher', name };
}

/** Upsert everything, each business in its own scoped transaction (the policies bind the login role too: FORCE RLS). */
export async function seedBuild(
  url: string,
  {
    log = console.log,
    bills = true,
  }: { log?: (s: string) => void; /** Issue the fixture bills too (Stage 6). */ bills?: boolean } = {},
): Promise<void> {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  const db = drizzle(client, { schema });
  try {
    await client.query('begin');
    await client.query(
      "select set_config('app.actor_kind', 'system', true), set_config('app.request_id', 'seed', true), set_config('app.user_id', '', true)",
    );
    for (const u of SEED.users) {
      await db
        .insert(schema.users)
        .values({ id: u.id, phoneE164: u.phone, name: u.name, theme: u.theme, language: u.language })
        .onConflictDoUpdate({
          target: schema.users.id,
          set: { phoneE164: u.phone, name: u.name, theme: u.theme, language: u.language },
        });
    }
    for (const b of SEED.businesses) {
      await client.query("select set_config('app.business_id', $1, true)", [b.id]);
      const owner = seedUser(b.owner)!;
      const blank: SeedProfile = {
        registrationType: 'not-sure',
        gstin: null,
        pan: null,
        stateCode: null,
        turnoverBand: null,
        turnoverPaise: null,
        eInvoicingApplies: null,
        compositionLegend: null,
        address: null,
        city: null,
        phone: null,
        upi: null,
      };
      const profile: SeedProfile = b.profile ? { ...blank, ...b.profile } : blank;
      await db
        .insert(schema.businesses)
        .values({ id: b.id, legalName: b.legalName, tradeName: b.tradeName, createdBy: owner.id, ...profile })
        .onConflictDoUpdate({
          target: schema.businesses.id,
          set: { legalName: b.legalName, tradeName: b.tradeName, status: 'active', ...profile },
        });
      // The numbering state (next_number, fy) is the business's own: a re-seed never rewinds it.
      let firstBillSeries: string | null = null;
      for (const sr of b.series) {
        if (sr.kind === 'bill' && !firstBillSeries) firstBillSeries = sr.id;
        await db
          .insert(schema.series)
          .values({
            id: sr.id,
            businessId: b.id,
            name: sr.name,
            kind: sr.kind,
            prefix: sr.prefix,
            padding: sr.padding,
            includeFy: sr.includeFy,
          })
          .onConflictDoUpdate({
            target: schema.series.id,
            set: {
              name: sr.name,
              kind: sr.kind,
              prefix: sr.prefix,
              padding: sr.padding,
              includeFy: sr.includeFy,
              active: true,
            },
          });
      }
      await db
        .update(schema.businesses)
        .set({ defaultSeriesId: firstBillSeries, setupDoneAt: b.profile ? new Date() : null })
        .where(eq(schema.businesses.id, b.id));
      // The fixture customers and items (Stage 5): upserted, never rewinding what the owner changed since.
      for (const c of fixture.customers.filter((x) => x.business === b.key)) {
        await db
          .insert(schema.customers)
          .values({
            id: seedCustomerId(b.key, c.id)!,
            businessId: b.id,
            name: c.name,
            contactPerson: c.contact ?? null,
            phone: c.phone ?? null,
            gstin: c.gstin ?? null,
            pan: c.pan ?? null,
            stateCode: c.stateCode ?? null,
            language: c.lang ?? 'hi-Latn',
            languageSource: c.lang ? 'owner' : null,
            notes: c.notes ?? null,
            createdBy: owner.id,
          })
          .onConflictDoNothing({ target: schema.customers.id });
      }
      for (const it of fixture.items.filter((x) => x.business === b.key)) {
        await db
          .insert(schema.items)
          .values({
            id: seedItemId(b.key, it.id)!,
            businessId: b.id,
            name: it.name,
            hsnSac: it.hsn ?? null,
            unit: it.unit ?? null,
            defaultRatePaise: it.ratePaise ?? null,
            defaultTaxBp: it.gstRate === null || it.gstRate === undefined ? null : Math.round(it.gstRate * 100),
            createdBy: owner.id,
          })
          .onConflictDoNothing({ target: schema.items.id });
      }
      for (const [role, key] of [
        ['owner', b.owner],
        ['staff', b.staff],
        ['accountant', b.accountant],
      ] as const) {
        const user = seedUser(key)!;
        await db
          .insert(schema.memberships)
          .values({
            businessId: b.id,
            userId: user.id,
            role,
            status: 'active',
            invitedBy: owner.id,
            acceptedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [schema.memberships.businessId, schema.memberships.userId],
            set: { role, status: 'active' },
          });
      }
    }
    await keepNewOwnerNew(client);
    await client.query('commit');
    log(`seed: ${SEED.users.length} people, ${SEED.businesses.length} businesses (upserted)`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
  if (!bills) return;
  const issued = await seedBills(url);
  if (issued) log(`seed: ${issued} fixture bills issued`);
}

/**
 * The fixture bills as real documents (Stage 6): issued through
 * issueDocument in number order (the series moved up to each fixture
 * number first, so INV-031 is INV-031), then their payments, the cancelled
 * bill and the credit note, as the owner, actor 'system'. A bill already
 * there is left alone, so the seed runs again without change.
 */
export async function seedBills(url: string): Promise<number> {
  process.env.DATABASE_URL ??= url;
  const { createDraft, issueDocument, cancelDocument, createCreditNote, listBills } = await import('./repos/documents');
  const { recordPayment } = await import('./repos/payments');
  let issued = 0;
  for (const b of SEED.businesses) {
    const bills = fixture.bills.filter((x) => x.business === b.key);
    if (!bills.length) continue;
    const owner = seedUser(b.owner)!;
    const scope = {
      businessId: b.id,
      userId: owner.id,
      role: 'owner' as const,
      requestId: 'seed',
      actorKind: 'system' as const,
    };
    const have = new Set((await listBills(scope)).map((x) => x.number));
    const seriesOf = (prefix: string) => b.series.find((sr) => sr.kind === 'bill' && sr.prefix === `${prefix}-`)!;
    const sorted = [...bills].sort((x, y) => x.number.localeCompare(y.number, 'en', { numeric: true }));
    for (const bill of sorted) {
      if (have.has(bill.number)) continue;
      const sr = seriesOf(bill.series);
      const sequence = Number(bill.number.replace(/^\D+/, ''));
      // Move the series to the fixture's number (up only; the bills are issued in number order).
      const { withTenant } = await import('./scope');
      await withTenant(scope, async ({ client }) => {
        await client.query('update series set next_number = greatest(next_number, $2) where id = $1', [
          sr.id,
          sequence,
        ]);
      });
      const customerId = seedCustomerId(b.key, bill.customer);
      const c = fixture.customers.find((x) => x.business === b.key && x.id === bill.customer);
      const draft = await createDraft(scope, {
        seriesId: sr.id,
        customer: {
          id: customerId,
          name: c?.name ?? bill.customer,
          gstin: c?.gstin ?? null,
          stateCode: c?.stateCode ?? null,
          phone: c?.phone ?? null,
        },
        // A walk-in with no state on record buys at the counter: the seller's state.
        placeOfSupplyStateCode: c?.stateCode ?? b.profile?.stateCode ?? null,
        dateIso: bill.date,
        gstOn: bill.kind === 'tax-invoice',
        lines: bill.lines.map((l) => ({
          description: l.what,
          quantityMilli: Math.round(l.qty * 1000),
          unitPricePaise: l.ratePaise,
          gstBp: Math.round((l.gstRate ?? 0) * 100),
          taxRateChosen: true,
          hsnCode: null,
        })),
      });
      const doc = await issueDocument(scope, { id: draft.id, today: bill.date });
      issued += 1;
      for (const p of fixture.payments.filter((x) => x.business === b.key && x.bill === bill.number)) {
        await recordPayment(scope, {
          documentId: doc.id,
          amountPaise: p.amountPaise,
          dateIso: p.date,
          method: p.method,
          today: p.date,
        });
      }
      if (bill.status === 'cancelled')
        await cancelDocument(scope, { id: doc.id, reason: bill.cancelledReason ?? 'Galti se bana' });
      for (const cn of fixture.creditNotes.filter((x) => x.business === b.key && x.bill === bill.number)) {
        const rate = bill.lines[0]?.gstRate ?? 0;
        const note = await createCreditNote(scope, {
          invoiceId: doc.id,
          dateIso: cn.date,
          reason: cn.reason,
          lines: [
            {
              description: cn.reason,
              quantityMilli: 1000,
              unitPricePaise: cn.amountPaise,
              gstBp: Math.round(rate * 100),
              taxRateChosen: true,
              priceIncludesTax: true,
            },
          ],
        });
        await issueDocument(scope, { id: note.id, today: cn.date });
      }
    }
  }
  return issued;
}

/**
 * The brand-new owner stays brand new: a business the setup made in an earlier run (or a journey earlier in this
 * one) is archived and left behind, nothing deleted, so /dev/switch/new lands on the welcome flow again. Runs
 * inside the caller's transaction.
 */
export async function keepNewOwnerNew(client: pg.ClientBase): Promise<void> {
  const naya = seedUser('new')!;
  const left = await client.query<{ business_id: string }>(
    "update memberships set status = 'removed' where user_id = $1 and status = 'active' returning business_id",
    [naya.id],
  );
  for (const row of left.rows) {
    await client.query("select set_config('app.business_id', $1, true)", [row.business_id]);
    await client.query("update businesses set status = 'archived', updated_at = now() where id = $1", [
      row.business_id,
    ]);
    await client.query('update sessions set business_id = null, role = null where user_id = $1', [naya.id]);
  }
}
