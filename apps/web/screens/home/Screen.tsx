'use client';

import { useRouter } from 'next/navigation';

import { t } from '@ekbill/copy';
import {
  AccentButton,
  AgeingIndicator,
  BillRow,
  Card,
  ClientChip,
  Display,
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

import { useDraft } from '../draft';
import { rupees } from '../money';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { statusKey } from '../common';
import { manifest } from './manifest';
import type { HomeData } from './data';

export function HomeScreen({ data, viewer }: { data: HomeData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => (viewer.as ? `${href}${href.includes('?') ? '&' : '?'}as=${viewer.as}` : href);
  const [setup] = useDraft<{ name: string } | null>('setup', null);
  const shopName = data.kind === 'new' ? setup?.name?.trim() || null : null;

  if (data.kind === 'new') {
    return (
      <AppShell
        viewer={{ ...viewer, businessName: shopName }}
        tab="home"
        tour={manifest.tour.filter((s) => s.target === 'mic')}
      >
        <section className="eb-heading">
          <Display emphasis={shopName ?? data.personName}>Namaste, </Display>
          <Meta>{t('home.first.sub')}</Meta>
        </section>
        <HeroPanel eyebrow="01 / Pehla bill" title={t('home.first.title')} sub={t('home.first.sub')} guide="first">
          <div className="eb-actions eb-actions--stack">
            <PrimaryCTA onClick={() => router.push(as('/bills/new?first=1'))}>{t('home.first.cta')}</PrimaryCTA>
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
  const tour = manifest.tour.filter((s) => canBill || !['kiska-bill', 'photo'].includes(s.target));

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
            <Display emphasis={data.personName}>Namaste, </Display>
            <Meta>
              {data.businessName} · {data.city}
              {data.kind === 'staff' ? ` · ${t('home.staff.note', { business: data.businessName ?? '' })}` : ''}
            </Meta>
          </>
        )}
      </section>

      {canBill ? (
        <HeroPanel
          eyebrow="01 / Kiska bill"
          chip={t('home.bill.count', { n: data.customerCount })}
          title="Chalo,"
          emphasis="bill banate hain"
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
          <Sparkline values={data.sparkline} label="8 hafte" />
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
                  href={as(`/bills/${r.number}`)}
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
                href={as(`/bills/${r.number}`)}
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
                        onClick={() => router.push(as(`/bills/${r.number}/remind`))}
                      >
                        {t('action.remind')}
                      </AccentButton>
                    ) : (
                      <OutlineButton small onClick={() => router.push(as(`/bills/${r.number}/remind`))}>
                        {t('action.remind')}
                      </OutlineButton>
                    )
                  ) : (
                    <OutlineButton small onClick={() => router.push(as(`/bills/${r.number}`))}>
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
