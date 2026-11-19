/**
 * An Rsbuild RSC app with two modules of each shared file, one per layer of
 * the server compiler (SSR: what the route renders; RSC: what the server
 * fn's server component runs), for rsc-layers-dev.test.ts and
 * rsc-layers-build.test.ts:
 * - `fns.ts`, a server fn the route's loader calls (the SSR layer's module:
 *   a caller of the provider) and the server component calls (the RSC
 *   layer's module: the provider);
 * - `ClientBox.tsx`, a `'use client'` component the route renders (the SSR
 *   layer's module: the component) and the server component renders (the
 *   RSC layer's module: a client reference, which SSR renders again).
 * The document `/` shows each caller's answer and each box.
 */
import { expect } from 'vitest'

export const sharedFns = (marker: string) =>
  `import { createServerFn } from '@tanstack/react-start'
export const shared = createServerFn().handler(() => '${marker}')
`

export const clientBox = (label: string) => `'use client'
export function ClientBox({ from }: { from: string }) {
  return <span data-testid={'box-' + from}>{'${label} ' + from}</span>
}
`

export const layersFiles = {
  'src/router.tsx': `import { createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export function getRouter() {
  return createRouter({ routeTree })
}
`,
  'src/routes/__root.tsx': `import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({ component: Root })
function Root() {
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
`,
  'src/shared/fns.ts': sharedFns('MARK_SHARED'),
  'src/shared/ClientBox.tsx': clientBox('box'),
  'src/shared/server.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ClientBox } from './ClientBox'
import { shared } from './fns'
async function ServerPart() {
  const value = await shared()
  return (
    <section>
      <p data-testid="server">{'server ' + value}</p>
      <ClientBox from="server" />
    </section>
  )
}
export const getServer = createServerFn().handler(async () => renderServerComponent(<ServerPart />))
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { ClientBox } from '../shared/ClientBox'
import { shared } from '../shared/fns'
import { getServer } from '../shared/server'
export const Route = createFileRoute('/')({
  loader: async () => ({ value: await shared(), Server: await getServer() }),
  component: Page,
})
function Page() {
  const { value, Server } = Route.useLoaderData()
  return (
    <main>
      <p data-testid="route">{'route ' + value}</p>
      <ClientBox from="route" />
      {Server}
    </main>
  )
}
`,
  'src/entry.ts': `export {}\n`,
  'tsconfig.json': JSON.stringify({ compilerOptions: { jsx: 'react-jsx' } }),
}

/** The texts of the document's test ids. */
function texts(html: string): Record<string, string> {
  return Object.fromEntries(
    [...html.matchAll(/data-testid="([^"]+)"[^>]*>([^<]*)</g)].map((m) => [
      m[1]!,
      m[2]!,
    ]),
  )
}

/**
 * The document `/` at `url` answers 200 and shows both callers' answer
 * `marker` and both boxes labelled `label`.
 */
export async function expectBothLayers(
  url: string,
  marker: string,
  label: string,
) {
  const response = await fetch(new URL('/', url))
  expect({
    status: response.status,
    texts: texts(await response.text()),
  }).toEqual({
    status: 200,
    texts: {
      route: `route ${marker}`,
      'box-route': `${label} route`,
      server: `server ${marker}`,
      'box-server': `${label} server`,
    },
  })
}
