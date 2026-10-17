import { afterAll, describe, expect, it } from 'vitest';

import type { IssuedSnapshot } from '../../packages/engine/src/index';
import * as businesses from '../../packages/db/src/repos/businesses';
import * as documentFiles from '../../packages/db/src/repos/document-files';
import * as documents from '../../packages/db/src/repos/documents';
import { withTenant } from '../../packages/db/src/scope';
import { browserPath, closeRenderer, renderBillHtml } from '../../packages/render/src/index';
import { printAndKeep } from '../../packages/render/src/print';
import { scopeFor, seeded } from './helpers';

/**
 * The printed bill (Stage 6): the key strings on the paper, the page size
 * per paper, the issue-time budget (3 s), and that a kept file never
 * changes: printing the same bill again gives the same bytes back.
 */
seeded();
afterAll(() => closeRenderer());

const hasBrowser = Boolean(browserPath());

/** Points of a PDF's first page, from its MediaBox (1 mm = 72 / 25.4 pt). */
function mediaBox(pdf: Buffer): { width: number; height: number } {
  const m = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(pdf.toString('latin1'));
  if (!m) throw new Error('no MediaBox');
  return { width: Number(m[1]), height: Number(m[2]) };
}
const mm = (pt: number) => (pt * 25.4) / 72;

async function seededBill(number: string) {
  const owner = await scopeFor('sharma', 'owner');
  const id = (await documents.findBill(owner, number))!;
  return { owner, doc: await documents.getDocument(owner, id) };
}

