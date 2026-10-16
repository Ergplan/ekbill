import { t } from '@ekbill/copy';
import { EmptyState } from '@ekbill/ui';

/**
 * A link that leads nowhere (a bill number of another business, a removed
 * item): said in the app's words, with the way home (the flow audit's
 * "always a way out").
 */
export default function NotFound() {
  return (
    <main className="eb-screen">
      <EmptyState
        icon="file"
        title={t('error.notFound')}
        sub={t('error.notFound.sub')}
        action={
          <a className="eb-btn eb-btn--ink" href="/" data-guide="home">
            {t('nav.home')}
          </a>
        }
      />
    </main>
  );
}
