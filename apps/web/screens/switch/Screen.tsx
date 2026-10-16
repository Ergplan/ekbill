'use client';

import { t } from '@ekbill/copy';
import { Avatar, Display, GuideHighlight, Logo, Meta, StatusPill, useTour } from '@ekbill/ui';

import { manifest } from './manifest';
import type { SwitchRow } from './data';

export function SwitchScreen({ people, current }: { people: SwitchRow[]; current: string | null }) {
  const guide = useTour(manifest.tour);
  return (
    <main className="eb-screen">
      <header className="eb-topbar">
        <Logo />
        <div className="eb-topbar__right">
          <button
            type="button"
            className="eb-iconbtn"
            aria-label={t('action.tour')}
            data-testid="tour"
            onClick={guide.start}
          >
            ?
          </button>
        </div>
      </header>
      <div className="eb-screen__body">
        <section className="eb-heading">
          <Display as="h1">{t('switch.title')}</Display>
          <Meta>{t('switch.sub')}</Meta>
        </section>
        {/* The card keeps its padding; the list inside it (eb-rows on the card itself zeroed the padding). */}
        <div className="eb-card" data-guide="people">
          <div className="eb-rows">
            {people.map((p) => (
              <a
                key={p.id}
                href={`/dev/switch/${p.id}`}
                className="eb-billrow"
                aria-current={current === p.id ? 'true' : undefined}
              >
                <Avatar name={p.name} index={p.index} />
                <span className="eb-billrow__text">
                  <span className="eb-billrow__name">{p.name}</span>
                  <span className="eb-billrow__meta">{p.business ?? t('switch.none')}</span>
                </span>
                <span className="eb-billrow__right">
                  {p.role ? (
                    <StatusPill status={p.role === 'owner' ? 'paid' : 'sent'} label={t(`switch.role.${p.role}`)} />
                  ) : null}
                </span>
              </a>
            ))}
          </div>
        </div>
      </div>
      <GuideHighlight step={guide.step} onDone={guide.next} />
    </main>
  );
}
