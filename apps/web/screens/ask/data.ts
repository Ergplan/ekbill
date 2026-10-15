import { FIXTURE, type Fixture } from '../fixtures';
import type { Viewer } from '../viewer';

export interface AskData {
  ask: Fixture['ask'];
  state: 'empty' | 'answered';
}

/** Poocho: the examples and, after a question, the fixture's answer (Stage 8 answers from the owner's own bills). */
export function loadAsk(viewer: Viewer, opts: { state: string | null }): AskData | null {
  if (!viewer.business) return null;
  return { ask: FIXTURE.ask, state: opts.state === 'answered' ? 'answered' : 'empty' };
}
