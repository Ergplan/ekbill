/**
 * Phone numbers the way people write them, into E.164. Salvaged from the
 * MVP's profile helpers (tag mvp-final): an Indian 10-digit number (with
 * or without a leading 0, +91 or 91) becomes +91XXXXXXXXXX; another
 * country's number keeps its +code; anything else is null.
 */
export function toE164(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, '');
  // 00 is the international prefix dialled from India: 0091 98765 43210 is +91 98765 43210.
  const plus = digits.startsWith('+') || digits.startsWith('00');
  let n = digits.replace(/\D/g, '').replace(/^00/, '');
  // The trunk 0 written after the country code ("+91 098765 43210") is not part of the number.
  if (/^910[6-9]\d{9}$/.test(n)) n = `91${n.slice(3)}`;
  if (!plus) {
    if (n.length === 11 && n.startsWith('0')) n = n.slice(1);
    if (n.length === 10) n = `91${n}`;
    else if (n.length === 12 && n.startsWith('91')) {
      // already with the country code
    } else return null;
  }
  if (n.length < 8 || n.length > 15) return null;
  // An Indian number is 91 and ten digits, a mobile starting 6 to 9: anything else under +91 does not exist.
  if (n.startsWith('91') && (n.length !== 12 || !/^[6-9]/.test(n.slice(2)))) return null;
  return `+${n}`;
}

/** The wa.me door: a chat with the number and the message typed in; with no number, WhatsApp's chat picker with the message ready. */
export function whatsappLink(phone: string | null | undefined, text: string): string {
  const e164 = toE164(phone);
  return `https://wa.me/${e164 ? e164.slice(1) : ''}?text=${encodeURIComponent(text)}`;
}
