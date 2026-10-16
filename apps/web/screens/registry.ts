import { manifest as aap } from './aap/manifest';
import { manifest as ask } from './ask/manifest';
import { manifest as bill } from './bill/manifest';
import { manifest as billDone } from './bill-done/manifest';
import { manifest as billStart } from './bill-start/manifest';
import { manifest as billView } from './bill-view/manifest';
import { manifest as bills } from './bills/manifest';
import { manifest as creditNote } from './credit-note/manifest';
import { manifest as customer } from './customer/manifest';
import { manifest as customerNew } from './customer-new/manifest';
import { manifest as customers } from './customers/manifest';
import { manifest as dues } from './dues/manifest';
import { manifest as gst } from './gst/manifest';
import { manifest as help } from './help/manifest';
import { manifest as home } from './home/manifest';
import { manifest as importScreen } from './import/manifest';
import { manifest as item } from './item/manifest';
import { manifest as items } from './items/manifest';
import { manifest as login } from './login/manifest';
import { manifest as photo } from './photo/manifest';
import { manifest as remind } from './remind/manifest';
import { manifest as setup } from './setup/manifest';
import { manifest as switchScreen } from './switch/manifest';
import { manifest as team } from './team/manifest';
import type { ScreenManifest } from './types';
import { manifest as welcome } from './welcome/manifest';

/** Every screen, in the order the owner meets them. /flow, the docs and the tests read this list. */
export const SCREENS: ScreenManifest[] = [
  welcome,
  login,
  setup,
  home,
  billStart,
  bill,
  billDone,
  billView,
  creditNote,
  photo,
  remind,
  bills,
  dues,
  customers,
  customer,
  customerNew,
  importScreen,
  items,
  item,
  gst,
  aap,
  team,
  ask,
  help,
  switchScreen,
];

/** A concrete URL that renders each screen in its default state, with the fixture's ids. */
export const SAMPLE_URL: Record<string, string> = {
  welcome: '/welcome',
  login: '/login',
  setup: '/setup/name',
  home: '/',
  'bill-start': '/bills/new',
  bill: '/bills/new?customer=mehta',
  'bill-done': '/bills/new/done',
  'bill-view': '/bills/INV-042',
  'credit-note': '/bills/INV-042/credit-note',
  photo: '/bills/photo?state=review',
  remind: '/bills/INV-042/remind',
  bills: '/bills',
  dues: '/dues',
  customers: '/customers',
  customer: '/customers/mehta',
  'customer-new': '/customers/new',
  import: '/customers/import?state=rows',
  items: '/items',
  item: '/items/amc',
  gst: '/gst',
  aap: '/aap',
  team: '/aap/team',
  ask: '/poocho?state=answered',
  help: '/help',
  switch: '/dev/switch',
};

/** Extra states worth a screenshot, beyond the default: id → ?state values with their URLs. */
export const STATE_URLS: Array<{ screen: string; state: string; url: string; as?: string }> = [
  { screen: 'login', state: 'code', url: '/login?state=code' },
  { screen: 'gst', state: 'month', url: '/gst?period=month' },
  { screen: 'setup', state: 'gst', url: '/setup/gst' },
  { screen: 'setup', state: 'gstin', url: '/setup/gstin' },
  { screen: 'setup', state: 'review', url: '/setup/review' },
  { screen: 'home', state: 'new', url: '/', as: 'new' },
  { screen: 'help', state: 'terms', url: '/help?kind=percent' },
  { screen: 'home', state: 'staff', url: '/', as: 'staff' },
  { screen: 'home', state: 'accountant', url: '/', as: 'accountant' },
  { screen: 'home', state: 'composition', url: '/', as: 'composition' },
  { screen: 'bill', state: 'first', url: '/bills/new?first=1', as: 'new' },
  { screen: 'bill', state: 'composition', url: '/bills/new?customer=hostel', as: 'composition' },
  { screen: 'bill', state: 'check-fail', url: '/bills/new?customer=priya&state=check-fail' },
  { screen: 'bill-view', state: 'paid', url: '/bills/INV-044' },
  { screen: 'bill-view', state: 'partial', url: '/bills/INV-037' },
  { screen: 'bill-view', state: 'cancelled', url: '/bills/INV-034' },
  { screen: 'bill-view', state: 'credit-note', url: '/bills/INV-038' },
  { screen: 'photo', state: 'pick', url: '/bills/photo' },
  { screen: 'photo', state: 'unclear', url: '/bills/photo?state=unclear' },
  { screen: 'photo', state: 'notfound', url: '/bills/photo?state=notfound' },
  { screen: 'import', state: 'pick', url: '/customers/import' },
  { screen: 'aap', state: 'composition', url: '/aap', as: 'composition' },
  { screen: 'aap', state: 'staff', url: '/aap', as: 'staff' },
  { screen: 'ask', state: 'empty', url: '/poocho' },
];
