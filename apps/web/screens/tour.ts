import { sourceKey, t } from '@ekbill/copy';
import type { GuideStep } from '@ekbill/ui';

/** A screen's tour in the person's language: the manifest's Hinglish lines, each through its tour.* key. */
export function localTour(steps: readonly GuideStep[]): GuideStep[] {
  return steps.map((s) => {
    const key = sourceKey(s.say, 'tour.');
    return key ? { ...s, say: t(key) } : s;
  });
}
