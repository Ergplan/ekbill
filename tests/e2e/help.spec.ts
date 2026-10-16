import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 9, the contract helper on real data: a percentage of a contract read
 * from its pasted text, the working for the advance, and the bill form
 * opened for the customer with the line and the contract's GST; a running
 * bill that would bill nothing new says so. Nothing is saved until Bill banao.
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}

test('a contract pasted, the advance worked out, and the bill form opened with its line', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/help');
  await hydrated(page);
  await page.getByRole('radio', { name: /Contract ka kuch percent/ }).click();
  await page.locator('[data-guide="next"]').click();
  await expect(page).toHaveURL(/\/help\?kind=percent$/);
  await hydrated(page);
  await page
    .locator('#help-paste')
    .fill(
      'Contract for Green Park Society wiring worth Rs 5,00,000 plus GST @ 18%. 30% advance, 40% on delivery, 30% on installation. 5% retention.',
    );
  await page.getByRole('button', { name: 'Isse bharo' }).click();
  await expect(page.locator('main')).toContainText('cheezein bhar di');
  await expect(page.locator('#help-total')).toHaveValue('500000');
  await page.locator('#help-customer').selectOption({ label: 'Mehta Traders' });
  const plan = page.getByTestId('help-plan');
  await expect(plan).toContainText('Advance (instalment 1 of 3: 30% of contract value ₹5,00,000)');
  await expect(plan).toContainText('₹1,77,000');
  await expect(plan).toContainText('5% retention');
  await page.locator('[data-guide="make"]').click();
  await expect(page).toHaveURL(/\/bills\/new\?customer=[0-9a-f-]{36}$/);
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Mehta Traders');
  await expect(page.locator('[data-guide="line-0"] input').first()).toHaveValue(/Green Park Society wiring - Advance/);
  await expect(page.locator('[data-guide="make"]')).toContainText('1,77,000');
});

test('a running bill: nothing new to bill says so; the back arrow starts again from the choices', async ({ page }) => {
  await page.goto('/dev/switch/sharma?to=/help?kind=running');
  await hydrated(page);
  await page.locator('#help-customer').selectOption({ label: 'Mehta Traders' });
  await page.locator('#help-name').fill('Tower B');
  await page.locator('#help-total').fill('10 lakh');
  await page.locator('#help-done').fill('40');
  await page.locator('#help-before').fill('4 lakh');
  await page.locator('[data-guide="make"]').click();
  await expect(page.locator('main')).toContainText('Naya kuch nahi: 40% ka bill pehle se bana hai.');
  await expect(page).toHaveURL(/\/help\?kind=running$/);
  await page.locator('#help-done').fill('55');
  await expect(page.getByTestId('help-plan')).toContainText('running bill 2: work completed to 55%');
  await page.locator('[data-guide="back"]').click();
  await expect(page).toHaveURL(/\/help$/);
  await hydrated(page);
  await expect(page.locator('[data-guide="choices"]')).toBeVisible();
});
