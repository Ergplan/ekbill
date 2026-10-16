/**
 * Hand a message to WhatsApp (I9: the share sheet is a real step, not a
 * pressed button). The Web Share API where the phone has it (the sheet
 * offers WhatsApp); else the wa.me link in a new tab, addressed to the
 * customer's number when one is known, which WhatsApp Web or the app
 * picks up. Stage 6 attaches the PDF/JPG file (handoffWithFile).
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

/** The wa.me link: an Indian 10-digit number (with or without a leading 0) gets the 91 country code. */
export function whatsAppLink(message: { text: string; phone?: string | null }): string {
  let digits = (message.phone ?? '').replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  if (digits.length === 10) digits = `91${digits}`;
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

/** The bill's file URL (the route prints it on first ask and keeps it). */
export function billFileUrl(documentId: string, kind: 'pdf' | 'jpg', paper: string, download = false): string {
  return `/api/documents/${documentId}/file?kind=${kind}&paper=${paper.toLowerCase()}${download ? '&download=1' : ''}`;
}

/**
 * The bill itself to WhatsApp (Stage 6): the phone's share sheet with the
 * PDF or JPG attached where the browser can share files (Android Chrome,
 * iOS Safari); else the file is downloaded and the chat opened with the
 * message, so the owner attaches it from Downloads.
 */
export async function handoffWithFile(message: {
  text: string;
  title?: string;
  phone?: string | null;
  file: { url: string; name: string; type: string };
}): Promise<'shared' | 'opened' | 'cancelled' | 'failed'> {
  let blob: Blob;
  try {
    const res = await fetch(message.file.url, { credentials: 'same-origin' });
    if (!res.ok) return 'failed';
    blob = await res.blob();
  } catch {
    return 'failed';
  }
  const nav = typeof navigator === 'undefined' ? null : navigator;
  const file = typeof File === 'undefined' ? null : new File([blob], message.file.name, { type: message.file.type });
  if (nav && file && typeof nav.share === 'function' && typeof nav.canShare === 'function') {
    try {
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], text: message.text, title: message.title });
        return 'shared';
      }
    } catch (e) {
      if ((e as { name?: string }).name === 'AbortError') return 'cancelled';
      // Not shareable after all: fall through to download + link.
    }
  }
  saveBlob(blob, message.file.name);
  return openWhatsAppLink(message);
}

/** Save a file the page holds (a real download; the anchor is never added to the page). */
export function saveBlob(blob: Blob, name: string): void {
  if (typeof document === 'undefined') return;
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
