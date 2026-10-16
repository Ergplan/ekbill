/**
 * The repository module list (I1): scripts/gen-tests.mjs reads this file to
 * generate tests/integration/tenancy.test.ts (every module's tenancyProbes)
 * and tests/integration/roles.test.ts (every module's allowedRoles against
 * every role). A module not listed here is not tested, so list it.
 */
export const REPOSITORIES = [
  'ai-calls',
  'businesses',
  'customers',
  'document-files',
  'documents',
  'files',
  'gst',
  'imports',
  'items',
  'memberships',
  'payments',
  'photos',
  'reminders',
  'search',
  'series',
  'users',
] as const;
export type RepositoryName = (typeof REPOSITORIES)[number];
