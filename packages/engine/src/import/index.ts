export { linesOf, parseDate, readBill, type Owner } from './bill-text';
export { parseCsv } from './csv';
export { PAGE_BREAK, markdownToLines, markdownToPages } from './markdown-lines';
export { dedupeWithin, matchExisting, normaliseName, type ExistingCustomer } from './match';
export { mapHeader, readTable } from './table';
export type { ImportedCustomer } from './types';

/**
 * All the files of one import together (Stage 11 review): the upload passes through the web proxy, which buffers
 * at most proxyClientMaxBodySize (next.config.ts, 40 MB) and silently cuts the rest, so a bigger upload could
 * never be read. The route refuses it in words before reading it; the screen before sending it.
 */
export const MAX_TOTAL_BYTES = 36 * 1024 * 1024;
