import { t } from '@ekbill/copy';
import { computeTax, supplyKind } from '@ekbill/engine';
import type { PaperData } from '@ekbill/ui';

import type { Bill, Business, Customer } from './fixtures';
import { longDate } from './fixtures';

/**
 * The InvoicePaper data for a fixture bill. The engine computes the heads
 * (CGST/SGST within the state, IGST across) and the document kind (I4, I5);
 * the fixture's stored totals are not trusted over it.
 */
export function paperOfBill(business: Business, bill: Bill, customer: Customer | null): PaperData {
  const tax = computeTax({
    lines: bill.lines.map((l) => ({
      description: l.what,
      quantityMilli: Math.round(l.qty * 1000),
      unitPricePaise: l.ratePaise,
      gstBp: (l.gstRate ?? 0) * 100,
    })),
    registration: business.registration,
    gstOn: bill.kind === 'tax-invoice',
    supply: supplyKind(business.stateCode, customer?.stateCode ?? null),
  });
  const bos = tax.documentKind === 'bill-of-supply';
  return {
    title: bos
      ? t('paper.bos', undefined, 'en')
      : tax.documentKind === 'tax-invoice'
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
    lines: tax.lines.map((l) => ({
      description: l.description,
      qty: String(l.quantityMilli / 1000),
      rate: l.unitPricePaise,
      amount: l.taxablePaise,
    })),
    taxLines: tax.heads,
    totalPaise: tax.totalPaise,
    upiId: business.upi,
    legend: bos ? t('paper.bos.legend', undefined, 'en') : null,
  };
}
