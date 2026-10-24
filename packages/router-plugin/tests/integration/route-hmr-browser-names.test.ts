/**
 * Route HMR of React route components under the names users give them, on
 * a real page (`route-hmr-page.ts`): lowercase components (React Refresh's
 * own transform registers PascalCase names only), components the route file
 * exports, reassigns or overloads, split or not. An edit of a component's
 * body shows its new code in place, without a full reload, without errors,
 * and without mounting the component anew (React Refresh keeps its state).
 * How the compiler gets there (renaming, hoisting, registration) is free.
 *
 * Replaces the in-process registration checks of
 * react-refresh-route-components.test.ts and known-bugs-route-hmr.test.ts
 * (V1 HMR-17): those read which names React Refresh's transform registered,
 * which neither shows new code nor kept state. Pins: known-bugs-route-hmr
 * -components.test.ts (integration). What modules importing the exports get:
 * react-refresh-route-components.test.ts.
 *
 * Concurrent: each test has its own dev server and page, and mostly waits.
 */
import { describe, test } from 'vitest'
import {
  countMounts,
  isAppError,
  mountsOf,
  openRouteHmrPage,
} from '../route-hmr-page'
import type { TestContext } from 'vitest'

const inPlace = { reloaded: false, errors: [] }

/** Errors the page logged that the app causes on purpose. */
const withoutLoaderErrors = (errors: Array<string>) =>
  errors.filter((error) => !isAppError(error, 'loader failed'))

