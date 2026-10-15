'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import { Card, Display, FilterChips, GhostButton, Input, Meta, PrimaryCTA, SeriesChip } from '@ekbill/ui';

import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Fixture } from '../fixtures';
import { manifest } from './manifest';

export function AskScreen({
  ask,
  state,
  viewer,
}: {
  ask: Fixture['ask'];
  state: 'empty' | 'answered';
  viewer: ShellViewer;
}) {
  const as = (href: string) => withAs(href, viewer.as);
  const [q, setQ] = useState(state === 'answered' ? ask.answer.question : '');
  const [answered, setAnswered] = useState(state === 'answered');
  return (
    <AppShell viewer={viewer} tab="home" back="/" title={t('ask.title')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('ask.title')}
        </Display>
        <Meta>{t('ask.sub')}</Meta>
      </section>
      <div data-guide="question">
        <Input
          large
          placeholder={t('ask.placeholder')}
          value={q}
          aria-label={t('ask.title')}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && q.trim() && setAnswered(true)}
        />
      </div>
      <div data-guide="examples">
        <FilterChips<string>
          label={t('ask.sub')}
          value={q}
          onChange={(v) => {
            setQ(v);
            setAnswered(true);
          }}
          options={ask.examples.map((e) => ({ value: e, label: e }))}
        />
      </div>
      {answered ? (
        <Card title={ask.answer.question} className="eb-answer">
          <p data-guide="answer">{ask.answer.text}</p>
          <Meta>{t('ask.sources')}</Meta>
          <div className="eb-actions" data-guide="sources">
            {ask.answer.sources.map((s) => (
              <a key={s} href={as(`/bills/${s}`)}>
                <SeriesChip>{s}</SeriesChip>
              </a>
            ))}
          </div>
          <GhostButton
            data-guide="more"
            onClick={() => {
              setQ('');
              setAnswered(false);
            }}
          >
            {t('ask.more')}
          </GhostButton>
        </Card>
      ) : (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="go" icon="chat" disabled={!q.trim()} onClick={() => setAnswered(true)}>
            {t('ask.go')}
          </PrimaryCTA>
        </div>
      )}
    </AppShell>
  );
}
