/**
 * @ekbill/render: the printed bill (Stage 6). The MVP's templates (classic,
 * modern, simple; A4, A5, 80mm, 58mm; PDF and JPEG) on v2's issued
 * snapshot. Listed in tokens-allow.txt: the paper is deliberately not themed.
 */
export {
  DESIGNS,
  PAPER,
  PAPERS,
  escapeHtml,
  renderBillHtml,
  safeImage,
  type Design,
  type Paper,
  type PaperSpec,
  type PrintInput,
} from './template';
export { RenderError, browserPath, closeRenderer, renderJpeg, renderPdf, upiQrDataUrl } from './render';
export { printAndKeep, printTheRest, type FileKind } from './print';
