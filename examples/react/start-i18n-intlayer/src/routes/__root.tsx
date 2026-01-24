import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
  useMatches,
} from '@tanstack/react-router'
import { defaultLocale, getHTMLTextDir } from 'intlayer'
import { type ReactNode } from 'react'
import { IntlayerProvider } from 'react-intlayer'

import Header from '@/components/Header'
import { LocaleSwitcher } from '@/components/locale-switcher'

import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{}>()({
  head: () => ({
    links: [
      {
        href: appCss,
        rel: 'stylesheet',
      },
    ],
    meta: [
      {
        charSet: 'utf-8',
      },
      {
        content: 'width=device-width, initial-scale=1',
        name: 'viewport',
      },
      {
        title: 'TanStack Start Starter',
      },
    ],
  }),

  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const match = useMatches()

  // Try to find locale in params of any active match
  const localeRoute = match.find((match) => match.routeId === '/{-$locale}')
  const locale = localeRoute?.params?.locale ?? defaultLocale

  return (
    <html dir={getHTMLTextDir(locale)} lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <Header />
        <LocaleSwitcher />
        <IntlayerProvider locale={locale}>{children}</IntlayerProvider>
        <Scripts />
      </body>
    </html>
  )
}
