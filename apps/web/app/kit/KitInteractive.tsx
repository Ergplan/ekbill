'use client';

import { useState } from 'react';

import { t } from '@ekbill/copy';
import {
  AddLineButton,
  AttachmentRow,
  CheckStrip,
  ConfidenceField,
  FilterChips,
  GuideHighlight,
  LineItemCard,
  MakeBar,
  MessagePreview,
  OutlineButton,
  RepeatCard,
  SeriesChip,
  ShareToggle,
  SignaturePad,
  Stack,
  TabBar,
  ToneSegmented,
  TotalCard,
  useTour,
  type GuideStep,
  type LineValue,
  type Tone,
} from '@ekbill/ui';

const TOUR: GuideStep[] = [
  { target: 'kiska-bill', say: 'Yahan se bill shuru hota hai: naam pe tap karo.' },
  { target: 'repeat', say: 'Pichli baar jaisa hi? Ek tap mein bhar jaata hai.' },
  { target: 'line-0', say: 'Kya kiya, kitna, rate. Bas teen cheezein.' },
  { target: 'make', say: 'Sab theek? Bill banao dabao.' },
  { target: 'paise', say: 'Kiske paise aane hain, sab yahan.' },
];

const paise = (s: string) => Math.round((Number.parseFloat(s.replace(/,/g, '')) || 0) * 100);

export function KitInteractive({ customerName }: { customerName: string }) {
  const [lines, setLines] = useState<LineValue[]>([
    { what: 'AMC visit — September', qty: '1', rate: '3500' },
    { what: 'Ceiling fan install', qty: '2', rate: '1350' },
  ]);
  const [filled, setFilled] = useState(true);
  const [tone, setTone] = useState<Tone>('direct');
  const [share, setShare] = useState<'pdf' | 'jpg'>('pdf');
  const [filter, setFilter] = useState<'all' | 'due' | 'paid'>('all');
  const [conf, setConf] = useState({ what: 'Fan repair', rate: '450', qty: '' });
  const [signed, setSigned] = useState<string | null>(null);
  const tour = useTour(TOUR);
  const total = lines.reduce((s, l) => s + Math.round(((Number.parseFloat(l.qty) || 0) * paise(l.rate)) / 1), 0);

  return (
    <Stack>
      <RepeatCard
        title={t('bill.repeat')}
        summary={`Aug ka bill: AMC visit + 2 fans · ₹6,200`}
        fillLabel={t('bill.repeat.fill')}
        doneLabel={t('bill.repeat.done')}
        freshLabel={t('bill.repeat.fresh')}
        filled={filled}
        onFill={() => setFilled(true)}
        onFresh={() => {
          setFilled(false);
          setLines([{ what: '', qty: '1', rate: '' }]);
        }}
        guide="repeat"
      />
      {lines.map((l, i) => (
        <LineItemCard
          key={i}
          index={i}
          value={l}
          labels={{
            kaam: t('bill.item'),
            what: t('bill.item.what'),
            whatHint: t('bill.item.what.hint'),
            qty: t('bill.item.qty'),
            rate: t('bill.item.rate'),
            amount: t('bill.item.amount'),
            remove: 'Hatao',
          }}
          onChange={(patch) => setLines((ls) => ls.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
          onRemove={() => setLines((ls) => ls.filter((_, j) => j !== i))}
          removable={lines.length > 1}
          amountPaise={Math.round((Number.parseFloat(l.qty) || 0) * paise(l.rate))}
          guide={`line-${i}`}
        />
      ))}
      <AddLineButton onClick={() => setLines((ls) => [...ls, { what: '', qty: '1', rate: '' }])}>
        {t('bill.item.add')}
      </AddLineButton>
      <CheckStrip
        items={[{ id: 'pos', text: 'Customer ka state chuno', action: <OutlineButton small>Chuno</OutlineButton> }]}
      />
      <TotalCard label={t('bill.total')} paise={total} count={`${lines.length} kaam`} note={t('bill.english.note')} />
      <MakeBar label={t('bill.create')} paise={total} onClick={() => undefined} guide="make" />

      <ToneSegmented
        value={tone}
        onChange={setTone}
        labels={{ gentle: 'Pyaar se', direct: 'Seedha', second: 'Doosri baar', group: 'Tone' }}
      />
      <MessagePreview
        text={`Namaste ${customerName} ji, bill INV-040 ka ₹9,450 24 din se baaki hai. Kripya aaj bhej dein. — Sharma Electricals`}
        attachment={
          <AttachmentRow
            kind={share}
            name={`INV-040.${share}`}
            note="Bill saath jaayega"
            editLabel="Badlo"
            onEdit={() => undefined}
          />
        }
      />
      <ShareToggle value={share} onChange={setShare} labels={{ pdf: 'PDF', jpg: 'Photo', group: 'WhatsApp pe' }} />
      <div className="eb-chips">
        <SeriesChip>INV</SeriesChip>
        <FilterChips
          label="Filter"
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Sab' },
            { value: 'due', label: 'Baaki' },
            { value: 'paid', label: 'Aa gaye' },
          ]}
        />
      </div>

      <Stack gap="row">
        <ConfidenceField
          id="c-what"
          label="Kya kiya?"
          value={conf.what}
          confidence={0.92}
          onChange={(v) => setConf((c) => ({ ...c, what: v }))}
        />
        <ConfidenceField
          id="c-rate"
          label="Rate (₹)"
          value={conf.rate}
          confidence={0.7}
          numeric
          onChange={(v) => setConf((c) => ({ ...c, rate: v }))}
        />
        <ConfidenceField
          id="c-qty"
          label="Kitna"
          value={conf.qty}
          confidence={0}
          unreadable
          numeric
          onChange={(v) => setConf((c) => ({ ...c, qty: v }))}
        />
      </Stack>

      <SignaturePad onChange={setSigned} clearLabel="Phir se" hint={signed ? 'Theek hai ✓' : 'Ungli se sign karo'} />

      <OutlineButton onClick={tour.running ? tour.next : tour.start} data-testid="kit-tour">
        {tour.running ? 'Aage' : 'Tour'}
      </OutlineButton>
      <GuideHighlight step={tour.step} onDone={tour.next} />

      <TabBar
        items={[
          { key: 'home', label: t('nav.home'), icon: 'home', href: '#' },
          { key: 'bills', label: t('nav.bills'), icon: 'receipt', href: '#' },
          { key: 'gst', label: t('nav.gst'), icon: 'percent', href: '#' },
          { key: 'you', label: t('nav.you'), icon: 'user', href: '#' },
        ]}
        current="home"
        micLabel="Bolke batao"
      />
    </Stack>
  );
}
