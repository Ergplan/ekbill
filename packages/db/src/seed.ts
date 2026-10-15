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
    },
    {
      key: 'gupta',
      id: '00000000-0000-4000-9000-000000000002',
      legalName: 'Gupta Kirana Stores',
      tradeName: 'Gupta Kirana',
      owner: 'gupta',
      staff: 'sunita',
      accountant: 'rao',
    },
    {
      key: 'verma',
      id: '00000000-0000-4000-9000-000000000003',
      legalName: 'Verma Traders',
      tradeName: 'Verma Traders',
      owner: 'verma',
      staff: 'deepak',
      accountant: 'iyer',
    },
  ],
} as const;

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
      await db
        .insert(schema.businesses)
        .values({ id: b.id, legalName: b.legalName, tradeName: b.tradeName, createdBy: owner.id })
        .onConflictDoUpdate({
          target: schema.businesses.id,
          set: { legalName: b.legalName, tradeName: b.tradeName, status: 'active' },
        });
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
    await client.query('commit');
    log(`seed: ${SEED.users.length} people, ${SEED.businesses.length} businesses (upserted)`);
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}
