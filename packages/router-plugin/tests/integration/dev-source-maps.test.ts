/**
 * Source maps in development (SPEC G6, dev as in build): a thrown error in
 * the route module, in what the loader and the split component share, and
 * in the split component, executed in a real browser page served by Vite's
 * dev server and by Rsbuild's, resolves through the maps the dev server
 * serves to the user's file and line; on Vite, the module's map names the
 * route file itself as its source. The modules are those the throws run
 * in, named by the executed stack frames: their ids, how many there are and
 * which of them holds which code are free (SPEC §5.3). Maps are the ones the
 * page's modules point to (Vite's inline maps, Rsbuild's `sourceMappingURL`),
 * read with a standard consumer (`@tanstack/compiler-test-utils/source-maps`).
 * Source: #6667, #3828.
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pluginReact } from '@rsbuild/plugin-react'
import react from '@vitejs/plugin-react'
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  onTestFinished,
  test,
} from 'vitest'
import { openPage } from '@tanstack/compiler-test-utils/browser'
import { createPluginHost } from '@tanstack/compiler-test-utils/plugin-host'
import { createRsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'
import {
  expectMapsTo,
  inlineSourceMap,
  positionAt,
  tokenOffsets,
  traceStack,
} from '@tanstack/compiler-test-utils/source-maps'
import { tanstackRouter } from '../../src/vite'
import { rootRoute, routeHead } from '../build-harness'
import type { AnySourceMap } from '@tanstack/compiler-test-utils/source-maps'

const timeout = 60_000

/** The apps live next to the other harness apps, where imports resolve. */
const appsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

/**
 * A route that throws from its loader (route module), from a function the
 * loader and the split component share, and from the split component, each
 * with its own marker string on the line of the throw.
 */
const route = `${routeHead()}function fail(): never {
  throw new Error('MARK_SHARED_THROW')
}
function Page(): never {
  throw new Error('MARK_PAGE_THROW ' + typeof fail)
}
export const Route = createFileRoute('/')({
  loader: (input?: { which?: string }) => {
    if (input?.which === 'loader') {
      throw new Error('MARK_LOADER_THROW')
    }
    return fail()
  },
  component: Page,
})
`
const markers = ['MARK_SHARED_THROW', 'MARK_PAGE_THROW ', 'MARK_LOADER_THROW']

/**
 * The page's code: runs each throw of the route (the loader's, the shared
 * function's through the loader, the split component's through React) and
 * returns each error's stack, by marker.
 */
const probe = `import { createElement } from 'react'
import { flushSync } from 'react-dom'
import { createRoot } from 'react-dom/client'
import { Route } from './routes/index'

const stackOf = async (run: () => unknown) => {
  try {
    await run()
  } catch (error) {
    return (error as Error).stack
  }
  return undefined
}

export async function throws() {
  const options = Route.options as any
  const loader =
    typeof options.loader === 'function' ? options.loader : options.loader.handler
  const stacks: Record<string, string | undefined> = {
    MARK_LOADER_THROW: await stackOf(() => loader({ which: 'loader' })),
    MARK_SHARED_THROW: await stackOf(() => loader({})),
  }
  await options.component.preload?.()
  let thrown: unknown
  const root = createRoot(document.createElement('div'), {
    onUncaughtError: (error) => {
      thrown = error
    },
  })
  flushSync(() => root.render(createElement(options.component)))
  stacks['MARK_PAGE_THROW '] = (thrown as Error | undefined)?.stack
  return stacks
}
`

/** Where the string `marker` starts in the route file (1-based line). */
function lineOf(marker: string) {
  return positionAt(route, tokenOffsets(route, { string: marker })[0]!).line
}

