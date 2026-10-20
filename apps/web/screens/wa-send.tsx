'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import { toE164 } from '@ekbill/engine';
import { Field, Input, Meta, OutlineButton, WhatsAppButton } from '@ekbill/ui';

import { rememberPhone } from '../actions/people';
import { handoffToWhatsApp, handoffWithFile, openWhatsAppChat } from './share';

/**
 * A bill to the customer's WhatsApp by their number (20 Oct, the operator: "the shopkeeper may not have the new
 * customer's number stored in WhatsApp"). The number is typed here, or is the customer's on record; the button opens
 * that number's chat straight away (wa.me, saved contact or not) with the message and the bill's own link, and the
 * number is kept on the customer for next time. The owner presses Send in WhatsApp: the app never sends by itself.
 * With no number, the phone's share sheet as before; "File share karo" attaches the PDF or JPG that way too.
 */
export function WhatsAppSend({
  text,
  title,
  link,
  phone: known,
  customerId,
  file,
  guide = 'whatsapp',
  sentLabel,
  onSent,
  buttonClassName,
}: {
  /** The message without the link. */
  text: string;
  title: string;
  /** The bill's own link (the customer opens it without signing in); null for a look at the prototype. */
  link: string | null;
  phone: string | null;
  /** Where the typed number is kept; null when the bill's customer is not on record. */
  customerId: string | null;
  /** The bill's file, for the share sheet; null for a look. */
  file: { url: string; name: string; type: string } | null;
  guide?: string;
  /** The button's words once the chat opened (the done screen's "Bhej diya"). */
  sentLabel?: string;
  onSent?: () => void;
  /** Around the button alone (the done screen keeps it at the bottom of the screen; the number stays in the page). */
  buttonClassName?: string;
}) {
  const [phone, setPhone] = useState(known ?? '');
  const [error, setError] = useState<string | undefined>(undefined);
  const [opened, setOpened] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [fileError, setFileError] = useState(false);
  const message = link ? `${text}\n${t('done.wa.link', { link })}` : text;

  const send = () => {
    setError(undefined);
    setFileError(false);
    const typed = phone.trim();
    if (!typed) {
      // No number: the share sheet (the file where the phone can attach it), as before.
      const go = file
        ? handoffWithFile({ title, text: message, phone: null, file })
        : handoffToWhatsApp({ title, text: message, phone: null });
      void go.then((r) => {
        if (r === 'failed') setFileError(true);
        else if (r !== 'cancelled') {
          setSent(true);
          onSent?.();
        }
      });
      return;
    }
    const e164 = toE164(typed);
    if (!e164) {
      setError(t('wa.number.error'));
      return;
    }
    // In the tap itself: a popup opened after an await is blocked.
    if (openWhatsAppChat({ phone: e164, text: message }) === 'cancelled') return;
    setOpened(e164);
    setSent(true);
    onSent?.();
    if (customerId && toE164(known) !== e164)
      void rememberPhone({ id: customerId, phone: e164 }).then((r) => {
        if (!r.ok) setError(t(r.error, 'say' in r && r.say ? r.say.params : undefined));
      });
  };

  return (
    <div className="eb-stack" data-guide={guide}>
      <Field id="wa-phone" label={t('wa.number')} hint={t('wa.number.hint')} error={error}>
        <Input
          id="wa-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          maxLength={20}
          placeholder="98765 43210"
          value={phone}
          onChange={(e) => {
            setError(undefined);
            setPhone(e.target.value);
          }}
        />
      </Field>
      <div className={buttonClassName}>
        <WhatsAppButton onClick={send} aria-pressed={sent}>
          {sent && sentLabel ? sentLabel : t('action.whatsapp')}
        </WhatsAppButton>
      </div>
      {opened ? (
        <p className="eb-meta" role="status" data-testid="wa-opened">
          {t('wa.sent.to', { phone: opened })}
        </p>
      ) : null}
      {file ? (
        <OutlineButton
          data-guide="share-file"
          onClick={() => {
            setFileError(false);
            void handoffWithFile({ title, text: message, phone: null, file }).then((r) => {
              if (r === 'failed') setFileError(true);
            });
          }}
        >
          {t('wa.file')}
        </OutlineButton>
      ) : null}
      {fileError ? <Meta>{t('done.file.error')}</Meta> : null}
    </div>
  );
}
