import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import '@ekbill/design/tokens/fonts.css';
import '@ekbill/design/tokens/themes.css';
import '@ekbill/ui/styles.css';
import './globals.css';
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
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-IN" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(function(){try{var m=document.cookie.match(/(?:^|; )eb-theme=(narangi|harmony)/);if(m)document.documentElement.setAttribute('data-theme',m[1]);}catch(e){}})();",
          }}
        />
      </head>
      <body>
        {children}
        <Hydrated />
      </body>
    </html>
  );
}
