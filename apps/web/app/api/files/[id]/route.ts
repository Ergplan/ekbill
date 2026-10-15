import { NextResponse } from 'next/server';

import { NotFoundError, files } from '@ekbill/db';

import { current } from '../../../../server/session';

export const dynamic = 'force-dynamic';

/**
 * A business file's bytes (the logo on the paper, the signature), for a
 * member of the business only: the scope comes from the session, the row
 * from the repository under that scope (RLS fences the rest).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse(null, { status: 404 });
  const me = await current();
  if (!me?.scope) return new NextResponse(null, { status: 401 });
  try {
    const f = await files.getFile(me.scope, id);
    return new NextResponse(new Uint8Array(f.bytes), {
      status: 200,
      headers: {
        'content-type': f.mime,
        'content-length': String(f.size),
        'cache-control': 'private, max-age=3600',
        etag: `"${f.sha256}"`,
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse(null, { status: 404 });
    throw e;
  }
}
