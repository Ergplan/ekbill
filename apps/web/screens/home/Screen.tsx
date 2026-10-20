'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import { t } from '@ekbill/copy';
import {
  AccentButton,
  AgeingIndicator,
  BillRow,
  Card,
  ClientChip,
  Display,
  GhostButton,
  Greeting,
  HeroPanel,
  IconChip,
  Meta,
  MoneyHero,
  NewCustomerChip,
  OutlineButton,
  OwedRow,
  PrimaryCTA,
  Sparkline,
  Stack,
} from '@ekbill/ui';

import { markDemoSeen } from '../../actions/user';
import { useDemo } from '../demo/DemoProvider';
import { useDraft } from '../draft';
import { rupees } from '../money';
import { billPath, withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { statusKey } from '../common';
import { manifest } from './manifest';
import type { HomeData } from './data';

export function HomeScreen({ data, viewer }: { data: HomeData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const [setup] = useDraft<{ name: string } | null>('setup', null);
  const shopName = data.kind === 'new' ? (data.businessName ?? setup?.name?.trim() ?? null) : null;
  // The app demo (20 Oct): offered once to a first-timer here after sign-in; a "naya kya hai" card for someone
  // already billing who has not seen this version of it.
  const demo = useDemo();
  // demoSeen is the session's own (a look or no session counts as seen), so a brand-new person with no business yet
  // (no scope, not "signedIn" for the voice) is still greeted.
  const firstRun = viewer.demoSeen === 0 && data.kind === 'new';
  const [whatsNew, setWhatsNew] = useState(
    !firstRun && viewer.demoSeen !== undefined && viewer.demoSeen < (viewer.demoVersion ?? 0),
  );
  useEffect(() => {
    if (!firstRun || !demo) return;
    try {
      if (sessionStorage.getItem('ekbill.demo.offered')) return;
      sessionStorage.setItem('ekbill.demo.offered', '1');
    } catch {
      // No storage: offer it anyway; the answer is kept on the server.
    }
    demo.offer();
    // Once, on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const newCard = whatsNew ? (
    <Card title={t('demo.new.title')} className="eb-card--demo">
      <div data-guide="demo">
        <Meta>{t('demo.new.sub')}</Meta>
        <div className="eb-actions">
          <AccentButton
            onClick={() => {
              setWhatsNew(false);
              demo?.start({ firstTime: false });
            }}
          >
            {t('aap.demo')}
          </AccentButton>
          <GhostButton
            onClick={() => {
              setWhatsNew(false);
              void markDemoSeen().catch(() => undefined);
            }}
          >
            {t('demo.new.later')}
          </GhostButton>
        </div>
      </div>
    </Card>
  ) : null;
  // The hello on arrival, by name once the person has said it (19 Oct: "Namaste Sharma ji" is for after sign-up;
  // before it, the hello alone and "Apne baare mein batao" is the star).
  // A name that already carries its "ji" (Sharma ji, Gupta ji) is not given a second one.
  const honoured = /(^|\s)(ji|जी)$/i.test(data.personName.trim())
    ? data.personName.trim()
    : t('greet.named', { name: data.personName.trim() });
  const greeting = viewer.named ? (
    <Greeting hello={t('home.greeting').trim()} name={honoured} />
  ) : (
    <Greeting hello={t('greet.hello')} />
  );
  // Someone with no business yet answers the setup questions; someone with one says their name on Aap.
  // The two opening buttons (20 Oct): a pakka bill (the real bill: a tax invoice for a GST business) is the star; a
  // kaccha bill (an estimate the customer checks first, counted nowhere) beside it, and one line saying which is which.
  const pakkaLabel = t(data.registration === 'regular' ? 'home.pakka.tax' : 'home.pakka');
  const kaccha = (
    <OutlineButton data-guide="kaccha" onClick={() => router.push(as('/bills/new?kaccha=1'))}>
      {t('home.kaccha')}
    </OutlineButton>
  );
  const about = (
    <div className="eb-star" data-guide="about">
      <PrimaryCTA onClick={() => router.push(as(data.businessName || shopName ? '/aap#person' : '/setup/name'))}>
        {t('home.about')}
      </PrimaryCTA>
    </div>
  );

  if (data.kind === 'new') {
    return (
      <AppShell
        viewer={{ ...viewer, businessName: shopName }}
        tab="home"
        tour={manifest.tour.filter(
          (s) => ['mic', 'star', 'kaccha'].includes(s.target) || (!viewer.named && s.target === 'about'),
        )}
      >
        <section className="eb-heading">
          {greeting}
          <Meta>{shopName ?? (viewer.named ? t('home.first.sub') : t('home.about.sub'))}</Meta>
        </section>
        {viewer.named ? null : about}
        <HeroPanel
          eyebrow={t('home.first.eyebrow')}
          title={t('home.first.title')}
          sub={t('home.first.sub')}
          guide="first"
        >
          {/* One star (I9): the first bill once the person is known, else "Apne baare mein batao" above it. */}
          <div className="eb-actions eb-actions--stack">
            <div className={viewer.named ? 'eb-star' : undefined} data-guide="star">
              {viewer.named ? (
                <PrimaryCTA onClick={() => router.push(as('/bills/new?first=1'))}>{t('home.first.cta')}</PrimaryCTA>
              ) : (
                <OutlineButton onClick={() => router.push(as('/bills/new?first=1'))}>
                  {t('home.first.cta')}
                </OutlineButton>
              )}
            </div>
            <div>{kaccha}</div>
            <Meta>{t('home.kinds.note')}</Meta>
          </div>
        </HeroPanel>
        <Card title={t('home.sent.title')} action={<IconChip name="receipt" />}>
          <Meta>{t('home.sent.none')}</Meta>
        </Card>
      </AppShell>
    );
  }

  const canBill = data.kind !== 'accountant';
  const canRemind = data.kind !== 'accountant';
  const oldest = data.owed.rows[0];
  const tour = manifest.tour.filter(
    (s) =>
      (canBill || !['kiska-bill', 'photo', 'star', 'kaccha'].includes(s.target)) &&
      (s.target !== 'about' || !viewer.named) &&
      ((s.target !== 'star' && s.target !== 'kaccha') || viewer.named),
  );

  return (
    <AppShell viewer={viewer} tab="home" tour={tour}>
      <section className="eb-heading">
        {data.kind === 'accountant' ? (
          <>
            <Display emphasis={data.businessName ?? ''}>{t('home.accountant.title', { business: '' })}</Display>
            <Meta>{t('home.accountant.sub')}</Meta>
          </>
        ) : (
          <>
            {greeting}
            <Meta>
              {data.businessName} · {data.city}
              {data.kind === 'staff' ? ` · ${t('home.staff.note', { business: data.businessName ?? '' })}` : ''}
            </Meta>
          </>
        )}
      </section>

      {/* The star (19 Oct): the one thing to do first. A new bill for someone known; their name for someone new. */}
      {!viewer.named ? (
        about
      ) : canBill ? (
        <div className="eb-actions eb-actions--stack">
          <div className="eb-star" data-guide="star">
            <PrimaryCTA onClick={() => router.push(as('/bills/new'))}>{pakkaLabel}</PrimaryCTA>
          </div>
          <div>{kaccha}</div>
          <Meta>{t('home.kinds.note')}</Meta>
        </div>
      ) : null}
      {newCard}

      {canBill ? (
        <HeroPanel
          eyebrow={t('home.bill.eyebrow')}
          chip={t('home.bill.count', { n: data.customerCount })}
          title={t('home.bill.title')}
          emphasis={t('home.bill.emphasis')}
          sub={t('home.bill.sub')}
          guide="kiska-bill"
          peeks={data.recent.slice(0, 3).map((r) => ({
            title: r.name,
            sub: `${r.number} · ${r.date.slice(8)} ${r.date.slice(5, 7)}`,
            amount: rupees(r.totalPaise),
          }))}
        >
          <div className="eb-hero__chips">
            {data.chips.map((c) => (
              <ClientChip key={c.id} name={c.name} index={c.index} href={as(`/bills/new?customer=${c.id}`)} />
            ))}
            {data.showSearch ? (
              <NewCustomerChip label={t('home.bill.search')} icon="plus" href={as('/customers')} guide="search" />
            ) : null}
            <NewCustomerChip label={t('home.bill.new')} href={as('/customers/new')} guide="naya-customer" />
            <NewCustomerChip label={t('home.bill.photo')} icon="camera" href={as('/bills/photo')} guide="photo" />
          </div>
        </HeroPanel>
      ) : null}

      <Card title={t('home.sent.title')} action={<IconChip name="receipt" />} className="eb-card--sent">
        <div data-guide="sent">
          <p className="eb-count">
            <span className="eb-count__figure eb-num">{String(data.sentThisMonth).padStart(2, '0')}</span>
            <span className="eb-count__sub">{t('home.sent.count')}</span>
          </p>
          <Sparkline values={data.sparkline} label={t('home.sent.weeks')} />
          {data.recent.length ? (
            <div className="eb-rows">
              {data.recent.map((r) => (
                <BillRow
                  key={r.number}
                  name={r.name}
                  index={r.index}
                  meta={`${r.number} · ${r.date.slice(8)}/${r.date.slice(5, 7)}`}
                  amountPaise={r.totalPaise}
                  status={r.status}
                  statusLabel={t(statusKey(r.status))}
                  href={as(billPath(r.number, '', r.fy))}
                />
              ))}
            </div>
          ) : (
            <Meta>{t('home.sent.none')}</Meta>
          )}
          <a className="eb-card__more" href={as('/bills')}>
            {t('home.sent.all')} →
          </a>
        </div>
      </Card>

      <HeroPanel
        tone="panel"
        title={t('home.owed.title')}
        sub={
          data.owed.rows.length
            ? t('home.owed.sub', { n: data.owed.people, days: data.owed.oldestDays })
            : t('home.owed.none')
        }
        guide="paise"
        peeks={data.owed.rows.map((r) => ({ title: r.name, sub: r.number, amount: rupees(r.duePaise) }))}
      >
        <Stack>
          <MoneyHero paise={data.owed.totalPaise} />
          {oldest ? (
            <AgeingIndicator
              ages={data.owed.rows.map((r) => r.days)}
              todayLabel={t('status.today')}
              dayLabel={(d) => t('dues.age', { days: d })}
            />
          ) : null}
          <ul className="eb-owedlist">
            {data.owed.rows.map((r, i) => (
              <OwedRow
                key={r.number}
                name={r.name}
                href={as(billPath(r.number, '', r.fy))}
                age={t('home.owed.age', { days: r.days })}
                overdue={r.days > 14}
                amountPaise={r.duePaise}
                oldest={i === 0}
                action={
                  canRemind ? (
                    i === 0 ? (
                      <AccentButton
                        small
                        data-guide="remind"
                        onClick={() => router.push(as(billPath(r.number, '/remind', r.fy)))}
                      >
                        {t('action.remind')}
                      </AccentButton>
                    ) : (
                      <OutlineButton small onClick={() => router.push(as(billPath(r.number, '/remind', r.fy)))}>
                        {t('action.remind')}
                      </OutlineButton>
                    )
                  ) : (
                    <OutlineButton small onClick={() => router.push(as(billPath(r.number, '', r.fy)))}>
                      {t('action.more')}
                    </OutlineButton>
                  )
                }
              />
            ))}
          </ul>
          <a className="eb-card__more" href={as('/dues')}>
            {t('home.owed.all')} →
          </a>
        </Stack>
      </HeroPanel>
    </AppShell>
  );
}
