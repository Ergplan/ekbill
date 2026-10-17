import { expect, test, type Page } from '@playwright/test';

/**
 * Stage 9, Poocho on real data: the owner asks about a customer's bills and
 * gets an answer from their own records, cited, with the record one tap away;
 * the accountant asks too; a question about nothing says so. The server's
 * model is the stand-in (AI_TRANSPORT=fake): no model is called from the build.
 */
async function hydrated(page: Page) {
  await page.locator('html[data-hydrated]').waitFor({ timeout: 60_000 });
}
async function ask(page: Page, question: string, label = 'Poocho') {
  await page.getByLabel(label, { exact: true }).fill(question);
  await page.locator('[data-guide="go"]').click();
}

test('the owner asks about Mehta Traders: an answer from the records, cited, and the record one tap away', async ({
  page,
}) => {
  await page.goto('/dev/switch/sharma?to=/poocho');
  await hydrated(page);
  // The examples name the business's own customers and items.
  await expect(page.locator('[data-guide="examples"]')).toContainText('ka kitna baaki hai?');
  await ask(page, 'Mehta Traders ke bill mein kya tha?');
  const answer = page.getByTestId('ask-answer');
  await expect(answer).toContainText('Mehta Traders', { timeout: 30_000 });
  await expect(answer).toContainText('[1]');
  const source = page.getByTestId('ask-source').first();
  await expect(source).toContainText('[1]');
  const href = await source.getAttribute('href');
  expect(href).toMatch(/^\/(bills|customers)\//);
  await source.click();
  await expect(page).toHaveURL(new RegExp(href!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await hydrated(page);
  await expect(page.locator('main')).toContainText('Mehta Traders');
});

// Meera (the CA) chose English: the screen and its answers are in English.
test('the accountant asks too, in her English; a question about nothing says nothing was found', async ({ page }) => {
  await page.goto('/dev/switch/meera?to=/poocho');
  await hydrated(page);
  await expect(page.locator('html')).toHaveAttribute('lang', 'en-IN');
  await ask(page, 'What is the AMC visit rate?', 'Ask');
  await expect(page.getByTestId('ask-answer')).toContainText('AMC', { timeout: 30_000 });
  await page.locator('[data-guide="more"]').click();
  await ask(page, 'qqqzzzxxx wwwvvv', 'Ask');
  await expect(page.getByTestId('ask-answer')).toContainText('Nothing about this in your records', { timeout: 30_000 });
});
