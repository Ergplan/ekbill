import { FIXTURE, type Fixture } from '../fixtures';
import type { Viewer } from '../viewer';

export interface HelpData {
  help: Fixture['help'];
}

/** "Mera bill thoda complex hai": the choices the helper opens with. */
export function loadHelp(viewer: Viewer): HelpData | null {
  if (!viewer.business || viewer.role === 'accountant') return null;
  return { help: FIXTURE.help };
}
