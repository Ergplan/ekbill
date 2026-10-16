import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 9: the team in the UI. The owner invites a phone as accountant and
 * hands the invite to WhatsApp; that phone signs in (the switcher stands in
 * for OTP) and lands in the business as the accountant; the owner makes them
 * staff, then removes them, and they no longer reach the business.
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function stubShare(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __shared: Array<{ text?: string }> };
    w.__shared = [];
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      value: (data: { text?: string }) => {
        w.__shared.push({ text: data.text });
        return Promise.resolve();
      },
    });
  });
}

test('invite → sign in as that phone → role changed → removed', async ({ page }) => {
  const digits = `98${String(Date.now()).slice(-8)}`;
  await stubShare(page);
  await page.goto('/dev/switch/sharma?to=/aap/team');
  await hydrated(page);
  await page.getByRole('button', { name: 'Invite karo' }).click();
  await page.getByLabel('Phone').fill(digits);
  await page.getByRole('radio', { name: 'Accountant (CA)' }).click();
  await page.getByRole('button', { name: 'Bhejo' }).click();
  await expect(page.locator('main')).toContainText(`WhatsApp pe invite gaya: ${digits}`, { timeout: 15_000 });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared.length)).toBe(1);
  const row = page.locator('.eb-billrow').filter({ hasText: `+91${digits}` });
  await expect(row).toContainText('Invite bheja');
  await expect(row).toContainText('Accountant (CA)');

  // That phone signs in: the invite is accepted and they land in the business as the accountant.
  await page.goto(`/dev/switch/${digits}?to=/`);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Sharma Electricals');
  await page.goto('/bills/new');
  await expect(page).toHaveURL(/\/$/); // the accountant makes no bills

  // The owner makes them staff, then removes them.
  await page.goto('/dev/switch/sharma?to=/aap/team');
  await hydrated(page);
  const member = page.locator('.eb-billrow').filter({ hasText: `+91${digits}` });
  await expect(member).not.toContainText('Invite bheja');
  await member.getByRole('button', { name: 'Role badlo' }).click();
  await expect(member).toContainText('Staff', { timeout: 15_000 });
  await member.getByRole('button', { name: 'Hatao' }).click();
  await member.getByRole('button', { name: 'Pakka hatao?' }).click();
  await expect(page.locator('.eb-billrow').filter({ hasText: `+91${digits}` })).toHaveCount(0, { timeout: 15_000 });

  // Removed: signing in as that phone no longer reaches the business.
  await page.goto(`/dev/switch/${digits}?to=/`);
  await expect(page).toHaveURL(/\/welcome/);
});

test('staff and the accountant do not reach the team screen', async ({ page }) => {
  for (const who of ['ravi', 'meera']) {
    await page.goto(`/dev/switch/${who}?to=/aap/team`);
    await expect(page).toHaveURL(/\/aap$/);
  }
});
