/**
 * A split loader whose value the compiler cannot read (SPEC J2.3, J2.8;
 * source: REVIEW-design5-final finding 6): an import, a call or any other
 * value that is no function or object literal through the route file's
 * consts may be a function or an object-form loader (`{ handler,
 * staleReloadMode }`), whose options the router reads from the route module
 * before a split chunk could load. Such a loader stays in the route module,
 * with a warning naming the file, only where loader splitting is
 * configured; each fix the warning gives splits it. A loader object with a
 * spread after its `handler` (which may replace it) stays and warns too;
 * with the spread before `handler`, the handler splits. A loader naming an
 * object with no readable `handler` (`const l = { ...base }`) stays in the
 * route module, nothing reported, as the same object written inline. Real
 * client builds whose page renders the route through a real router, which
 * runs the loader.
 */
import { describe, expect, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import { build, head } from '../build-harness'

const timeout = 120_000

const rootRoute = `import { createRootRoute, Outlet } from '@tanstack/react-router'
export const Route = createRootRoute({ component: () => <Outlet /> })
`

/**
 * `renderAt(path, text)` renders the app at `path` and returns its HTML
 * once it shows `text` (or after 2 seconds); `Route` is the index route.
 */
const entry = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { RouterProvider, createMemoryHistory, createRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
export { Route } from './routes/index'
export async function renderAt(path: string, text: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  })
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  flushSync(() => root.render(createElement(RouterProvider, { router })))
  for (let tries = 0; tries < 200 && !container.innerHTML.includes(text); tries++) {
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  const html = container.innerHTML
  root.unmount()
  container.remove()
  return html
}
`

const loaders = `export const objectLoader = { handler: () => 'MARK_DATA' }
export const blockingLoader = {
  handler: () => 'MARK_DATA',
  staleReloadMode: 'blocking' as const,
}
export const functionLoader = (_ctx?: unknown) => 'MARK_DATA'
export const defineLoader = (handler: () => string) => ({ handler })
export const wrapLoader = (fn: () => string) => (_ctx?: unknown) => fn()
`

const route = (declarations: string, loader: string) =>
  `${head}import { objectLoader, blockingLoader, functionLoader, defineLoader, wrapLoader } from '../loaders'
${declarations}
export const Route = createFileRoute('/')({
  loader: ${loader},
  component: () => <p>{Route.useLoaderData()}</p>,
})
`

/**
 * Builds the route (the loader split unless `groupings` says otherwise) and
 * renders it through the router: where the loader's data lives, what the
 * page shows, the route's `loader` option as the router reads it (`typeof`,
 * its `staleReloadMode`), and the build's warnings about the route file.
 */
async function renderRoute(
  bundler: 'vite' | 'rspack',
  routeFile: string,
  groupings: Array<Array<'loader' | 'component'>> = [['loader'], ['component']],
) {
  const app = await build({
    bundler,
    env: 'client',
    minify: false,
    pluginOptions: { codeSplittingOptions: { defaultBehavior: groupings } },
    files: {
      'routes/__root.tsx': rootRoute,
      'routes/index.tsx': routeFile,
      'loaders.ts': loaders,
      'entry.ts': entry,
    },
  })
  try {
    const { result } = await app.run(`const loader = entry.Route.options.loader
return {
  html: await entry.renderAt('/', 'MARK_DATA'),
  loader: typeof loader,
  staleReloadMode: loader.staleReloadMode ?? null,
}`)
    const { html, ...rest } = result as {
      html: string
      loader: string
      staleReloadMode: string | null
    }
    return {
      where: app.where('MARK_DATA'),
      rendered: html.includes('MARK_DATA'),
      ...rest,
      warnings: findDiagnostics(app.warnings, {
        severity: 'warning',
      }).filter(({ text }) => text.includes('routes/index.tsx')).length,
    }
  } finally {
    await app.dispose()
  }
}

/** Loaders the compiler cannot read, and what the router reads of each. */
const unreadable = [
  {
    name: 'an imported object `{ handler }`',
    declarations: '',
    loader: 'objectLoader',
    form: { loader: 'object', staleReloadMode: null },
  },
  {
    name: 'an imported object `{ handler, staleReloadMode }`',
    declarations: '',
    loader: 'blockingLoader',
    form: { loader: 'object', staleReloadMode: 'blocking' },
  },
  {
    name: 'an imported object named through a const',
    declarations: 'const l = blockingLoader',
    loader: 'l',
    form: { loader: 'object', staleReloadMode: 'blocking' },
  },
  {
    name: 'an object returned by a call',
    declarations: '',
    loader: `defineLoader(() => 'MARK_DATA')`,
    form: { loader: 'object', staleReloadMode: null },
  },
  {
    name: 'an imported function',
    declarations: '',
    loader: 'functionLoader',
    form: { loader: 'function', staleReloadMode: null },
  },
  {
    name: 'a function returned by a call',
    declarations: '',
    loader: `wrapLoader(() => 'MARK_DATA')`,
    form: { loader: 'function', staleReloadMode: null },
  },
  {
    name: 'a conditional',
    declarations: 'const enabled = true',
    loader: 'enabled ? functionLoader : wrapLoader(() => "other")',
    form: { loader: 'function', staleReloadMode: null },
  },
]

describe.each(['vite', 'rspack'] as const)('a %s client build', (bundler) => {
  test.each(unreadable)(
    'keeps a split loader that is $name in the route module, warns, and the router reads it as written',
    async ({ declarations, loader, form }) => {
      const r = await renderRoute(bundler, route(declarations, loader))
      expect(r).toEqual({
        where: 'eager',
        rendered: true,
        ...form,
        warnings: 1,
      })
    },
    timeout,
  )

  test(
    'reports nothing when loader splitting is not configured',
    async () => {
      const r = await renderRoute(bundler, route('', 'blockingLoader'), [
        ['component'],
      ])
      expect(r).toEqual({
        where: 'eager',
        rendered: true,
        loader: 'object',
        staleReloadMode: 'blocking',
        warnings: 0,
      })
    },
    timeout,
  )

  // The warning's fixes, applied
  test.each([
    {
      name: 'an object written in the route options',
      loader: `{ handler: blockingLoader.handler, staleReloadMode: 'blocking' }`,
      form: { loader: 'object', staleReloadMode: 'blocking' },
    },
    {
      name: 'a function calling the imported one',
      loader: '(ctx) => functionLoader(ctx)',
      form: { loader: 'function', staleReloadMode: null },
    },
    {
      name: 'a function calling the one a call returns',
      loader: `(ctx) => wrapLoader(() => 'MARK_DATA')(ctx)`,
      form: { loader: 'function', staleReloadMode: null },
    },
  ])(
    'splits the loader once it is $name, nothing reported',
    async ({ loader, form }) => {
      const r = await renderRoute(bundler, route('', loader))
      expect(r).toEqual({
        where: 'lazy',
        rendered: true,
        ...form,
        warnings: 0,
      })
    },
    timeout,
  )

  // A spread before `handler` cannot replace it: the handler splits inside
  // the object, whose other options the router reads in the route module
  test.each([
    {
      name: 'splits the handler of a loader object spreading options before it, nothing reported',
      loader: '{ ...options, handler: functionLoader }',
      where: 'lazy',
      warnings: 0,
    },
    {
      name: 'keeps a loader object spreading options after its handler in the route module and warns',
      loader: '{ handler: functionLoader, ...options }',
      where: 'eager',
      warnings: 1,
    },
  ])(
    '$name',
    async ({ loader, where, warnings }) => {
      const r = await renderRoute(
        bundler,
        route(
          `const options = { staleReloadMode: 'blocking' as const }`,
          loader,
        ),
      )
      expect(r).toEqual({
        where,
        rendered: true,
        loader: 'object',
        staleReloadMode: 'blocking',
        warnings,
      })
    },
    timeout,
  )

  test.each([
    { name: 'inline', declarations: '', loader: '{ ...base }' },
    { name: 'in a const', declarations: 'const l = { ...base }', loader: 'l' },
    {
      name: 'through a chain of consts',
      declarations: 'const a = { ...base }\nconst l = a',
      loader: 'l',
    },
  ])(
    'keeps an object loader with no readable `handler` ($name) in the route module, nothing reported',
    async ({ declarations, loader }) => {
      const r = await renderRoute(
        bundler,
        route(
          `const base = {
  handler: () => 'MARK_DATA',
  staleReloadMode: 'blocking' as const,
}
${declarations}`,
          loader,
        ),
      )
      expect(r).toEqual({
        where: 'eager',
        rendered: true,
        loader: 'object',
        staleReloadMode: 'blocking',
        warnings: 0,
      })
    },
    timeout,
  )
})
