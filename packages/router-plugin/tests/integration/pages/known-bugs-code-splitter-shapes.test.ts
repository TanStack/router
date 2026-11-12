/**
 * Known code-splitter bugs (route options and factories written in other
 * shapes, what split chunks hold, names the code splitter generates). Each test asserts the correct behaviour for a shape a code-splitter bug broke (a regression test). Same harness as
 * `known-bugs-code-splitter.test.ts`: every route is loaded the way an app
 * loads it (`./route-app`), each check runs in a real browser page.
 */

import { describe, expect, test } from 'vitest'

import { expectValidModules, head, loadRoute } from '../../route-app'
import type { Plugin } from 'vite'

describe('route options written in other shapes', () => {
  // Controls for the pins above and in "route factories written in other
  // shapes": these routes keep working (split or not), so the pins fail only
  // because the component is not split.
  test.each([
    `createFileRoute('/')({ ssr: false, component: Page } as any)`,
    `(createFileRoute('/') as any)({ ssr: false, component: Page })`,
    `createFileRoute('/')(makeOptions())`,
  ])('a route written as %s renders its component', async (route) => {
    const loaded = await loadRoute(`${head}function Page() {
  return <p>page</p>
}
const makeOptions = () => ({ component: Page })
export const Route = ${route}
`)
    await expectValidModules(loaded)
    expect(await loaded.run(`return render('component')`)).toBe('<p>page</p>')
  })
})

describe('what split chunks hold', () => {
  /**
   * A route app whose dependency optimizer also pre-bundles `@emotion/react`
   * (a CommonJS-dependent package the page imports), as a user's Vite config
   * does with `optimizeDeps.include`.
   */
  const emotionDeps: Plugin = {
    name: 'test:app-optimize-emotion',
    config: () => ({
      optimizeDeps: {
        include: ['@emotion/react', '@emotion/react/jsx-runtime'],
      },
    }),
  }

  /**
   * Renders the route file's component as the route renders it, and as the
   * same file renders it untouched (an app module the router plugin does not
   * compile, `untouched.tsx`); with whether `library` loads with the route
   * module, read before anything else imports it.
   */
  async function loadPragmaRoute(code: string, library: string) {
    const route = await loadRoute(code, {
      plugins: { before: [emotionDeps] },
      files: { 'untouched.tsx': code },
    })
    const observed = await route.run<{
      rendered: string
      untouched: string
      libraryLoadsEagerly: boolean
    }>(`// The library's module as the dependency optimizer serves it
const library = ${JSON.stringify(library)}
const libraryLoaded = () => performance.getEntriesByType('resource').some((entry) =>
  new URL(entry.name).pathname.startsWith('/node_modules/.vite/deps/' + library.replace('/', '_') + '.js'))
const libraryLoadsEagerly = libraryLoaded()
const rendered = await render('component')
const untouched = await renderComponent((await app('untouched.tsx')).Route.options.component)
return { rendered, untouched, libraryLoadsEagerly }`)
    return { route, ...observed }
  }

  // The `@jsxFrag` row of the pin above, without its import check: a chunk
  // that keeps an unused `Fragment` specifier on the import of `react` it
  // needs anyway pulls in no unrelated dependency (an unused specifier is
  // free, SPEC §5.9), so what remains to check is that the split
  // component renders as the untouched file renders it, with `@jsx` and
  // `@jsxFrag` pragmas naming React's real factories.
  test('a split component of a file with @jsx and @jsxFrag pragmas renders as the untouched file', async () => {
    const code = `/** @jsxRuntime classic */
/** @jsx createElement */
/** @jsxFrag Fragment */
import { createElement, Fragment } from 'react'
${head}export const Route = createFileRoute('/')({
  loader: () => <>{1}</>,
  component: () => <p>page</p>,
})
`
    const { rendered, untouched } = await loadPragmaRoute(code, 'react')
    expect(rendered).toBe(untouched)
    expect(rendered).toBe('<p>page</p>')
  })

  // Control for the array destructuring pins below: a component declared by
  // an object destructuring of a literal is split and renders.
  test('a component declared by an object destructuring renders', async () => {
    const route =
      await loadRoute(`${head}const { Page } = { Page: () => <div>page</div> }
export const Route = createFileRoute('/')({ component: Page })
`)
    expect(await route.run(`return render('component')`)).toBe(
      '<div>page</div>',
    )
  })
})

