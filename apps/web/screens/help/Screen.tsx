'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import { ChoiceList, Display, Meta, PrimaryCTA } from '@ekbill/ui';

import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Fixture } from '../fixtures';
import { manifest } from './manifest';

export function HelpScreen({ help, viewer }: { help: Fixture['help']; viewer: ShellViewer }) {
  const [choice, setChoice] = useState<string | null>(null);
  const [next, setNext] = useState(false);
  return (
    <AppShell viewer={viewer} tab="home" back="/" title={t('help.title')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('help.title')}
        </Display>
        <Meta>{t('help.sub')}</Meta>
      </section>
      <ChoiceList<string>
        guide="choices"
        label={t('help.title')}
        value={choice}
        onChoose={setChoice}
        choices={help.choices.map((c) => ({ value: c.id, label: c.title, sub: c.sub }))}
      />
      {next ? <Meta>{t('help.chosen')}</Meta> : null}
      <div className="eb-sticky">
        <PrimaryCTA data-guide="next" disabled={!choice} onClick={() => setNext(true)}>
          {t('help.next')}
        </PrimaryCTA>
      </div>
    </AppShell>
  );
}
