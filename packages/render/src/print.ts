import { createHash } from 'node:crypto';

import { businesses, documentFiles, documents, files, type DocumentFile, type TenantScope } from '@ekbill/db';
import type { IssuedSnapshot } from '@ekbill/engine';

import { renderJpeg, renderPdf, upiQrDataUrl } from './render';
import { DESIGNS, type Design, type Paper } from './template';

/**
 * Print a bill and keep the file (Stage 6): the web server at issue (the
 * format the business shares, synchronously, budget 3 s) and the worker
 * for the other sizes. Everything comes from the issued snapshot; the
 * logo and signature are the business files the snapshot names, which
 * never change, so a re-render prints what the customer got (I2).
 */
export type FileKind = 'pdf' | 'jpg';

async function dataUrlOf(scope: TenantScope, fileId: string | null | undefined): Promise<string | null> {
  if (!fileId) return null;
  try {
    const f = await files.getFile(scope, fileId);
    return `data:${f.mime};base64,${Buffer.from(f.bytes).toString('base64')}`;
  } catch {
    return null;
  }
}

/** The look a bill prints in: the one kept in its snapshot at issue, else (older bills) the business's today. */
async function lookOf(scope: TenantScope, snapshot: IssuedSnapshot): Promise<{ design: Design; accent: string }> {
  const kept = snapshot.seller.look;
  if (kept && (DESIGNS as readonly string[]).includes(kept.design))
    return { design: kept.design as Design, accent: kept.accent };
  const profile = await businesses.getProfile(scope);
  return { design: profile.look.design, accent: profile.look.accent };
}

export async function printAndKeep(
  scope: TenantScope,
  input: { documentId: string; kind: FileKind; paper: Paper; design?: Design },
): Promise<DocumentFile & { bytes: Buffer }> {
  const doc = await documents.getDocument(scope, input.documentId);
  if (doc.status === 'draft' || !doc.issuedSnapshot || !doc.number)
    throw new Error('only an issued document is printed');
  // The design is settled before the kept file is looked for: the look the bill was issued with (I2, Stage 6 review:
  // a later change of look reprinted old bills in it), else, for a bill issued before the look was kept, the
  // business's own.
  const look = await lookOf(scope, doc.issuedSnapshot as IssuedSnapshot);
  const design = input.design ?? look.design;
  const key = { documentId: input.documentId, kind: input.kind, paper: input.paper, design };
  // A cancelled bill prints as what it is, CANCELLED across it and no QR to pay it by, never from the file kept
  // while it stood (Stage 11 review: it downloaded, and went into the CA pack, as a clean tax invoice).
  const cancelled = doc.status === 'cancelled';
  if (!cancelled) {
    const existing = await documentFiles.findRendering(scope, key);
    if (existing) return existing;
  }
  const snapshot = doc.issuedSnapshot as IssuedSnapshot;
  const [logo, signature] = await Promise.all([
    dataUrlOf(scope, snapshot.seller.logoRef),
    dataUrlOf(scope, snapshot.seller.signatureRef),
  ]);
  const qr =
    snapshot.kind === 'credit-note' || cancelled
      ? null
      : await upiQrDataUrl({
          vpa: snapshot.seller.upi,
          payeeName: snapshot.seller.legalName,
          amountPaise: snapshot.totals.totalPaise,
          reference: doc.number,
        });
  const printInput = {
    snapshot,
    number: doc.number,
    dueDate: doc.dueDate,
    look: { design, paper: input.paper, accent: look.accent },
    logoDataUrl: logo,
    signatureDataUrl: signature,
    upiQrDataUrl: qr,
    watermark: cancelled ? 'CANCELLED' : null,
  };
  const t0 = Date.now();
  const bytes = input.kind === 'pdf' ? await renderPdf(printInput) : await renderJpeg(printInput);
  const renderMs = Date.now() - t0;
  if (cancelled || !(documentFiles.allowedRoles.storeRendering as readonly string[]).includes(scope.role)) {
    // A cancelled bill's print is not kept (nor one for a role that may not keep files).
    return {
      id: '',
      documentId: doc.id,
      kind: input.kind,
      paper: input.paper,
      design,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      renderMs,
      bytes,
    };
  }
  const stored = await documentFiles.storeRendering(scope, {
    documentId: doc.id,
    kind: input.kind,
    paper: input.paper,
    design,
    bytes,
    renderMs,
  });
  if (stored.sha256 === createHash('sha256').update(bytes).digest('hex'))
    return { ...stored, bytes: Buffer.from(bytes) };
  // Another print of the same combination was kept first (the worker's, or a second tap): that file is the bill,
  // never this render.
  const kept = await documentFiles.findRendering(scope, key);
  if (!kept) throw new Error('a kept bill file went missing');
  return kept;
}

/** Every format, paper and design combination of the business's look not kept yet: the worker's render-other-sizes. */
export async function printTheRest(scope: TenantScope, documentId: string): Promise<number> {
  const doc = await documents.getDocument(scope, documentId);
  if (!doc.issuedSnapshot) return 0;
  const { design } = await lookOf(scope, doc.issuedSnapshot as IssuedSnapshot);
  const have = await documentFiles.renderingsOf(scope, documentId);
  let made = 0;
  for (const kind of ['pdf', 'jpg'] as const) {
    for (const paper of ['a4', 'a5', '80mm', '58mm'] as const) {
      if (have.some((f) => f.kind === kind && f.paper === paper && f.design === design)) continue;
      await printAndKeep(scope, { documentId, kind, paper, design });
      made += 1;
    }
  }
  return made;
}
