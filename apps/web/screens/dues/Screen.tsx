'use client';

import { useRouter } from 'next/navigation';

import { t } from '@ekbill/copy';
import { AccentButton, Avatar, Display, EmptyState, Meta, Money, MoneyHero, OutlineButton } from '@ekbill/ui';

import { rupees } from '../money';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { manifest } from './manifest';
import type { DuesData } from './data';

export function DuesScreen({ data, viewer }: { data: DuesData; viewer: ShellViewer }) {
  const router = useRouter();
  const as = (href: string) => withAs(href, viewer.as);
  const canAct = viewer.role !== 'accountant';
  return (
    <AppShell viewer={viewer} tab="home" back="/" title={t('dues.title')} tour={manifest.tour}>
      <section className="eb-heading" data-guide="total">
        <Display as="h1" size="title">
          {t('dues.title')}
        </Display>
        <MoneyHero paise={data.totalPaise} />
        <Meta>
          {data.rows.length ? t('dues.sub', { n: data.rows.length, amount: rupees(data.totalPaise) }) : t('dues.none')}
        </Meta>
      </section>
      <div className="eb-card eb-rows" data-guide="rows">
        {data.rows.length ? (
          data.rows.map((r) => (
            <div key={r.number} className="eb-duerow">
              <a href={as(`/bills/${r.number}`)} className="eb-billrow">
                <Avatar name={r.name} index={r.index} />
                <span className="eb-billrow__text">
                  <span className="eb-billrow__name">{r.name}</span>
                  <span className={`eb-billrow__meta${r.days > 14 ? ' eb-owedrow__age--due' : ''}`}>
                    {r.number} · {t('home.owed.age', { days: r.days })}
                  </span>
                </span>
                <span className="eb-billrow__right">
                  <Money paise={r.duePaise} whole />
                </span>
              </a>
              {canAct ? (
                <div className="eb-actions eb-duerow__actions">
                  <OutlineButton small data-guide="remind" onClick={() => router.push(as(`/bills/${r.number}/remind`))}>
                    {t('action.remind')}
                  </OutlineButton>
                  <AccentButton small data-guide="paid" onClick={() => router.push(as(`/bills/${r.number}?paid=1`))}>
                    {t('dues.paid')}
                  </AccentButton>
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <EmptyState icon="check" title={t('dues.none')} />
        )}
      </div>
    </AppShell>
  );
}
