import type { LineDraft } from './bill-form';
import { compareDates, daysBetween, type CivilDate } from './dates';

/**
 * The checks around a bill that an owner with paper would do by memory:
 * "didn't I bill them this already?", "wasn't it 3,500 last time, not
 * 350?". Salvaged from the MVP (src/lib/domain/bill-guard.ts, tag
 * mvp-final); the numbering parts moved to numbering.ts. Pure, so every
 * check is tested on its own and the screens only ask.
 */
export interface RecentBill {
  id: string;
  number: string | null;
  status: 'draft' | 'issued' | 'cancelled';
  issueDate: CivilDate;
  customerId: string | null;
  customerName: string;
  totalPaise: number;
}
export interface DuplicateHit {
  id: string;
  number: string;
  issueDate: CivilDate;
  totalPaise: number;
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/\(sample\)/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * A bill that looks like this one, already issued to the same customer for
 * the same amount within the last week. The owner is asked, not blocked:
 * two identical jobs in a week do happen.
 */
export function findDuplicate(
  candidate: { customerId: string | null; customerName: string; totalPaise: number; today: CivilDate },
  recent: readonly RecentBill[],
  withinDays = 7,
): DuplicateHit | null {
  const hits = recent
    .filter((b) => b.status === 'issued' && b.number)
    .filter((b) =>
      candidate.customerId
        ? b.customerId === candidate.customerId
        : normName(b.customerName) === normName(candidate.customerName),
    )
    .filter((b) => b.totalPaise === candidate.totalPaise)
    .filter((b) => {
      const age = daysBetween(b.issueDate, candidate.today);
      return age >= 0 && age <= withinDays;
    })
    .sort((a, b) => compareDates(b.issueDate, a.issueDate));
  const hit = hits[0];
  return hit ? { id: hit.id, number: hit.number!, issueDate: hit.issueDate, totalPaise: hit.totalPaise } : null;
}

export interface RateOddity {
  what: string;
  lastRatePaise: number;
  nowRatePaise: number;
}
/** A line whose rate is four times more or a quarter of what the same thing cost last time is usually a missing or extra zero. Shown, not corrected. */
export function rateOddities(
  lines: readonly LineDraft[],
  last: readonly { description: string; unitPricePaise: number }[],
): RateOddity[] {
  const key = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const out: RateOddity[] = [];
  for (const line of lines) {
    const rupees = Number(line.rate.replace(/,/g, ''));
    if (!line.what.trim() || !Number.isFinite(rupees) || rupees <= 0) continue;
    const nowPaise = Math.round(rupees * 100);
    const prior = last.find((l) => key(l.description) === key(line.what) && l.unitPricePaise > 0);
    if (!prior) continue;
    const ratio = nowPaise / prior.unitPricePaise;
    if (ratio >= 4 || ratio <= 0.25)
      out.push({ what: line.what, lastRatePaise: prior.unitPricePaise, nowRatePaise: nowPaise });
  }
  return out;
}

/**
 * A credit note for part of a bill reduces the taxable value and each tax
 * head in the bill's own proportion, so the GST summary stays consistent
 * with the bill it corrects. Rounded to the paisa; the remainder lands on
 * the taxable value so the parts add up to the note.
 */
export function proportionalCredit(
  totals: { totalPaise: number; cgstPaise: number; statePaise: number; igstPaise: number; cessPaise: number },
  amountPaise: number,
): { taxablePaise: number; cgstPaise: number; statePaise: number; igstPaise: number; cessPaise: number } {
  const grand = totals.totalPaise;
  if (grand <= 0 || amountPaise <= 0)
    return { taxablePaise: amountPaise, cgstPaise: 0, statePaise: 0, igstPaise: 0, cessPaise: 0 };
  const share = (part: number) => Math.round((part * amountPaise) / grand);
  const cgstPaise = share(totals.cgstPaise);
  const statePaise = share(totals.statePaise);
  const igstPaise = share(totals.igstPaise);
  const cessPaise = share(totals.cessPaise);
  return {
    taxablePaise: amountPaise - cgstPaise - statePaise - igstPaise - cessPaise,
    cgstPaise,
    statePaise,
    igstPaise,
    cessPaise,
  };
}
