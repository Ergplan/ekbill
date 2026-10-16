import { AiOutputError, AiUnavailableError, callVision, readBillAnswer } from '@ekbill/ai';
import { aiCalls, businesses, customers, items, photos, type TenantScope } from '@ekbill/db';
import { ENGINE_REGISTRATION, checkReading, todayIst, type BillReading } from '@ekbill/engine';

import { doclingConfig, readWithDocling } from '../import/docling';
import { NotAPhotoError, normalisePhoto } from './normalise';

/**
 * read-bill (Stage 7): one photographed bill into one extraction. Normalise
 * the photo; ask Docling for the printed text where it runs (a hint, never
 * the answer); ask the vision model through packages/ai with the business's
 * customer and item names as spelling hints; check the answer with the
 * engine (numbers, quantity × rate, the date, the customer, the total by
 * computeTax); record it. It writes as the model, so the database lets it
 * write the reading and nothing else (I6, guard_extraction). Never a bill.
 */
export const READ_BILL = 'read-bill';
export const PROMPT = { name: 'read-bill', version: 1 } as const;

export interface ReadBillJob {
  extractionId: string;
  businessId: string;
  userId: string;
  role: TenantScope['role'];
  requestId: string;
}

export async function runReadBill(job: ReadBillJob, now: Date = new Date()): Promise<string> {
  const person: TenantScope = {
    businessId: job.businessId,
    userId: job.userId,
    role: job.role,
    requestId: job.requestId,
    actorKind: 'system',
  };
  const model: TenantScope = { ...person, actorKind: 'model' };
  const photo = await photos.photoOf(person, job.extractionId);

  let jpeg: Buffer;
  try {
    jpeg = (await normalisePhoto(photo.bytes)).jpeg;
  } catch (e) {
    if (!(e instanceof NotAPhotoError)) throw e;
    await photos.recordReading(model, job.extractionId, { status: 'failed', error: 'unreadable' });
    return 'unreadable';
  }

  // Docling reads print well and handwriting badly: its text goes to the model as a hint only.
  let hint = '';
  if (doclingConfig().url) {
    try {
      const { pages } = await readWithDocling('bill.jpg', jpeg, { forceOcr: true });
      hint = pages.join('\n').slice(0, 4000);
    } catch {
      hint = '';
    }
  }

  const [profile, people, things] = await Promise.all([
    businesses.getProfile(person),
    customers.listCustomers(person),
    items.listItems(person),
  ]);
  const today = todayIst(now);
  const text = [
    `Today is ${today}. The seller is ${profile.legalName}${profile.gstin ? ` (GSTIN ${profile.gstin})` : ''}.`,
    `Known customers (spelling hints): ${
      people
        .slice(0, 80)
        .map((c) => c.name)
        .join('; ') || 'none yet'
    }.`,
    `Known items (spelling hints): ${
      things
        .slice(0, 80)
        .map((i) => i.name)
        .join('; ') || 'none yet'
    }.`,
    hint ? `Printed text Docling found on the photo (may be wrong for handwriting):\n${hint}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  let call;
  try {
    call = await callVision({
      purpose: 'read-bill',
      prompt: PROMPT,
      text,
      imageJpeg: jpeg,
      key: photo.sha256,
      output: readBillAnswer,
      record: (row) => aiCalls.recordAiCall(person, row),
    });
  } catch (e) {
    const error = e instanceof AiUnavailableError ? 'ai-unavailable' : e instanceof AiOutputError ? 'invalid' : 'error';
    await photos.recordReading(model, job.extractionId, {
      status: 'failed',
      error,
      image: jpeg,
      doclingUsed: Boolean(hint),
      promptVersion: `${PROMPT.name}/v${PROMPT.version}`,
    });
    return error;
  }

  const checked = checkReading(call.value as BillReading, {
    today,
    customers: people.map((c) => ({ id: c.id, name: c.name, phone: c.phone })),
    registration: ENGINE_REGISTRATION[profile.registrationType],
    sellerStateCode: profile.stateCode,
  });
  await photos.recordReading(model, job.extractionId, {
    status: checked.outcome === 'ready' ? 'ready' : 'failed',
    error: checked.outcome === 'ready' ? null : checked.outcome,
    model: call.model,
    promptVersion: call.promptVersion,
    doclingUsed: Boolean(hint),
    image: jpeg,
    result: checked,
    warnings: checked.warnings,
    matchedCustomerId: checked.match?.customerId ?? null,
    matchScorePct: checked.match ? Math.round(checked.match.score * 100) : null,
    aiCallId: call.callId,
    costMicros: call.costMicros,
    latencyMs: call.latencyMs,
  });
  return checked.outcome;
}
