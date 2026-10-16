'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import { t } from '@ekbill/copy';
import {
  Avatar,
  Display,
  Field,
  Input,
  Meta,
  OutlineButton,
  PrimaryCTA,
  Segmented,
  StatusPill,
  WhatsAppButton,
} from '@ekbill/ui';

import { changeMemberRole, inviteMember, removeMember } from '../../actions/team';
import { AppShell, type ShellViewer } from '../shell/AppShell';
import { handoffToWhatsApp } from '../share';
import type { TeamMember } from './data';
import { manifest } from './manifest';

export function TeamScreen({ members, live, viewer }: { members: TeamMember[]; live: boolean; viewer: ShellViewer }) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'staff' | 'accountant'>('staff');
  const [sent, setSent] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  /** A team write, then the list again from the server. */
  const act = (run: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setProblem(null);
    startTransition(async () => {
      const r = await run();
      if (!r.ok) {
        setProblem(t(r.error ?? 'error.generic'));
        return;
      }
      after?.();
      router.refresh();
    });
  };
  const sendInvite = () => {
    if (!live) {
      setSent(phone);
      setInviting(false);
      setPhone('');
      return;
    }
    act(
      () => inviteMember({ phone, role }),
      () => {
        const text = t('team.wa.text', {
          business: viewer.businessName ?? '',
          role: t(`team.role.${role}`),
          link: typeof window === 'undefined' ? '' : window.location.origin,
        });
        void handoffToWhatsApp({ text, phone });
        setSent(phone);
        setInviting(false);
        setPhone('');
      },
    );
  };
  return (
    <AppShell viewer={viewer} tab="you" back="/aap" title={t('team.title')} tour={manifest.tour}>
      <section className="eb-heading">
        <Display as="h1" size="title">
          {t('team.title')}
        </Display>
        <Meta>{t('aap.team.sub', { n: members.length })}</Meta>
      </section>
      <div className="eb-card eb-rows" data-guide="members">
        {members.map((m, i) => (
          <div key={m.id} className="eb-billrow eb-billrow--static">
            <Avatar name={m.name} index={i} />
            <span className="eb-billrow__text">
              <span className="eb-billrow__name">
                {m.name}
                {m.you ? ` (${t('team.you')})` : ''}
              </span>
              <span className="eb-billrow__meta">
                {m.phone}
                {m.status === 'invited' ? ` · ${t('team.status.invited')}` : ''}
              </span>
            </span>
            <span className="eb-billrow__right">
              <StatusPill status={m.role === 'owner' ? 'paid' : 'sent'} label={t(`team.role.${m.role}`)} />
              {m.role !== 'owner' ? (
                <span className="eb-actions">
                  <OutlineButton
                    small
                    disabled={pending}
                    onClick={() =>
                      live &&
                      act(() => changeMemberRole({ userId: m.id, role: m.role === 'staff' ? 'accountant' : 'staff' }))
                    }
                  >
                    {t('team.change')}
                  </OutlineButton>
                  <OutlineButton
                    small
                    disabled={pending}
                    onClick={() => {
                      if (!live) return;
                      if (removing !== m.id) {
                        setRemoving(m.id);
                        return;
                      }
                      act(
                        () => removeMember({ userId: m.id }),
                        () => setRemoving(null),
                      );
                    }}
                  >
                    {removing === m.id ? t('team.remove.sure') : t('team.remove')}
                  </OutlineButton>
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {sent ? <Meta>{t('team.sent', { phone: sent })}</Meta> : null}
      {problem ? (
        <p className="eb-meta" role="alert">
          {problem}
        </p>
      ) : null}
      {inviting ? (
        <div className="eb-card" data-guide="invite">
          <Field id="inv-phone" label={t('team.invite.phone')}>
            <Input
              id="inv-phone"
              numeric
              inputMode="tel"
              autoFocus
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              maxLength={14}
            />
          </Field>
          <Segmented<'staff' | 'accountant'>
            label={t('team.invite.role')}
            value={role}
            onChange={setRole}
            options={[
              { value: 'staff', label: t('team.role.staff') },
              { value: 'accountant', label: t('team.role.accountant') },
            ]}
          />
          <div className="eb-sticky eb-sticky--bare" data-guide="send">
            <WhatsAppButton disabled={phone.replace(/\D/g, '').length < 10 || pending} onClick={sendInvite}>
              {t('team.send')}
            </WhatsAppButton>
          </div>
        </div>
      ) : (
        <div className="eb-sticky">
          <PrimaryCTA data-guide="invite" icon="plus" onClick={() => setInviting(true)}>
            {t('team.invite')}
          </PrimaryCTA>
        </div>
      )}
    </AppShell>
  );
}
