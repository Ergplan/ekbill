import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { cookies } from 'next/headers';

import { FlowScreen } from '../../screens/flow/Screen';
import { questions } from '../../screens/flow/questions';
import { goldenPaths } from '../../screens/golden-paths';
import { SAMPLE_URL, SCREENS } from '../../screens/registry';

export const dynamic = 'force-dynamic';

const ROLE_ROWS = [
  { action: 'Business profile, series, look, signature, logo, theme', owner: true, staff: false, accountant: false },
  { action: 'Invite / remove members', owner: true, staff: false, accountant: false },
  { action: 'Add / edit customers and items', owner: true, staff: true, accountant: false },
  { action: 'Make bills, read photos, issue', owner: true, staff: true, accountant: false },
  { action: 'Record money, reminders', owner: true, staff: true, accountant: false },
  { action: 'Cancel, credit note', owner: true, staff: false, accountant: false },
  { action: 'See bills, dues, GST workings', owner: true, staff: true, accountant: true },
  { action: 'Export the CA pack', owner: true, staff: false, accountant: true },
  { action: 'Delete anything', owner: false, staff: false, accountant: false },
];

/** Thumbnails are the Stage 1 screenshots, copied into public/flow-thumbs by scripts/copy-thumbs.mjs. */
function thumbs() {
  const out: Record<string, Partial<Record<'narangi' | 'harmony', string>>> = {};
  for (const s of SCREENS) {
    for (const theme of ['narangi', 'harmony'] as const) {
      const rel = `/flow-thumbs/${theme}/${s.id}.png`;
      if (existsSync(join(process.cwd(), 'public', rel))) (out[s.id] ??= {})[theme] = rel;
    }
  }
  return out;
}

export default async function Page() {
  const theme = (await cookies()).get('eb-theme')?.value === 'harmony' ? 'harmony' : 'narangi';
  return (
    <FlowScreen
      screens={SCREENS}
      sampleUrl={SAMPLE_URL}
      thumbs={thumbs()}
      paths={goldenPaths}
      questions={questions}
      theme={theme}
      roles={ROLE_ROWS}
      stage="Stage 1 — screen flow for approval"
    />
  );
}
