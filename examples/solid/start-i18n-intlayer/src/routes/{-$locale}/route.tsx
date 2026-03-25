import { createFileRoute, Outlet, redirect } from '@tanstack/solid-router'
import { validatePrefix } from 'intlayer'
import { NotFoundComponent } from './404'

export const Route = createFileRoute('/{-$locale}')({
  // beforeLoad runs before the route renders (on both server and client)
  // It's the ideal place to validate the locale prefix
  beforeLoad: ({ params }) => {
    const localeParam = params.locale

    // validatePrefix checks if the locale is valid according to your intlayer config
    const { isValid, localePrefix } = validatePrefix(localeParam)

    if (!isValid) {
      // Invalid locale prefix - redirect to the 404 page with a valid locale prefix
      throw redirect({
        to: '/{-$locale}/404',
        params: { locale: localePrefix },
      })
    }
  },
  component: Outlet,
  // notFoundComponent is called when a child route doesn't exist
  // e.g., /en/non-existent-page triggers this within the /en layout
  notFoundComponent: NotFoundComponent,
})
