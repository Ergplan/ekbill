'use server';

import { localeOf, t, type Locale } from '@ekbill/copy';
import { customers, documents } from '@ekbill/db';
import {
  ageInDays,
  linesFromSpeech,
  matchCustomer,
  reminderFor,
  todayIst,
  whoOwesReply,
  type SpokenLine,
} from '@ekbill/engine';
import { askRecords } from '../server/ask';
import { current } from '../server/session';
import { voiceAskInput, voiceBillInput, voiceNameInput } from './schema';

/**
 * The voice's tools that need the business's records (Stage 9). Each answers
 * a short reply in the person's app language for the model to say and, where
 * it opens a screen, the address; none of them writes anything (rule 17: the
 * voice opens and fills, the owner commits).
 */
export type VoiceReply = { ok: boolean; reply: string; href?: string; lines?: SpokenLine[] };

async function scope() {
  return (await current())?.scope ?? null;
}

async function language(): Promise<Locale> {
  return localeOf((await current())?.user.language);
}

async function dues(s: NonNullable<Awaited<ReturnType<typeof scope>>>) {
  const today = todayIst(new Date());
  return (await documents.listBills(s, { status: 'due', limit: 200 }))
    .filter((r) => r.kind !== 'credit_note' && r.balance.duePaise > 0)
    .map((r) => ({
      number: r.number,
      financialYear: r.financialYear,
      customerId: r.customerId,
      customerName: r.customerName,
      amountPaise: r.balance.duePaise,
      days: ageInDays(r.issueDate, today),
    }));
}

export async function voiceWhoOwes(): Promise<VoiceReply> {
  const l = await language();
  const s = await scope();
  if (!s) return { ok: false, reply: t('voice.reply.notYet', undefined, l) };
  return {
    ok: true,
    reply: whoOwesReply(await dues(s), {
      none: t('voice.reply.dues.none', undefined, l),
      total: (amount, count) => t('voice.reply.dues.total', { amount, count }, l),
      row: (name, amount, days) => t('voice.reply.dues.row', { name, amount, days }, l),
    }),
  };
}

export async function voiceStartBill(input: unknown): Promise<VoiceReply> {
  const l = await language();
  const parsed = voiceBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: t('voice.reply.again', undefined, l) };
  const s = await scope();
  if (!s) return { ok: false, reply: t('voice.reply.notYet', undefined, l) };
  if (s.role === 'accountant') return { ok: false, reply: t('voice.reply.accountant', undefined, l) };
  const said = parsed.data.customerName.trim();
  const lines = linesFromSpeech(parsed.data.lines);
  const customer = said ? matchCustomer(said, await customers.listCustomers(s)) : null;
  const href = customer
    ? `/bills/new?customer=${customer.id}`
    : `/bills/new?new=1${said ? `&name=${encodeURIComponent(said)}` : ''}`;
  return {
    ok: true,
    href,
    lines,
    reply: t(
      'voice.reply.bill',
      { name: customer?.name ?? (said || t('voice.reply.newCustomer', undefined, l)), count: lines.length },
      l,
    ),
  };
}

export async function voiceRemind(input: unknown): Promise<VoiceReply> {
  const l = await language();
  const parsed = voiceNameInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: t('voice.reply.remind.who', undefined, l) };
  const s = await scope();
  if (!s) return { ok: false, reply: t('voice.reply.notYet', undefined, l) };
  const said = parsed.data.customerName;
  const due = await dues(s);
  const who = reminderFor(said, await customers.listCustomers(s), due);
  if (who.kind === 'ask')
    return { ok: false, reply: t('voice.reply.remind.which', { name: said, names: who.names.join(', ') }, l) };
  if (who.kind === 'none') return { ok: false, reply: t('voice.reply.remind.none', { name: who.name }, l) };
  const row = who.row;
  return {
    ok: true,
    href: `/bills/${encodeURIComponent(row.number)}/remind${row.financialYear ? `?fy=${row.financialYear}` : ''}`,
    reply: t('voice.reply.remind.open', { name: row.customerName }, l),
  };
}

export async function voiceAsk(input: unknown): Promise<VoiceReply> {
  const l = await language();
  const parsed = voiceAskInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: t('voice.reply.ask.what', undefined, l) };
  const s = await scope();
  if (!s) return { ok: false, reply: t('voice.reply.notYet', undefined, l) };
  const r = await askRecords(s, parsed.data.question, l);
  if (r.answer) return { ok: true, reply: r.answer.replace(/\s*\[\d+\]/g, '') };
  if (!r.sources.length) return { ok: true, reply: t('voice.reply.ask.none', undefined, l) };
  return { ok: true, reply: t('voice.reply.ask.sources', { titles: r.sources.map((x) => x.title).join('; ') }, l) };
}
