import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'
import { validatePrefix } from 'intlayer'

import { NotFoundComponent } from './404'

export const Route = createFileRoute('/{-$locale}')({
  beforeLoad: ({ params }) => {
    // Get locale from route params (not from server headers, as beforeLoad runs on both client and server)
    const localeParam = params.locale

    // If no locale provided (optional param), it's valid (will use default)
    // In prefix-all mode, the locale is required to be a valid locale
    const { isValid, localePrefix } = validatePrefix(localeParam)

    if (isValid) {
      // If locale is valid, continue
      return
    }

    throw redirect({
      params: { locale: localePrefix },
      to: '/{-$locale}/404',
    })
  },
  component: Outlet,
  notFoundComponent: NotFoundComponent,
})
