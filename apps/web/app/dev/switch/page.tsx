import { notFound } from 'next/navigation';

import { SEED } from '@ekbill/db';

import { authMode } from '../../../server/auth-mode';
import { current } from '../../../server/session';
import { loadSwitch } from '../../../screens/switch/data';
import { SwitchScreen } from '../../../screens/switch/Screen';

export const dynamic = 'force-dynamic';

export default async function Page() {
  if (authMode() !== 'switcher') notFound();
  const me = await current();
  const people = await loadSwitch();
  // By the person's id: a name can be changed under Aap, or shared.
  const currentKey = me ? (SEED.users.find((u) => u.id === me.user.id)?.key ?? null) : null;
  return <SwitchScreen people={people} current={currentKey} />;
}
