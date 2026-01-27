import {
  HeadContent,
  Link,
  Outlet,
  Scripts,
  createRootRoute,
} from '@tanstack/react-router'

export const Route = createRootRoute({
  headers: ({ ssr }) => {
    const nonce = ssr?.nonce
    if (!nonce) return
    return {
      'Content-Security-Policy': [
        // "default-src 'self'",
        // `script-src 'self' 'nonce-${nonce}'`,
        // "style-src 'self' 'unsafe-inline'",
        "require-trusted-types-for 'script'",
      ].join('; '),
    }
  },
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'CSP Trusted Types Test' },
    ],
    links: [{ rel: 'stylesheet', href: '/external.css' }],
    scripts: [{ src: '/external.js' }],
    styles: [
      { children: '.inline-styled { color: green; font-weight: bold; }' },
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
        <div style={{ display: 'flex', gap: '1rem', padding: '1rem' }}>
          <Link to="/">Home</Link>
          <Link to="/other">Other</Link>
        </div>
        <hr />
        <Outlet />
        <Scripts />
      </body>
    </html>
  )
}