describe.concurrent('vite: React route components', { timeout: 60_000 }, () => {
  /**
   * A route at `/` whose `mode` search parameter picks what the page shows:
   * its component (no mode), its error component (`error`: the loader
   * throws) or its pending component (`pending`: the loader never settles).
   * The three options are lowercase function declarations that count their
   * mounts and name the version of the file. `options` passes them (and
   * the code split groupings).
   */
  const lowercaseOptionsRoute =
    (options: string) =>
    (
      version: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: search.mode as string | undefined,
  }),
  loaderDeps: ({ search }) => ({ mode: search.mode }),
  loader: ({ deps }) =>
    deps.mode === 'error'
      ? Promise.reject(new Error('loader failed'))
      : deps.mode === 'pending'
        ? new Promise<never>(() => {})
        : null,
  pendingMs: 0,
  pendingMinMs: 0,
  ${options}
})
function pendingComponent() {
  ${countMounts('pendingComponent')}
  return <p>pendingComponent ${version}</p>
}
function errorComponent() {
  ${countMounts('errorComponent')}
  return <p>errorComponent ${version}</p>
}
function component() {
  ${countMounts('component')}
  return <p>component ${version}</p>
}
`

  // Source: add-hmr snapshot fixture createFileRoute-lowercase-components
  // (with the default groupings, `component` and `errorComponent` are split
  // and `pendingComponent` stays in the route module), and the former
  // known-bugs-route-hmr "registers a split %s declared as a lowercase
  // function" (each option in its own group).
  test.for([
    {
      name: 'the default groupings',
      options: `pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  component: component,`,
    },
    {
      name: 'each option in its own group',
      options: `codeSplitGroupings: [['component'], ['pendingComponent'], ['errorComponent']],
  pendingComponent,
  errorComponent,
  component,`,
    },
  ])(
    'declared as lowercase functions, with $name: an edit of the component, the error component and the pending component shows each in place',
    async ({ options }, { expect, onTestFinished }: TestContext) => {
      const route = lowercaseOptionsRoute(options)
      const file = 'routes/index.tsx'
      const app = await openRouteHmrPage({
        onTestFinished,
        files: { [file]: route('v1') },
        ready: 'component v1',
      })
      let version = 1
      for (const [option, mode] of [
        ['component', undefined],
        ['errorComponent', 'error'],
        ['pendingComponent', 'pending'],
      ] as const) {
        if (mode) {
          await app.evaluate(
            `void window.__APP_ROUTER__.navigate({ to: '/', search: { mode: '${mode}' } })`,
          )
          await app.page.waitForText(`${option} v${version}`, {
            selector: '#app',
          })
        }
        const mounts = await mountsOf(app)
        expect(mounts[option], option).toBeGreaterThan(0)
        version++
        const { reloaded, errors } = await app.edit(
          { [file]: route(`v${version}`) },
          `${option} v${version}`,
        )
        expect(
          { reloaded, errors: withoutLoaderErrors(errors) },
          option,
        ).toEqual(inPlace)
        // The router runs the edited route's loader again, so the error and
        // pending states it shows start anew: only the component's state
        // is the framework's to keep.
        if (option === 'component') {
          expect((await mountsOf(app))[option], option).toBe(mounts[option])
        }
      }
    },
  )

  /**
   * A route at `/` whose component is `page`, declared by `declaration`
   * (with `version`), counting its mounts; `options` are the other route
   * options.
   */
  const pageRoute =
    (declaration: (body: string) => string, imports = '', exports = '') =>
    (
      version: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
${imports}
${declaration(`{
  ${countMounts('page')}
  return <p>page ${version}</p>
}`)}
${exports}
export const Route = createFileRoute('/')({ component: page })
`

  // Source: ReactFreshBabelPlugin-test "only registers pascal case
  // functions", "uses original function declaration if it get reassigned"
  // and "registers top-level exported function declarations" / "...
  // exported named arrow functions"; the former react-refresh-route
  // -components "declared lowercase as %s, by renaming it" and "renamed
  // lowercase and exported (%s)". The split rows of the lowercase
  // variables, and `export { page }` split: pinned in
  // known-bugs-route-hmr-components.test.ts.
  test.for([
    ...[false, true].flatMap((autoCodeSplitting) => [
      {
        name: 'a function declaration',
        autoCodeSplitting,
        route: pageRoute((body) => `function page() ${body}`),
      },
      {
        name: 'an overloaded function declaration',
        autoCodeSplitting,
        route: pageRoute(
          (body) => `function page(props: { title?: string }): ReactNode
function page(props: any) ${body}`,
          `import type { ReactNode } from 'react'`,
        ),
      },
      {
        name: 'an exported function declaration',
        autoCodeSplitting,
        route: pageRoute((body) => `export function page() ${body}`),
      },
      {
        name: 'a function declaration exported as default',
        autoCodeSplitting,
        route: pageRoute(
          (body) => `function page() ${body}`,
          '',
          'export default page',
        ),
      },
    ]),
    {
      name: 'a const arrow function',
      autoCodeSplitting: false,
      route: pageRoute((body) => `const page = () => ${body}`),
    },
    {
      name: 'a function expression that names itself',
      autoCodeSplitting: false,
      route: pageRoute((body) => `const page = function page() ${body}`),
    },
    {
      name: 'an arrow function exported by an export list',
      autoCodeSplitting: false,
      route: pageRoute(
        (body) => `const page = () => ${body}`,
        '',
        'export { page }',
      ),
    },
  ])(
    'declared lowercase as $name: an edit shows in place without mounting it again (autoCodeSplitting: $autoCodeSplitting)',
    async (
      { route, autoCodeSplitting },
      { expect, onTestFinished }: TestContext,
    ) => {
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page v1',
      })
      const mounts = await mountsOf(app)
      expect(mounts.page).toBeGreaterThan(0)
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'page v2'),
      ).toEqual(inPlace)
      expect(await mountsOf(app)).toEqual(mounts)
    },
  )

  // A lowercase function declaration the route file reassigns to what a
  // higher-order component returns (`page = connect(page)`; JavaScript
  // only: TypeScript rejects assigning to a function declaration, TS2630).
  // Source: ReactFreshBabelPlugin-test "uses original function declaration
  // if it get reassigned"; the former react-refresh-route-components row.
  test('declared lowercase as a reassigned function declaration: an edit shows in place (autoCodeSplitting: false)', async ({
    expect,
    onTestFinished,
  }: TestContext) => {
    const route = (version: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { connect } from '../connect'
function page() {
  ${countMounts('page')}
  return <p>page ${version}</p>
}
page = connect(page)
export const Route = createFileRoute('/')({ component: page })
`
    const app = await openRouteHmrPage({
      onTestFinished,
      pluginOptions: { autoCodeSplitting: false },
      files: {
        'connect.js': `export const connect = (component) => component\n`,
        'routes/index.jsx': route('v1'),
      },
      ready: 'page v1',
    })
    expect(
      await app.edit({ 'routes/index.jsx': route('v2') }, 'page v2'),
    ).toEqual(inPlace)
  })
})
