'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import {
  AttachmentRow,
  GhostButton,
  HeroPanel,
  MessagePreview,
  Meta,
  ToneSegmented,
  WhatsAppButton,
  type Tone,
} from '@ekbill/ui';

import { AppShell, type ShellViewer } from '../shell/AppShell';
import { shortDate } from '../fixtures';
import { handoffToWhatsApp } from '../share';
import { manifest } from './manifest';
import type { RemindData } from './data';

export function RemindScreen({ data, viewer }: { data: RemindData; viewer: ShellViewer }) {
  const [tone, setTone] = useState<Tone>('gentle');
  const [lang, setLang] = useState<'hi-Latn' | 'en'>(data.lang);
  const [opened, setOpened] = useState(false);
  const text = data.messages[lang][tone];
  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back={`/bills/${data.bill.number}`}
      title={t('remind.title', { customer: data.customerName })}
      sub={t('remind.meta', { date: shortDate(data.bill.date), days: data.days })}
      tour={manifest.tour}
      noTabs
    >
      <HeroPanel title={t('remind.title', { customer: data.customerName })} sub={t('remind.preview')} guide="preview">
        <div data-guide="tone">
          <ToneSegmented
            value={tone}
            onChange={setTone}
            onHero
            labels={{
              gentle: t('remind.tone.warm'),
              direct: t('remind.tone.direct'),
              second: t('remind.tone.second'),
              group: 'Tone',
            }}
          />
        </div>
        <MessagePreview
          text={text}
          attachment={
            <AttachmentRow
              kind={data.share}
              name={data.fileName}
              note={data.share === 'pdf' ? t('remind.attach.pdf') : t('remind.attach.jpg')}
            />
          }
        />
      </HeroPanel>
      <div className="eb-actions">
        <GhostButton data-guide="lang" onClick={() => setLang(lang === 'en' ? 'hi-Latn' : 'en')}>
          {t('remind.lang')} · {lang === 'en' ? 'English' : 'Hinglish'}
        </GhostButton>
      </div>
      <Meta>{t('remind.attach')}</Meta>
      <div className="eb-sticky eb-sticky--bare" data-guide="open">
        <WhatsAppButton
          onClick={() => {
            void handoffToWhatsApp({ text, title: data.fileName }).then((r) => {
              if (r !== 'cancelled') setOpened(true);
            });
          }}
          aria-pressed={opened}
        >
          {opened ? t('done.sent') : t('remind.open')}
        </WhatsAppButton>
      </div>
    </AppShell>
  );
}
