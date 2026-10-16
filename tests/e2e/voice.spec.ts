import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 9, the voice. The server mints the session (one ai_calls row); in
 * the build the stand-in answers (AI_TRANSPORT=fake), no connection opens,
 * and window.__ekbillVoice runs the same tools the model would call. On real
 * screens: the screen description from the data-guide map with OWNER-ONLY
 * marked; show / fill / safe taps; a committing button lit and never
 * pressed (rule 17); a bill opened by voice with the lines filled; the
 * setup walk-through.
 */
type Hook = { sent: Array<{ item?: { content?: Array<{ text?: string }> } }> };
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function run(page: Page, name: string, args: Record<string, unknown> = {}) {
  return page.evaluate(
    ([n, a]) =>
      (
        window as unknown as { __ekbillVoice: { run: (n: string, a: unknown) => Promise<Record<string, unknown>> } }
      ).__ekbillVoice.run(n as string, a),
    [name, args] as const,
  );
}
async function screenText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const hook = (window as unknown as { __ekbillVoice: Hook }).__ekbillVoice;
    const texts = hook.sent.map((e) => e.item?.content?.[0]?.text ?? '').filter((t) => t.startsWith('[screen]'));
    return texts.at(-1) ?? '';
  });
}

test('the mic starts the voice; it is told the screen, lights and fills, and never presses Bill banao', async ({
  page,
}) => {
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  await expect.poll(() => screenText(page)).toContain('[screen] home (start)');

  // "Mehta ka bill banao, AMC visit 3500": the form opens for Mehta Traders with the line filled.
  const opened = await run(page, 'start_bill', { customer_name: 'mehta', lines: [{ what: 'AMC visit', rate: 3500 }] });
  expect(opened).toMatchObject({ ok: true });
  await expect(page).toHaveURL(/\/bills\/new\?customer=[0-9a-f-]{36}/);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Mehta Traders');
  await expect(page.locator('[data-guide="line-0"] input').first()).toHaveValue('AMC visit');
  // The new screen is described, with the committing button marked.
  await expect.poll(() => screenText(page)).toContain('[screen] bill (opened-by-voice)');
  expect(await screenText(page)).toMatch(/make \| button \| .* \| OWNER-ONLY/);

  // Show lights the ring; a safe tap adds a line; Bill banao is lit, not pressed.
  expect(await run(page, 'show', { item_id: 'total', say: 'Yeh total hai' })).toEqual({ ok: true });
  await expect(page.locator('.eb-guide__caption')).toContainText('Yeh total hai');
  expect(await run(page, 'tap', { item_id: 'add' })).toEqual({ ok: true });
  await expect(page.locator('[data-guide="line-1"]')).toBeVisible();
  const refused = await run(page, 'tap', { item_id: 'make' });
  expect(refused).toMatchObject({ ok: false });
  expect(String(refused.reason)).toContain('owner-only');
  await expect(page.locator('.eb-guide__caption')).toContainText('Yeh aap khud dabao.');
  await expect(page).toHaveURL(/\/bills\/new\?customer=/);

  // Records: who owes, and a question; "Bas" ends the session.
  expect(String((await run(page, 'who_owes')).reply)).toMatch(/^Total ₹[\d,.]+ baaki, \d+ bills\./);
  expect(String((await run(page, 'ask_records', { question: 'AMC visit ka rate kya hai?' })).reply)).toContain('AMC');
  await page.getByTestId('voice-live').getByRole('button').click();
  await expect(page.getByTestId('voice-live')).toBeHidden();
});

test('the voice opens screens and the reminder; a link out to WhatsApp stays the owner’s', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/');
  await hydrated(page);
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  expect(await run(page, 'go_to', { screen: 'dues' })).toMatchObject({ ok: true });
  await expect(page).toHaveURL(/\/dues$/);
  const r = await run(page, 'remind', { customer_name: 'Mehta Traders' });
  expect(r).toMatchObject({ ok: true });
  await expect(page).toHaveURL(/\/bills\/[^/]+\/remind$/);
  await hydrated(page);
  await expect.poll(() => screenText(page)).toContain('[screen] remind');
  // Every item that leaves the app (WhatsApp) or sends is OWNER-ONLY on this screen.
  const lines = (await screenText(page)).split('\n').filter((l) => /\| (button|link) \|/.test(l));
  expect(lines.length).toBeGreaterThan(0);
  for (const l of lines.filter((x) => /whatsapp|bhejo|send/i.test(x))) expect(l).toContain('OWNER-ONLY');
});

test('the setup walk-through: the voice asks, fills the answer and goes on; the start is the owner’s', async ({
  page,
}) => {
  await page.goto('/dev/switch/new');
  await page.goto('/setup/name');
  await hydrated(page);
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  await expect.poll(() => screenText(page)).toContain('[screen] setup (start)');
  expect(await screenText(page)).toMatch(/next \| button \| [^|]+$/m);
  expect(await run(page, 'fill', { item_id: 'answer', value: 'Voice Kirana' })).toEqual({ ok: true });
  expect(await run(page, 'tap', { item_id: 'next' })).toEqual({ ok: true });
  await expect(page).toHaveURL(/\/setup\/gst$/);
});

test('the photo-review walk-through: the voice reads the fields, corrects a doubtful rate, and leaves Bill banao to staff', async ({
  page,
}) => {
  await page.goto('/dev/switch/ravi?to=/bills/photo');
  await hydrated(page);
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByRole('radio', { name: 'Photo lo' }).click(),
  ]);
  await chooser.setFiles({
    name: 'kaccha-03.jpg',
    mimeType: 'image/jpeg',
    buffer: readFileSync(join(__dirname, '..', 'fixtures', 'bills', 'synthetic', 'kaccha-03.jpg')),
  });
  await expect(page.getByRole('heading', { name: 'Yeh samjha. Sahi hai?' })).toBeVisible({ timeout: 30_000 });
  await page.locator('[data-guide="mic"]').click();
  await expect(page.getByTestId('voice-live')).toBeVisible();
  await expect.poll(() => screenText(page)).toContain('[screen] photo (start)');
  const text = await screenText(page);
  expect(text).toContain('fields/pf-customer | field | ');
  expect(text).toMatch(/fields\/pf-rate-0 \| field \| .* \| value: 340/);
  expect(await run(page, 'fill', { item_id: 'fields/pf-rate-0', value: '350' })).toEqual({ ok: true });
  await expect(page.locator('#pf-rate-0')).toHaveValue('350');
  await expect(page.getByRole('button', { name: /Bill banao/ })).toContainText('2,017');
  const make = text.split('\n').find((l) => /^\S+ \| button \| Bill banao/.test(l));
  expect(make).toContain('OWNER-ONLY');
  expect(await run(page, 'tap', { item_id: make!.split(' | ')[0]! })).toMatchObject({ ok: false });
  await expect(page).toHaveURL(/\/bills\/photo/);
});
