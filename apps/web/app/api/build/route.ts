import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Which build is serving, and nothing else (no database, unlike /api/health): a phone coming back to the app asks
 * it, and reloads when the build is not the one its page came from (Hydrated.tsx).
 */
export function GET() {
  return NextResponse.json(
    { builtAt: process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'unknown' },
    { headers: { 'cache-control': 'no-store' } },
  );
}
