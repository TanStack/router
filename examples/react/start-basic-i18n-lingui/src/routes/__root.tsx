import { TanStackRouterDevtools } from '@tanstack/react-router-devtools'
import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import appCss from '~/styles/app.css?url'
import * as React from 'react'
import { i18n } from '@lingui/core'
import { defaultLocale, locales } from '~/modules/lingui/i18n'
import { createServerFn } from '@tanstack/react-start'
import { setHeader } from '@tanstack/react-start/server'
import { serialize } from 'cookie-es'
import { Trans } from '@lingui/react/macro'

const updateLanguage = createServerFn({ method: 'POST' })
  .validator((locale: string) => locale)
  .handler(async ({ data }) => {
    setHeader(
      'Set-Cookie',
      serialize('locale', data, {
        maxAge: 30 * 24 * 60 * 60,
        path: '/',
      }),
    )
  })

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  )
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang={i18n.locale ?? defaultLocale}>
      <head>
        <HeadContent />
      </head>
      <body>
        <div className="p-2 flex gap-2 text-lg">
          <Link to="/">
            <Trans>Index</Trans>
          </Link>
          <Link to="/about">
            <Trans>About</Trans>
          </Link>
          |
          {Object.entries(locales).map(([locale, label]) => (
            <button
              key={locale}
              className={locale === i18n.locale ? 'font-bold' : ''}
              onClick={() => {
                updateLanguage({ data: locale }).then(() => {
                  location.reload()
                })
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {children}
        <TanStackRouterDevtools position="bottom-right" />
        <Scripts />
      </body>
    </html>
  )
}
