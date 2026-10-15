import { notFound } from 'next/navigation';

import { authMode } from '../../../server/auth-mode';
import { current } from '../../../server/session';
import { loadSwitch } from '../../../screens/switch/data';
import { SwitchScreen } from '../../../screens/switch/Screen';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (authMode() !== 'switcher') notFound();
  const me = await current();
  const people = await loadSwitch();
  const currentKey = me ? (people.find((p) => p.name === me.user.name)?.id ?? null) : null;
  return <SwitchScreen people={people} current={currentKey} />;
}
