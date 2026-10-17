import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { sendOrUndo } from '../../apps/web/server/send-or-undo';
import * as imports from '../../packages/db/src/repos/imports';
import * as photos from '../../packages/db/src/repos/photos';
import { scopeFor, seeded } from './helpers';

/**
 * Uploads (Stage 5 and 7 reviews). The upload is kept, then the queue send fails. Nothing would ever read it and the screen
 * would wait forever; instead the uploader's own scope sets it aside (the photo discarded, the import failed) and
 * the route answers 503 for them to send it again.
 */
seeded();
const queueDown = () => Promise.reject(new Error('queue down'));

describe('a failed queue send sets the upload aside', () => {
  it('photo: the pending reading is discarded by staff', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const bytes = readFileSync(join(__dirname, '..', 'fixtures', 'bills', 'synthetic', 'kaccha-03.jpg'));
    const { extractionId } = await photos.startRead(staff, { name: 'k.jpg', mime: 'image/jpeg', bytes });
    const seen: string[] = [];
    const sent = await sendOrUndo(
      queueDown,
      () => photos.discardReading(staff, extractionId),
      (_, step) => seen.push(step),
    );
    expect(sent).toBe(false);
    expect(seen).toEqual(['send']);
    expect((await photos.getExtraction(staff, extractionId)).status).toBe('discarded');
  });

  it('import: the reading import is failed, with the reason', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const started = await imports.startImport(staff, [
      { name: 'p.csv', mime: 'text/csv', bytes: new TextEncoder().encode('Name,Phone\nAsha,9822000000\n') },
    ]);
    const sent = await sendOrUndo(
      queueDown,
      () => imports.failImport(staff, started.id, 'queue'),
      () => undefined,
    );
    expect(sent).toBe(false);
    expect((await imports.getImport(staff, started.id)).import).toMatchObject({ status: 'failed', error: 'queue' });
  });
});

describe('an import keeps at most so many customers (Stage 5 review)', () => {
  const reading = (names: string[]): imports.FileReading => ({
    name: 'parties.csv',
    kind: 'csv',
    reader: 'sheet',
    pages: 1,
    found: names.length,
    problem: null,
    customers: names.map((name) => ({ name }) as imports.FileReading['customers'][number]),
  });

  it('new customers take the places first, and the cut file says so', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const tag = String(Date.now()).slice(-6);
    const started = await imports.startImport(staff, [
      { name: 'parties.csv', mime: 'text/csv', bytes: new TextEncoder().encode('Name\nx\n') },
    ]);
    // Mehta Traders is already a customer: it is kept only after the new ones.
    await imports.recordReading(
      staff,
      started.id,
      [reading(['Mehta Traders', `Cut A ${tag}`, `Cut B ${tag}`, `Cut C ${tag}`])],
      2,
    );
    const { import: imp, rows } = await imports.getImport(staff, started.id);
    expect(rows.map((r) => (r.candidate as { name: string }).name)).toEqual([`Cut A ${tag}`, `Cut B ${tag}`]);
    expect(imp.summary).toEqual([expect.objectContaining({ name: 'parties.csv', found: 4, problem: 'too-many' })]);
  });

  it('the add action takes all of an import’s rows', async () => {
    const { commitImportInput } = await import('../../apps/web/actions/schema');
    const ids = Array.from({ length: imports.MAX_IMPORT_ROWS }, () => crypto.randomUUID());
    expect(commitImportInput.safeParse({ importId: crypto.randomUUID(), rowIds: ids }).success).toBe(true);
    expect(
      commitImportInput.safeParse({ importId: crypto.randomUUID(), rowIds: [...ids, crypto.randomUUID()] }).success,
    ).toBe(false);
  });
});

describe('a stored business file (Stage 4 review, migration 0011)', () => {
  it('its size is its bytes’ size, and its size and creation never change', async () => {
    const { withTenant } = await import('../../packages/db/src/scope');
    const owner = await scopeFor('sharma', 'owner');
    await expect(
      withTenant(owner, ({ client }) =>
        client.query(
          `insert into business_files (business_id, kind, mime, bytes, size, sha256, created_by)
           values ($1, 'logo', 'image/png', '\\x41'::bytea, 5, repeat('a', 64), $2)`,
          [owner.businessId, owner.userId],
        ),
      ),
    ).rejects.toThrow(/business_files_size_is_bytes/);
    const kept = await withTenant(owner, ({ client }) =>
      client.query<{ id: string }>(
        `insert into business_files (business_id, kind, mime, bytes, size, sha256, created_by)
         values ($1, 'logo', 'image/png', '\\x41'::bytea, 1, repeat('a', 64), $2) returning id`,
        [owner.businessId, owner.userId],
      ),
    );
    const id = kept.rows[0]!.id;
    for (const change of ['size = 2', "created_at = now() - interval '1 day'"])
      await expect(
        withTenant(owner, ({ client }) => client.query(`update business_files set ${change} where id = $1`, [id])),
      ).rejects.toThrow(/never changed/);
  });
});
