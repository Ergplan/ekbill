'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { t } from '@ekbill/copy';
import { formatDateShort } from '@ekbill/engine';
import { Card, Field, HeroPanel, IconChip, Input, Meta, OutlineButton, PrimaryCTA, Stack } from '@ekbill/ui';

import { claimPlanPayment } from '../../actions/plan';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { PlanData } from './data';
import { manifest } from './manifest';

const rupees = (paise: number) => String(Math.round(paise / 100));

/**
 * Aapka plan (20 Oct): where the business stands with EkBill's own fee (20 bills free, then ₹20 a month), paying it
 * by UPI (the owner's UPI app opens with the amount; the 12-digit reference starts the month), and the referral
 * link that makes a month 25 % cheaper for each friend who joins and bills.
 */
export function PlanScreen({ data, viewer }: { data: PlanData; viewer: ShellViewer }) {
  const router = useRouter();
  const [utr, setUtr] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [done, setDone] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const owner = viewer.role === 'owner';
  const s = data.state;
  const fee = rupees(data.monthlyPaise);

  const hero =
    s.kind === 'free'
      ? { title: t('plan.free.title', { left: s.freeLeft }), sub: t('plan.free.sub', { free: data.freeBills, fee }) }
      : s.kind === 'comp'
        ? { title: t('plan.comp.title'), sub: t('plan.comp.sub', { date: formatDateShort(s.until) }) }
        : s.kind === 'paid'
          ? {
              title: t('plan.paid.title'),
              sub: `${t('plan.paid.sub', { date: formatDateShort(s.until) })}${s.claimed ? ` ${t('plan.paid.checking')}` : ''}`,
            }
          : { title: t('plan.due.title'), sub: t('plan.due.sub', { fee }) };

  const claim = async () => {
    if (busy) return;
    setBusy(true);
    setError(undefined);
    const r = await claimPlanPayment({ utr }).catch(() => ({ ok: false as const, error: 'error.generic' }));
    setBusy(false);
    if (!r.ok) {
      setError(t(r.error));
      return;
    }
    setUtr('');
    setDone(t('plan.claimed', { date: formatDateShort(r.value.periodEnd) }));
    router.refresh();
  };

  const share = data.referral
    ? `https://wa.me/?text=${encodeURIComponent(t('plan.refer.message', { link: data.referral.link }))}`
    : null;

  return (
    <AppShell viewer={viewer} tab="you" back="/aap" title={t('plan.title')} tour={manifest.tour}>
      <HeroPanel
        eyebrow={t('plan.title')}
        title={hero.title}
        sub={hero.sub}
        chip={t('plan.count', { n: Math.min(data.billsIssued, data.freeBills), free: data.freeBills })}
        guide="status"
      />

      <Card title={t('plan.pay.title', { amount: rupees(data.next.amountPaise) })} action={<IconChip name="receipt" />}>
        <div data-guide="pay">
          <Stack>
            {!owner ? (
              <Meta>{t('plan.ownerOnly')}</Meta>
            ) : !data.pay ? (
              <Meta>{t('plan.off')}</Meta>
            ) : (
              <>
                <Meta>
                  {t('plan.pay.sub', {
                    start: formatDateShort(data.next.periodStart),
                    end: formatDateShort(data.next.periodEnd),
                  })}
                </Meta>
                {data.next.discountPaise ? (
                  <p className="eb-plan__discount">
                    {t('plan.pay.discount', { off: rupees(data.next.discountPaise) })}
                  </p>
                ) : null}
                <PrimaryCTA onClick={() => window.location.assign(data.pay!.link)}>
                  {t('plan.pay.cta', { amount: rupees(data.next.amountPaise) })}
                </PrimaryCTA>
                {data.pay.qr ? (
                  <figure className="eb-plan__qr">
                    <img src={data.pay.qr} alt="" width={160} height={160} />
                    <figcaption className="eb-meta">{t('plan.pay.qr')}</figcaption>
                  </figure>
                ) : null}
                <Meta>{t('plan.pay.to', { vpa: data.pay.vpa, note: data.pay.note })}</Meta>
                <Field id="utr" label={t('plan.utr.label')} hint={t('plan.utr.hint')} error={error}>
                  <Input
                    id="utr"
                    numeric
                    inputMode="numeric"
                    maxLength={16}
                    value={utr}
                    onChange={(e) => {
                      setError(undefined);
                      setDone(null);
                      setUtr(e.target.value);
                    }}
                  />
                </Field>
                <OutlineButton
                  data-guide="utr"
                  disabled={busy || utr.replace(/\D/g, '').length !== 12}
                  onClick={() => void claim()}
                >
                  {t('plan.utr.done')}
                </OutlineButton>
                {done ? (
                  <p className="eb-meta" role="status" data-testid="plan-claimed">
                    {done}
                  </p>
                ) : null}
              </>
            )}
          </Stack>
        </div>
      </Card>

      {data.referral ? (
        <Card title={t('plan.refer.title')} action={<IconChip name="send" />}>
          <div data-guide="refer">
            <Stack>
              <Meta>{t('plan.refer.sub')}</Meta>
              <p className="eb-plan__link" data-testid="referral-link">
                {data.referral.link}
              </p>
              <div className="eb-actions">
                <OutlineButton onClick={() => window.open(share!, '_blank', 'noopener')}>
                  {t('plan.refer.share')}
                </OutlineButton>
                <OutlineButton
                  onClick={() =>
                    void navigator.clipboard
                      ?.writeText(data.referral!.link)
                      .then(() => setCopied(true))
                      .catch(() => undefined)
                  }
                >
                  {copied ? t('plan.refer.copied') : t('plan.refer.copy')}
                </OutlineButton>
              </div>
              <Meta>
                {t('plan.refer.stats', {
                  joined: data.referral.joined,
                  earned: data.referral.earned,
                  left: data.referral.creditsLeft,
                })}
              </Meta>
            </Stack>
          </div>
        </Card>
      ) : null}

      {data.payments.length ? (
        <Card title={t('plan.history')}>
          <ul className="eb-plan__history">
            {data.payments.map((p) => (
              <li key={p.id}>
                <span>
                  {formatDateShort(p.periodStart)} – {formatDateShort(p.periodEnd)}
                </span>
                <span className="eb-num">₹{rupees(p.amountPaise)}</span>
                <span className={`eb-plan__status eb-plan__status--${p.status}`}>{t(`plan.status.${p.status}`)}</span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </AppShell>
  );
}
