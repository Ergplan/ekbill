import { and, eq, sql } from 'drizzle-orm';

import {
  checkProfile,
  type BillLook,
  type BusinessFileKind,
  type Profile,
  type ProfileField,
  type ProfileInput,
  type RegistrationType,
  type Say,
  type TurnoverBand,
} from '@ekbill/engine';

import * as schema from '../schema';
import { withTenant, withUser, type Db, type TenantScope } from '../scope';
import { allow, NotFoundError, type RoleProbe, type TenancyProbe } from './allow';
import { PROBE_PNG, putFile } from './files';
import { joinByReferral } from './plan';
import { ESTIMATE_SERIES } from './series';

export interface Business {
  id: string;
  legalName: string;
  tradeName: string;
  status: 'active' | 'archived';
  createdAt: Date;
  updatedAt: Date;
}

/** The whole profile as the screens read it (Stage 4), with the file and series pointers. */
export interface BusinessProfile extends Profile {
  id: string;
  status: 'active' | 'archived';
  logoFileId: string | null;
  signatureFileId: string | null;
  defaultSeriesId: string | null;
  setupDoneAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** The engine said no to the profile: which field, and the dictionary key the screen shows. */
export class ProfileError extends Error {
  constructor(
    public readonly field: ProfileField,
    public readonly say: Say,
  ) {
    super(`profile ${field}: ${say.key}`);
    this.name = 'ProfileError';
  }
}

/** Who may make each write (8.3; I8). The generated roles test holds every role to this table. Owner only (Stage 4). */
export const allowedRoles = {
  rename: ['owner'],
  archive: ['owner'],
  saveProfile: ['owner'],
  setLook: ['owner'],
  setFile: ['owner'],
  setDefaultSeries: ['owner'],
} as const satisfies Record<string, readonly TenantScope['role'][]>;

type Row = typeof schema.businesses.$inferSelect;

export function profileOf(row: Row): BusinessProfile {
  return {
    id: row.id,
    status: row.status as BusinessProfile['status'],
    legalName: row.legalName,
    tradeName: row.tradeName,
    registrationType: row.registrationType as RegistrationType,
    gstin: row.gstin,
    pan: row.pan,
    stateCode: row.stateCode,
    turnoverBand: row.turnoverBand as TurnoverBand | null,
    turnoverPaise: row.turnoverPaise,
    eInvoicingApplies: row.eInvoicingApplies,
    compositionLegend: row.compositionLegend,
    phone: row.phone,
    email: row.email,
    upi: row.upi,
    address: row.address,
    city: row.city,
    pincode: row.pincode,
    bankName: row.bankName,
    bankAccount: row.bankAccount,
    bankIfsc: row.bankIfsc,
    bankHolder: row.bankHolder,
    defaultPaymentTermsDays: row.defaultPaymentTermsDays,
    look: {
      design: row.billDesign as BillLook['design'],
      paper: row.billPaper as BillLook['paper'],
      shareAs: row.billShareAs as BillLook['shareAs'],
      accent: row.billAccent,
    },
    voiceOnArrival: row.voiceOnArrival,
    logoFileId: row.logoFileId,
    signatureFileId: row.signatureFileId,
    defaultSeriesId: row.defaultSeriesId,
    setupDoneAt: row.setupDoneAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** The columns a checked profile writes. */
function columnsOf(p: Profile) {
  return {
    legalName: p.legalName,
    tradeName: p.tradeName,
    registrationType: p.registrationType,
    gstin: p.gstin,
    pan: p.pan,
    stateCode: p.stateCode,
    turnoverBand: p.turnoverBand,
    turnoverPaise: p.turnoverPaise,
    eInvoicingApplies: p.eInvoicingApplies,
    compositionLegend: p.compositionLegend,
    phone: p.phone,
    email: p.email,
    upi: p.upi,
    address: p.address,
    city: p.city,
    pincode: p.pincode,
    bankName: p.bankName,
    bankAccount: p.bankAccount,
    bankIfsc: p.bankIfsc,
    bankHolder: p.bankHolder,
    defaultPaymentTermsDays: p.defaultPaymentTermsDays,
    billDesign: p.look.design,
    billPaper: p.look.paper,
    billShareAs: p.look.shareAs,
    billAccent: p.look.accent,
    voiceOnArrival: p.voiceOnArrival,
  };
}

function checked(input: ProfileInput): Profile {
  const c = checkProfile(input);
  if (!c.ok) throw new ProfileError(c.field, c.message);
  return c.profile;
}

export async function getProfile(scope: TenantScope): Promise<BusinessProfile> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, scope.businessId)))[0];
    if (!row) throw new NotFoundError('business');
    return profileOf(row);
  });
}

