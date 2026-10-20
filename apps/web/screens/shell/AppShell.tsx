'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';

import { t, type Locale } from '@ekbill/copy';
import {
  GuideHighlight,
  Icon,
  IconButton,
  Logo,
  ProfileRing,
  TabBar,
  ThemeToggle,
  useTour,
  type GuideStep,
} from '@ekbill/ui';

import { setTheme } from '../../actions/user';
import { localTour } from '../tour';
import type { Registration, Role } from '../types';
import { useVoice } from '../voice/VoiceProvider';
import { tabsFor } from './nav';

/** The serialisable part of the viewer that the shell needs. */
export interface ShellViewer {
  personId: string;
  personName: string;
  /** The person has said their name; until then Home asks "Apne baare mein batao" (19 Oct). */
  named?: boolean;
  /** The app demo seen (20 Oct), and the current version: below it, the demo is offered once. */
  demoSeen?: number;
  demoVersion?: number;
  businessName: string | null;
  registration: Registration | null;
  role: Role;
  as: string | null;
  /** The person's own language (users.language); the dictionary switch arrives with the Aap wiring in Stage 4. */
  language?: Locale;
  /** "Bolke" on Aap: a hint by the mic once a visit; the voice starts only on a tap (19 Oct). */
  voice?: boolean;
  /** A signed-in member, not a look or the demo. */
  signedIn?: boolean;
}

/**
 * Every product screen sits in this shell: the top bar (logo + profile ring
 * on tab roots, back + title elsewhere), the floating tab bar with the mic,
 * the "Tour" button and the guide highlight (rule 17). The mic starts the
 * voice where a session can be minted (Stage 9), else the tour; the voice
 * moves the same highlight.
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
  topMic,
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
  /** The mic in the top bar where there is no tab bar and the voice walks the screen (the photo's review). */
  topMic?: boolean;
}) {
  const router = useRouter();
  const guide = useTour(localTour(tour));
  const voice = useVoice();
  const talk = voice?.available ? voice.toggle : guide.running ? guide.stop : guide.start;
  // The VoiceProvider reads this for its one hint by the mic ("Bolke"); it never starts the voice by itself (19 Oct).
  useEffect(() => {
    document.documentElement.dataset.bolke = viewer.voice ? 'on' : 'off';
  }, [viewer.voice]);
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
              data-voice="safe"
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
          {topMic && voice?.available && viewer.signedIn ? (
            // No tab bar here (the photo's review): the mic sits in the top bar instead.
            <IconButton name="mic" label={t('action.mic')} data-guide="mic" data-voice="owner" onClick={voice.toggle} />
          ) : null}
          {/* Each control in the top bar says what it is under it (19 Oct: "what does the globe do?"). The theme sits
              on the tab roots, beside the profile; a screen with a back and its own actions has no room for it. */}
          {!back ? (
            <span className="eb-topbar__act">
              <ThemeToggle
                label={t('aap.theme')}
                onChange={(theme) => void setTheme({ theme }).catch(() => undefined)}
              />
              <span className="eb-topbar__cap" aria-hidden="true">
                {t('aap.theme')}
              </span>
            </span>
          ) : null}
          {tour.length ? (
            <span className="eb-topbar__act">
              <button
                type="button"
                className="eb-iconbtn"
                aria-label={t('action.tour')}
                data-testid="tour"
                onClick={guide.running ? guide.stop : guide.start}
              >
                <Icon name="help" size={20} />
              </button>
              <span className="eb-topbar__cap" aria-hidden="true">
                {t('action.tour')}
              </span>
            </span>
          ) : null}
          {!back ? (
            <span className="eb-topbar__act">
              <ProfileRing initial={initial} label={t('nav.profile')} onClick={() => router.push(withAs('/aap'))} />
              <span className="eb-topbar__cap" aria-hidden="true">
                {t('nav.profile')}
              </span>
            </span>
          ) : null}
        </div>
      </header>
      <div className="eb-screen__body">{children}</div>
      {noTabs ? null : (
        <TabBar
          items={tabs}
          current={tab ?? ''}
          micLabel={t('action.mic')}
          onMic={talk}
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
