/**
 * Hand a message to WhatsApp (I9: the share sheet is a real step, not a
 * pressed button). The Web Share API where the phone has it (the sheet
 * offers WhatsApp); else the wa.me link in a new tab, which WhatsApp Web or
 * the app picks up. Stage 6 attaches the PDF/JPG file here.
 */
export async function handoffToWhatsApp(message: {
  text: string;
  title?: string;
  url?: string;
  /** The customer's number, when known: the wa.me link then opens their chat. */
  phone?: string | null;
}): Promise<'shared' | 'opened' | 'cancelled'> {
  const nav = typeof navigator === 'undefined' ? null : navigator;
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ text: message.text, title: message.title, url: message.url });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled';
      // Not shareable here (desktop without a sheet): fall through to the link.
    }
  }
  const digits = (message.phone ?? '').replace(/\D/g, '');
  const to = digits ? (digits.length === 10 ? `91${digits}` : digits) : '';
  const href = `https://wa.me/${to}?text=${encodeURIComponent(message.text)}`;
  if (typeof window === 'undefined') return 'cancelled';
  // With 'noopener' the browser returns null even when the tab opens (the new tab must not reach
  // back), so the return value says nothing. The call runs inside the tap, where no blocker holds it.
  window.open(href, '_blank', 'noopener');
  return 'opened';
}
