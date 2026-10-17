import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { runReadImport } from '../../apps/worker/src/import/job';
import { ForbiddenError } from '../../packages/db/src/repos/allow';
import * as customers from '../../packages/db/src/repos/customers';
import * as imports from '../../packages/db/src/repos/imports';
import * as items from '../../packages/db/src/repos/items';
import { seedCustomerId } from '../../packages/db/src/seed';
import { withTenant } from '../../packages/db/src/scope';
import { scopeFor, seeded } from './helpers';

/**
 * Stage 5: customers, items, and the import pipeline (I6: nothing lands
 * without the owner's tick). The import fixtures are the MVP's Tally invoice
 * (as a text PDF) and a party list as CSV: one customer from the PDF, three
 * from the CSV once its repeated row is folded, the one already a customer
 * recognised.
 */
const TODAY = '2026-10-15';
const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', 'import', name)));
const stamp = () => `${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(-9);
const phone = () => `+9198${stamp().padStart(8, '0').slice(-8)}`;

describe('customers', () => {
  seeded();

  it('adds a customer with what the GSTIN says (state, PAN) and the phone in E.164', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const c = await customers.createCustomer(staff, {
      name: '  Nagpur   Sports Club ',
      phone: `98${stamp().slice(-8)}`,
      gstin: '29aagcb7383j1z4',
      language: 'kn',
    });
    expect(c.name).toBe('Nagpur Sports Club');
    expect(c.phone).toMatch(/^\+9198\d{8}$/);
    expect(c.gstin).toBe('29AAGCB7383J1Z4');
    expect(c.stateCode).toBe('29');
    expect(c.pan).toBe('AAGCB7383J');
    expect(c.language).toBe('kn');
    expect(c.languageSource).toBe('owner');
  });

  it('refuses a phone that already belongs to a customer of the business, and a GSTIN that disagrees with the state', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const p = phone();
    await customers.createCustomer(owner, { name: 'First', phone: p });
    await expect(customers.createCustomer(owner, { name: 'Second', phone: p })).rejects.toMatchObject({
      name: 'CustomerError',
      field: 'phone-taken',
    });
    // The same number in another business is another customer (I1).
    await expect(
      customers.createCustomer(await scopeFor('gupta', 'owner'), { name: 'Elsewhere', phone: p }),
    ).resolves.toBeTruthy();
    await expect(
      customers.createCustomer(owner, { name: 'Wrong state', gstin: '29AAGCB7383J1Z4', stateCode: '27' }),
    ).rejects.toMatchObject({ field: 'stateCode', say: { key: 'error.gstinState' } });
  });

  it('staff change a customer; only the owner archives one, and the list hides it', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const owner = await scopeFor('sharma', 'owner');
    const c = await customers.createCustomer(staff, { name: `Archive me ${stamp()}` });
    const changed = await customers.updateCustomer(staff, c.id, { name: `${c.name} Pvt` });
    expect(changed.name).toBe(`${c.name} Pvt`);
    await expect(customers.archiveCustomer(staff, c.id)).rejects.toBeInstanceOf(ForbiddenError);
    await customers.archiveCustomer(owner, c.id);
    expect((await customers.listCustomers(owner)).some((x) => x.id === c.id)).toBe(false);
    expect((await customers.listCustomers(owner, { includeArchived: true })).some((x) => x.id === c.id)).toBe(true);
  });

  it('the seed carries the fixture customers with ids the fixture bills can find', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const mehta = await customers.getCustomer(owner, seedCustomerId('sharma', 'mehta')!);
    expect(mehta.name).toBe('Mehta Traders');
    expect(mehta.phone).toBe('+919822100001');
    const found = await customers.listCustomers(owner, { q: 'mehta' });
    expect(found.map((c) => c.name)).toContain('Mehta Traders');
  });
});

describe('items', () => {
  seeded();

  it('adds an item, and refuses the same name twice whatever its case', async () => {
    const staff = await scopeFor('sharma', 'staff');
    const name = `Inverter service ${stamp()}`;
    const i = await items.createItem(
      staff,
      { name, hsnSac: '998719', unit: 'visit', defaultRatePaise: 150000, defaultTaxBp: 1800 },
      TODAY,
    );
    expect(i).toMatchObject({
      name,
      hsnSac: '998719',
      unit: 'visit',
      defaultRatePaise: 150000,
      defaultTaxBp: 1800,
      priceIncludesTax: false,
    });
    await expect(items.createItem(staff, { name: name.toUpperCase() }, TODAY)).rejects.toMatchObject({
      name: 'ItemError',
      field: 'name-taken',
    });
    // Another business may use the name.
    await expect(items.createItem(await scopeFor('gupta', 'owner'), { name }, TODAY)).resolves.toBeTruthy();
  });

  it('holds the HSN/SAC shape and the rates in force on the date (12 % is gone after 22 September 2025)', async () => {
    const owner = await scopeFor('sharma', 'owner');
    await expect(items.createItem(owner, { name: `Bad code ${stamp()}`, hsnSac: '123' }, TODAY)).rejects.toMatchObject({
      field: 'hsnSac',
    });
    await expect(
      items.createItem(owner, { name: `Old rate ${stamp()}`, defaultTaxBp: 1200 }, TODAY),
    ).rejects.toMatchObject({
      field: 'defaultTaxBp',
      say: { key: 'error.rate' },
    });
    await expect(
      items.createItem(owner, { name: `Old rate ok ${stamp()}`, defaultTaxBp: 1200 }, '2025-09-21'),
    ).resolves.toBeTruthy();
  });
});

describe('the import pipeline (I6)', () => {
  seeded();

  it('reads one customer from the PDF and three from the CSV, recognises the one already there, and adds only what is ticked', async () => {
    const staff = { ...(await scopeFor('sharma', 'staff')), requestId: `import-${stamp()}` };
    const started = await imports.startImport(staff, [
      { name: 'tally-invoice.pdf', mime: 'application/pdf', bytes: fixture('tally-invoice.pdf') },
      { name: 'parties.csv', mime: 'text/csv', bytes: fixture('parties.csv') },
    ]);
    expect(started.status).toBe('reading');
    // Nothing is a customer yet.
    expect((await customers.listCustomers(staff, { q: 'Rathi Agro' })).length).toBe(0);

    const { found } = await runReadImport({
      importId: started.id,
      businessId: staff.businessId,
      userId: staff.userId,
      role: staff.role,
      requestId: staff.requestId,
    });
    expect(found).toBe(5); // 1 + 4 rows as read; the repeated Pawar Dairy row folds into one below
    const { import: read, rows } = await imports.getImport(staff, started.id);
    expect(read.status).toBe('ready');
    expect(read.summary).toEqual([
      expect.objectContaining({ name: 'tally-invoice.pdf', kind: 'pdf', reader: 'text', found: 1, problem: null }),
      expect.objectContaining({ name: 'parties.csv', kind: 'csv', reader: 'sheet', found: 4, problem: null }),
    ]);
    const names = rows.map((r) => (r.candidate as { name: string }).name);
    expect(names).toEqual([
      'Green Park Co-operative Housing Society',
      'Rathi Agro Industries',
      'Pawar Dairy',
      'Mehta Traders',
    ]);
    const fromCsv = rows.filter((r) => r.fileName === 'parties.csv');
    expect(fromCsv).toHaveLength(3);
    // Recognised: Mehta Traders by phone, and the PDF's buyer, which is the seeded Green Park Society by GSTIN.
    const byName = (n: string) => rows.find((r) => (r.candidate as { name: string }).name === n)!;
    expect(byName('Mehta Traders').existingCustomerId).toBe(seedCustomerId('sharma', 'mehta'));
    expect(byName('Green Park Co-operative Housing Society').existingCustomerId).toBe(
      seedCustomerId('sharma', 'greenpark'),
    );
    expect(
      rows.filter((r) => r.existingCustomerId === null).map((r) => (r.candidate as { name: string }).name),
    ).toEqual(['Rathi Agro Industries', 'Pawar Dairy']);

    // The owner ticks two new ones, plus Mehta, which is already a customer and is skipped.
    const tick = ['Rathi Agro Industries', 'Pawar Dairy', 'Mehta Traders'].map((n) => byName(n).id);
    const result = await imports.commitImport(staff, started.id, tick);
    expect(result.added).toBe(2);
    const added = await customers.listCustomers(staff, { q: 'Rathi Agro' });
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      gstin: '27AADCR7788P1ZA',
      stateCode: '27',
      pan: 'AADCR7788P',
      phone: '+919822300001',
    });
    expect((await customers.listCustomers(staff, { q: 'Pawar Dairy' }))[0]).toMatchObject({ phone: '+919822300002' });
    // Mehta Traders is still one customer.
    expect((await customers.listCustomers(staff, { q: 'Mehta Traders' })).length).toBe(1);
    const after = await imports.getImport(staff, started.id);
    expect(after.import).toMatchObject({ status: 'committed', addedCount: 2 });
    expect(after.rows.filter((r) => r.customerId).length).toBe(2);
    await expect(imports.commitImport(staff, started.id, tick)).rejects.toMatchObject({ code: 'already-committed' });
  });

  it('a model may not add customers from an import (I6), and a reading never changes', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const started = await imports.startImport(owner, [
      { name: 'parties.csv', mime: 'text/csv', bytes: fixture('parties.csv') },
    ]);
    await runReadImport({
      importId: started.id,
      businessId: owner.businessId,
      userId: owner.userId,
      role: owner.role,
      requestId: 'i6',
    });
    const { rows } = await imports.getImport(owner, started.id);
    await expect(
      imports.commitImport(
        { ...owner, actorKind: 'model' },
        started.id,
        rows.map((r) => r.id),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(owner, ({ client }) =>
        client.query(`update import_rows set candidate = '{"name":"x"}'::jsonb where id = $1`, [rows[0]!.id]),
      ),
    ).rejects.toThrow(/only its customer link/);
    // Stage 5 review: what it matched and its file are part of the reading; the stored file keeps its name and size.
    await expect(
      withTenant(owner, ({ client }) =>
        client.query('update import_rows set existing_customer_id = null where id = $1', [rows[0]!.id]),
      ),
    ).rejects.toThrow(/only its customer link/);
    await expect(
      withTenant(owner, ({ client }) =>
        client.query(`update import_rows set file_name = 'other.csv' where id = $1`, [rows[0]!.id]),
      ),
    ).rejects.toThrow(/only its customer link/);
    await expect(
      withTenant(owner, ({ client }) =>
        client.query(`update import_files set name = 'x.csv' where import_id = $1`, [started.id]),
      ),
    ).rejects.toThrow(/never changed/);
    await expect(
      withTenant(owner, ({ client }) =>
        client.query(
          `insert into import_files (business_id, import_id, name, mime, bytes, size, sha256)
           values ($1, $2, 'lie.csv', 'text/csv', '\\x41'::bytea, 5, 'x')`,
          [owner.businessId, started.id],
        ),
      ),
    ).rejects.toThrow(/import_files_size_is_bytes/);
  });

  it('says why a file gave nobody, and refuses an empty pick or a file over 8 MB', async () => {
    const owner = await scopeFor('sharma', 'owner');
    const started = await imports.startImport(owner, [
      { name: 'notes.csv', mime: 'text/csv', bytes: new TextEncoder().encode('Date,Amount\n2026-01-01,500\n') },
      { name: 'photo.jpg', mime: 'image/jpeg', bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]) },
    ]);
    const saved = process.env.DOCLING_URL;
    delete process.env.DOCLING_URL;
    try {
      await runReadImport({
        importId: started.id,
        businessId: owner.businessId,
        userId: owner.userId,
        role: owner.role,
        requestId: 'none',
      });
    } finally {
      if (saved !== undefined) process.env.DOCLING_URL = saved;
    }
    const { import: read, rows } = await imports.getImport(owner, started.id);
    expect(rows).toHaveLength(0);
    expect((read.summary as Array<{ problem: string }>).map((s) => s.problem)).toEqual(['unrecognised', 'scanned']);
    await expect(imports.startImport(owner, [])).rejects.toMatchObject({ code: 'no-files' });
    await expect(
      imports.startImport(owner, [
        { name: 'big.pdf', mime: 'application/pdf', bytes: new Uint8Array(8 * 1024 * 1024 + 1) },
      ]),
    ).rejects.toMatchObject({ code: 'too-big' });
  });
});
