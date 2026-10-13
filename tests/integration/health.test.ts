import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

/**
 * /api/health against the real test database (global setup migrated it).
 * The route must never leak secrets: it reports state words and the schema tag.
 */
describe('GET /api/health', () => {
  afterEach(() => {
    delete process.env.BACKUP_STATE_FILE;
  });

  it('reports ok, the schema version and sign-in off', async () => {
    const { GET } = await import('../../apps/web/app/api/health/route');
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.database).toBe('ok');
    expect(body.schema).toMatch(/^\d{4}_/);
    expect(body.authMode).toBe('switcher');
    expect(body.signIn).toContain('switched off');
    expect(body.lastBackup).toBe('none');
    expect(JSON.stringify(body)).not.toMatch(/postgres:\/\//);
  });

  it('reports the last backup age once a backup exists', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ekbill-backup-'));
    const file = join(dir, 'last-backup.json');
    const at = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    writeFileSync(file, JSON.stringify({ at, object: 'gs://bucket/pg/ekbill2-x.dump', bytes: 12345 }));
    process.env.BACKUP_STATE_FILE = file;
    const { GET } = await import('../../apps/web/app/api/health/route');
    const body = await (await GET()).json();
    expect(body.lastBackup.at).toBe(at);
    expect(body.lastBackup.ageHours).toBe(3);
    expect(body.lastBackup.bytes).toBe(12345);
  });
});
