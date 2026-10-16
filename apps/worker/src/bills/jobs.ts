import { businesses, businessesWithBills, documents, type TenantScope } from '@ekbill/db';
import { todayIst } from '@ekbill/engine';
import { printTheRest } from '@ekbill/render';

/**
 * Stage 6's jobs. render-other-sizes: after a bill is issued (the web
 * server printed the shared format at once), every other paper and format
 * of the business's design, kept so a later download is instant.
 * dues-today: once a day, per business, the unpaid bills whose terms end
 * today and those past them, logged for the owner's Home; nothing is sent
 * (the owner opens each reminder in WhatsApp).
 */
export const RENDER_OTHER_SIZES = 'render-other-sizes';
export const DUES_TODAY = 'dues-today';

export interface RenderOtherSizesJob {
  documentId: string;
  businessId: string;
  userId: string;
  role: TenantScope['role'];
  requestId: string;
}

export async function runRenderOtherSizes(job: RenderOtherSizesJob): Promise<number> {
  const scope: TenantScope = {
    businessId: job.businessId,
    userId: job.userId,
    // Keeping a file is the owner's and staff's; an accountant never issues, so never queues this.
    role: job.role === 'accountant' ? 'staff' : job.role,
    requestId: job.requestId,
    actorKind: 'system',
  };
  return printTheRest(scope, job.documentId);
}

export interface DuesLine {
  businessId: string;
  dueToday: number;
  overdue: number;
  duePaise: number;
}

export async function runDuesToday(now: Date = new Date()): Promise<DuesLine[]> {
  const today = todayIst(now);
  const out: DuesLine[] = [];
  for (const b of await businessesWithBills()) {
    const scope: TenantScope = {
      businessId: b.businessId,
      userId: b.ownerId,
      role: 'owner',
      requestId: `dues-today-${today}`,
      actorKind: 'system',
    };
    const profile = await businesses.getProfile(scope);
    const { dueToday, overdue } = await documents.duesToday(scope, today, profile.defaultPaymentTermsDays ?? 0);
    out.push({
      businessId: b.businessId,
      dueToday: dueToday.length,
      overdue: overdue.length,
      duePaise: [...dueToday, ...overdue].reduce((s, r) => s + r.balance.duePaise, 0),
    });
  }
  return out;
}
