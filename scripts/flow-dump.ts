// Prints the screen manifests and golden paths as JSON for scripts/flow-map.mjs.
// Run by that script through `node --import tsx` so the TypeScript manifests load in place.
import { goldenPaths } from '../apps/web/screens/golden-paths';
import { SAMPLE_URL, SCREENS } from '../apps/web/screens/registry';

process.stdout.write(JSON.stringify({ screens: SCREENS, paths: goldenPaths, sampleUrl: SAMPLE_URL }));
