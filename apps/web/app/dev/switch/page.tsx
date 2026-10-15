import { cookies } from 'next/headers';

import { loadSwitch } from '../../../screens/switch/data';
import { SwitchScreen } from '../../../screens/switch/Screen';

export const dynamic = 'force-dynamic';

export default async function Page() {
  const current = (await cookies()).get('eb-as')?.value ?? null;
  return <SwitchScreen people={loadSwitch()} current={current} />;
}
