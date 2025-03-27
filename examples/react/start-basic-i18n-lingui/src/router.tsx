import type { I18n } from '@lingui/core'
import { I18nProvider } from '@lingui/react'
import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import type { PropsWithChildren } from 'react'
import { routeTree } from './routeTree.gen'
import { Trans } from '@lingui/react/macro'

export function createRouter({ i18n }: { i18n: I18n }) {
  const router = createTanStackRouter({
    routeTree,
    defaultPreload: 'intent',
    defaultErrorComponent: (err) => <p>{err.error.stack}</p>,
    defaultNotFoundComponent: () => (
      <p>
        <Trans>not found</Trans>
      </p>
    ),
    scrollRestoration: true,
    Wrap: ({ children }: PropsWithChildren) => {
      return <I18nProvider i18n={i18n}>{children}</I18nProvider>
    },
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
