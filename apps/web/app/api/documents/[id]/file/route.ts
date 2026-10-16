import { NextResponse } from 'next/server';

import { NotFoundError, documents } from '@ekbill/db';
import { PAPERS, printAndKeep, type Paper } from '@ekbill/render';

import { billFileName } from '../../../../../screens/links';
import { log } from '../../../../../server/log';
import { current } from '../../../../../server/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * A bill's file: GET /api/documents/<id or number>/file?kind=pdf|jpg&paper=a4|a5|80mm|58mm[&download=1].
 * Any member of the business (the accountant included: reading is theirs);
 * the scope comes from the session and RLS fences the rest. A kept rendering
 * is served as kept; one not kept yet is printed from the issued snapshot
 * (and kept, for owner and staff). The bytes never change once kept (I2).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: raw } = await params;
  const me = await current();
  if (!me?.scope) return new NextResponse(null, { status: 401 });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') === 'jpg' ? 'jpg' : 'pdf';
  const paperParam = (url.searchParams.get('paper') ?? 'a4').toLowerCase();
  if (!(PAPERS as readonly string[]).includes(paperParam)) return new NextResponse(null, { status: 400 });
  const paper = paperParam as Paper;
  const id = await documents.findBill(me.scope, decodeURIComponent(raw));
  if (!id) return new NextResponse(null, { status: 404 });
  try {
    const doc = await documents.getDocument(me.scope, id);
    const file = await printAndKeep(me.scope, { documentId: id, kind, paper });
    const name = billFileName(doc.number ?? 'bill', kind);
    const download = url.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
        'content-length': String(file.bytes.length),
        'content-disposition': `${download ? 'attachment' : 'inline'}; filename="${name}"`,
        'cache-control': 'private, max-age=3600',
        etag: `"${file.sha256}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse(null, { status: 404 });
    log.error({ requestId: me.scope.requestId, documentId: id, err: e }, 'bill file failed');
    return new NextResponse(null, { status: 500 });
  }
}
