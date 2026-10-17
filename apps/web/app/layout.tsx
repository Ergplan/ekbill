import type { Metadata, Viewport } from 'next';
import { cookies } from 'next/headers';
import type { ReactNode } from 'react';

import '@ekbill/design/tokens/fonts.css';
import '@ekbill/design/tokens/themes.css';
import '@ekbill/ui/styles.css';
import './globals.css';
import { voiceAvailable } from '@ekbill/ai';
import { htmlLang, localeOf } from '@ekbill/copy';
import { LocaleProvider } from '@ekbill/copy/provider';

import { VoiceProvider } from '../screens/voice/VoiceProvider';
import { Hydrated } from './Hydrated';

export const metadata: Metadata = {
  title: 'EkBill',
  description: 'Bill banao. WhatsApp karo. Paise lo.',
  applicationName: 'EkBill',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * The root. The theme attribute is set before paint by a tiny inline script
 * (no flash of the wrong theme): the user's choice when there is one (Stage 2
 * puts it on the user), else the OS. Stage 0 reads a cookie so /kit's switch
 * sticks across reloads.
 */
export default async function RootLayout({ children }: { children: ReactNode }) {
  // The person's language (users.language, echoed in a cookie by sign-in, /dev/switch and the Aap action); Hinglish by
  // default. Every screen below reads it through the provider (the dictionary's t()).
  const locale = localeOf((await cookies()).get('eb-lang')?.value);
  return (
    <html lang={htmlLang(locale)} data-locale={locale} suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=document.cookie.match(/(?:^|; )eb-theme=(narangi|harmony)/);var t=m?m[1]:(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'harmony':'narangi');document.documentElement.setAttribute('data-theme',t);}catch(e){}})();",
          }}
        />
      </head>
      <body>
        {/* The voice (Stage 9) lives above the screens, so one conversation survives moving between them. */}
        <LocaleProvider locale={locale}>
          <VoiceProvider available={voiceAvailable()}>{children}</VoiceProvider>
        </LocaleProvider>
        <Hydrated />
      </body>
    </html>
  );
}
