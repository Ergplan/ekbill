import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

import { localeOf, t, type Locale } from '@ekbill/copy';
import { customers } from '@ekbill/db';
import { formatDateShort, formatMoneyIndian, type IssuedSnapshot } from '@ekbill/engine';
import { Display, Logo, Meta } from '@ekbill/ui';

import { upiLink } from '../../../screens/plan/data';
import { openBill } from '../../../server/bill-link';
import { logRequest } from '../../../server/log';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * The bill as the customer opens it from WhatsApp (20 Oct): no sign-in, no app around it, only this one bill. The
 * picture of the bill, its PDF, and the shop's UPI to pay by (not for a cancelled bill or a credit note). In the
 * customer's own language when the shop has said it; else Hinglish.
 */
export default async function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const id = (await headers()).get('x-request-id') ?? 'bill-link';
  const opened = await openBill(token, id);
  logRequest('GET /b/[token]', id, { found: Boolean(opened) });
  if (!opened) notFound();
  const { scope, doc } = opened;
  const s = doc.issuedSnapshot as IssuedSnapshot;
  const customer = doc.customerId ? await customers.getCustomer(scope, doc.customerId).catch(() => null) : null;
  const lang: Locale = localeOf(customer?.language);
  const shop = s.seller.tradeName || s.seller.legalName;
  const amount = formatMoneyIndian(s.totals.totalPaise, { withSymbol: true });
  const cancelled = doc.status === 'cancelled';
  const estimate = s.kind === 'estimate';
  const pay =
    !cancelled && s.kind !== 'credit-note' && s.seller.upi
      ? upiLink(s.seller.upi, s.seller.legalName, s.totals.totalPaise, doc.number ?? '')
      : null;
  const file = (kind: 'pdf' | 'jpg', download = false) =>
    `/b/${encodeURIComponent(token)}/file?kind=${kind}&paper=a4${download ? '&download=1' : ''}`;
  return (
    <main className="eb-screen eb-public" data-testid="bill-link">
      <header className="eb-topbar">
        <Logo />
      </header>
      <div className="eb-screen__body">
        <section className="eb-heading">
          <Meta>{shop}</Meta>
          <Display as="h1" size="title">
            {t('link.title', { title: s.title, number: doc.number ?? '' }, lang)}
          </Display>
          <p className="eb-public__amount eb-num">{amount}</p>
          <Meta>{t('link.date', { date: formatDateShort(s.dateIso) }, lang)}</Meta>
          {cancelled ? (
            <p className="eb-meta" role="status">
              {t('link.cancelled', undefined, lang)}
            </p>
          ) : estimate ? (
            <p className="eb-meta" role="status">
              {t('link.estimate', undefined, lang)}
            </p>
          ) : null}
        </section>
        <div className="eb-actions eb-actions--stack">
          {pay ? (
            <a className="eb-btn eb-btn--accent" href={pay}>
              {t('link.pay', { amount }, lang)}
            </a>
          ) : null}
          <a className="eb-btn eb-btn--outline" href={file('pdf', true)}>
            {t('link.pdf', undefined, lang)}
          </a>
        </div>
        <figure className="eb-public__paper">
          <img src={file('jpg')} alt={t('link.title', { title: s.title, number: doc.number ?? '' }, lang)} />
        </figure>
        <Meta>{t('link.by', undefined, lang)}</Meta>
      </div>
    </main>
  );
}
