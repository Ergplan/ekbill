/**
 * The files a business keeps (Stage 4: a logo and a signature, bytes in
 * Postgres). The limits the browser and the server both hold, and the data
 * URL the browser hands over, parsed without Node. Pure.
 */
export type BusinessFileKind = 'logo' | 'signature';

export const FILE_LIMITS: Record<BusinessFileKind, { maxBytes: number; mimes: readonly string[] }> = {
  logo: { maxBytes: 300 * 1024, mimes: ['image/png', 'image/jpeg', 'image/webp'] },
  signature: { maxBytes: 60 * 1024, mimes: ['image/png'] },
};

export type FileProblem = 'not-a-data-url' | 'mime' | 'empty' | 'too-big';

export interface ParsedDataUrl {
  mime: string;
  bytes: Uint8Array;
}

/** "data:image/png;base64,...." → the mime and the bytes; null for anything else. */
export function parseDataUrl(dataUrl: string): ParsedDataUrl | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]*)$/i.exec(dataUrl);
  if (!m) return null;
  const b64 = m[2]!.replace(/\s/g, '');
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { mime: m[1]!.toLowerCase(), bytes };
  } catch {
    return null;
  }
}

/** The size of a base64 payload without decoding it (the browser's early "too big"). */
export function base64Size(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = i < 0 ? '' : dataUrl.slice(i + 1).replace(/\s/g, '');
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.max(0, Math.floor((b64.length * 3) / 4) - pad);
}

export function checkFile(kind: BusinessFileKind, file: { mime: string; size: number }): FileProblem | null {
  const limit = FILE_LIMITS[kind];
  if (!limit.mimes.includes(file.mime)) return 'mime';
  if (file.size <= 0) return 'empty';
  if (file.size > limit.maxBytes) return 'too-big';
  return null;
}

/** A data URL checked for its kind: the bytes to store, or what is wrong. */
export function acceptFile(
  kind: BusinessFileKind,
  dataUrl: string,
): { ok: true; mime: string; bytes: Uint8Array } | { ok: false; problem: FileProblem } {
  if (base64Size(dataUrl) > FILE_LIMITS[kind].maxBytes) return { ok: false, problem: 'too-big' };
  const parsed = parseDataUrl(dataUrl);
  if (!parsed) return { ok: false, problem: 'not-a-data-url' };
  const problem = checkFile(kind, { mime: parsed.mime, size: parsed.bytes.length });
  return problem ? { ok: false, problem } : { ok: true, mime: parsed.mime, bytes: parsed.bytes };
}
