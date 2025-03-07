import * as Devtools from './TanStackRouterDevtools'

export const TanStackRouterDevtools: (typeof Devtools)['TanStackRouterDevtools'] =
  process.env.NODE_ENV !== 'development'
    ? function () {
        return null
      }
    : Devtools.TanStackRouterDevtools
