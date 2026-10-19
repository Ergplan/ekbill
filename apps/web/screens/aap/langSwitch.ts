import { t, type Locale } from '@ekbill/copy';

const wait = (ms: number) => new Promise<void>((r) => window.setTimeout(r, ms));

/** Until the page is drawn in `locale` (the root layout stamps data-locale on <html>), or `ms` have gone. */
async function drawnIn(locale: Locale, ms: number): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (document.documentElement.dataset.locale === locale) return true;
    await wait(40);
  }
  return false;
}

/**
 * A new language, without a reload (19 Oct: "the words transform into the selected language, theatrics"): the
 * screen's words blur away while the new language's hello rises in the middle; the choice is saved, the screen is
 * drawn again from the server in it, and its words come back out of the blur already changed. A save that fails
 * brings the old words back and answers false. Reduced motion swaps the words with no blur and no hello.
 */
export async function switchLanguage(
  locale: Locale,
  save: () => Promise<boolean>,
  redraw: () => void,
): Promise<boolean> {
  const root = document.documentElement;
  const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  const overlay = document.createElement('div');
  overlay.className = 'eb-langswap';
  overlay.setAttribute('aria-hidden', 'true');
  overlay.dataset.testid = 'lang-swap';
  const word = document.createElement('div');
  word.className = 'eb-langswap__word';
  word.lang = locale;
  word.textContent = t('greet.hello', undefined, locale);
  overlay.append(word);
  const done = async () => {
    root.classList.remove('eb-lang-out');
    if (still) {
      overlay.remove();
      return;
    }
    root.classList.add('eb-lang-in');
    overlay.classList.add('eb-langswap--out');
    await wait(550);
    overlay.remove();
    root.classList.remove('eb-lang-in');
  };
  root.classList.remove('eb-lang-in');
  root.classList.add('eb-lang-out');
  if (!still) document.body.append(overlay);
  const [saved] = await Promise.all([save().catch(() => false), wait(still ? 0 : 420)]);
  if (!saved) {
    await done();
    return false;
  }
  redraw();
  // The hello stays up long enough to be read, however fast the server answers.
  const [drawn] = await Promise.all([drawnIn(locale, 8000), wait(still ? 0 : 500)]);
  // A page that did not redraw in time is drawn the old way, from the top.
  if (!drawn) {
    window.location.reload();
    return true;
  }
  await done();
  return true;
}
