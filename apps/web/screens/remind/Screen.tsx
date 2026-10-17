'use client';

import { useEffect, useState } from 'react';

import { LOCALES, LOCALE_NAMES, t, type Locale } from '@ekbill/copy';
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
import { reminderOpened } from '../../actions/bills';
import { billPath } from '../links';
import { billFileUrl, handoffToWhatsApp, handoffWithFile, prefetchFile } from '../share';
import { manifest } from './manifest';
import type { RemindData } from './data';

export function RemindScreen({ data, viewer }: { data: RemindData; viewer: ShellViewer }) {
  const [tone, setTone] = useState<Tone>('gentle');
  const [lang, setLang] = useState<Locale>(data.lang);
  const [opened, setOpened] = useState(false);
  const text = data.messages[lang][tone];
  // The bill's file, fetched ahead so the share tap hands it over at once (Stage 6 review).
  useEffect(() => {
    if (data.live) void prefetchFile(billFileUrl(data.live.documentId, data.share, data.live.paperSize));
  }, [data.live, data.share]);
  return (
    <AppShell
      viewer={viewer}
      tab="home"
      back={billPath(data.bill.number, '', data.bill.fy)}
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
        {/* The message in the next of the app's languages; it opens in the customer's. */}
        <GhostButton data-guide="lang" onClick={() => setLang(LOCALES[(LOCALES.indexOf(lang) + 1) % LOCALES.length]!)}>
          {t('remind.lang')} · {LOCALE_NAMES[lang]}
        </GhostButton>
      </div>
      <Meta>{t('remind.attach')}</Meta>
      <div className="eb-sticky eb-sticky--bare" data-guide="open">
        <WhatsAppButton
          onClick={() => {
            const live = data.live;
            const handoff = live
              ? handoffWithFile({
                  text,
                  title: data.fileName,
                  phone: data.phone,
                  file: {
                    url: billFileUrl(live.documentId, data.share, live.paperSize),
                    name: data.fileName,
                    type: data.share === 'pdf' ? 'application/pdf' : 'image/jpeg',
                  },
                })
              : handoffToWhatsApp({ text, title: data.fileName, phone: data.phone });
            void handoff.then((r) => {
              if (r === 'cancelled' || r === 'failed') return;
              setOpened(true);
              // Kept so the bill shows it was reminded; the app never sends a message itself.
              if (live) void reminderOpened({ documentId: live.documentId, tone, language: lang, text });
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
