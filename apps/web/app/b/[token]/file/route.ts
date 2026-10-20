import { NextResponse } from 'next/server';

import { PAPERS, printAndKeep, type Paper } from '@ekbill/render';

import { billFileName } from '../../../../screens/links';
import { openBill } from '../../../../server/bill-link';
import { log, requestId } from '../../../../server/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * The bill's file by its own link (20 Oct), for the customer who opened it from WhatsApp: no sign-in, the token is
 * the key. GET /b/<token>/file?kind=pdf|jpg&paper=a4|a5|80mm|58mm[&download=1]. The same kept file the shop shares.
 */
export async function GET(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const id = requestId(request);
  const opened = await openBill((await params).token, id);
  if (!opened) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const kind = url.searchParams.get('kind') === 'jpg' ? 'jpg' : 'pdf';
  const paperParam = (url.searchParams.get('paper') ?? 'a4').toLowerCase();
  if (!(PAPERS as readonly string[]).includes(paperParam)) return new NextResponse(null, { status: 400 });
  try {
    const file = await printAndKeep(opened.scope, { documentId: opened.doc.id, kind, paper: paperParam as Paper });
    const name = billFileName(opened.doc.number ?? 'bill', kind);
    return new NextResponse(new Uint8Array(file.bytes), {
      status: 200,
      headers: {
        'content-type': kind === 'pdf' ? 'application/pdf' : 'image/jpeg',
        'content-length': String(file.bytes.length),
        'content-disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="${name}"`,
        'cache-control': 'private, max-age=600',
        etag: `"${file.sha256}"`,
        'x-content-type-options': 'nosniff',
        'x-robots-tag': 'noindex',
      },
    });
  } catch (e) {
    log.error({ requestId: id, documentId: opened.doc.id, err: e }, 'bill link file failed');
    return new NextResponse(null, { status: 500 });
  }
}
