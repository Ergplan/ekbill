import { NextResponse } from 'next/server';

import { ForbiddenError, photos } from '@ekbill/db';

import { log } from '../../../server/log';
import { enqueue } from '../../../server/queue';
import { sendOrUndo } from '../../../server/send-or-undo';
import { current } from '../../../server/session';

export const dynamic = 'force-dynamic';

/**
 * "Photo se bill" (Stage 7): the picked photo (multipart, field "photo"),
 * kept, and a reading queued for the worker (read-bill). Owner and staff;
 * one photo of 8 MB at most. Answers the reading's id; the photo screen
 * waits on it. Nothing here calls a model.
 */
export async function POST(request: Request) {
  const me = await current();
  if (!me?.scope) return NextResponse.json({ error: 'auth.signed.out' }, { status: 401 });
  // Refused before the body is read (one photo, with the multipart framing).
  if (Number(request.headers.get('content-length') ?? 0) > photos.PHOTO_MAX_BYTES + 1024 * 1024)
    return NextResponse.json({ error: 'photo.error.too-big' }, { status: 413 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'form.invalid' }, { status: 400 });
  }
  const photo = form.get('photo');
  if (!photo || typeof photo !== 'object' || !('arrayBuffer' in photo))
    return NextResponse.json({ error: 'photo.error.empty' }, { status: 400 });
  try {
    const started = await photos.startRead(me.scope, {
      name: photo.name,
      mime: photo.type || 'image/jpeg',
      bytes: new Uint8Array(await photo.arrayBuffer()),
    });
    const scope = me.scope;
    const sent = await sendOrUndo(
      () =>
        enqueue('read-bill', {
          extractionId: started.extractionId,
          businessId: scope.businessId,
          userId: scope.userId,
          role: scope.role,
          requestId: scope.requestId,
        }),
      () => photos.discardReading(scope, started.extractionId),
      (err, step) =>
        log.error(
          { err, step, requestId: scope.requestId, extractionId: started.extractionId },
          'photo read not queued',
        ),
    );
    if (!sent) return NextResponse.json({ error: 'photo.error.queue' }, { status: 503 });
    log.info({ requestId: me.scope.requestId, extractionId: started.extractionId }, 'photo read queued');
    return NextResponse.json({ id: started.extractionId }, { status: 202 });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: 'auth.forbidden' }, { status: 403 });
    if (e instanceof photos.PhotoError) return NextResponse.json({ error: `photo.error.${e.code}` }, { status: 400 });
    throw e;
  }
}
