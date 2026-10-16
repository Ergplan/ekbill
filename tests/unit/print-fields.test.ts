import { describe, expect, it } from 'vitest';

import { prepareIssue, type IssueBusiness, type IssueCustomer } from '../../packages/engine/src/issue';
import { renderBillHtml } from '../../packages/render/src/template';

/**
 * What Rules 46 and 53 ask a tax invoice and a credit note to say, on every
 * paper: the place of supply by name and code, whether tax is payable on
 * reverse charge, and on the counter receipt too the HSN of each line, the
 * buyer's address and State, and the date of the invoice a note corrects.
 */
const seller: IssueBusiness = {
  registration: 'regular',
  gstin: '27AAAAA0000A1Z2',
  stateCode: '27',
  turnoverPaise: 5000000000,
  eInvoiceSelfDeclaredNotApplicable: true,
  legalName: 'Sharma Electricals',
  tradeName: 'Sharma Electricals',
  address: '12, Dharampeth',
  city: 'Nagpur',
  phone: null,
  upi: null,
};
const buyer: IssueCustomer = {
  id: 'patel',
  name: 'Patel Stores',
  gstin: '24AABCP1234C1Z5',
  stateCode: '24',
  address: '4, Relief Road, Ahmedabad',
  phone: null,
};
const line = {
  description: 'Panel repair',
  quantityMilli: 2000,
  unitPricePaise: 100000,
  gstBp: 1800,
  taxRateChosen: true,
  hsnCode: '998719',
  unit: 'visit',
};

function snapshot(kind: 'bill' | 'credit-note', gstOn = true) {
  const r = prepareIssue(
    {
      kind,
      dateIso: '2026-09-24',
      gstOn,
      placeOfSupplyStateCode: '24',
      lines: [line],
      linkedInvoice: kind === 'credit-note' ? { id: 'inv', number: 'INV-045', dateIso: '2026-09-02' } : null,
    },
    seller,
    buyer,
    undefined,
    '2026-10-15',
  );
  if (!r.ok) throw new Error(r.blockers.map((b) => b.code).join(', '));
  return r.snapshot;
}
const print = (kind: 'bill' | 'credit-note', paper: 'a4' | 'a5' | '80mm' | '58mm', gstOn = true) =>
  renderBillHtml({
    snapshot: snapshot(kind, gstOn),
    number: kind === 'bill' ? 'INV-046' : 'CN-001',
    look: { design: 'classic', paper, accent: '#2f4a9e' },
  });

describe('the fields a GST document prints', () => {
  it.each(['a4', 'a5', '80mm', '58mm'] as const)(
    'a tax invoice on %s: place of supply with its code, and reverse charge',
    (paper) => {
      const html = print('bill', paper);
      expect(html).toContain('Gujarat (24)');
      expect(html).toContain('Tax payable on reverse charge: No');
      expect(html).toContain('HSN/SAC 998719');
      expect(html).toContain('2 visit');
    },
  );
  it.each(['a4', '80mm', '58mm'] as const)('a credit note on %s names the invoice and its date', (paper) => {
    const html = print('credit-note', paper);
    expect(html).toContain('Tax payable on reverse charge: No');
    expect(html).toMatch(/Against invoice (<strong>)?INV-045(<\/strong>)? dated 02/);
  });
  it.each(['80mm', '58mm'] as const)('the %s receipt carries the buyer’s address and State', (paper) => {
    const html = print('bill', paper);
    expect(html).toContain('4, Relief Road, Ahmedabad');
    expect(html).toContain('Place of supply: Gujarat (24)');
  });
  it('a bill without GST says nothing about reverse charge', () => {
    for (const paper of ['a4', '80mm'] as const) expect(print('bill', paper, false)).not.toContain('reverse charge');
  });
});
