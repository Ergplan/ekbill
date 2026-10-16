'use server';

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
 * a short Hinglish reply for the model to say and, where it opens a screen,
 * the address; none of them writes anything (rule 17: the voice opens and
 * fills, the owner commits).
 */
export type VoiceReply = { ok: boolean; reply: string; href?: string; lines?: SpokenLine[] };

const NOT_YET = 'Pehle dukaan ki jaankari poori karo, phir yeh kar sakte hain.';

async function scope() {
  return (await current())?.scope ?? null;
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
  const s = await scope();
  if (!s) return { ok: false, reply: NOT_YET };
  return { ok: true, reply: whoOwesReply(await dues(s)) };
}

export async function voiceStartBill(input: unknown): Promise<VoiceReply> {
  const parsed = voiceBillInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: 'Samjha nahi, dobara bolo?' };
  const s = await scope();
  if (!s) return { ok: false, reply: NOT_YET };
  if (s.role === 'accountant') return { ok: false, reply: 'Accountant bill nahi banate; owner ya staff banayenge.' };
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
    reply: `${customer?.name ?? (said || 'Naye customer')} ka bill khul raha hai, ${lines.length} line ke saath. Check karwao; Bill banao owner dabayenge.`,
  };
}

export async function voiceRemind(input: unknown): Promise<VoiceReply> {
  const parsed = voiceNameInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: 'Kiska reminder?' };
  const s = await scope();
  if (!s) return { ok: false, reply: NOT_YET };
  const said = parsed.data.customerName;
  const due = await dues(s);
  const who = reminderFor(said, await customers.listCustomers(s), due);
  if (who.kind === 'ask') return { ok: false, reply: `Kaunse ${said}? ${who.names.join(', ')}.` };
  if (who.kind === 'none') return { ok: false, reply: `${who.name} ke koi paise baaki nahi.` };
  const row = who.row;
  return {
    ok: true,
    href: `/bills/${encodeURIComponent(row.number)}/remind${row.financialYear ? `?fy=${row.financialYear}` : ''}`,
    reply: `${row.customerName} ka reminder khul raha hai. WhatsApp pe bhejna owner dabayenge.`,
  };
}

export async function voiceAsk(input: unknown): Promise<VoiceReply> {
  const parsed = voiceAskInput.safeParse(input);
  if (!parsed.success) return { ok: false, reply: 'Kya poochna hai?' };
  const s = await scope();
  if (!s) return { ok: false, reply: NOT_YET };
  const r = await askRecords(s, parsed.data.question);
  if (r.answer) return { ok: true, reply: r.answer.replace(/\s*\[\d+\]/g, '') };
  if (!r.sources.length) return { ok: true, reply: 'Records mein yeh nahi mila.' };
  return { ok: true, reply: `Seedha jawab nahi bana. Yeh mila: ${r.sources.map((x) => x.title).join('; ')}.` };
}
