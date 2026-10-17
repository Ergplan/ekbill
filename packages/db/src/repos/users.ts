import { eq, sql } from 'drizzle-orm';

import * as schema from '../schema';
import { withTenant, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';

export interface User {
  id: string;
  name: string;
  phoneE164: string;
  theme: 'narangi' | 'harmony' | 'system';
  language: 'hi-Latn' | 'en' | 'hi' | 'mr' | 'ta';
}

/** A person's own settings: every role may change their own theme and language (users carries no business data). */
export const allowedRoles = {
  setTheme: ['owner', 'staff', 'accountant'],
  setLanguage: ['owner', 'staff', 'accountant'],
  setName: ['owner', 'staff', 'accountant'],
} as const satisfies Record<string, readonly TenantScope['role'][]>;

const columns = {
  id: schema.users.id,
  name: schema.users.name,
  phoneE164: schema.users.phoneE164,
  theme: schema.users.theme,
  language: schema.users.language,
};

export async function getUser(scope: TenantScope): Promise<User> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select(columns).from(schema.users).where(eq(schema.users.id, scope.userId)))[0];
    if (!row) throw new NotFoundError('user');
    return row as User;
  });
}

async function setOwn(scope: TenantScope, patch: Partial<Pick<User, 'theme' | 'language' | 'name'>>): Promise<User> {
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.users)
      .set({ ...patch, lastSeenAt: sql`now()` })
      .where(eq(schema.users.id, scope.userId))
      .returning(columns);
    if (!row) throw new NotFoundError('user');
    return row as User;
  });
}

export async function setTheme(scope: TenantScope, theme: User['theme']): Promise<User> {
  allow(scope, allowedRoles.setTheme, 'set the theme');
  return setOwn(scope, { theme });
}
export async function setLanguage(scope: TenantScope, language: User['language']): Promise<User> {
  allow(scope, allowedRoles.setLanguage, 'set the language');
  return setOwn(scope, { language });
}
export async function setName(scope: TenantScope, name: string): Promise<User> {
  allow(scope, allowedRoles.setName, 'set the name');
  return setOwn(scope, { name: name.trim() });
}

export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  setTheme: (scope) => setTheme(scope, 'harmony'),
  setLanguage: (scope) => setLanguage(scope, 'en'),
  setName: (scope) => setName(scope, 'Probe'),
};
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'setTheme changes only the acting user',
    run: async (scope, other) => {
      const me = await setTheme(scope, 'harmony');
      // The other business's user is untouched: read it outside any scope would need the login role; the
      // returned row is the acting user's, so the only id touched is the scope's own user.
      return { touched: me.id === other.userId ? [other.businessId] : [scope.businessId] };
    },
  },
];
