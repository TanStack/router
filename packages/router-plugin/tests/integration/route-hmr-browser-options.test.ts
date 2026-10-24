/**
 * Route HMR of React route components written inline, of root route
 * components, of edits that add route options beside a component, and of
 * components using custom hooks, on a real page (`route-hmr-page.ts`). An
 * edit shows its new code in place, without a full reload and without
 * errors; a component React Refresh can patch in place (a body edit that
 * keeps its hooks) is not mounted anew, and one whose hooks changed may be
 * (React Refresh remounts it). How the compiler gets there (hoisting,
 * naming, registration, hook signatures) is free.
 *
 * Replaces the in-process registration and signature checks of
 * react-refresh-route-components.test.ts (V1 HMR-17), which read the names
 * and hook signatures React Refresh's transform computed.
 *
 * Concurrent: each test has its own dev server and page, and mostly waits.
 */
import { describe, test } from 'vitest'
import { countMounts, mountsOf, openRouteHmrPage } from '../route-hmr-page'
import type { TestContext } from 'vitest'

const inPlace = { reloaded: false, errors: [] }

describe.concurrent('vite: React route components', { timeout: 60_000 }, () => {
  /**
   * Opens an app whose route file `file` holds `route('v1')`, waits until it
   * shows `shows('v1')` (after navigating to `path`, when given), edits it
   * to `route('v2')`, and asserts that the page shows `shows('v2')` in place
   * and that no component `countMounts` counts was mounted anew.
   */
  async function expectEditInPlace(
    {
      file,
      files,
      route,
      shows,
      path,
      autoCodeSplitting,
    }: {
      file: string
      files?: Record<string, string>
      route: (version: string) => string
      shows: (version: string) => string
      path?: string
      autoCodeSplitting: boolean
    },
    { expect, onTestFinished }: TestContext,
  ) {
    const app = await openRouteHmrPage({
      onTestFinished,
      pluginOptions: { autoCodeSplitting },
      files: { ...files, [file]: route('v1') },
      ready: path ? /./ : shows('v1'),
    })
    if (path) {
      await app.evaluate(
        `void window.__APP_ROUTER__.navigate({ to: '${path}' })`,
      )
      await app.page.waitForText(shows('v1'), { selector: '#app' })
    }
    const mounts = await mountsOf(app)
    expect(Object.keys(mounts)).not.toEqual([])
    expect(await app.edit({ [file]: route('v2') }, shows('v2'))).toEqual(
      inPlace,
    )
    expect(await mountsOf(app)).toEqual(mounts)
  }

  /** A route at `/` whose component is `component`, after `imports`. */
  const inlineRoute =
    (component: (body: string) => string) => (version: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createFileRoute('/')({
  component: ${component(`{
    ${countMounts('page')}
    return <p>inline ${version}</p>
  }`)},
})
`

  // Source: ReactFreshBabelPlugin-test "registers top-level variable
  // declarations with function expressions" and "... with arrow
  // functions"; the former react-refresh-route-components "written inline
  // as %s". An inline arrow function: route-hmr-browser.test.ts.
  test.for(
    [false, true].flatMap((autoCodeSplitting) => [
      {
        name: 'an anonymous function expression',
        autoCodeSplitting,
        component: (body: string) => `function () ${body}`,
      },
      {
        name: 'a parenthesized arrow function',
        autoCodeSplitting,
        component: (body: string) => `(() => ${body})`,
      },
    ]),
  )(
    'written inline as $name: an edit shows in place without mounting it again (autoCodeSplitting: $autoCodeSplitting)',
    async ({ autoCodeSplitting, component }, context: TestContext) => {
      await expectEditInPlace(
        {
          file: 'routes/index.tsx',
          route: inlineRoute(component),
          shows: (version) => `inline ${version}`,
          autoCodeSplitting,
        },
        context,
      )
    },
  )

  // Every component option of a root route at once, each its own
  // component: the edit shows each one's new code, and the root component
  // keeps its state. The page is at a path no route matches, so the root's
  // not-found component shows. Source: the former react-refresh-route
  // -components "for every inline component option of a root route, under
  // distinct names", "for every lowercase function component of a root
  // route, under distinct names" (add-hmr snapshot fixture
  // createRootRoute-lowercase-components) and "of a root route created with
  // context type arguments" (createRootRouteWithContext-type-args).
  test.for(
    [false, true].flatMap((autoCodeSplitting) => [
      {
        name: 'written inline',
        autoCodeSplitting,
        route: (version: string) =>
          `import { Outlet, createRootRoute } from '@tanstack/react-router'
import { useState } from 'react'
export const Route = createRootRoute({
  component: () => {
    ${countMounts('root')}
    return <div>root ${version} <Outlet /></div>
  },
  pendingComponent: () => <p>pending ${version}</p>,
  errorComponent: ({ error }) => <p>error ${version} {String(error)}</p>,
  notFoundComponent: () => <p>not found ${version}</p>,
  shellComponent: ({ children }) => <div>shell ${version} {children}</div>,
})
`,
      },
      {
        name: 'declared as lowercase functions',
        autoCodeSplitting,
        route: (version: string) =>
          `import { Outlet, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useState } from 'react'
export const Route = createRootRoute({
  shellComponent: shellComponent,
  pendingComponent: pendingComponent,
  errorComponent: errorComponent,
  notFoundComponent: notFoundComponent,
  component: component,
})
function shellComponent({ children }: { children: ReactNode }) {
  return <div>shell ${version} {children}</div>
}
function pendingComponent() {
  return <p>pending ${version}</p>
}
function errorComponent() {
  return <p>error ${version}</p>
}
function notFoundComponent() {
  return <p>not found ${version}</p>
}
function component() {
  ${countMounts('root')}
  return <div>root ${version} <Outlet /></div>
}
`,
      },
      {
        name: 'of a root route created with context type arguments',
        autoCodeSplitting,
        route: (version: string) =>
          `import { Outlet, createRootRouteWithContext } from '@tanstack/react-router'
import { useState } from 'react'
interface MyRouterContext {
  auth?: boolean
}
export const Route = createRootRouteWithContext<MyRouterContext>()({
  component: () => {
    ${countMounts('root')}
    return <div>root ${version} <Outlet /></div>
  },
  notFoundComponent: () => <p>not found ${version}</p>,
  shellComponent: ({ children }) => <div>shell ${version} {children}</div>,
})
`,
      },
    ]),
  )(
    'root route components $name: an edit shows each in place, and the root component keeps its state (autoCodeSplitting: $autoCodeSplitting)',
    async ({ autoCodeSplitting, route }, context: TestContext) => {
      await expectEditInPlace(
        {
          file: 'routes/__root.tsx',
          files: {
            'routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({ component: () => <p>index</p> })
`,
          },
          route,
          path: '/missing',
          shows: (version) =>
            `shell ${version} root ${version} not found ${version}`,
          autoCodeSplitting,
        },
        context,
      )
    },
  )

  // An edit that adds component options before an inline component shows
  // in place. Whether the component keeps its state is free: adding sibling
  // options next to an inline component may remount it (ruling 2026-10-24,
  // SPEC J3.2). Source: the former react-refresh-route-components "names
  // hoisted components after their option, so adding options keeps the
  // family" (ReactFreshIntegration-test "preserves state ...").
  test.for([false, true])(
    'an edit that adds component options before an inline component shows in place (autoCodeSplitting: %s)',
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      const route = (version: string) =>
        `import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/')({${
          version === 'v1'
            ? ''
            : `
  pendingComponent: () => <p>pending</p>,
  errorComponent: () => <p>error</p>,`
        }
  component: () => <p>page ${version}</p>,
})
`
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page v1',
      })
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'page v2'),
      ).toEqual(inPlace)
    },
  )

  /**
   * A route at `/` whose inline component calls the custom hook
   * `useCounter`, declared by `hook` (with `version`); the loader shares
   * `format` with the hook. The component counts its mounts.
   */
  const hookRoute = (hook: (version: string) => string) => (version: string) =>
    `import { createFileRoute } from '@tanstack/react-router'
import { useMemo, useState } from 'react'
const format = (n: number) => 'n' + n
${hook(version)}
export const Route = createFileRoute('/')({
  loader: () => format(1),
  component: () => {
    ${countMounts('page')}
    const count = useCounter()
    return <p>page {count} {Route.useLoaderData()}</p>
  },
})
`

  // A body edit of a custom hook that keeps its hook calls: React Refresh
  // keeps the component that calls it. Source: the former
  // react-refresh-route-components "with the hook signature of the
  // component the user wrote, also in the split chunk"
  // (ReactFreshBabelPlugin-test "includes custom hooks into the
  // signatures").
  test.for([false, true])(
    'an edit of the body of a custom hook a component calls shows in place and keeps its state (autoCodeSplitting: %s)',
    async (autoCodeSplitting: boolean, context: TestContext) => {
      await expectEditInPlace(
        {
          file: 'routes/index.tsx',
          route: hookRoute(
            (version) => `function useCounter() {
  const [count] = useState(0)
  return format(count) + ' ${version}'
}`,
          ),
          shows: (version) => `page n0 ${version} n1`,
          autoCodeSplitting,
        },
        context,
      )
    },
  )

  // An edit that changes the hooks a custom hook calls: React Refresh must
  // mount the component calling it anew (its state no longer matches its
  // hooks); the edit shows without a reload and without errors (a component
  // kept with mismatched hooks throws). Source: as above
  // (ReactFreshIntegration-test "remounts on changed hook order" for custom
  // hooks).
  test.for([false, true])(
    'an edit that changes the hooks of a custom hook a component calls shows in place (autoCodeSplitting: %s)',
    async (
      autoCodeSplitting: boolean,
      { expect, onTestFinished }: TestContext,
    ) => {
      const route = hookRoute((version) =>
        version === 'v1'
          ? `function useCounter() {
  const [count] = useState(0)
  return format(count) + ' v1'
}`
          : `function useCounter() {
  const [count] = useState(0)
  const doubled = useMemo(() => count * 2, [count])
  return format(doubled) + ' ${version}'
}`,
      )
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting },
        files: { 'routes/index.tsx': route('v1') },
        ready: 'page n0 v1 n1',
      })
      expect(
        await app.edit({ 'routes/index.tsx': route('v2') }, 'page n0 v2 n1'),
      ).toEqual(inPlace)
    },
  )
})
