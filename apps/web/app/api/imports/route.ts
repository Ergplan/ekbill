import { NextResponse } from 'next/server';

import { ForbiddenError, imports } from '@ekbill/db';

import { log } from '../../../server/log';
import { enqueue } from '../../../server/queue';
import { current } from '../../../server/session';

export const dynamic = 'force-dynamic';

/**
 * "Purane bills upload karo": the picked files (multipart, field "files"),
 * kept as an import for the worker to read (Stage 5; I6: staging only).
 * Owner and staff; 20 files of 8 MB at most. Answers the import's id; the
 * screen then waits on its status.
 */
export async function POST(request: Request) {
  const me = await current();
  if (!me?.scope) return NextResponse.json({ error: 'auth.signed.out' }, { status: 401 });
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'form.invalid' }, { status: 400 });
  }
  const files = form.getAll('files').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
  try {
    const started = await imports.startImport(
      me.scope,
      await Promise.all(
        files.map(async (f) => ({ name: f.name, mime: f.type, bytes: new Uint8Array(await f.arrayBuffer()) })),
      ),
    );
    await enqueue('read-import', {
      importId: started.id,
      businessId: me.scope.businessId,
      userId: me.scope.userId,
      role: me.scope.role,
      requestId: me.scope.requestId,
    });
    log.info({ requestId: me.scope.requestId, importId: started.id, files: files.length }, 'import started');
    return NextResponse.json({ id: started.id }, { status: 202 });
  } catch (e) {
    if (e instanceof ForbiddenError) return NextResponse.json({ error: 'auth.forbidden' }, { status: 403 });
    if (e instanceof imports.ImportError)
      return NextResponse.json({ error: `import.error.${e.code}` }, { status: 400 });
    throw e;
  }
}
