import { NextResponse } from 'next/server';

import { isMonthPeriod, addMonthsToPeriod } from '@ekbill/engine';
import { buildCaPack } from '@ekbill/render';

import { log } from '../../../../server/log';
import { current } from '../../../../server/session';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * "CA ko bhejo": GET /api/gst/pack?from=YYYY-MM&to=YYYY-MM answers the zip
 * (workings.xlsx, gstr1.json, every bill of the period as PDF). The owner
 * and the accountant; staff do not send the pack (8.0). At most a year.
 */
export async function GET(request: Request) {
  const me = await current();
  if (!me?.scope) return new NextResponse(null, { status: 401 });
  if (me.scope.role === 'staff') return new NextResponse(null, { status: 403 });
  const url = new URL(request.url);
  const from = url.searchParams.get('from') ?? '';
  const to = url.searchParams.get('to') ?? from;
  if (!isMonthPeriod(from) || !isMonthPeriod(to) || to < from) return new NextResponse(null, { status: 400 });
  const months: string[] = [];
  for (let p = from; p <= to && months.length < 12; p = addMonthsToPeriod(p, 1)) months.push(p);
  const t0 = Date.now();
  const pack = await buildCaPack(me.scope, months);
  log.info(
    { requestId: me.scope.requestId, months: months.length, documents: pack.documents, ms: Date.now() - t0 },
    'ca pack',
  );
  return new NextResponse(new Uint8Array(pack.zip), {
    status: 200,
    headers: {
      'content-type': 'application/zip',
      'content-length': String(pack.zip.length),
      'content-disposition': `attachment; filename="${pack.name}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}
