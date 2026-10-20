'use client';

import { useRouter } from 'next/navigation';

import { t } from '@ekbill/copy';
import { Display, GhostButton, GuideHighlight, HeroPanel, Icon, Logo, Meta, PrimaryCTA, useTour } from '@ekbill/ui';

import { useDemo } from '../demo/DemoProvider';
import { manifest } from './manifest';

export function WelcomeScreen() {
  const router = useRouter();
  const guide = useTour(manifest.tour);
  const demo = useDemo();
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
            <Icon name="help" size={20} />
          </button>
        </div>
      </header>
      <div className="eb-screen__body">
        <HeroPanel
          eyebrow="EkBill"
          title={t('welcome.title')}
          sub={t('welcome.sub')}
          guide="hero"
          peeks={[
            { title: 'Mehta Traders', sub: 'INV-042 · 22 Sep', amount: '₹6,200' },
            { title: 'Dr. Kulkarni', sub: 'INV-039 · 17 Sep', amount: '₹2,850' },
            { title: 'Green Park Society', sub: 'INV-040 · 12 Sep', amount: '₹9,450' },
          ]}
        >
          <div className="eb-actions eb-actions--stack">
            <PrimaryCTA data-guide="start" onClick={() => router.push('/login')}>
              {t('welcome.cta')}
            </PrimaryCTA>
          </div>
        </HeroPanel>
        <section className="eb-heading">
          <Display as="h2" size="title">
            {t('auth.welcome')}
          </Display>
          <Meta>{t('auth.welcome.sub')}</Meta>
        </section>
        <div className="eb-actions">
          <GhostButton onClick={() => router.push('/login')}>{t('welcome.have')}</GhostButton>
          {/* The app demo for a visitor (20 Oct; a friend's link lands here): sample data, then back here. */}
          <GhostButton data-guide="demo" onClick={() => demo?.start({ firstTime: false, visitor: true })}>
            {t('welcome.demo')}
          </GhostButton>
        </div>
      </div>
      <GuideHighlight step={guide.step} onDone={guide.next} />
    </main>
  );
}
