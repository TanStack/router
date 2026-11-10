/**
 * Route HMR of a lazy route file (`routes/index.lazy.tsx`, the documented
 * file convention for options loaded with the route's chunk): a real dev
 * server serves the app to a real browser page, and the test edits the lazy
 * file on disk (`route-hmr-page.ts`). The edit shows its new code in place,
 * without a full reload (SPEC J3.1), and the route keeps the options of its
 * route file (`routes/index.tsx`, the loader).
 */
import { describe, it } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const timeout = 90_000

type Target = 'react' | 'solid' | 'vue'

const routeFile = (target: Target) =>
  `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({ loader: () => 'data' })
`

/** The lazy file of `/`: its component names the version and shows the route's loader data. */
const lazyFile = (target: Target, version: string, inline: boolean) => {
  const data =
    target === 'react'
      ? 'Route.useLoaderData()'
      : target === 'vue'
        ? 'data.value'
        : 'data()'
  const body =
    target === 'react'
      ? `<p>lazy ${version} {${data}}</p>`
      : `<p>lazy ${version} {${data}}</p>`
  const setup =
    target === 'react' ? '' : 'const data = Route.useLoaderData()\n  '
  return `import { createLazyFileRoute } from '@tanstack/${target}-router'
${inline ? '' : `function Page() {\n  ${setup}return ${body}\n}\n`}export const Route = createLazyFileRoute('/')({
  component: ${inline ? `() => {\n  ${setup}return ${body}\n}` : 'Page'},
})
`
}

describe.concurrent.each([
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it.for([false, true])(
    'shows the new code of an edited lazy route file in place (inline component: %s)',
    { timeout },
    async (inline: boolean, { expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        onTestFinished,
        files: {
          'routes/index.tsx': routeFile(target),
          'routes/index.lazy.tsx': lazyFile(target, 'v1', inline),
        },
        ready: 'lazy v1 data',
      })
      expect(
        await app.edit(
          { 'routes/index.lazy.tsx': lazyFile(target, 'v2', inline) },
          'lazy v2 data',
        ),
      ).toEqual({ reloaded: false, errors: [] })
    },
  )
})
