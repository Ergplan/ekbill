import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

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
        gstin: '27AAPFU0939F1ZV',
        pan: 'AAPFU0939F',
        stateCode: '27',
        turnoverBand: '40l',
        turnoverPaise: 400000000,
        eInvoicingApplies: false,
        address: '12, Dharampeth, Nagpur 440010',
        city: 'Nagpur',
        phone: '+919822012345',
        upi: 'sharma.electricals@upi',
      },
      series: [
        {
          id: '00000000-0000-4000-a000-000000000011',
          name: 'Bills',
          kind: 'bill',
          prefix: 'INV-',
          padding: 3,
          includeFy: true,
        },
        {
          id: '00000000-0000-4000-a000-000000000012',
          name: 'Credit notes',
          kind: 'credit_note',
          prefix: 'CN-',
          padding: 3,
          includeFy: true,
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
          name: 'Bills',
          kind: 'bill',
          prefix: 'GK/',
          padding: 4,
          includeFy: false,
        },
        {
          id: '00000000-0000-4000-a000-000000000022',
          name: 'Credit notes',
          kind: 'credit_note',
          prefix: 'GKCN/',
          padding: 4,
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
export function seedBusinessById(id: string) {
  return SEED.businesses.find((b) => b.id === id) ?? null;
}

/** Which of the build's databases may be seeded: a name that says dev or test, or the build's own instance (sign-in off). */
export function seedAllowed(url: string, env: NodeJS.ProcessEnv = process.env): { ok: boolean; name: string } {
  const name = url.split('/').pop()?.split('?')[0] ?? '';
  return { ok: /dev|test/.test(name) || env.AUTH_MODE === 'switcher', name };
}

/** Upsert everything, each business in its own scoped transaction (the policies bind the login role too: FORCE RLS). */
export async function seedBuild(url: string, { log = console.log }: { log?: (s: string) => void } = {}): Promise<void> {
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
    // The brand-new owner stays brand new: a business the setup made in an earlier run is archived and left
    // behind (nothing is deleted), so /dev/switch/new lands on the welcome flow again.
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
    await client.query('commit');
    log(`seed: ${SEED.users.length} people, ${SEED.businesses.length} businesses (upserted)`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
