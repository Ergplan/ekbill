import { readFileSync } from 'node:fs';

import { NextResponse } from 'next/server';

import { schemaStatus } from '@ekbill/db';

import { logRequest, requestId } from '../../../lib/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * What this installation can do. State, never secrets: whether Postgres
 * answered and which migration it is on, which auth mode is on, when this
 * build was made, how old the last backup is (deploy/vm/backup.sh writes a
 * small state file the container mounts read-only). Stage 10 adds queue age.
 * Every call is logged with its request id (I7) and answers with it.
 */
interface BackupState {
  at: string;
  object?: string;
  bytes?: number;
}

function lastBackup(): (BackupState & { ageHours: number }) | 'none' {
  const file = process.env.BACKUP_STATE_FILE ?? '/app/state/last-backup.json';
  try {
    const state = JSON.parse(readFileSync(file, 'utf8')) as BackupState;
    const at = Date.parse(state.at);
    if (Number.isNaN(at) || !(typeof state.bytes === 'number' && state.bytes > 0)) return 'none';
    return { at: state.at, bytes: state.bytes, ageHours: Math.round((Date.now() - at) / 3_600_000) };
  } catch {
    return 'none';
  }
}

export async function GET(request: Request) {
  const id = requestId(request);
  const db = await schemaStatus();
  const authMode = process.env.AUTH_MODE ?? 'switcher';
  const body = {
    ok: db.ok,
    builtAt: process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'unknown',
    authMode,
    signIn: authMode === 'otp' ? 'required' : 'switched off - test data only',
    database: db.ok ? 'ok' : 'FAILED',
    schema: db.version ?? 'none',
    lastBackup: lastBackup(),
    ...(db.error ? { databaseError: db.error } : {}),
  };
  logRequest('GET /api/health', id, { ok: db.ok, schema: body.schema });
  return NextResponse.json(body, { status: db.ok ? 200 : 503, headers: { 'x-request-id': id } });
}
