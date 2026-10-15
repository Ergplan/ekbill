'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { taxLines, type BillDraft, type Computed } from '../bill/compute';
import { longDate } from '../fixtures';
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
  customer: { id: string; name: string; gstin: string | null } | null;
}

export function BillDoneScreen({
  fallback,
  share: shareDefault,
  viewer,
}: {
  fallback: PaperData;
  share: 'pdf' | 'jpg';
  viewer: ShellViewer;
}) {
  const router = useRouter();
  const as = (href: string) => (viewer.as ? `${href}${href.includes('?') ? '&' : '?'}as=${viewer.as}` : href);
  const [issued] = useDraft<Issued | null>('issued', null);
  const [share, setShare] = useState<'pdf' | 'jpg'>(shareDefault);
  const [paperSize, setPaperSize] = useState<'A4' | 'A5' | '80mm' | '58mm'>('A4');
  const [sizeOpen, setSizeOpen] = useState(false);
  const [sent, setSent] = useState(false);
  const customerId = issued?.customer?.id ?? null;
  const paper = useMemo<PaperData>(() => {
    if (!issued) return fallback;
    const { draft, computed, business, customer } = issued;
    const bos = business.registration === 'composition';
    return {
      title: bos
        ? t('paper.bos', undefined, 'en')
        : business.gstin
          ? t('paper.tax', undefined, 'en')
          : t('paper.plain', undefined, 'en'),
      seller: { name: business.name, gstin: business.gstin, address: business.address },
      number: draft.number,
      date: longDate(draft.date),
      customer: { name: customer?.name ?? draft.customerName, gstin: customer?.gstin ?? null },
      lines: computed.lines
        .filter((l) => l.what.trim())
        .map((l) => ({ description: l.what, qty: l.qty, rate: l.ratePaise, amount: l.amountPaise })),
      taxLines: taxLines(computed, business.stateCode, draft.customerState),
      totalPaise: computed.totalPaise,
      upiId: business.upi,
      legend: bos ? t('paper.bos.legend', undefined, 'en') : null,
    };
  }, [issued, fallback]);

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
        <WhatsAppButton onClick={() => setSent(true)} aria-pressed={sent}>
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
      </div>
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
