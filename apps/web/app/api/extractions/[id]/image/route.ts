import { NextResponse } from 'next/server';

import { NotFoundError, photos } from '@ekbill/db';
import { isUuid } from '@ekbill/engine';

import { current } from '../../../../../server/session';

export const dynamic = 'force-dynamic';

/** The photo as the model saw it (upright, ≤ 2000 px), for the review screen; members of the business only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new NextResponse(null, { status: 404 });
  const me = await current();
  if (!me?.scope) return new NextResponse(null, { status: 401 });
  try {
    const image = await photos.imageOf(me.scope, id);
    if (!image) return new NextResponse(null, { status: 404 });
    return new NextResponse(new Uint8Array(image), {
      status: 200,
      headers: {
        'content-type': 'image/jpeg',
        'content-length': String(image.length),
        'cache-control': 'private, max-age=3600',
        'x-content-type-options': 'nosniff',
      },
    });
  } catch (e) {
    if (e instanceof NotFoundError) return new NextResponse(null, { status: 404 });
    throw e;
  }
}
