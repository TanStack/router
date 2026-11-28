/**
 * Route HMR of what two split options of one route read: a component or a
 * plain helper that `component` and `errorComponent` both use. In dev the
 * splitter puts it in a module of its own, which both chunks import (one
 * instance, ARCHITECTURE-CODE-SPLITTING.md); an edit of it, then of the
 * route's component, must show in place, keeping the state of the
 * components React Refresh patches (SPEC J3.3), as the same edits of an
 * unshared component or value do (route-hmr-browser.test.ts).
 *
 * Each test first checks that the page loaded that module, by provenance:
 * rendering the route component loaded two modules of the route file besides
 * the route module (the component's chunk and the module it shares). Module
 * layout is free (SPEC §5), so this is the row's precondition, not a
 * behaviour; a compiler that stops sharing the binding here fails it, and
 * the row then needs a shape that still shares one.
 *
 * Vite with `@vitejs/plugin-react` and Rsbuild with `@rsbuild/plugin-react`
 * (React Refresh on both). webpack: its harness app has no refresh runtime
 * (`webpack-hmr-page.ts`), so the state rows do not apply there.
 */
import { describe } from 'vitest'
import { inPlace } from '../route-hmr-edit'
import { test } from '../test'
import type { RouteHmrPage } from '../route-hmr-page'

const FILE = 'routes/index.tsx'

/**
 * The ids of the route file's modules the page loaded: on Vite, the URLs it
 * requested; on Rsbuild, the module ids of the chunks it loaded (the
 * chunk-loading global's entries; dev builds name modules by their request).
 */
function loadedRouteModules(
  app: RouteHmrPage,
  bundler: 'vite' | 'rsbuild',
): Promise<Array<string>> {
  return app.evaluate(
    bundler === 'vite'
      ? `performance.getEntriesByType('resource').map((entry) => entry.name).filter((name) => name.includes('/${FILE}'))`
      : `Object.keys(self).filter((key) => /^(?:webpack|rspack)Chunk/.test(key)).flatMap((key) => self[key].flatMap((chunk) => Object.keys(chunk[1] ?? {}))).filter((id) => id.includes('${FILE}'))`,
  )
}

async function expectSharedModuleLoaded(
  expect: (value: unknown, message?: string) => any,
  app: RouteHmrPage,
  bundler: 'vite' | 'rsbuild',
) {
  const loaded = await loadedRouteModules(app, bundler)
  // (a derived module of the route file has an id of its own: the file's
  // path with a query; the route module is the path alone)
  const derived = new Set(loaded.filter((id) => id.includes('?')))
  expect(
    derived.size,
    `the shared module loaded (precondition), among: ${loaded.join(', ')}`,
  ).toBeGreaterThanOrEqual(2)
}

describe.each(['vite', 'rsbuild'] as const)(
  '%s: a React route whose split options share a binding',
  (bundler) => {
    test('an edit of the shared component, then of the inline route component, shows in place', async ({
      expect,
      openRouteHmrPage,
    }) => {
      const route = (page: string, badge: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
function Badge() {
  return <i>badge ${badge}</i>
}
export const Route = createFileRoute('/')({
  component: () => <p>page ${page} <Badge /></p>,
  errorComponent: () => <Badge />,
})
`
      const app = await openRouteHmrPage({
        bundler,
        files: { [FILE]: route('v1', 'v1') },
        ready: 'page v1 badge v1',
      })
      await expectSharedModuleLoaded(expect, app, bundler)
      expect(
        await app.edit({ [FILE]: route('v1', 'v2') }, 'page v1 badge v2'),
        'edit of the shared component',
      ).toEqual(inPlace)
      expect(
        await app.edit({ [FILE]: route('v2', 'v2') }, 'page v2 badge v2'),
        'edit of the route component',
      ).toEqual(inPlace)
    })

    test('an edit of the shared component, then of the route component, keeps the route component state', async ({
      expect,
      openRouteHmrPage,
    }) => {
      const route = (page: string, badge: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
function Badge() {
  return <i>badge ${badge}</i>
}
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page ${page} count {count} <Badge /></button>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>failed <Badge /></p>,
})
`
      const app = await openRouteHmrPage({
        bundler,
        files: { [FILE]: route('v1', 'v1') },
        ready: 'page v1 count 0 badge v1',
      })
      await expectSharedModuleLoaded(expect, app, bundler)
      await app.click('button')
      await app.page.waitForText('page v1 count 1 badge v1', {
        selector: '#app',
      })
      expect(
        await app.edit(
          { [FILE]: route('v1', 'v2') },
          'page v1 count 1 badge v2',
        ),
        'edit of the shared component',
      ).toEqual(inPlace)
      expect(
        await app.edit(
          { [FILE]: route('v2', 'v2') },
          'page v2 count 1 badge v2',
        ),
        'edit of the route component',
      ).toEqual(inPlace)
    })

    // The unshared equivalent (a value the component and the loader read):
    // route-hmr-browser.test.ts "a value the loader and the component
    // share", in place.
    test.for([
      {
        name: 'a function',
        helper: (v: string) => `function label() {
  return 'helper ${v}'
}`,
        read: 'label()',
      },
      {
        name: 'an object',
        helper: (v: string) => `const settings = { label: 'helper ${v}' }`,
        read: 'settings.label',
      },
    ])(
      'an edit of a shared plain helper ($name) shows in place, keeping the route component state',
      async ({ helper, read }, { expect, openRouteHmrPage }) => {
        const route = (v: string) =>
          `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
${helper(v)}
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page {${read}} count {count}</button>
}
export const Route = createFileRoute('/')({
  component: Page,
  errorComponent: () => <p>failed {${read}}</p>,
})
`
        const app = await openRouteHmrPage({
          bundler,
          files: { [FILE]: route('v1') },
          ready: 'page helper v1 count 0',
        })
        await expectSharedModuleLoaded(expect, app, bundler)
        await app.click('button')
        await app.page.waitForText('page helper v1 count 1', {
          selector: '#app',
        })
        expect(
          await app.edit({ [FILE]: route('v2') }, 'page helper v2 count 1'),
        ).toEqual(inPlace)
        expect(
          await app.edit({ [FILE]: route('v3') }, 'page helper v3 count 1'),
        ).toEqual(inPlace)
      },
    )
  },
)
