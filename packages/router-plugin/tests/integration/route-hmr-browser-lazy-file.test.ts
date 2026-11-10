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
  const body = `<p>lazy ${version} {${data}}</p>`
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

/** A route whose lazy file names its version; the index route links to it. */
const aboutApp = (target: Target, version: string) => ({
  'routes/index.tsx': `import { Link, createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({
  component: () => <Link to="/about">home</Link>,
})
`,
  'routes/about.tsx': routeFile(target).replace(`('/')`, `('/about')`),
  'routes/about.lazy.tsx': aboutLazy(target, version),
})
const aboutLazy = (target: Target, version: string) =>
  `import { createLazyFileRoute } from '@tanstack/${target}-router'
export const Route = createLazyFileRoute('/about')({
  component: () => <p>about ${version}</p>,
})
`

describe.concurrent.each([
  { bundler: 'vite', target: 'react' },
  { bundler: 'vite', target: 'solid' },
  { bundler: 'vite', target: 'vue' },
  { bundler: 'rsbuild', target: 'react' },
  { bundler: 'rsbuild', target: 'solid' },
  { bundler: 'rsbuild', target: 'vue' },
] as const)('$bundler: a $target app', ({ bundler, target }) => {
  it(
    'loads the edited lazy route file of a route the page has not shown yet',
    { timeout },
    async ({ expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        bundler,
        target,
        onTestFinished,
        files: aboutApp(target, 'v1'),
        ready: 'home',
      })
      expect(
        await app.edit(
          { 'routes/about.lazy.tsx': aboutLazy(target, 'v2') },
          'home',
        ),
      ).toEqual({ reloaded: false, errors: [] })
      await app.click('a')
      await app.page.waitForText('about v2', { selector: '#app' })
      expect(app.loads()).toBe(1)
    },
  )
})

// React: the component of a lazy route file keeps its state across an edit,
// as a route module's component does (React Refresh patches it in place)
describe.concurrent.each(['vite', 'rsbuild'] as const)(
  '%s: a react app',
  (bundler) => {
    const counter = (version: string) =>
      `import { useState } from 'react'
import { createLazyFileRoute } from '@tanstack/react-router'
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>lazy ${version} count {count}</button>
}
export const Route = createLazyFileRoute('/')({ component: Page })
`
    it(
      'keeps the state of an edited lazy route component',
      { timeout },
      async ({ expect, onTestFinished }: TestContext) => {
        const app = await openRouteHmrPage({
          bundler,
          onTestFinished,
          files: {
            'routes/index.tsx': routeFile('react'),
            'routes/index.lazy.tsx': counter('v1'),
          },
          ready: 'lazy v1 count 0',
        })
        await app.click('button')
        await app.page.waitForText('lazy v1 count 1', { selector: '#app' })
        expect(
          await app.edit(
            { 'routes/index.lazy.tsx': counter('v2') },
            'lazy v2 count 1',
          ),
        ).toEqual({ reloaded: false, errors: [] })
      },
    )
  },
)
