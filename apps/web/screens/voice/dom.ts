/**
 * What the voice sees and touches on a screen (Stage 9; the MVP's
 * GuideProvider snapshot/fill/tap, on v2's data-guide map). The items are
 * the screen's data-guide sections (the manifests' guides), so the model
 * points at the same ids the tour does.
 *
 * Rule 17, deny by default: the voice may press only a link to another
 * screen in the app, a choice (a radio chip), or an item marked
 * data-voice="safe" (Aage, Aur kaam jodo, the back arrow). Every other
 * button makes, saves, sends, pays or shares: it is OWNER-ONLY, lit and
 * never pressed.
 */
export interface ScreenItem {
  id: string;
  kind: 'field' | 'choice' | 'button' | 'link' | 'section';
  label: string;
  value?: string;
  ownerOnly: boolean;
}

const FIELD = 'input:not([type=hidden]):not([type=file]):not([type=checkbox]):not([type=radio]), textarea, select';
const PRESS = 'button, a[href], [role="radio"]';

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none';
}
const textOf = (el: Element) => (el.textContent ?? '').replace(/\s+/g, ' ').trim();

function labelOf(el: HTMLElement): string {
  const aria = el.getAttribute('aria-label');
  if (aria) return aria.slice(0, 60);
  const field = el.matches(FIELD) ? el : el.querySelector<HTMLElement>(FIELD);
  const fieldLabel = field?.getAttribute('aria-label') ?? field?.getAttribute('placeholder');
  if (fieldLabel) return fieldLabel.slice(0, 60);
  return textOf(el).slice(0, 60);
}

/** The element a press lands on: the item itself when it is pressable, else its one pressable child. */
export function pressTarget(el: HTMLElement): HTMLElement | null {
  if (el.matches(PRESS)) return el;
  const inner = [...el.querySelectorAll<HTMLElement>('button, a[href]')].filter(visible);
  return inner.length === 1 ? inner[0]! : null;
}

/** Whether only the owner may press it (rule 17). */
export function ownerOnly(el: HTMLElement): boolean {
  const target = pressTarget(el) ?? el;
  if (target.closest('[data-voice="owner"]')) return true;
  if (target.closest('[data-voice="safe"]')) return false;
  if (target.getAttribute('role') === 'radio') return false;
  if (target instanceof HTMLAnchorElement) {
    if (target.hasAttribute('download')) return true;
    try {
      const url = new URL(target.href, window.location.href);
      // A link out (WhatsApp, a share) sends something; a link inside the app only opens a screen.
      return url.origin !== window.location.origin || url.pathname.startsWith('/api/');
    } catch {
      return true;
    }
  }
  return true;
}

function kindOf(el: HTMLElement): ScreenItem['kind'] {
  if (el.matches(FIELD)) return 'field';
  if (el.matches('[role="radiogroup"]') || el.querySelector('[role="radio"]')) return 'choice';
  const fields = el.querySelectorAll(FIELD);
  if (fields.length === 1 && !el.querySelector('button')) return 'field';
  const target = pressTarget(el);
  if (!target) return 'section';
  return target instanceof HTMLAnchorElement ? 'link' : 'button';
}

function valueOf(el: HTMLElement, kind: ScreenItem['kind']): string | undefined {
  if (kind === 'field') {
    const f = (el.matches(FIELD) ? el : el.querySelector(FIELD)) as HTMLInputElement | null;
    return f?.value || undefined;
  }
  if (kind === 'choice') {
    const on = el.querySelector('[role="radio"][aria-checked="true"]');
    return on ? textOf(on) : undefined;
  }
  return undefined;
}

/** The screen's items, in page order, each data-guide id once. */
export function snapshot(root: ParentNode = document): ScreenItem[] {
  const seen = new Set<string>();
  const out: ScreenItem[] = [];
  for (const el of root.querySelectorAll<HTMLElement>('[data-guide]')) {
    const id = el.dataset.guide!;
    if (seen.has(id) || !visible(el) || el.closest('.eb-guide__caption')) continue;
    seen.add(id);
    const kind = kindOf(el);
    out.push({
      id,
      kind,
      label: labelOf(el),
      value: valueOf(el, kind),
      ownerOnly: kind === 'button' || kind === 'link' ? ownerOnly(el) : false,
    });
    // A section of several fields (a bill line, the photo's review): each field is an item of its own, "<section>/<field>".
    if (kind === 'section')
      for (const [n, f] of subFields(el).entries())
        out.push({
          id: `${id}/${f.id || n}`,
          kind: 'field',
          label: labelOf(f),
          value: (f as HTMLInputElement).value || undefined,
          ownerOnly: false,
        });
    if (out.length >= 60) break;
  }
  return out;
}

function subFields(section: HTMLElement): HTMLElement[] {
  return [...section.querySelectorAll<HTMLElement>(FIELD)].filter(visible).slice(0, 24);
}

/** An item by its id: a data-guide section, or "<section>/<field id or position>" inside one. */
export function findItem(id: string): HTMLElement | null {
  const [guide, sub] = id.split('/', 2) as [string, string | undefined];
  const all = [...document.querySelectorAll<HTMLElement>(`[data-guide="${CSS.escape(guide)}"]`)];
  const section = all.find(visible) ?? null;
  if (!section || sub === undefined) return section;
  const fields = subFields(section);
  return fields.find((f) => f.id === sub) ?? (/^\d+$/.test(sub) ? (fields[Number(sub)] ?? null) : null);
}

function setNativeValue(el: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : el instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

export type ToolOutcome = { ok: boolean; reason?: string };

/** Types into a field, or picks a choice by its label. Never presses a button. */
export function fillItem(id: string, value: string): ToolOutcome {
  const el = findItem(id);
  if (!el) return { ok: false, reason: 'not on screen' };
  const kind = kindOf(el);
  if (kind === 'choice') {
    const want = value.trim().toLowerCase();
    const option = [...el.querySelectorAll<HTMLElement>('[role="radio"]')].find((o) =>
      textOf(o).toLowerCase().includes(want),
    );
    if (!option) return { ok: false, reason: 'no such choice' };
    option.click();
    return { ok: true };
  }
  if (kind !== 'field') return { ok: false, reason: 'not a field' };
  const f = (el.matches(FIELD) ? el : el.querySelector(FIELD)) as
    HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!f) return { ok: false, reason: 'not a field' };
  if (f.disabled || ('readOnly' in f && f.readOnly)) return { ok: false, reason: 'cannot be changed here' };
  if (f instanceof HTMLSelectElement) {
    const want = value.trim().toLowerCase();
    const option = [...f.options].find((o) => o.value.toLowerCase() === want || o.text.toLowerCase().includes(want));
    if (!option) return { ok: false, reason: 'no such choice' };
    setNativeValue(f, option.value);
  } else {
    setNativeValue(f, value.slice(0, 500));
  }
  return { ok: true };
}

/** Presses a safe item; an OWNER-ONLY one is refused (the caller lights it for the owner). */
export function tapItem(id: string): ToolOutcome {
  const el = findItem(id);
  if (!el) return { ok: false, reason: 'not on screen' };
  if (ownerOnly(el)) return { ok: false, reason: 'owner-only: the owner taps this one; it is lit for them' };
  const target = pressTarget(el);
  if (!target) return { ok: false, reason: 'nothing to press' };
  if ((target as HTMLButtonElement).disabled) return { ok: false, reason: 'not ready yet' };
  target.click();
  return { ok: true };
}
