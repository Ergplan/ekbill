import { formatRupees } from '@ekbill/ui';

/** "₹6,200" for whole rupees, "₹6,200.50" otherwise; the owner's eye wants no paise on round sums. */
export function rupees(paise: number): string {
  return `₹${formatRupees(paise, { whole: paise % 100 === 0 })}`;
}
