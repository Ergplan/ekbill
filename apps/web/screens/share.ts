/**
 * Hand a message to WhatsApp (I9: the share sheet is a real step, not a
 * pressed button). The Web Share API where the phone has it (the sheet
 * offers WhatsApp); else the wa.me link in a new tab, addressed to the
 * customer's number when one is known, which WhatsApp Web or the app
 * picks up. Stage 6 attaches the PDF/JPG file here.
 */
export async function handoffToWhatsApp(message: {
  text: string;
  title?: string;
  url?: string;
  /** The customer's number (any formatting); the link opens their chat. */
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
  return openWhatsAppLink(message);
}

export function whatsAppLink(message: { text: string; phone?: string | null }): string {
  const digits = (message.phone ?? '').replace(/\D/g, '');
  return `https://wa.me/${digits}?text=${encodeURIComponent(message.text)}`;
}

function openWhatsAppLink(message: { text: string; phone?: string | null }): 'opened' | 'cancelled' {
  if (typeof window === 'undefined') return 'cancelled';
  // Not the 'noopener' feature: with it window.open returns null even when the tab opened. Cut the opener by hand.
  const tab = window.open(whatsAppLink(message), '_blank');
  if (!tab) return 'cancelled'; // the browser blocked the popup
  try {
    tab.opener = null;
  } catch {
    // Cross-origin tabs may refuse; the link carries no credentials either way.
  }
  return 'opened';
}
