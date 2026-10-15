import { t } from '@ekbill/copy';
import type { TabItem } from '@ekbill/ui';

import type { Registration, Role } from '../types';

/** Ghar · Bills · [GST, regular businesses only] · Aap (master prompt 8.0). */
export function tabsFor(registration: Registration | null, _role: Role): TabItem[] {
  const tabs: TabItem[] = [
    { key: 'home', label: t('nav.home'), icon: 'home', href: '/' },
    { key: 'bills', label: t('nav.bills'), icon: 'receipt', href: '/bills' },
  ];
  if (registration === 'regular') tabs.push({ key: 'gst', label: t('nav.gst'), icon: 'percent', href: '/gst' });
  tabs.push({ key: 'you', label: t('nav.you'), icon: 'user', href: '/aap' });
  return tabs;
}
