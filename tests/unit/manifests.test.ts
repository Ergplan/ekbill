import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { goldenPaths } from '../../apps/web/screens/golden-paths';
import { SAMPLE_URL, SCREENS, STATE_URLS } from '../../apps/web/screens/registry';

const ROOT = join(__dirname, '..', '..');
const routes = new Set(SCREENS.map((s) => s.route));
/** Pages for the operator and the build, not the owner: no manifest, no tour, not in the flow. */
const DEV_SCREENS = new Set(['flow']);
const DEV_PAGES = new Set(['/flow', '/kit']);

describe('screen manifests (Stage 1)', () => {
  it('every screen folder has a manifest that is in the registry', () => {
    // A folder with a Screen.tsx is a screen; a screen without a manifest is the defect this catches.
    const dirs = readdirSync(join(ROOT, 'apps/web/screens'), { withFileTypes: true })
      .filter((d) => d.isDirectory() && existsSync(join(ROOT, 'apps/web/screens', d.name, 'Screen.tsx')))
      .map((d) => d.name)
      .filter((name) => !DEV_SCREENS.has(name));
    for (const dir of dirs) expect(existsSync(join(ROOT, 'apps/web/screens', dir, 'manifest.ts')), dir).toBe(true);
    expect(dirs.sort()).toEqual(SCREENS.map((s) => s.id).sort());
  });
  it('every route under apps/web/app is a registered screen (or a dev page)', () => {
    const pages: string[] = [];
    const walk = (dir: string, route: string) => {
      for (const d of readdirSync(dir, { withFileTypes: true })) {
        if (d.isDirectory()) walk(join(dir, d.name), `${route}/${d.name}`);
        else if (d.name === 'page.tsx') pages.push(route || '/');
      }
    };
    walk(join(ROOT, 'apps/web/app'), '');
    for (const page of pages) expect(routes.has(page) || DEV_PAGES.has(page), page).toBe(true);
  });
  it('every manifest id is unique and has a sample URL', () => {
    const ids = SCREENS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(SAMPLE_URL[id], id).toBeTruthy();
  });
  it('every tap resolves to a screen route or an external door', () => {
    for (const s of SCREENS) {
      for (const tap of [...(s.primary ? [s.primary] : []), ...s.taps]) {
        expect(routes.has(tap.to) || tap.to.startsWith('external:'), `${s.id}: ${tap.label} → ${tap.to}`).toBe(true);
      }
    }
  });
  it('every tour step and hidden id is a declared guide id', () => {
    for (const s of SCREENS) {
      const guides = new Set(s.guides);
      for (const step of s.tour) expect(guides.has(step.target), `${s.id}: tour ${step.target}`).toBe(true);
      for (const [role, ids] of Object.entries(s.hidden ?? {}))
        for (const id of ids) expect(guides.has(id), `${s.id}: hidden for ${role}: ${id}`).toBe(true);
    }
  });
  it('every extra state URL names a declared state', () => {
    const byId = new Map(SCREENS.map((s) => [s.id, s]));
    for (const st of STATE_URLS) expect(byId.get(st.screen)?.states, `${st.screen}/${st.state}`).toContain(st.state);
  });
  it('every golden path is within its budget (I9)', () => {
    for (const p of goldenPaths) expect(p.taps.length, p.name).toBeLessThanOrEqual(p.budget);
  });
  it('every screen has at most one primary action and says what each role sees', () => {
    for (const s of SCREENS) {
      expect(s.roles.owner && s.roles.staff && s.roles.accountant, s.id).toBeTruthy();
      expect(s.purpose.length, s.id).toBeGreaterThan(20);
    }
  });
});
