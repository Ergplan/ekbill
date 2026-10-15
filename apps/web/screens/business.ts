import 'server-only';

import { businesses, memberships, series, type BusinessProfile, type Series, type TenantScope } from '@ekbill/db';
import { ENGINE_REGISTRATION, findState } from '@ekbill/engine';

import type { Business } from './fixtures';

/**
 * The business as the screens read it (Stage 4): the repository's profile,
 * its series and its people, shaped like the fixture Business so every
 * screen that reads viewer.business keeps working, with the real values.
 */
export interface LoadedBusiness {
  view: Business;
  profile: BusinessProfile;
  series: Series[];
  /** URLs the browser can load (the files route), or null. */
  logoUrl: string | null;
  signatureUrl: string | null;
  team: number;
  ownerName: string;
}

export function fileUrl(id: string | null): string | null {
  return id ? `/api/files/${id}` : null;
}

export function viewOf(
  p: BusinessProfile,
  all: Series[],
  ownerName: string,
  theme: Business['theme'],
  lang: Business['lang'],
  fixtureKey: string | null,
): Business {
  const bills = all.filter((s) => s.kind === 'bill' && s.active);
  return {
    id: fixtureKey ?? p.id,
    name: p.tradeName,
    ownerName,
    pan: p.pan,
    gstin: p.gstin,
    registration: ENGINE_REGISTRATION[p.registrationType],
    turnoverBand: p.turnoverBand,
    irn: p.eInvoicingApplies === true,
    phone: p.phone ?? '',
    upi: p.upi,
    bank:
      p.bankAccount && p.bankIfsc
        ? { name: p.bankName ?? '', account: `XXXX${p.bankAccount.slice(-4)}`, ifsc: p.bankIfsc }
        : null,
    address: p.address,
    city: p.city,
    stateCode: p.stateCode,
    stateName: findState(p.stateCode)?.name ?? null,
    series: bills.map((s) => ({ prefix: s.prefix, next: s.nextNumber })),
    look: {
      logo: p.logoFileId !== null,
      signature: p.signatureFileId !== null,
      design: p.look.design,
      colour: p.look.accent,
      paper: p.look.paper === 'a4' ? 'A4' : p.look.paper === 'a5' ? 'A5' : p.look.paper,
      share: p.look.shareAs,
    },
    theme,
    lang,
    voiceOnArrival: p.voiceOnArrival,
    gstDefaultRate: p.registrationType === 'regular' ? 18 : null,
  };
}

export async function loadBusiness(
  scope: TenantScope,
  who: { theme: Business['theme']; lang: Business['lang']; fixtureKey: string | null },
): Promise<LoadedBusiness> {
  const [profile, all, members] = await Promise.all([
    businesses.getProfile(scope),
    series.listSeries(scope),
    memberships.listMembers(scope),
  ]);
  const owner = members.find((m) => m.role === 'owner' && m.status === 'active');
  const ownerName = owner?.name ?? '';
  return {
    view: viewOf(profile, all, ownerName, who.theme, who.lang, who.fixtureKey),
    profile,
    series: all,
    logoUrl: fileUrl(profile.logoFileId),
    signatureUrl: fileUrl(profile.signatureFileId),
    team: members.filter((m) => m.status === 'active').length,
    ownerName,
  };
}
