'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import {
  Card,
  Display,
  FilterChips,
  GhostButton,
  Logo,
  Meta,
  OutlineButton,
  StatusPill,
  ThemeSwitch,
} from '@ekbill/ui';

import type { GoldenPath } from '../golden-paths';
import type { Role, ScreenManifest } from '../types';

export interface FlowQuestion {
  id: number;
  question: string;
  proposal: string;
}

export interface FlowProps {
  screens: ScreenManifest[];
  sampleUrl: Record<string, string>;
  thumbs: Record<string, Partial<Record<'narangi' | 'harmony', string>>>;
  paths: GoldenPath[];
  questions: FlowQuestion[];
  theme: 'narangi' | 'harmony';
  roles: Array<{ action: string; owner: boolean; staff: boolean; accountant: boolean }>;
  stage: string;
}

const ROLES: Role[] = ['owner', 'staff', 'accountant'];

/**
 * The review screen for the operator (Stage 1 approval gate): the screen
 * map as tappable cards with a thumbnail in the current theme and the taps
 * that leave each one; the golden paths with their counts; the role matrix;
 * the open questions with proposals; "walk it" opens the prototype at the
 * start of a path.
 */
export function FlowScreen(p: FlowProps) {
  const [view, setView] = useState<'map' | 'paths' | 'roles' | 'questions'>('map');
  const [role, setRole] = useState<Role>('owner');
  const byId = new Map(p.screens.map((s) => [s.id, s]));
  const routeToId = new Map(p.screens.map((s) => [s.route, s.id]));
  const withAs = (url: string, as?: string) => (as ? `${url}${url.includes('?') ? '&' : '?'}as=${as}` : url);
  return (
    <main className="eb-screen eb-flow">
      <header className="eb-topbar">
        <Logo />
        <div className="eb-topbar__right">
          <ThemeSwitch labels={{ narangi: t('theme.narangi'), harmony: t('theme.harmony'), group: t('aap.theme') }} />
        </div>
      </header>
      <div className="eb-screen__body">
        <section className="eb-heading">
          <Display as="h1" size="title">
            {t('flow.title')}
          </Display>
          <Meta>
            {p.stage} · {p.screens.length} screens · both themes · tap any card to open the real screen
          </Meta>
        </section>
        <FilterChips<'map' | 'paths' | 'roles' | 'questions'>
          label="View"
          value={view}
          onChange={setView}
          options={[
            { value: 'map', label: `Screens (${p.screens.length})` },
            { value: 'paths', label: `Golden paths (${p.paths.length})` },
            { value: 'roles', label: 'Roles' },
            { value: 'questions', label: `Questions (${p.questions.length})` },
          ]}
        />

        {view === 'map' ? (
          <div className="eb-flow__grid">
            {p.screens.map((s) => {
              const thumb = p.thumbs[s.id]?.[p.theme];
              const outs = [...(s.primary ? [s.primary] : []), ...s.taps];
              return (
                <Card
                  key={s.id}
                  className="eb-flow__card"
                  title={<a href={p.sampleUrl[s.id] ?? s.route}>{s.title}</a>}
                  action={<code className="eb-flow__route">{s.route}</code>}
                >
                  <a href={p.sampleUrl[s.id] ?? s.route} className="eb-flow__thumb" aria-label={`Open ${s.title}`}>
                    {thumb ? (
                      <img src={thumb} alt="" loading="lazy" />
                    ) : (
                      <span className="eb-flow__nothumb">no screenshot yet</span>
                    )}
                  </a>
                  <p className="eb-flow__purpose">{s.purpose}</p>
                  <ul className="eb-flow__taps">
                    {outs.map((tap, i) => {
                      const target = routeToId.get(tap.to);
                      return (
                        <li
                          key={`${tap.label}-${i}`}
                          className={i === 0 && s.primary ? 'eb-flow__tap eb-flow__tap--primary' : 'eb-flow__tap'}
                        >
                          <span>{tap.label}</span>
                          <span aria-hidden="true">→</span>
                          {target ? (
                            <a href={p.sampleUrl[target] ?? tap.to}>{byId.get(target)?.title ?? tap.to}</a>
                          ) : (
                            <span className="eb-flow__ext">{tap.to.replace('external:', '')}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                  <div className="eb-actions">
                    {s.states.map((st) => (
                      <StatusPill key={st} status="sent" label={st} />
                    ))}
                  </div>
                  <Meta>guide: {s.guides.map((g) => `#${g}`).join(' ')}</Meta>
                </Card>
              );
            })}
          </div>
        ) : null}

        {view === 'paths' ? (
          <div className="eb-flow__paths">
            {p.paths.map((path) => (
              <Card
                key={path.id}
                title={path.name}
                action={
                  <StatusPill
                    status={path.taps.length <= path.budget ? 'paid' : 'due'}
                    label={`${path.taps.length} / ${path.budget} taps`}
                  />
                }
              >
                <ol className="eb-flow__steps">
                  {path.taps.map((tap, i) => (
                    <li key={i}>{tap}</li>
                  ))}
                </ol>
                <div className="eb-actions">
                  <OutlineButton onClick={() => window.open(withAs(path.start, path.as), '_blank')}>
                    Walk it →
                  </OutlineButton>
                </div>
              </Card>
            ))}
          </div>
        ) : null}

        {view === 'roles' ? (
          <Card title="Who sees what (master prompt 8.3)">
            <table className="eb-table eb-table--roles">
              <thead>
                <tr>
                  <th>Action</th>
                  {ROLES.map((r) => (
                    <th key={r}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.roles.map((row) => (
                  <tr key={row.action}>
                    <td>{row.action}</td>
                    {ROLES.map((r) => (
                      <td key={r}>{row[r] ? '✓' : ''}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <Meta>Open any screen as a role:</Meta>
            <FilterChips<Role>
              label="Role"
              value={role}
              onChange={setRole}
              options={ROLES.map((r) => ({ value: r, label: r }))}
            />
            <div className="eb-actions">
              {['home', 'bill-view', 'aap', 'dues', 'gst'].map((id) => (
                <GhostButton key={id} onClick={() => window.open(withAs(p.sampleUrl[id] ?? '/', role), '_blank')}>
                  {byId.get(id)?.title} as {role} →
                </GhostButton>
              ))}
            </div>
            <ul className="eb-flow__rolenotes">
              {p.screens.map((s) => (
                <li key={s.id}>
                  <strong>{s.title}:</strong> owner — {s.roles.owner} staff — {s.roles.staff} accountant —{' '}
                  {s.roles.accountant}
                </li>
              ))}
            </ul>
          </Card>
        ) : null}

        {view === 'questions' ? (
          <div className="eb-flow__paths">
            {p.questions.map((q) => (
              <Card key={q.id} title={`${q.id}. ${q.question}`}>
                <p className="eb-flow__purpose">
                  <strong>Proposal:</strong> {q.proposal}
                </p>
              </Card>
            ))}
            <Meta>Answers go in docs/stages/stage-1-answers.md; "Run Stage 1 again" applies them.</Meta>
          </div>
        ) : null}
      </div>
    </main>
  );
}