describe('the bill on paper', () => {
  it('prints the issued snapshot: title, number, seller, buyer, totals, "For" and the signatory', async () => {
    const { doc } = await seededBill('INV-031');
    const html = renderBillHtml({
      snapshot: doc.issuedSnapshot as IssuedSnapshot,
      number: doc.number!,
      look: { design: 'classic', paper: 'a4', accent: '#c2410c' },
    });
    for (const s of [
      'TAX INVOICE',
      'INV-031',
      'Sharma Electricals',
      '27AAAAA0000A1Z2',
      'Mehta Traders',
      '7,316.00',
      'For Sharma Electricals',
      'Authorised signatory',
    ])
      expect(html).toContain(s);
    // A bill of supply carries the legend and no tax line.
    const gupta = await scopeFor('gupta', 'owner');
    const bos = await documents.getDocument(gupta, (await documents.findBill(gupta, 'BOS-020'))!);
    const bosHtml = renderBillHtml({
      snapshot: bos.issuedSnapshot as IssuedSnapshot,
      number: bos.number!,
      look: { design: 'simple', paper: 'a5', accent: '#0f766e' },
    });
    expect(bosHtml).toContain('BILL OF SUPPLY');
    expect(bosHtml).toMatch(/composition taxable person/i);
    expect(bosHtml).not.toMatch(/CGST|SGST|IGST/);
  });

  it.skipIf(!hasBrowser)('makes a PDF of the right size for each paper, and a JPEG', { timeout: 60_000 }, async () => {
    const { owner, doc } = await seededBill('INV-032');
    const a4 = await printAndKeep(owner, { documentId: doc.id, kind: 'pdf', paper: 'a4' });
    expect(a4.bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(Math.round(mm(mediaBox(a4.bytes).width))).toBe(210);
    expect(Math.round(mm(mediaBox(a4.bytes).height))).toBe(297);
    const a5 = await printAndKeep(owner, { documentId: doc.id, kind: 'pdf', paper: 'a5' });
    expect(Math.round(mm(mediaBox(a5.bytes).width))).toBe(148);
    expect(Math.round(mm(mediaBox(a5.bytes).height))).toBe(210);
    for (const [paper, width] of [
      ['80mm', 80],
      ['58mm', 58],
    ] as const) {
      const roll = await printAndKeep(owner, { documentId: doc.id, kind: 'pdf', paper });
      const box = mediaBox(roll.bytes);
      expect(Math.round(mm(box.width))).toBe(width);
      expect(box.height).toBeGreaterThan(box.width); // a roll is as long as the bill
    }
    const jpg = await printAndKeep(owner, { documentId: doc.id, kind: 'jpg', paper: 'a4' });
    expect([...jpg.bytes.subarray(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
    const kept = await documentFiles.renderingsOf(owner, doc.id);
    expect(kept.map((f) => `${f.kind}:${f.paper}`).sort()).toEqual(
      ['jpg:a4', 'pdf:58mm', 'pdf:80mm', 'pdf:a4', 'pdf:a5'].sort(),
    );
  });

  it.skipIf(!hasBrowser)('prints at issue within the 3 s budget (a warm renderer)', { timeout: 60_000 }, async () => {
    const owner = await scopeFor('sharma', 'staff');
    const draft = await documents.createDraft(owner, {
      customer: { name: 'Budget Check', stateCode: '27' },
      dateIso: '2026-10-15',
      lines: [
        { description: 'Panel repair', quantityMilli: 1000, unitPricePaise: 250000, gstBp: 1800, taxRateChosen: true },
      ],
    });
    const issued = await documents.issueDocument(owner, { id: draft.id, today: '2026-10-15' });
    const t0 = Date.now();
    const file = await printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a4' });
    const ms = Date.now() - t0;
    expect(file.size).toBeGreaterThan(1000);
    expect(ms).toBeLessThan(3000);
  });

  it.skipIf(!hasBrowser)(
    'never changes a kept file: the same bytes come back, and the row refuses a change',
    { timeout: 60_000 },
    async () => {
      const { owner, doc } = await seededBill('INV-033');
      const first = await printAndKeep(owner, { documentId: doc.id, kind: 'pdf', paper: 'a4' });
      const second = await printAndKeep(owner, { documentId: doc.id, kind: 'pdf', paper: 'a4' });
      expect(second.id).toBe(first.id);
      expect(second.sha256).toBe(first.sha256);
      expect(Buffer.compare(second.bytes, first.bytes)).toBe(0);
      // A second store of the same combination keeps the first file.
      const again = await documentFiles.storeRendering(owner, {
        documentId: doc.id,
        kind: 'pdf',
        paper: 'a4',
        design: first.design,
        bytes: new TextEncoder().encode('%PDF-1.4 something else'),
      });
      expect(again.sha256).toBe(first.sha256);
      await expect(
        withTenant(owner, ({ client }) =>
          client.query("update document_files set bytes = 'x'::bytea where id = $1", [first.id]),
        ),
      ).rejects.toThrow(/never changed/);
      // The accountant reads a size nobody printed yet: kept, so their next download is the same file and no new
      // render (Stage 11 review: each of their downloads started Chromium again).
      const accountant = await scopeFor('sharma', 'accountant');
      const before = (await documentFiles.renderingsOf(owner, doc.id)).length;
      const read = await printAndKeep(accountant, { documentId: doc.id, kind: 'jpg', paper: '58mm' });
      expect(read.bytes.length).toBeGreaterThan(1000);
      expect((await documentFiles.renderingsOf(owner, doc.id)).length).toBe(before + 1);
      expect((await printAndKeep(accountant, { documentId: doc.id, kind: 'jpg', paper: '58mm' })).id).toBe(read.id);
    },
  );

  // Found by CI, where a role probe had left Sharma on the modern design: the kept file was looked for under
  // 'classic', so every share and download of a business on another design printed afresh.
  it.skipIf(!hasBrowser)(
    'keeps and reuses the file of a business on a design other than classic',
    { timeout: 60_000 },
    async () => {
      const owner = await scopeFor('sharma', 'owner');
      const before = (await businesses.getProfile(owner)).look.design;
      await businesses.setLook(owner, { design: 'modern' });
      try {
        const draft = await documents.createDraft(owner, {
          customer: { name: 'Modern Look', stateCode: '27' },
          dateIso: '2026-10-15',
          lines: [
            { description: 'Fan', quantityMilli: 1000, unitPricePaise: 150000, gstBp: 1800, taxRateChosen: true },
          ],
        });
        const issued = await documents.issueDocument(owner, { id: draft.id, today: '2026-10-15' });
        const first = await printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a4' });
        const second = await printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a4' });
        expect(first.design).toBe('modern');
        expect(second.id).toBe(first.id);
        expect(Buffer.compare(second.bytes, first.bytes)).toBe(0);
      } finally {
        await businesses.setLook(owner, { design: before });
      }
    },
  );

  it.skipIf(!hasBrowser)(
    'two prints at once of a file not kept yet give the one kept file, bytes and all',
    { timeout: 60_000 },
    async () => {
      const owner = await scopeFor('sharma', 'owner');
      const draft = await documents.createDraft(owner, {
        customer: { name: 'Two Taps', stateCode: '27' },
        dateIso: '2026-10-15',
        lines: [
          { description: 'Socket', quantityMilli: 1000, unitPricePaise: 30000, gstBp: 1800, taxRateChosen: true },
        ],
      });
      const issued = await documents.issueDocument(owner, { id: draft.id, today: '2026-10-15' });
      const [a, b] = await Promise.all([
        printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a5' }),
        printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a5' }),
      ]);
      const kept = (await documentFiles.findRendering(owner, {
        documentId: issued.id,
        kind: 'pdf',
        paper: 'a5',
        design: a.design,
      }))!;
      for (const got of [a, b]) {
        expect(got.id).toBe(kept.id);
        expect(Buffer.compare(got.bytes, kept.bytes)).toBe(0);
      }
    },
  );

  // Stage 11 review: a cancelled bill downloaded (and went into the CA pack) as the clean tax invoice kept at issue.
  it.skipIf(!hasBrowser)(
    'prints a cancelled bill afresh, marked, and keeps nothing of it',
    { timeout: 60_000 },
    async () => {
      const owner = await scopeFor('sharma', 'owner');
      const draft = await documents.createDraft(owner, {
        customer: { name: 'Cancel Me', stateCode: '27' },
        dateIso: '2026-10-15',
        lines: [{ description: 'Gate', quantityMilli: 1000, unitPricePaise: 90000, gstBp: 1800, taxRateChosen: true }],
      });
      const issued = await documents.issueDocument(owner, { id: draft.id, today: '2026-10-15' });
      const kept = await printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a4' });
      await documents.cancelDocument(owner, { id: issued.id, reason: 'Wrong customer' });
      const after = await printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a4' });
      expect(after.id).toBe(''); // not kept
      expect(after.sha256).not.toBe(kept.sha256);
      expect((await documentFiles.renderingsOf(owner, issued.id)).map((f) => f.id)).toEqual([kept.id]);
    },
  );
});

// Stage 6 review (I2): a later change of look reprinted old bills in it.
describe('a bill prints in the look it was issued with', () => {
  it.skipIf(!hasBrowser)(
    'a change of design and accent after issue leaves the bill as it was',
    { timeout: 60_000 },
    async () => {
      const owner = await scopeFor('sharma', 'owner');
      const before = (await businesses.getProfile(owner)).look;
      await businesses.setLook(owner, { design: 'classic', accent: '#2f4a9e' });
      try {
        const draft = await documents.createDraft(owner, {
          customer: { name: 'Look Kept', stateCode: '27' },
          dateIso: '2026-10-15',
          lines: [
            { description: 'Panel', quantityMilli: 1000, unitPricePaise: 50000, gstBp: 1800, taxRateChosen: true },
          ],
        });
        const issued = await documents.issueDocument(owner, { id: draft.id, today: '2026-10-15' });
        expect((issued.issuedSnapshot as IssuedSnapshot).seller.look).toEqual({ design: 'classic', accent: '#2f4a9e' });
        await businesses.setLook(owner, { design: 'modern', accent: '#b4232a' });
        const printed = await printAndKeep(owner, { documentId: issued.id, kind: 'pdf', paper: 'a5' });
        expect(printed.design).toBe('classic');
      } finally {
        await businesses.setLook(owner, before);
      }
    },
  );
});

// Stage 6 review: a render job in an accountant's name ran as staff and kept files.
describe('render-other-sizes in an accountant’s name', () => {
  it('is not acted on, and keeps nothing', async () => {
    const { runRenderOtherSizes } = await import('../../apps/worker/src/bills/jobs');
    const { owner, doc } = await seededBill('INV-031');
    const accountant = await scopeFor('sharma', 'accountant');
    const before = (await documentFiles.renderingsOf(owner, doc.id)).length;
    expect(
      await runRenderOtherSizes({
        documentId: doc.id,
        businessId: accountant.businessId,
        userId: accountant.userId,
        role: 'accountant',
        requestId: 'render-accountant',
      }),
    ).toBe(0);
    expect((await documentFiles.renderingsOf(owner, doc.id)).length).toBe(before);
  });
});
