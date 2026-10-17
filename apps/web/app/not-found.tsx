import { cookies } from 'next/headers';

import { localeOf, t } from '@ekbill/copy';
import { EmptyState } from '@ekbill/ui';

/**
 * A link that leads nowhere (a bill number of another business, a removed
 * item): said in the app's words, with the way home (the flow audit's
 * "always a way out").
 */
export default async function NotFound() {
  // A server component: the dictionary has no provider here, so the person's language is passed.
  const locale = localeOf((await cookies()).get('eb-lang')?.value);
  return (
    <main className="eb-screen">
      <EmptyState
        icon="file"
        title={t('error.notFound', undefined, locale)}
        sub={t('error.notFound.sub', undefined, locale)}
        action={
          <a className="eb-btn eb-btn--ink" href="/" data-guide="home">
            {t('nav.home', undefined, locale)}
          </a>
        }
      />
    </main>
  );
}
