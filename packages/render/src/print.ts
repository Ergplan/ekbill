import { createHash } from 'node:crypto';

import { businesses, documentFiles, documents, files, type DocumentFile, type TenantScope } from '@ekbill/db';
import type { IssuedSnapshot } from '@ekbill/engine';

import { renderJpeg, renderPdf, upiQrDataUrl } from './render';
import type { Design, Paper } from './template';

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

export async function printAndKeep(
  scope: TenantScope,
  input: { documentId: string; kind: FileKind; paper: Paper; design?: Design },
): Promise<DocumentFile & { bytes: Buffer }> {
  const existing = await documentFiles.findRendering(scope, {
    documentId: input.documentId,
    kind: input.kind,
    paper: input.paper,
    design: input.design ?? 'classic',
  });
  if (existing) return existing;
  const doc = await documents.getDocument(scope, input.documentId);
  if (doc.status === 'draft' || !doc.issuedSnapshot || !doc.number)
    throw new Error('only an issued document is printed');
  const snapshot = doc.issuedSnapshot as IssuedSnapshot;
  const profile = await businesses.getProfile(scope);
  const design = input.design ?? profile.look.design;
  const [logo, signature] = await Promise.all([
    dataUrlOf(scope, snapshot.seller.logoRef),
    dataUrlOf(scope, snapshot.seller.signatureRef),
  ]);
  const qr =
    snapshot.kind === 'credit-note'
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
    look: { design, paper: input.paper, accent: profile.look.accent },
    logoDataUrl: logo,
    signatureDataUrl: signature,
    upiQrDataUrl: qr,
  };
  const t0 = Date.now();
  const bytes = input.kind === 'pdf' ? await renderPdf(printInput) : await renderJpeg(printInput);
  const renderMs = Date.now() - t0;
  if (!(documentFiles.allowedRoles.storeRendering as readonly string[]).includes(scope.role)) {
    // The accountant reads: the file is printed for them and not kept (keeping is a write).
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
  return { ...stored, bytes: Buffer.from(bytes) };
}

/** Every format, paper and design combination of the business's look not kept yet: the worker's render-other-sizes. */
export async function printTheRest(scope: TenantScope, documentId: string): Promise<number> {
  const profile = await businesses.getProfile(scope);
  const have = await documentFiles.renderingsOf(scope, documentId);
  let made = 0;
  for (const kind of ['pdf', 'jpg'] as const) {
    for (const paper of ['a4', 'a5', '80mm', '58mm'] as const) {
      if (have.some((f) => f.kind === kind && f.paper === paper && f.design === profile.look.design)) continue;
      await printAndKeep(scope, { documentId, kind, paper, design: profile.look.design });
      made += 1;
    }
  }
  return made;
}