/** A stored profile as the input that would write it again: what a save leaves alone is kept, not reset. */
function inputOfProfile(p: Profile): ProfileInput {
  return {
    name: p.legalName,
    tradeName: p.tradeName,
    gst: p.registrationType,
    gstin: p.gstin,
    pan: p.pan,
    turnoverBand: p.turnoverBand,
    eInvoicingApplies: p.eInvoicingApplies,
    compositionLegend: p.compositionLegend,
    phone: p.phone,
    email: p.email,
    upi: p.upi,
    address: p.address,
    city: p.city,
    pincode: p.pincode,
    stateCode: p.stateCode,
    bankName: p.bankName,
    bankAccount: p.bankAccount,
    bankIfsc: p.bankIfsc,
    bankHolder: p.bankHolder,
    defaultPaymentTermsDays: p.defaultPaymentTermsDays,
    look: p.look,
    voiceOnArrival: p.voiceOnArrival,
  };
}

/**
 * The owner's "Save karo": the profile, checked by the engine, written once. Marks the setup done. A field the
 * input leaves out (undefined) keeps its stored value; null clears it. Aap's save carries no bill look and setup
 * carries no bank details: neither may reset what the other screen set.
 */
export async function saveProfile(scope: TenantScope, input: ProfileInput): Promise<BusinessProfile> {
  allow(scope, allowedRoles.saveProfile, 'change the business profile');
  return withTenant(scope, async ({ db }) => {
    const current = (
      await db.select().from(schema.businesses).where(eq(schema.businesses.id, scope.businessId)).for('update')
    )[0];
    if (!current) throw new NotFoundError('business');
    const given = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined)) as Partial<ProfileInput>;
    const base = inputOfProfile(profileOf(current));
    const profile = checked({
      ...base,
      ...given,
      look: given.look === undefined ? base.look : { ...base.look, ...(given.look ?? {}) },
    } as ProfileInput);
    const [row] = await db
      .update(schema.businesses)
      .set({
        ...columnsOf(profile),
        setupDoneAt: sql`coalesce(${schema.businesses.setupDoneAt}, now())`,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return profileOf(row);
  });
}

/** "Bill kaisa dikhe": design, paper, share format, accent, on their own (the rest of the profile untouched). */
export async function setLook(scope: TenantScope, look: Partial<BillLook>): Promise<BusinessProfile> {
  allow(scope, allowedRoles.setLook, 'change the bill look');
  return withTenant(scope, async ({ db }) => {
    const current = await getRow(db, scope.businessId);
    const profile = checked({ ...inputOf(current), look: { ...profileOf(current).look, ...look } });
    const [row] = await db
      .update(schema.businesses)
      .set({
        billDesign: profile.look.design,
        billPaper: profile.look.paper,
        billShareAs: profile.look.shareAs,
        billAccent: profile.look.accent,
        updatedAt: sql`now()`,
      })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    return profileOf(row!);
  });
}

/** The logo or the signature: a data URL stored as a file and pointed at, or null to take it off the bills. */
export async function setFile(
  scope: TenantScope,
  kind: BusinessFileKind,
  dataUrl: string | null,
): Promise<BusinessProfile> {
  allow(scope, allowedRoles.setFile, 'change the bill look');
  const file = dataUrl ? await putFile(scope, kind, dataUrl) : null;
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.businesses)
      .set(kind === 'logo' ? { logoFileId: file?.id ?? null } : { signatureFileId: file?.id ?? null })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return profileOf(row);
  });
}

/** The series new bills go in: one of the business's own active bill series. */
export async function setDefaultSeries(scope: TenantScope, seriesId: string): Promise<BusinessProfile> {
  allow(scope, allowedRoles.setDefaultSeries, 'change the series');
  return withTenant(scope, async ({ db }) => {
    const s = (
      await db
        .select({ id: schema.series.id })
        .from(schema.series)
        .where(and(eq(schema.series.id, seriesId), eq(schema.series.kind, 'bill'), eq(schema.series.active, true)))
    )[0];
    if (!s) throw new NotFoundError('series');
    const [row] = await db
      .update(schema.businesses)
      .set({ defaultSeriesId: s.id, updatedAt: sql`now()` })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return profileOf(row);
  });
}

async function getRow(db: Db, id: string): Promise<Row> {
  const row = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, id)))[0];
  if (!row) throw new NotFoundError('business');
  return row;
}

/** A stored row back into the engine's input, so a partial write re-checks the whole. */
export function inputOf(row: Row): ProfileInput {
  const p = profileOf(row);
  return {
    name: p.legalName,
    tradeName: p.tradeName,
    gst: p.registrationType,
    gstin: p.gstin,
    pan: p.pan,
    turnoverBand: p.turnoverBand,
    eInvoicingApplies: p.eInvoicingApplies,
    compositionLegend: p.compositionLegend,
    phone: p.phone,
    email: p.email,
    upi: p.upi,
    address: p.address,
    city: p.city,
    pincode: p.pincode,
    stateCode: p.stateCode,
    bankName: p.bankName,
    bankAccount: p.bankAccount,
    bankIfsc: p.bankIfsc,
    bankHolder: p.bankHolder,
    defaultPaymentTermsDays: p.defaultPaymentTermsDays,
    look: p.look,
    voiceOnArrival: p.voiceOnArrival,
  };
}

