'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

import { t } from '@ekbill/copy';
import { GuideHighlight, Icon, IconButton, Logo, ProfileRing, TabBar, useTour, type GuideStep } from '@ekbill/ui';

import type { Registration, Role } from '../types';
import { tabsFor } from './nav';

/** The serialisable part of the viewer that the shell needs. */
export interface ShellViewer {
  personName: string;
  businessName: string | null;
  registration: Registration | null;
  role: Role;
  as: string | null;
}

/**
 * Every product screen sits in this shell: the top bar (logo + profile ring
 * on tab roots, back + title elsewhere), the floating tab bar with the mic,
 * the "Tour" button and the guide highlight (rule 17). The mic starts the
 * tour in Stage 1; Stage 9 hands the same highlight to the Realtime voice.
 */
export function AppShell({
  viewer,
  tab,
  back,
  title,
  sub,
  actions,
  tour,
  children,
  noTabs,
}: {
  viewer: ShellViewer;
  tab?: 'home' | 'bills' | 'gst' | 'you';
  back?: string;
  title?: ReactNode;
  sub?: ReactNode;
  actions?: ReactNode;
  tour: GuideStep[];
  children: ReactNode;
  noTabs?: boolean;
}) {
  const router = useRouter();
  const guide = useTour(tour);
  const withAs = (href: string) => (viewer.as ? `${href}${href.includes('?') ? '&' : '?'}as=${viewer.as}` : href);
  const tabs = tabsFor(viewer.registration, viewer.role);
  const initial = viewer.personName.trim().charAt(0).toUpperCase() || 'E';
  return (
    <main className="eb-screen" data-role={viewer.role}>
      <header className="eb-topbar">
        <div className="eb-topbar__left">
          {back ? (
            <IconButton
              name="back"
              label={t('action.back')}
              onClick={() => router.push(withAs(back))}
              data-guide="back"
            />
          ) : (
            <Logo />
          )}
          {title ? (
            <div className="eb-topbar__titles">
              <div className="eb-topbar__title">{title}</div>
              {sub ? <div className="eb-topbar__sub">{sub}</div> : null}
            </div>
          ) : null}
        </div>
        <div className="eb-topbar__right">
          {actions}
          {tour.length ? (
            <button
              type="button"
              className="eb-iconbtn"
              aria-label={t('action.tour')}
              data-testid="tour"
              onClick={guide.running ? guide.stop : guide.start}
            >
              <Icon name="globe" size={20} />
            </button>
          ) : null}
          {!back ? (
            <ProfileRing initial={initial} label={t('nav.you')} onClick={() => router.push(withAs('/aap'))} />
          ) : null}
        </div>
      </header>
      <div className="eb-screen__body">{children}</div>
      {noTabs ? null : (
        <TabBar
          items={tabs}
          current={tab ?? ''}
          micLabel={t('action.mic')}
          onMic={guide.running ? guide.stop : guide.start}
          renderLink={(item, inner, active) => (
            <Link href={withAs(item.href)} className="eb-tab" aria-current={active ? 'page' : undefined}>
              {inner}
            </Link>
          )}
        />
      )}
      <GuideHighlight step={guide.step} onDone={guide.next} />
    </main>
  );
}
