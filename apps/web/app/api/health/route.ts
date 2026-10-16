import { readFileSync } from 'node:fs';

import { NextResponse } from 'next/server';

import { queueStatus, schemaStatus } from '@ekbill/db';

import { authMode } from '../../../server/auth-mode';
import { logRequest, requestId } from '../../../server/log';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * What this installation can do. State, never secrets: whether Postgres
 * answered and which migration it is on, which auth mode is on, when this
 * build was made, how old the last backup is (deploy/vm/backup.sh writes a
 * small state file the container mounts read-only), and (Stage 10) the queue: per job kind,
 * how many wait and how old the oldest is.
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
  const [db, queue] = await Promise.all([schemaStatus(), queueStatus()]);
  // What the sign-in doors actually do (authMode(): unset is otp, the safe side), not what an unset variable
  // might be taken to mean (Stage 11 review: unset read here as switcher while the doors were otp).
  const mode = authMode();
  const body = {
    ok: db.ok,
    builtAt: process.env.NEXT_PUBLIC_BUILD_STAMP ?? 'unknown',
    authMode: mode,
    signIn: mode === 'otp' ? 'required' : 'switched off - test data only',
    database: db.ok ? 'ok' : 'FAILED',
    schema: db.version ?? 'none',
    lastBackup: lastBackup(),
    queue: {
      waiting: queue.reduce((s, q) => s + q.waiting, 0),
      oldestSeconds: Math.max(0, ...queue.map((q) => q.oldestSeconds)),
      byKind: queue,
    },
  };
  // The database's own words go to the log, not to whoever asks (Stage 11 review).
  logRequest('GET /api/health', id, {
    ok: db.ok,
    schema: body.schema,
    ...(db.error ? { databaseError: db.error } : {}),
  });
  return NextResponse.json(body, { status: db.ok ? 200 : 503, headers: { 'x-request-id': id } });
}
