/**
 * npm run eval:read-bill [-- --fake] [-- --set real|synthetic]
 *
 * The read-bill pipeline over a labelled set: normalise the photo as the
 * worker does, call the model through packages/ai (prompts/read-bill/vN.md),
 * check the answer with the engine, and compare with the ground truth
 * (the operator's, never the model's). Reports separately:
 *   field accuracy  — customer, date and every line's what/qty/rate/amount, right / all labelled
 *   line recall     — labelled lines found (same thing, same amount) / labelled lines
 *   total match     — bills whose engine total of the lines equals the labelled total
 *   abstention      — fields the model marked unreadable / all fields it was asked for
 * plus calls, failures, latency and cost (when OPENAI_VISION_PRICE_IN/OUT are set).
 * The real set is tests/fixtures/bills/real/<name>.jpg + <name>.json; while it
 * has fewer than 30, the synthetic set fills the run and the counts say so.
 * --fake answers from tests/fixtures/bills/fake (checks the harness, not a model).
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { checkReading, looseDate, nameLikeness, type BillReading } from '@ekbill/engine';

import { normalisePhoto } from '../../../apps/worker/src/read-bill/normalise';
import { AiOutputError, AiUnavailableError, callVision } from '../src/client';
import { readBillAnswer } from '../src/read-bill';
import { chooseSet, denominatorsOf, setCounts, type EvalBill, type Source, type Truth } from './score';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const args = process.argv.slice(2);
if (args.includes('--fake')) process.env.AI_TRANSPORT = 'fake';
const setArg = args[args.indexOf('--set') + 1];
const TODAY = process.env.EVAL_TODAY ?? '2026-10-15';

function labelled(dir: string, source: Source): EvalBill[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f))
    .map((f) => ({ jpg: join(dir, f), json: join(dir, f.replace(/\.[^.]+$/, '.json')) }))
    .filter((x) => existsSync(x.json))
    .map((x) => ({ jpg: x.jpg, truth: JSON.parse(readFileSync(x.json, 'utf8')) as Truth, source }));
}

const real = labelled(join(ROOT, 'tests/fixtures/bills/real'), 'real');
const synthetic = labelled(join(ROOT, 'tests/fixtures/bills/synthetic'), 'synthetic');
const set = chooseSet(real, synthetic, setArg === 'real' || setArg === 'synthetic' ? setArg : null);

const near = (a: number | null | undefined, b: number | null | undefined) =>
  a !== null && a !== undefined && b !== null && b !== undefined && Math.abs(a - b) < 0.005;
const num = (s: string | null | undefined) => (s === null || s === undefined || s === '' ? null : Number(s));

async function main() {
  let fields = 0;
  let right = 0;
  let asked = 0;
  let abstained = 0;
  let linesTruth = 0;
  let linesFound = 0;
  let totalsMatched = 0;
  let billsWithTotal = 0;
  let failures = 0;
  let cost = 0;
  let costKnown = true;
  let incomplete = false;
  const latencies: number[] = [];
  const perBill: unknown[] = [];
  const ran: EvalBill[] = [];
  // A bill not read still counts for what it holds (Stage 7 review: a failure left the denominators).
  const countUnread = (truth: Truth) => {
    const d = denominatorsOf(truth);
    fields += d.fields;
    asked += d.asked;
    linesTruth += d.lines;
    billsWithTotal += d.withTotal;
  };

  for (const [n, bill] of set.entries()) {
    const { jpg, truth } = bill;
    ran.push(bill);
    const bytes = readFileSync(jpg);
    const key = createHash('sha256').update(bytes).digest('hex');
    let checked;
    try {
      const { jpeg } = await normalisePhoto(bytes);
      const call = await callVision({
        purpose: 'read-bill-eval',
        prompt: { name: 'read-bill', version: 1 },
        text: `Today is ${TODAY}.`,
        imageJpeg: jpeg,
        key,
        output: readBillAnswer,
        record: async () => null,
      });
      latencies.push(call.latencyMs);
      if (call.costMicros === null) costKnown = false;
      else cost += call.costMicros;
      checked = checkReading(call.value as BillReading, {
        today: TODAY,
        customers: [],
        registration: 'regular',
        sellerStateCode: '27',
      });
    } catch (e) {
      failures += 1;
      countUnread(truth);
      perBill.push({
        name: truth.name,
        error: e instanceof AiUnavailableError || e instanceof AiOutputError ? e.message : String(e),
      });
      if (e instanceof AiUnavailableError) {
        // The model went away: the rest are not read, and the report says it is incomplete.
        incomplete = true;
        for (const rest of set.slice(n + 1)) {
          ran.push(rest);
          countUnread(rest.truth);
          failures += 1;
        }
        break;
      }
      continue;
    }
    const expectOutcome = truth.legible === false ? 'unreadable' : truth.found === false ? 'no-bill' : 'ready';
    if (expectOutcome !== 'ready') {
      fields += 1;
      if (checked.outcome === expectOutcome) right += 1;
      perBill.push({ name: truth.name, expected: expectOutcome, got: checked.outcome });
      continue;
    }
    // Customer and date.
    const fieldResults: Record<string, boolean> = {};
    const score = (name: string, ok: boolean, unreadable: boolean) => {
      fields += 1;
      asked += 1;
      if (unreadable) abstained += 1;
      if (ok) right += 1;
      fieldResults[name] = ok;
    };
    score(
      'customer',
      Boolean(truth.customer && checked.customer.value && nameLikeness(checked.customer.value, truth.customer) >= 0.9),
      Boolean(checked.customer.unreadable),
    );
    score(
      'date',
      checked.date.value === (truth.date ? looseDate(truth.date, TODAY) : null),
      Boolean(checked.date.unreadable),
    );
    // Lines, aligned by the thing and the amount.
    const used = new Set<number>();
    for (const [i, t] of truth.lines.entries()) {
      linesTruth += 1;
      const j = checked.lines.findIndex(
        (l, k) =>
          !used.has(k) && nameLikeness(l.what.value ?? '', t.what) >= 0.8 && near(num(l.amount.value), t.amount),
      );
      const found = j >= 0 ? checked.lines[j]! : checked.lines[i];
      if (j >= 0) {
        used.add(j);
        linesFound += 1;
      }
      score(
        `lines.${i}.what`,
        Boolean(found && nameLikeness(found.what.value ?? '', t.what) >= 0.9),
        Boolean(found?.what.unreadable),
      );
      score(`lines.${i}.qty`, Boolean(found && near(num(found.qty.value), t.qty)), Boolean(found?.qty.unreadable));
      score(`lines.${i}.rate`, Boolean(found && near(num(found.rate.value), t.rate)), Boolean(found?.rate.unreadable));
      score(
        `lines.${i}.amount`,
        Boolean(found && near(num(found.amount.value), t.amount)),
        Boolean(found?.amount.unreadable),
      );
    }
    if (truth.total !== null) {
      billsWithTotal += 1;
      if (checked.linesTotalPaise === Math.round(truth.total * 100)) totalsMatched += 1;
    }
    perBill.push({
      name: truth.name,
      fields: fieldResults,
      linesTotalPaise: checked.linesTotalPaise,
      warnings: checked.warnings,
    });
  }

  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)} %` : '—');
  const sorted = [...latencies].sort((a, b) => a - b);
  const report = {
    at: new Date().toISOString(),
    transport: process.env.AI_TRANSPORT === 'fake' ? 'fake (harness check, not a model)' : 'openai',
    model: process.env.AI_TRANSPORT === 'fake' ? 'fake-reader' : (process.env.OPENAI_VISION_MODEL ?? null),
    prompt: 'read-bill/v1',
    set: setCounts(ran),
    incomplete,
    fieldAccuracy: pct(right, fields),
    lineRecall: pct(linesFound, linesTruth),
    totalMatch: pct(totalsMatched, billsWithTotal),
    abstention: pct(abstained, asked),
    failures,
    latencyMsMedian: sorted[Math.floor(sorted.length / 2)] ?? null,
    costMicrosPerRead: costKnown && latencies.length ? Math.round(cost / latencies.length) : null,
    perBill,
  };
  const out = join(ROOT, '.watch', 'eval');
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, 'read-bill.json'), `${JSON.stringify(report, null, 2)}\n`);
  const { perBill: _omit, ...summary } = report;
  void _omit;
  console.log(JSON.stringify(summary, null, 2));
  if (failures && process.env.AI_TRANSPORT !== 'fake' && !latencies.length) process.exitCode = 1;
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
