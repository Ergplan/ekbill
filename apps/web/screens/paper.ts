import { t } from '@ekbill/copy';
import type { PaperData } from '@ekbill/ui';

import type { Bill, Business, Customer } from './fixtures';
import { longDate } from './fixtures';

/** The InvoicePaper data for a fixture bill: English, the document kind by registration (I5 arrives in Stage 3). */
export function paperOfBill(
  business: Business,
  bill: Bill,
  customer: Customer | null,
  extraTax?: Array<{ label: string; paise: number }>,
): PaperData {
  const bos = bill.kind === 'bill-of-supply';
  const taxLines =
    bos || !bill.gstPaise
      ? []
      : (extraTax ?? [
          { label: 'CGST', paise: Math.round(bill.gstPaise / 2) },
          { label: 'SGST', paise: bill.gstPaise - Math.round(bill.gstPaise / 2) },
        ]);
  return {
    title: bos
      ? t('paper.bos', undefined, 'en')
      : business.gstin
        ? t('paper.tax', undefined, 'en')
        : t('paper.plain', undefined, 'en'),
    seller: {
      name: business.name,
      gstin: business.gstin,
      address: [business.address, business.city].filter(Boolean).join(', '),
    },
    number: bill.number,
    date: longDate(bill.date),
    customer: { name: customer?.name ?? bill.customer, gstin: customer?.gstin ?? null },
    lines: bill.lines.map((l) => ({
      description: l.what,
      qty: String(l.qty),
      rate: l.ratePaise,
      amount: l.amountPaise,
    })),
    taxLines,
    totalPaise: bill.totalPaise,
    upiId: business.upi,
    legend: bos ? t('paper.bos.legend', undefined, 'en') : null,
  };
}