/** The files the frames of a stack name. */
const frameLocations = (stack: string) =>
  stack
    .split('\n')
    .flatMap(
      (line) =>
        /((?:[a-z][\w+.-]*:\/\/?)?[^\s()@]+?):(\d+):(\d+)\)?\s*$/.exec(
          line,
        )?.[1] ?? [],
    )
    .filter((location) => /^https?:\/\//.test(location))

/**
 * Asserts that the top frame of each throw's stack resolves, through the
 * map of the module it names (`maps`), to the route file at the line of the
 * throw. `mapUrl` gives what a relative source of a module's map resolves
 * against.
 */
function expectThrowsMapToRouteFile(
  stacks: Record<string, string | undefined>,
  maps: Map<string, AnySourceMap | undefined>,
  root: string,
  mapUrl: (location: string) => string | undefined,
  only: Array<string> = markers,
) {
  for (const marker of only) {
    const stack = stacks[marker]
    expect(stack, `the stack of ${marker}`).toBeDefined()
    const [top] = traceStack(stack!, (location) => maps.get(location))
    expect(top, `the top frame of ${marker}: ${stack}`).toBeDefined()
    const map = maps.get(top!.location)
    expect(map, `${top!.location} (${marker}) has a source map`).toBeDefined()
    expectMapsTo(map!, top!.generated, {
      file: 'routes/index.tsx',
      root,
      mapUrl: mapUrl(top!.location),
      line: lineOf(marker),
    })
  }
}

describe('vite dev server', () => {
  const cleanups: Array<() => Promise<void>> = []
  let throws: {
    stacks: Record<string, string | undefined>
    maps: Map<string, AnySourceMap | undefined>
    root: string
    origin: string
  }
  beforeAll(async () => {
    const host = await createPluginHost({
      dir: appsDir,
      prefix: '.dev-source-maps-',
      registerCleanup: (cleanup) => {
        cleanups.push(cleanup)
      },
      files: {
        'routes/__root.tsx': rootRoute,
        'routes/index.tsx': route,
        'probe.ts': probe,
      },
      client: true,
      config: {
        optimizeDeps: {
          noDiscovery: true,
          include: [
            'react',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'react-dom',
            'react-dom/client',
            '@tanstack/react-router',
          ],
        },
      },
      plugins: () => [
        tanstackRouter({
          target: 'react',
          routesDirectory: './routes',
          generatedRouteTree: './routeTree.gen.ts',
          autoCodeSplitting: true,
        }),
        react(),
      ],
    })
    const { result: stacks } = await host.runClient<
      Record<string, string | undefined>
    >('/probe.ts', 'return module.throws()')
    // The map of every module a frame names, as the dev server serves it
    // (Vite inlines it)
    const maps = new Map<string, AnySourceMap | undefined>()
    const origin = new URL(host.dev.url!).origin
    for (const location of new Set(
      Object.values(stacks).flatMap((stack) => frameLocations(stack ?? '')),
    )) {
      const url = new URL(location)
      if (url.origin !== origin) {
        continue
      }
      const { body } = await host.dev.fetch(url.pathname + url.search)
      maps.set(location, inlineSourceMap(body))
    }
    throws = { stacks, maps, root: host.root, origin }
  }, timeout)
  afterAll(async () => {
    for (const cleanup of cleanups.reverse()) {
      await cleanup()
    }
  })

  // The module each throw runs in maps it to its line in the route file,
  // and names the route file as its source, as the browser resolves it
  // against the module's URL: a debugger binds a breakpoint set in the
  // route file by that URL.
  // Bug: the module of the split component and the module of what the
  // loader and the split component share name the route file with the code
  // splitter's query (`index.tsx?tsr-split=component`,
  // `index.tsx?tsr-shared=1`): the code splitter generates their maps with
  // the module id as the source file name.
  // Source: #6667; src/core/router-code-splitter-plugin.ts (`filename: id`).
  // Impact: in Vite dev, a debugger sees the split component and the shared
  // code as other files than the route file.
  const rows = [
    { name: 'the loader', marker: 'MARK_LOADER_THROW', fails: false },
    {
      name: 'a function the loader and the split component share',
      marker: 'MARK_SHARED_THROW',
      fails: true,
    },
    { name: 'the split component', marker: 'MARK_PAGE_THROW ', fails: true },
  ]
  for (const { name, marker, fails } of rows) {
    ;(fails ? test.fails : test)(
      `a throw in ${name} maps to its line in the route file, which its module names as its source`,
      () => {
        const { stacks, maps, root, origin } = throws
        // (a module's URL path is relative to the app root)
        expectThrowsMapToRouteFile(
          stacks,
          maps,
          root,
          (location) => path.join(root, new URL(location).pathname),
          [marker],
        )
        const [top] = traceStack(stacks[marker]!, (location) =>
          maps.get(location),
        )
        expect(new URL(top!.original!.source, top!.location).href).toBe(
          new URL('/routes/index.tsx', origin).href,
        )
      },
    )
  }
})

describe('rsbuild dev server', () => {
  // Bug: unplugin's Rspack transform loader drops the source map the
  // router plugin's `transform` returns when no earlier loader passed one
  // in, and the router plugin's loader is the first of a route file (same
  // upstream cause as the Rspack and webpack pins of
  // build-source-maps.test.ts). The modules compiled from the route file
  // then map to the lines of the code splitter's output (here the throw of
  // the shared function to line 2 instead of 3; re-verified 2026-10-21).
  // Source: #6667, #3828; upstream (unplugin), not the router
  // plugin.
  // Impact: in Rsbuild dev, a thrown error in a split component, and a
  // breakpoint in it, resolve to the generated split module's lines.
  test.fails(
    'the route module and every module derived from it map a throw to its line in the route file',
    async () => {
      const { tanstackRouter: tanstackRouterRspack } =
        await import('../../src/rspack')
      const server = await createRsbuildDevServer({
        dir: appsDir,
        prefix: '.dev-source-maps-rsbuild-',
        registerCleanup: onTestFinished,
        browser: true,
        entry: 'main.tsx',
        files: {
          'main.tsx': `import { throws } from './probe'
;(window as any).__throws = throws()
`,
          'probe.ts': probe,
          'routes/__root.tsx': rootRoute,
          'routes/index.tsx': route,
        },
        config: { output: { sourceMap: { js: 'source-map' } } },
        plugins: ({ root }) => [
          pluginReact({ fastRefresh: false }),
          {
            name: 'dev-source-maps',
            setup(api) {
              api.modifyRspackConfig((config) => {
                config.plugins.push(
                  tanstackRouterRspack({
                    target: 'react',
                    autoCodeSplitting: true,
                    routesDirectory: path.join(root, 'routes'),
                    generatedRouteTree: path.join(root, 'routeTree.gen.ts'),
                  }),
                )
              })
            },
          },
        ],
      })
      await server.settle()
      const page = await openPage(server.url!, {
        registerCleanup: onTestFinished,
      })
      await page.page.waitForFunction(() => (window as any).__throws, null, {
        timeout: 15_000,
      })
      const stacks = (await page.page.evaluate(
        () => (window as any).__throws,
      )) as Record<string, string | undefined>
      // The map each module a frame names points to (`sourceMappingURL`)
      const maps = new Map<string, AnySourceMap | undefined>()
      for (const location of new Set(
        Object.values(stacks).flatMap((stack) => frameLocations(stack ?? '')),
      )) {
        if (!location.startsWith(server.url!)) {
          continue
        }
        const code = await (await fetch(location)).text()
        const mapping = [
          ...code.matchAll(/[#@] sourceMappingURL=(\S+)\s*$/gm),
        ].at(-1)?.[1]
        maps.set(
          location,
          mapping === undefined
            ? undefined
            : mapping.startsWith('data:')
              ? inlineSourceMap(code)
              : await (await fetch(new URL(mapping, location))).json(),
        )
      }
      expectThrowsMapToRouteFile(stacks, maps, server.root, () => undefined)
    },
    timeout,
  )
})
