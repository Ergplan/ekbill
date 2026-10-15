/**
 * Phone numbers the way people write them, into E.164. Salvaged from the
 * MVP's profile helpers (tag mvp-final): an Indian 10-digit number (with
 * or without a leading 0, +91 or 91) becomes +91XXXXXXXXXX; another
 * country's number keeps its +code; anything else is null.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  const plus = digits.startsWith('+');
  let n = digits.replace(/\D/g, '');
  if (!plus) {
    if (n.length === 11 && n.startsWith('0')) n = n.slice(1);
    if (n.length === 10) n = `91${n}`;
    else if (n.length === 12 && n.startsWith('91')) {
      // already with the country code
    } else return null;
  }
  if (n.length < 8 || n.length > 15) return null;
  if (n.startsWith('91') && n.length === 12 && !/^[6-9]/.test(n.slice(2))) return null;
  return `+${n}`;
}

/** The wa.me door: a chat with the number and the message typed in; with no number, WhatsApp's chat picker with the message ready. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const e164 = toE164(phone);
  return `https://wa.me/${e164 ? e164.slice(1) : ''}?text=${encodeURIComponent(text)}`;
}
