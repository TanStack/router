// Slow-tier pins of route HMR on a real page: component shapes React
// Refresh does not register. The other page pins are in
// known-bugs-route-hmr.test.ts (two files, to keep each within its time
// budget), the in-process pins in ../known-bugs-route-hmr.test.ts (fast
// tier).
/**
 * Known route HMR and React Refresh bugs. Each test asserts the correct
 * behaviour for a bug main had, which today's compiler fixes (a regression
 * test, oracle/KNOWN-BUGS.md).
 *
 * Route HMR keeps the previous `component` (and the other component options)
 * so that React Refresh can patch it in place; a component React Refresh does
 * not register keeps rendering the old code until a full reload. Pins of what
 * the page shows run a real dev server and a real browser page
 * (`route-hmr-page.ts`): an edit must show its new code without a full
 * reload and without errors in the page. A pin fails as soon as the page's
 * HMR client reports the update applied without the new code showing.
 *
 * Concurrent: each pin has its own dev server and page, and mostly waits.
 */
import { describe, test } from 'vitest'
import { openRouteHmrPage } from '../route-hmr-page'
import { editRoute, inPlace } from '../route-hmr-edit'
import type { TestContext } from 'vitest'

describe.concurrent('route HMR in a real page', { timeout: 60_000 }, () => {
  /** A route at `/` with the `component` option `option`, after `imports`. */
  const inlineRoute =
    (imports: string, option: (version: string) => string) =>
    (version: string) =>
      `import { createFileRoute } from '@tanstack/react-router'
${imports}
export const Route = createFileRoute('/')({
  ${option(version)},
})
`

  // Controls for the inline component pins below (same harness): a
  // component wrapped in `memo` or `forwardRef` at the option, declared
  // under a name React Refresh registers, is patched in place with its
  // state.
  test.for(['memo', 'forwardRef'])(
    'vite: an edit of a component passed as %s(Page) shows in place with its state (autoCodeSplitting: false)',
    async (wrapper: string, { expect, onTestFinished }: TestContext) => {
      const route = inlineRoute('', () => `component: ${wrapper}(Page)`)
      const file = 'routes/index.tsx'
      const app = await openRouteHmrPage({
        onTestFinished,
        pluginOptions: { autoCodeSplitting: false },
        files: {
          [file]: `import { ${wrapper}, useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page v1 count {count}</button>
}
${route('v1')}`,
        },
        ready: 'page v1 count 0',
      })
      await app.click('button')
      await app.page.waitForText('page v1 count 1', { selector: '#app' })
      expect(
        await app.edit(
          {
            [file]: `import { ${wrapper}, useState } from 'react'
function Page() {
  const [count, setCount] = useState(0)
  return <button onClick={() => setCount(count + 1)}>page v2 count {count}</button>
}
${route('v2')}`,
          },
          'page v2 count 1',
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: inline component options that are not plain functions (`memo(...)`,
  // `forwardRef(...)`, method shorthand, a function wrapped in a TypeScript
  // `as` / `satisfies`) are neither hoisted nor registered for React
  // Refresh, nor is the function they wrap; route HMR keeps the previous
  // component for React Refresh to patch, which it cannot.
  // Impact: on unsplit routes (root routes, or file routes without automatic
  // code splitting), and for a split method-shorthand component, edits to
  // these components do not show until a reload.
  // Source: ReactFreshBabelPlugin-test "registers likely HOCs with inline
  // functions" and "registers top-level variable declarations with arrow
  // functions"; #8504 react-refresh-route-components ("written inline and
  // wrapped in ..."), where the wrapped rows pass; #8721 "keeps a
  // method-shorthand component option" (split row). Formerly read React
  // Refresh's registrations and modelled its runtime (now real tools only,
  // SPEC §8).
  // Any fix passes: the edit shows without a full reload.
  test.for([
    ...[
      ['as any', '', `(() => <p>inline VERSION</p>) as any`],
      [
        'satisfies',
        `import type { FC } from 'react'`,
        `(() => <p>inline VERSION</p>) satisfies FC`,
      ],
      [
        'memo(() => ...)',
        `import { memo } from 'react'`,
        `memo(() => <p>inline VERSION</p>)`,
      ],
      [
        'forwardRef(function () { ... })',
        `import { forwardRef } from 'react'`,
        `forwardRef(function (props, ref) {
    return <p ref={ref}>inline VERSION</p>
  })`,
      ],
    ].map(([name, imports, component]) => ({
      name: name!,
      file: 'routes/index.tsx',
      pluginOptions: { autoCodeSplitting: false },
      route: inlineRoute(
        imports!,
        (version) => `component: ${component!.replace('VERSION', version)}`,
      ),
      shows: (version: string) => `inline ${version}`,
    })),
    ...[false, true].map((autoCodeSplitting) => ({
      name: 'method shorthand',
      file: 'routes/index.tsx',
      pluginOptions: { autoCodeSplitting },
      route: inlineRoute(
        '',
        (version) => `component() {
    return <p>inline ${version}</p>
  }`,
      ),
      shows: (version: string) => `inline ${version}`,
    })),
    {
      name: 'React.memo(forwardRef(...)) on a root route',
      file: 'routes/__root.tsx',
      pluginOptions: { autoCodeSplitting: true },
      route: (version: string) => `import React, { forwardRef } from 'react'
import { createRootRoute } from '@tanstack/react-router'
export const Route = createRootRoute({
  component: React.memo(forwardRef(function Root(props, ref) {
    return <p ref={ref}>root ${version}</p>
  })),
})
`,
      shows: (version: string) => `root ${version}`,
    },
  ])(
    'vite: an edit of an inline component written as $name shows in place (autoCodeSplitting: $pluginOptions.autoCodeSplitting)',
    async (row, { expect, onTestFinished }: TestContext) => {
      expect(await editRoute(row, onTestFinished)).toEqual(inPlace)
    },
  )

  /**
   * A route at `/` whose component is `page`, declared by `declaration`
   * (whose body names the version), with the other route `options`.
   */
  const lowercaseRoute =
    (declaration: (body: string) => string, options = '', exports = '') =>
    (
      version: string,
    ) => `import { createFileRoute } from '@tanstack/react-router'
${declaration(`{
  return <p>page ${version}</p>
}`)}
${exports}
export const Route = createFileRoute('/')({ component: page${options} })
`

  // Bug: a lowercase split component declared as a variable keeps its name
  // in its split chunk, and React Refresh registers PascalCase names only (a
  // lowercase `function` declaration is renamed, a variable is not); route
  // HMR keeps the lazy component for React Refresh to patch, which it
  // cannot.
  // Impact: edits to the component do not show until a reload.
  // Source: ReactFreshBabelPlugin-test "only registers pascal case
  // functions"; the former in-process pin "registers a lowercase split
  // component declared as %s" (React Refresh's registrations, read, are
  // not what the page shows). Controls: the lowercase function
  // declaration (split) and the unsplit variables of
  // route-hmr-browser-names.test.ts.
  // Any fix passes: the edit shows without a full reload or errors.
  test.for([
    {
      name: 'an arrow function',
      declaration: (body: string) => `const page = () => ${body}`,
    },
    {
      name: 'a function expression',
      declaration: (body: string) => `const page = function page() ${body}`,
    },
  ])(
    'vite: an edit of a split component declared lowercase as $name shows in place',
    async ({ declaration }, { expect, onTestFinished }: TestContext) => {
      expect(
        await editRoute(
          {
            file: 'routes/index.tsx',
            route: lowercaseRoute(declaration),
            shows: (version) => `page ${version}`,
          },
          onTestFinished,
        ),
      ).toEqual(inPlace)
    },
  )

  // Bug: React HMR renames a lowercase `function` component in its split
  // chunk, also when the component is the unsplit `pendingComponent` too,
  // so the chunk exports a binding nothing declares (the in-process pin
  // "a lowercase function component that is also the unsplit
  // pendingComponent renders as both", known-bugs-route-hmr.test.ts).
  // Impact: in development, the route's component chunk fails to load
  // (SyntaxError: Export 'SplitComponent' is not defined): the page never
  // shows the route.
  // Source: #8504 react-refresh-route-components ("that is also the unsplit
  // pendingComponent"); the former in-process registration read.
  // Any fix passes: the page shows the route, and an edit shows in place.
  test('vite: a lowercase function component that is also the unsplit pendingComponent renders, and an edit shows in place', async ({
    expect,
    onTestFinished,
  }: TestContext) => {
    expect(
      await editRoute(
        {
          file: 'routes/index.tsx',
          route: lowercaseRoute(
            (body) => `function page() ${body}`,
            ', pendingComponent: page',
          ),
          shows: (version) => `page ${version}`,
        },
        onTestFinished,
      ),
    ).toEqual(inPlace)
  })

  // Bug: with React HMR, the code splitter moves a component exported by an
  // export list (`export { page }`) into its chunk and leaves the export
  // list in the route module (the in-process pin "a component exported by
  // an export list renders for a module importing it and as the route
  // component", known-bugs-route-hmr.test.ts).
  // Impact: in development, the route module fails to load (SyntaxError:
  // Export 'page' is not defined): the page never shows the route.
  // Source: ReactFreshBabelPlugin-test "registers top-level exported function
  // declarations" (`export { Baz }`). Unsplit: route-hmr-browser
  // -names.test.ts.
  // Any fix passes: the page shows the route, and an edit shows in place.
  test('vite: a split component exported by an export list renders, and an edit shows in place', async ({
    expect,
    onTestFinished,
  }: TestContext) => {
    expect(
      await editRoute(
        {
          file: 'routes/index.tsx',
          route: lowercaseRoute(
            (body) => `const page = () => ${body}`,
            '',
            'export { page }',
          ),
          shows: (version) => `page ${version}`,
        },
        onTestFinished,
      ),
    ).toEqual(inPlace)
  })
})
