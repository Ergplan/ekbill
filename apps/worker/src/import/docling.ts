import { importing } from '@ekbill/engine';

/**
 * Read one file with the docling-serve container: layout, tables and, for a
 * photo or a scan, OCR. Salvaged from the MVP's server/import/docling.ts
 * (tag mvp-final). The file goes to the container on the same machine and
 * nowhere else; Docling is not a model call (rule 9 is about model
 * endpoints), it is the layout reader the compose stack runs.
 */
export class DoclingUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DoclingUnavailableError';
  }
}

export interface DoclingConfig {
  url: string | null;
  apiKey: string | null;
  timeoutMs: number;
  ocrLanguages: string[];
}
export function doclingConfig(env: NodeJS.ProcessEnv = process.env): DoclingConfig {
  return {
    url: env.DOCLING_URL?.trim() || null,
    apiKey: env.DOCLING_API_KEY?.trim() || null,
    timeoutMs: Number(env.DOCLING_TIMEOUT_MS ?? 180_000),
    ocrLanguages: (env.DOCLING_OCR_LANGS ?? 'en,hi')
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean),
  };
}

export async function readWithDocling(
  filename: string,
  bytes: Uint8Array,
  opts: { forceOcr?: boolean; config?: DoclingConfig } = {},
): Promise<{ pages: string[]; status: string }> {
  const config = opts.config ?? doclingConfig();
  if (!config.url) throw new DoclingUnavailableError('DOCLING_URL is not set.');
  const form = new FormData();
  form.append('files', new Blob([bytes as BlobPart]), filename);
  form.append('to_formats', 'md');
  form.append('do_ocr', 'true');
  form.append('force_ocr', opts.forceOcr ? 'true' : 'false');
  for (const lang of config.ocrLanguages) form.append('ocr_lang', lang);
  form.append('image_export_mode', 'placeholder');
  form.append('md_page_break_placeholder', importing.PAGE_BREAK);
  form.append('do_table_structure', 'true');
  form.append('abort_on_error', 'false');
  let res: Response;
  try {
    res = await fetch(`${config.url.replace(/\/$/, '')}/v1/convert/file`, {
      method: 'POST',
      body: form,
      headers: config.apiKey ? { 'X-Api-Key': config.apiKey } : undefined,
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    throw new DoclingUnavailableError(`Docling is not answering: ${(error as Error).message}`);
  }
  if (!res.ok) throw new DoclingUnavailableError(`Docling answered ${res.status}.`);
  const body = (await res.json()) as { document?: { md_content?: string | null }; status?: string };
  return { pages: importing.markdownToPages(body.document?.md_content ?? ''), status: body.status ?? 'unknown' };
}
