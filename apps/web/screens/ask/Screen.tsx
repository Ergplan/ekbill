'use client';

import { useState, useTransition } from 'react';

import { t } from '@ekbill/copy';
import { Card, Display, FilterChips, GhostButton, Input, Meta, PrimaryCTA, SeriesChip } from '@ekbill/ui';

import { ask as askAction } from '../../actions/ask';
import { withAs } from '../links';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Fixture } from '../fixtures';
import { manifest } from './manifest';

interface Shown {
  question: string;
  answer: string | null;
  note: string | null;
  sources: Array<{ title: string; href: string }>;
}

/**
 * Poocho. A look draws the fixture's answer; a session asks its own records
 * (actions/ask.ts): the answer with the records it came from, the matching
 * records when no model answered, or "nothing found".
 */
export function AskScreen({
  ask,
  state,
  live,
  viewer,
}: {
  ask: Fixture['ask'];
  state: 'empty' | 'answered';
  live?: boolean;
  viewer: ShellViewer;
}) {
  const as = (href: string) => withAs(href, viewer.as);
  const fixtureAnswer: Shown = {
    question: ask.answer.question,
    answer: ask.answer.text,
    note: null,
    sources: ask.answer.sources.map((s) => ({ title: s, href: `/bills/${s}` })),
  };
  const [q, setQ] = useState(state === 'answered' ? ask.answer.question : '');
  const [shown, setShown] = useState<Shown | null>(state === 'answered' ? fixtureAnswer : null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const go = (question: string) => {
    const text = question.trim();
    if (!text) return;
    setError(null);
    if (!live) {
      setShown(fixtureAnswer);
      return;
    }
    start(async () => {
      try {
        const r = await askAction({ question: text });
        if (!r.ok) {
          setError(t(r.error));
          return;
        }
        const v = r.value;
        setShown({
          question: v.question,
          answer: v.mode === 'nothing' ? t('ask.nothing') : v.answer,
          note: v.mode === 'search' ? t('ask.search.note') : null,
          sources: v.sources.map((s) => ({ title: s.title, href: s.href })),
        });
      } catch {
        setError(t('ask.failed'));
      }
    });
  };

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
          onKeyDown={(e) => e.key === 'Enter' && go(q)}
          maxLength={500}
        />
      </div>
      {ask.examples.length ? (
        <div data-guide="examples">
          <FilterChips<string>
            label={t('ask.sub')}
            value={q}
            onChange={(v) => {
              setQ(v);
              go(v);
            }}
            options={ask.examples.map((e) => ({ value: e, label: e }))}
          />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="eb-meta">
          {error}
        </p>
      ) : null}
      {pending ? (
        <p role="status" aria-live="polite" data-testid="ask-thinking">
          <Meta>{t('ask.thinking')}</Meta>
        </p>
      ) : shown ? (
        <Card title={shown.question} className="eb-answer">
          {shown.answer ? (
            <p data-guide="answer" data-testid="ask-answer">
              {shown.answer}
            </p>
          ) : null}
          {shown.note ? <Meta>{shown.note}</Meta> : null}
          {shown.sources.length ? (
            <>
              {shown.note ? null : <Meta>{t('ask.sources')}</Meta>}
              <div className="eb-actions" data-guide="sources">
                {shown.sources.map((s, i) => (
                  <a key={s.href} href={as(s.href)} data-testid="ask-source">
                    <SeriesChip>{live ? `[${i + 1}] ${s.title}` : s.title}</SeriesChip>
                  </a>
                ))}
              </div>
            </>
          ) : null}
          <GhostButton
            data-guide="more"
            onClick={() => {
              setQ('');
              setShown(null);
            }}
          >
            {t('ask.more')}
          </GhostButton>
        </Card>
      ) : (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="go" icon="chat" disabled={!q.trim()} onClick={() => go(q)}>
            {t('ask.go')}
          </PrimaryCTA>
        </div>
      )}
    </AppShell>
  );
}