describe('names the code splitter generates', () => {
  /** A route file whose split options read `read` (`declaration` first). */
  const nameRoute = (read: string, declaration = '') => `${head}${declaration}
export const Route = createFileRoute('/')({
  codeSplitGroupings: [['loader'], ['component'], ['errorComponent']],
  loader: () => String(${read}),
  component: () => <p>{String(${read})}</p>,
  errorComponent: () => <p>{String(${read})}</p>,
})
`

  /**
   * Loads a route file that declares `declaration` (or reads `name` as a
   * global the page sets, `window` as the page's own) and whose split loader
   * and components return `name`'s value, compiled for HMR; returns what the
   * options return, and what they should return.
   */
  async function readName(name: string, declaration?: string) {
    const read = declaration?.startsWith('function') ? `${name}()` : name
    const route = await loadRoute(nameRoute(read, declaration), { hmr: true })
    return route.run<{ actual: Array<unknown>; expected: Array<unknown> }>(
      `const value = String(${declaration === undefined ? `globalThis[${JSON.stringify(name)}]` : `'value'`})
return {
  actual: [await options.loader(), await render('component'), await render('errorComponent')],
  expected: [value, '<p>' + value + '</p>', '<p>' + value + '</p>'],
}`,
      declaration === undefined && name !== 'window'
        ? { before: `globalThis[${JSON.stringify(name)}] = 'value'` }
        : {},
    )
  }

  async function expectNameKeepsValue(name: string, declaration?: string) {
    const { actual, expected } = await readName(name, declaration)
    expect(actual).toEqual(expected)
  }

  // Control for the pins below.
  test.each([
    { name: 'TSRComponent', declaration: `const TSRComponent = 'value'` },
    { name: 'window' },
  ])(
    'a route file binding or global named $name keeps its value',
    async ({ name, declaration }) => {
      await expectNameKeepsValue(name, declaration)
    },
  )

  // The code splitter imports `lazyRouteComponent` and `lazyFn` from the
  // router package; a route file that imports them itself, for an option
  // the code splitter leaves alone, keeps working next to split options.
  test.each([
    {
      name: 'lazyRouteComponent',
      option: `pendingComponent: lazyRouteComponent(() => import('./spinner'))`,
      read: `await render('pendingComponent')`,
      expected: 'spinner',
    },
    {
      name: 'lazyFn',
      option: `loader: lazyFn(() => import('./load-data'), 'loadData')`,
      read: `await options.loader()`,
      expected: 'data',
    },
  ])(
    'a route file that imports $name from the router package keeps working next to split options',
    async ({ name, option, read, expected }) => {
      const route = await loadRoute(
        `import { createFileRoute, ${name} } from '@tanstack/react-router'
export const Route = createFileRoute('/')({
  ${option},
  component: () => <p>page</p>,
  errorComponent: () => <p>error</p>,
})
`,
        {
          files: {
            'spinner.tsx': `export default function Spinner() {\n  return 'spinner'\n}\n`,
            'load-data.ts': `export const loadData = () => 'data'\n`,
          },
        },
      )
      await expectValidModules(route)
      expect([
        await route.isLazy('component'),
        ...(await route.run<Array<unknown>>(`return [
  ${read},
  await render('component'),
  await render('errorComponent'),
]`)),
      ]).toEqual([true, expected, '<p>page</p>', '<p>error</p>'])
    },
  )
})
