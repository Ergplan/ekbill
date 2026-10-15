'use client';

import { useState } from 'react';

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

import { AppShell, type ShellViewer } from '../shell/AppShell';
import type { Person } from '../fixtures';
import { manifest } from './manifest';

export function TeamScreen({ members, viewer }: { members: Person[]; viewer: ShellViewer }) {
  const [inviting, setInviting] = useState(false);
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'staff' | 'accountant'>('staff');
  const [sent, setSent] = useState<string | null>(null);
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
                {m.id === 'sharma' ? ` (${t('team.you')})` : ''}
              </span>
              <span className="eb-billrow__meta">{m.phone}</span>
            </span>
            <span className="eb-billrow__right">
              <StatusPill status={m.role === 'owner' ? 'paid' : 'sent'} label={t(`team.role.${m.role}`)} />
              {m.role !== 'owner' ? (
                <span className="eb-actions">
                  <OutlineButton small>{t('team.change')}</OutlineButton>
                  <OutlineButton small>{t('team.remove')}</OutlineButton>
                </span>
              ) : null}
            </span>
          </div>
        ))}
      </div>
      {sent ? <Meta>{t('team.sent', { phone: sent })}</Meta> : null}
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
            <WhatsAppButton
              disabled={phone.replace(/\D/g, '').length < 10}
              onClick={() => {
                setSent(phone);
                setInviting(false);
                setPhone('');
              }}
            >
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
