import {
  createRootRouteWithContext,
  HeadContent,
  Scripts,
} from '@tanstack/react-router'
import { defaultLocale, getHTMLTextDir } from 'intlayer'
import type { ReactNode } from 'react'
import { IntlayerProvider } from 'react-intlayer'
import type { QueryClient } from '@tanstack/react-query'

import Header from '@/components/Header'
import { LocaleSwitcher } from '@/components/locale-switcher'

import { Route as LocaleRoute } from './{-$locale}/route'
import appCss from '../styles.css?url'

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient
}>()({
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
  const { locale = defaultLocale } = LocaleRoute.useParams()

  return (
    <html dir={getHTMLTextDir(locale)} lang={locale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <IntlayerProvider locale={locale}>
          <Header />
          <LocaleSwitcher />
          {children}
        </IntlayerProvider>
        <Scripts />
      </body>
    </html>
  )
}
