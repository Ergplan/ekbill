import { t } from '@ekbill/copy';

import { rupees } from './money';

/**
 * A server action's refusal, said in the person's language: the engine's
 * blockers one per line, or the one dictionary key. Paise parameters are
 * shown as rupees.
 */
export interface RefusalLike {
  error: string;
  say?: { key: string; params?: Record<string, string | number> };
  blockers?: Array<{ key: string; params?: Record<string, string | number> }>;
}

function shown(params?: Record<string, string | number>): Record<string, string | number> | undefined {
  if (!params) return params;
  const out: Record<string, string | number> = { ...params };
  for (const k of ['due', 'amount']) if (typeof out[k] === 'number' && k === 'due') out[k] = rupees(out[k] as number);
  return out;
}

export function sayRefusal(r: RefusalLike): string {
  if (r.blockers?.length)
    return [t('bill.refused'), ...r.blockers.map((b) => `• ${t(b.key, shown(b.params))}`)].join('\n');
  const key = r.say?.key ?? r.error;
  const text = t(key, shown(r.say?.params));
  return text === key ? t('error.generic') : text;
}