export async function getBusiness(scope: TenantScope): Promise<Business> {
  return withTenant(scope, async ({ db }) => {
    const row = (await db.select().from(schema.businesses).where(eq(schema.businesses.id, scope.businessId)))[0];
    if (!row) throw new NotFoundError('business');
    return row as Business;
  });
}

export async function rename(scope: TenantScope, input: { legalName?: string; tradeName?: string }): Promise<Business> {
  allow(scope, allowedRoles.rename, 'rename the business');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.businesses)
      .set({
        ...(input.legalName !== undefined ? { legalName: input.legalName } : {}),
        ...(input.tradeName !== undefined ? { tradeName: input.tradeName } : {}),
        updatedAt: sql`now()`,
      })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return row as Business;
  });
}

export async function archive(scope: TenantScope): Promise<Business> {
  allow(scope, allowedRoles.archive, 'archive the business');
  return withTenant(scope, async ({ db }) => {
    const [row] = await db
      .update(schema.businesses)
      .set({ status: 'archived', updatedAt: sql`now()` })
      .where(eq(schema.businesses.id, scope.businessId))
      .returning();
    if (!row) throw new NotFoundError('business');
    return row as Business;
  });
}

/**
 * A brand-new owner's business: no scope exists yet, so this runs with the
 * user alone, chooses the id first and sets it as the scope of the insert
 * (the policy on businesses is id = app_business_id()). One transaction:
 * the business and its owner membership.
 */
export async function createBusiness(
  who: { userId: string; requestId: string },
  input: { legalName: string; tradeName: string } | ProfileInput,
  opts: { referralCode?: string | null } = {},
): Promise<BusinessProfile> {
  const profile = checked(
    'name' in input ? input : { name: input.legalName, tradeName: input.tradeName, gst: 'unknown' },
  );
  return withUser(who, async ({ db, client }) => {
    const id = (await client.query<{ id: string }>('select gen_random_uuid() as id')).rows[0]!.id;
    await client.query("select set_config('app.business_id', $1, true)", [id]);
    const [row] = await db
      .insert(schema.businesses)
      .values({ id, ...columnsOf(profile), createdBy: who.userId, setupDoneAt: 'name' in input ? sql`now()` : null })
      .returning();
    await db.insert(schema.memberships).values({
      businessId: id,
      userId: who.userId,
      role: 'owner',
      status: 'active',
      invitedBy: who.userId,
      acceptedAt: sql`now()`,
    });
    // Every business numbers from its first day: a bill series, a credit-note series and one for kaccha bills
    // (estimates, 20 Oct); Aap changes them.
    const [bills] = await db
      .insert(schema.series)
      .values({ businessId: id, name: 'Bills', kind: 'bill', prefix: 'INV-', padding: 3, includeFy: true })
      .returning({ id: schema.series.id });
    await db.insert(schema.series).values({
      businessId: id,
      name: 'Credit notes',
      kind: 'credit_note',
      prefix: 'CN-',
      padding: 3,
      includeFy: true,
    });
    await db.insert(schema.series).values(ESTIMATE_SERIES(id));
    // Came by a friend's link (20 Oct): who referred it, and the friend's join row (an unknown code is ignored).
    if (opts.referralCode) await joinByReferral(client, id, opts.referralCode);
    const [done] = await db
      .update(schema.businesses)
      .set({ defaultSeriesId: bills!.id })
      .where(eq(schema.businesses.id, id))
      .returning();
    return profileOf(done ?? row!);
  });
}

// --- probes for the generated tests (not part of the product API)
export const roleProbes: Record<keyof typeof allowedRoles, RoleProbe> = {
  rename: (scope) => rename(scope, { tradeName: 'Probe Traders' }),
  archive: (scope) => archive(scope),
  saveProfile: async (scope) => {
    const current = await getProfile(scope);
    return saveProfile(scope, { ...inputOf(await rowOf(scope)), name: current.legalName });
  },
  setLook: (scope) => setLook(scope, { design: 'modern' }),
  setFile: (scope) => setFile(scope, 'logo', PROBE_PNG),
  setDefaultSeries: async (scope) => {
    const s = (
      await withTenant(scope, ({ db }) =>
        db
          .select({ id: schema.series.id })
          .from(schema.series)
          .where(and(eq(schema.series.kind, 'bill'), eq(schema.series.active, true))),
      )
    )[0];
    return setDefaultSeries(scope, s!.id);
  },
};
async function rowOf(scope: TenantScope): Promise<Row> {
  return withTenant(scope, ({ db }) => getRow(db, scope.businessId));
}
export const tenancyProbes: TenancyProbe[] = [
  {
    name: 'getBusiness returns only its own business',
    run: async (scope) => ({ touched: [(await getBusiness(scope)).id] }),
  },
  {
    name: 'rename touches only its own business',
    run: async (scope) => ({ touched: [(await rename(scope, { tradeName: 'Renamed by A' })).id] }),
  },
];
