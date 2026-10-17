'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  ChoiceList,
  GhostButton,
  InvoicePaper,
  Meta,
  OutlineButton,
  Segmented,
  ShareToggle,
  Sheet,
  SuccessHeader,
  WhatsAppButton,
  type PaperData,
} from '@ekbill/ui';

import { useDraft } from '../draft';
import { rupees } from '../money';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { BillDraft, Computed } from '../bill/compute';
import { longDate } from '../fixtures';
import { billFileName } from '../links';
import { billFileUrl, handoffToWhatsApp, handoffWithFile, prefetchFile } from '../share';
import type { BillDoneData } from './data';
import { manifest } from './manifest';

interface Issued {
  draft: BillDraft;
  computed: Computed;
  business: {
    name: string;
    registration: string;
    stateCode: string | null;
    gstin: string | null;
    upi: string | null;
    address: string | null;
  };
  customer: { id: string | null; name: string; gstin: string | null; phone?: string | null } | null;
}

type Size = 'A4' | 'A5' | '80mm' | '58mm';
const SIZE_OF: Record<string, Size> = { a4: 'A4', a5: 'A5', '80mm': '80mm', '58mm': '58mm' };

export function BillDoneScreen({
  fallback,
  share: shareDefault,
  live,
  viewer,
}: {
  fallback: PaperData;
  share: 'pdf' | 'jpg';
  /** The issued bill (Stage 6): its paper and its file; null for a look at the prototype. */
  live: BillDoneData['live'];
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [stored] = useDraft<Issued | null>(`${viewer.personId}:issued`, null);
  const issued = live ? null : stored;
  const [share, setShare] = useState<'pdf' | 'jpg'>(shareDefault);
  const [paperSize, setPaperSize] = useState<Size>(live ? (SIZE_OF[live.paperSize] ?? 'A4') : 'A4');
  const [fileError, setFileError] = useState(false);
  const [sizeOpen, setSizeOpen] = useState(false);
  const [sent, setSent] = useState(false);
  // The file is fetched while the owner reads the bill, so the share tap hands it over at once (Stage 6 review).
  useEffect(() => {
    if (live) void prefetchFile(billFileUrl(live.documentId, share, paperSize));
  }, [live, share, paperSize]);
  const customerId = live ? live.customerId : (issued?.customer?.id ?? null);
  const paper = useMemo<PaperData>(() => {
    if (live) return live.paper;
    if (!issued) return fallback;
    const { draft, computed, business, customer } = issued;
    const kind = computed.documentKind;
    return {
      title:
        kind === 'bill-of-supply'
          ? t('paper.bos', undefined, 'en')
          : kind === 'tax-invoice'
            ? t('paper.tax', undefined, 'en')
            : t('paper.plain', undefined, 'en'),
      seller: { name: business.name, gstin: business.gstin, address: business.address },
      number: draft.number,
      date: longDate(draft.date),
      customer: { name: customer?.name ?? draft.customerName, gstin: customer?.gstin ?? null },
      lines: computed.lines
        .filter((l) => !l.blank)
        .map((l) => ({
          description: l.description,
          qty: String(l.quantityMilli / 1000),
          rate: l.unitPricePaise,
          amount: l.taxablePaise,
        })),
      taxLines: computed.heads,
      totalPaise: computed.totalPaise,
      upiId: business.upi,
      legend: kind === 'bill-of-supply' ? t('paper.bos.legend', undefined, 'en') : null,
    };
  }, [issued, fallback, live]);
  const fileName = billFileName(paper.number, share);

  return (
    <AppShell viewer={viewer} tab="bills" tour={manifest.tour} noTabs>
      <SuccessHeader
        title={t('done.title')}
        sub={t('done.sub', { number: paper.number, customer: paper.customer.name, amount: rupees(paper.totalPaise) })}
      />
      <div data-guide="paper">
        <InvoicePaper data={paper} />
      </div>
      <div className="eb-sticky eb-sticky--bare" data-guide="whatsapp">
        <WhatsAppButton
          onClick={() => {
            const text = t('done.wa.text', {
              customer: paper.customer.name,
              business: paper.seller.name,
              title: paper.title,
              number: paper.number,
              amount: rupees(paper.totalPaise),
            });
            setFileError(false);
            const handoff = live
              ? handoffWithFile({
                  phone: live.customerPhone,
                  title: `${paper.title} ${paper.number}`,
                  text,
                  file: {
                    url: billFileUrl(live.documentId, share, paperSize),
                    name: fileName,
                    type: share === 'pdf' ? 'application/pdf' : 'image/jpeg',
                  },
                })
              : handoffToWhatsApp({
                  phone: issued?.customer?.phone ?? null,
                  title: `${paper.title} ${paper.number}`,
                  text,
                });
            void handoff.then((r) => {
              if (r === 'failed') setFileError(true);
              else if (r !== 'cancelled') setSent(true);
            });
          }}
          aria-pressed={sent}
        >
          {sent ? t('done.sent') : t('action.whatsapp')}
        </WhatsAppButton>
      </div>
      <div className="eb-actions" data-guide="share">
        <ShareToggle
          value={share}
          onChange={setShare}
          labels={{ pdf: t('done.share.pdf'), jpg: t('done.share.jpg'), group: t('done.share.group') }}
        />
        <OutlineButton data-guide="size" onClick={() => setSizeOpen(true)}>
          {t('done.size')} · {paperSize}
        </OutlineButton>
        {live ? (
          <a
            className="eb-btn eb-btn--ghost"
            href={billFileUrl(live.documentId, share, paperSize, true)}
            download={fileName}
          >
            {t('view.download')}
          </a>
        ) : null}
      </div>
      {fileError ? (
        <p className="eb-meta" role="alert">
          {t('done.file.error')}
        </p>
      ) : null}
      <Meta>{t('bill.registers')}</Meta>
      <div className="eb-actions">
        <GhostButton data-guide="home" onClick={() => router.push(as('/'))}>
          {t('done.home')}
        </GhostButton>
        <GhostButton
          data-guide="again"
          onClick={() => router.push(as(customerId ? `/bills/new?customer=${customerId}` : '/bills/new'))}
        >
          {t('done.again')}
        </GhostButton>
      </div>
      <Sheet
        open={sizeOpen}
        title={t('done.size.q')}
        onClose={() => setSizeOpen(false)}
        closeLabel={t('action.cancel')}
      >
        <ChoiceList<'A4' | 'A5' | '80mm' | '58mm'>
          label={t('done.size.q')}
          value={paperSize}
          onChoose={(v) => {
            setPaperSize(v);
            setSizeOpen(false);
          }}
          choices={[
            { value: 'A4', label: t('done.size.a4') },
            { value: 'A5', label: t('done.size.a5') },
            { value: '80mm', label: t('done.size.80') },
            { value: '58mm', label: t('done.size.58') },
          ]}
        />
        <Segmented<'pdf' | 'jpg'>
          label={t('done.share.group')}
          value={share}
          onChange={setShare}
          options={[
            { value: 'pdf', label: 'PDF' },
            { value: 'jpg', label: t('done.share.jpg') },
          ]}
        />
      </Sheet>
    </AppShell>
  );
}
