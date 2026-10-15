import type { Role, TenantScope } from '../scope';

/** A write the scope's role may not make (I8). The UI hides the control; this is the enforcement. */
export class ForbiddenError extends Error {
  constructor(what: string, role: Role) {
    super(`${role} may not ${what}`);
    this.name = 'ForbiddenError';
  }
}
/** A row the scope cannot see (another business's, or none): tenancy never says which. */
export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
    this.name = 'NotFoundError';
  }
}

/** The one gate every repository write passes: the scope's role must be in the write's allowedRoles. */
export function allow(scope: TenantScope, roles: readonly Role[], what: string): void {
  if (!roles.includes(scope.role)) throw new ForbiddenError(what, scope.role);
}

/** What the generated tests need from a repository module (scripts/gen-tests.mjs reads these by name). */
export type RoleProbe = (scope: TenantScope) => Promise<unknown>;
export interface TenancyProbe {
  name: string;
  /** Runs as scope A against another business's ids; returns every business id the call touched or returned. */
  run: (scope: TenantScope, other: { businessId: string; userId: string }) => Promise<{ touched: string[] }>;
}
