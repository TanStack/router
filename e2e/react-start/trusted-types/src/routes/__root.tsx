import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import { TanStackRouterDevtoolsInProd } from '@tanstack/react-router-devtools'

// The devtools only pass the policy their own markup.
const devtoolsPolicy =
  typeof window === 'undefined'
    ? undefined
    : (window as any).trustedTypes?.createPolicy('devtools', {
        createHTML: (html: string) => html,
      })

export const Route = createRootRoute({
  headers: () => ({
    'Content-Security-Policy':
      "require-trusted-types-for 'script'; trusted-types devtools",
  }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Trusted Types Test' },
    ],
  }),
  component: RootComponent,
})

function RootComponent() {
  return (
    <html>
      <head>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        <TanStackRouterDevtoolsInProd trustedTypesPolicy={devtoolsPolicy} />
        <Scripts />
      </body>
    </html>
  )
}
