import { existsSync } from 'node:fs';

import { chromium, type Browser, type BrowserContext, type Page } from 'playwright-core';
import QRCode from 'qrcode';

import { formatMoneyPlain } from '@ekbill/engine';

import { PAPER, renderBillHtml, type PrintInput } from './template';

/**
 * The bill as a PDF or a photo (Stage 6), through Chromium. Salvaged from
 * the MVP's server/pdf/render.ts (tag mvp-final): one shared browser, a
 * fresh context per bill with JavaScript off and every request but data:
 * refused, so a rendering can never reach out or leak a bill. Rendering is
 * apart from issuing: a failed render never issues a second bill (I2); it
 * is tried again against the same issued snapshot.
 */
const BASE_ARGS = ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'];
const CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM_PATH,
  '/usr/bin/chromium',
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
];

export function browserPath(): string | null {
  return CANDIDATES.find((p): p is string => Boolean(p) && existsSync(p!)) ?? null;
}

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    const executablePath = browserPath();
    browserPromise = chromium
      .launch({ ...(executablePath ? { executablePath } : {}), args: BASE_ARGS })
      .catch((error) => {
        browserPromise = null;
        throw error;
      });
  }
  return browserPromise;
}

export class RenderError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RenderError';
  }
}

async function withBillPage<T>(
  html: string,
  viewport: { width: number; height: number; scale: number },
  work: (page: Page) => Promise<T>,
): Promise<T> {
  let context: BrowserContext | undefined;
  try {
    const browser = await getBrowser();
    context = await browser.newContext({
      javaScriptEnabled: false,
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: viewport.scale,
    });
    await context.route('**/*', (route) => {
      const url = route.request().url();
      return url.startsWith('data:') || url === 'about:blank' ? route.continue() : route.abort();
    });
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load', timeout: 20_000 });
    return await work(page);
  } catch (error) {
    throw new RenderError('The bill could not be drawn just now. It is safe; try again.', { cause: error });
  } finally {
    await context?.close().catch(() => undefined);
  }
}

export async function renderPdf(input: PrintInput): Promise<Buffer> {
  const paper = PAPER[input.look.paper];
  const html = renderBillHtml(input);
  return withBillPage(html, { width: paper.widthPx, height: 1000, scale: 1 }, async (page) => {
    if (paper.receipt) {
      // A roll is as long as the bill: measure it, then cut the page there.
      const box = await page.locator('body').boundingBox();
      const heightMm = Math.ceil(((box?.height ?? 600) * 25.4) / 96) + 2;
      return Buffer.from(
        await page.pdf({
          width: `${paper.widthMm}mm`,
          height: `${heightMm}mm`,
          printBackground: true,
          margin: { top: '0', right: '0', bottom: '0', left: '0' },
        }),
      );
    }
    return Buffer.from(
      await page.pdf({
        format: input.look.paper === 'a5' ? 'A5' : 'A4',
        printBackground: true,
        margin: { top: '0', right: '0', bottom: '0', left: '0' },
        displayHeaderFooter: true,
        headerTemplate: '<div></div>',
        footerTemplate:
          '<div style="width:100%;font-size:8px;color:#888;text-align:center;padding:0 12mm;"><span class="pageNumber"></span> of <span class="totalPages"></span></div>',
      }),
    );
  });
}

/** The bill as a photo for WhatsApp: the page at the paper's width, twice the pixels, a JPEG small enough for 3G. */
export async function renderJpeg(input: PrintInput): Promise<Buffer> {
  const paper = PAPER[input.look.paper];
  const html = renderBillHtml(input);
  return withBillPage(html, { width: paper.widthPx, height: 600, scale: 2 }, async (page) =>
    Buffer.from(await page.screenshot({ type: 'jpeg', quality: 86, fullPage: true })),
  );
}

/**
 * The UPI payment QR (salvaged from the MVP's server/pdf/upi.ts): not a
 * government e-invoice QR, and never evidence of payment. Null when the
 * VPA does not look like one; a QR that cannot be drawn is left out.
 */
export async function upiQrDataUrl(args: {
  vpa: string | null;
  payeeName: string;
  amountPaise?: number;
  reference?: string | null;
}): Promise<string | null> {
  const vpa = args.vpa?.trim();
  if (!vpa || !/^[\w.-]{2,60}@[a-zA-Z]{2,30}$/.test(vpa)) return null;
  const params = new URLSearchParams();
  params.set('pa', vpa);
  params.set('pn', args.payeeName.slice(0, 50));
  params.set('cu', 'INR');
  if (args.amountPaise && args.amountPaise > 0) params.set('am', formatMoneyPlain(args.amountPaise));
  if (args.reference) params.set('tn', args.reference.slice(0, 50));
  try {
    return await QRCode.toDataURL(`upi://pay?${params.toString()}`, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 240,
      color: { dark: '#000000', light: '#ffffff' },
    });
  } catch {
    return null;
  }
}

export async function closeRenderer(): Promise<void> {
  if (!browserPromise) return;
  const browser = await browserPromise.catch(() => null);
  browserPromise = null;
  await browser?.close().catch(() => undefined);
}
