/// <reference types="vite/client" />

import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from '@tanstack/react-router'

export const requiresTrustedTypes: boolean =
  import.meta.env.VITE_CSP === 'strict'

declare const trustedTypes: any

function createPolicy<T>(name: string, policy: T): T {
  if (!requiresTrustedTypes) return policy

  if (typeof trustedTypes !== 'undefined') {
    return trustedTypes.createPolicy(name, policy)
  }
  return policy
}

const policy = createPolicy('test-app', {
  createHTML: (s: string) => s,
})

export const Route = createRootRoute({
  headers: ({ ssr }) => {
    const nonce = ssr?.nonce
    if (!nonce) return
    return {
      'Content-Security-Policy': [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        `style-src 'self' 'nonce-${nonce}'`,
        ...(requiresTrustedTypes ? ["require-trusted-types-for 'script'"] : []),
      ].join('; '),
    }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'CSP Nonce Test' },
    ],
    links: [{ rel: 'stylesheet', href: '/external.css' }],
    scripts: [{ src: '/external.js' }],
    styles: [
      {
        children: policy.createHTML(
          '.inline-styled { color: green; font-weight: bold; }',
        ),
      },
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
        <Scripts />
      </body>
    </html>
  )
}
