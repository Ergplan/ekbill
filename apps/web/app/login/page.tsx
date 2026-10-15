import { LoginScreen } from '../../screens/login/Screen';
import { one, type SearchParams } from '../../screens/viewer';

export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const state = one((await searchParams).state) === 'code' ? 'code' : 'phone';
  return <LoginScreen state={state} />;
}
