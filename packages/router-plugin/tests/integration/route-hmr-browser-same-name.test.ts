/**
 * Route HMR when an edit gives a component option another component under
 * the same name: the route imports a same-named component from another
 * module (a component file moved, a layout switched), or an expression
 * value picks another component. The page shows the new component (SPEC
 * J3.3). Whether it mounts anew is the framework's refresh contract, not the
 * name (J3.2): the two are different refresh families, so nothing patches
 * the held one in place. Keeping a component is tested in
 * route-hmr-browser-names.test.ts and route-hmr-browser.test.ts.
 *
 * Concurrent: each test has its own dev server and page, and mostly waits.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const inPlace = { reloaded: false, errors: [] }

/** Two layout modules exporting a component `Shell` that shows its module. */
const layouts = Object.fromEntries(
  ['classic', 'modern'].map((name) => [
    `layouts/${name}.tsx`,
    `export function Shell() {
  return <p>${name} shell</p>
}
`,
  ]),
)

// Bug: the route HMR runtime kept the component the router held when the
// new evaluation named its option with the same binding name, though the
// import now names another module's `Shell`, which no refresh runtime
// patches the held one with.
// Impact: the page went on showing the old layout, without a reload or an
// error, and later edits of the new layout never showed either.
describe.concurrent.each(['react', 'solid'] as const)(
  'vite, %s: a same-named component imported from another module',
  { timeout: 60_000 },
  (target) => {
    test.for([
      {
        name: 'the root route',
        file: 'routes/__root.tsx',
        autoCodeSplitting: true,
        route: (
          from: string,
        ) => `import { createRootRoute } from '@tanstack/${target}-router'
import { Shell } from '../layouts/${from}'
export const Route = createRootRoute({ component: Shell })
`,
      },
      {
        name: 'an unsplit route',
        file: 'routes/index.tsx',
        autoCodeSplitting: false,
        route: (
          from: string,
        ) => `import { createFileRoute } from '@tanstack/${target}-router'
import { Shell } from '../layouts/${from}'
export const Route = createFileRoute('/')({ component: Shell })
`,
      },
      {
        name: 'a split route',
        file: 'routes/index.tsx',
        autoCodeSplitting: true,
        route: (
          from: string,
        ) => `import { createFileRoute } from '@tanstack/${target}-router'
import { Shell } from '../layouts/${from}'
export const Route = createFileRoute('/')({ component: Shell })
`,
      },
    ])(
      '$name: switching the import shows the other component',
      async (
        { file, route, autoCodeSplitting },
        { expect, onTestFinished }: TestContext,
      ) => {
        const app = await openRouteHmrPage({
          target,
          onTestFinished,
          pluginOptions: { autoCodeSplitting },
          files: {
            ...layouts,
            ...(file === 'routes/index.tsx'
              ? {}
              : {
                  'routes/index.tsx': `import { createFileRoute } from '@tanstack/${target}-router'
export const Route = createFileRoute('/')({})
`,
                }),
            [file]: route('classic'),
          },
          ready: 'classic shell',
        })
        expect(
          await app.edit({ [file]: route('modern') }, 'modern shell'),
        ).toEqual(inPlace)
      },
    )
  },
)

// Bug: the same through the name the compiler gives an expression value
// (React: a hoisted `const` in the route module, or the split chunk's own
// declaration), which React Refresh registers for a function or a call but
// not for a conditional: the runtime kept the held component.
// Impact: flipping the condition showed nothing.
describe.concurrent('vite, react: a conditional component value', () => {
  const route = (
    flag: boolean,
  ) => `import { createFileRoute } from '@tanstack/react-router'
const flag = ${flag}
function Wide() {
  return <p>wide layout</p>
}
function Narrow() {
  return <p>narrow layout</p>
}
export const Route = createFileRoute('/')({ component: flag ? Wide : Narrow })
`
  test.for([false, true])(
    'flipping the condition shows the other component (autoCodeSplitting: %s)',
    { timeout: 60_000 },
    async (autoCodeSplitting, { expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': route(true) },
        ready: 'wide layout',
      })
      expect(
        await app.edit({ 'routes/index.tsx': route(false) }, 'narrow layout'),
      ).toEqual(inPlace)
    },
  )
})

// A frozen component object as a split React component: dev code writes
// nothing onto a component value, so the chunk evaluates, and an edit
// shows.
describe.concurrent('vite, react: a frozen split component', () => {
  const route = (
    version: string,
  ) => `import { createFileRoute } from '@tanstack/react-router'
import { memo } from 'react'
function Page() {
  return <p>frozen page ${version}</p>
}
export const Route = createFileRoute('/')({ component: Object.freeze(memo(Page)) })
`
  test(
    'renders, and an edit shows',
    { timeout: 60_000 },
    async ({ expect, onTestFinished }: TestContext) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        files: { 'routes/index.tsx': route('v1') },
        ready: 'frozen page v1',
      })
      const edited = await app.edit(
        { 'routes/index.tsx': route('v2') },
        'frozen page v2',
      )
      expect(edited.errors).toEqual([])
    },
  )
})
