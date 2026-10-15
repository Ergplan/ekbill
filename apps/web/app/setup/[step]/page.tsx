import { notFound } from 'next/navigation';

import { SETUP_STEPS, type SetupStep } from '../../../screens/setup/manifest';
import { SetupScreen } from '../../../screens/setup/Screen';

export default async function Page({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;
  if (!(SETUP_STEPS as readonly string[]).includes(step)) notFound();
  return <SetupScreen step={step as SetupStep} />;
}
