/**
 * A production build of a React Start app with RSC enabled on Rsbuild
 * (`rsc-app.ts`) whose server fn only client code calls (`<ClientOnly>`)
 * renders a `'use client'` component (`Inner`) that calls another server fn:
 * the nested chain of KNOWN-BUGS ("Rsbuild RSC build: a client component
 * only a late server fn renders is missing from the client manifest"). The
 * server compilation reaches `outer`'s handler after Rspack handed the
 * client its references, so `Inner` is missing from the client build's
 * manifest and the browser cannot decode the outer call's result. The
 * build warns, naming `Inner`'s file (design-rsc-phase2.md §5.1: a warning
 * until decision 4's evidence rule), also when another route renders
 * `Inner` from client code or a client plugin watches its file; and does
 * not when a server fn the build reaches first renders it (the way out).
 * The check reads what Rspack compiled as a client reference (an installed
 * package's component, a loader's directive; an asset of the file, an
 * adapter registering another file, are none) by its Flight id (an accented
 * directory, a quoted query, a fragment), and the manifest of its own server
 * compilation (a plugin's asynchronous `done` on both compilers), for each
 * entry whose runtime loads the component (a vendor chunk or an `import()`
 * chunk name two entries share, a worker, a barrel's re-export only another
 * entry uses, is no load).
 */
import path from 'node:path'
import { expect, onTestFinished, test } from 'vitest'
import { findDiagnostics } from '@tanstack/compiler-test-utils/diagnostics'
import {
  answeredText,
  openRscPage,
  startRscRsbuildPreviewServer,
  waitForHydration,
} from './rsc-app'

const timeout = 60_000

const files = {
  'src/nested/deep.ts': `import { createServerFn } from '@tanstack/react-start'
export const deep = createServerFn().handler(() => 'MARK_DEEP')
`,
  'src/nested/Inner.tsx': `'use client'
import { useState } from 'react'
import { deep } from './deep'
export function Inner() {
  const [result, setResult] = useState('')
  return (
    <button data-testid="inner" onClick={() => deep().then(setResult, (error) => setResult('error ' + error))}>
      inner {result}
    </button>
  )
}
`,
  'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner'
export const outer = createServerFn().handler(() => renderServerComponent(<section>nested <Inner /></section>))
`,
  'src/routes/nested.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { outer } from '../nested/outer'
export const Route = createFileRoute('/nested')({ component: Page })
function Page() {
  const [node, setNode] = useState<ReactNode>(null)
  const [state, setState] = useState('none')
  return (
    <main>
      <ClientOnly fallback={<span>loading</span>}>
        <button data-testid="outer" onClick={() => outer().then((n) => { setNode(n as ReactNode); setState('answered') }, (error) => setState('error ' + error))}>
          outer {state}
        </button>
      </ClientOnly>
      {node}
    </main>
  )
}
`,
}

/** Whether a report of the build names `Inner`'s file. */
const namesInner = (server: { messages: Array<string>; root: string }) =>
  findDiagnostics(server.messages, {
    file: 'src/nested/Inner.tsx',
    root: server.root,
  }).length > 0

/** Each Flight warning of the build: `<file> (<exports>): <entries>`. */
const flightWarnings = (server: { messages: Array<string> }) =>
  [
    ...new Set(
      server.messages.flatMap((message) =>
        [
          ...message.matchAll(
            /The client component (\S+) \(([^)]*)\) is a client reference of the RSC build, and the Flight client manifest Rspack delivered \(entry ([^)]*)\)/g,
          ),
        ].map(
          ([, file, exports, entries]) => `${file} (${exports}): ${entries}`,
        ),
      ),
    ),
  ].sort()

/** A `'use client'` component showing `ANSWER_1` once it hydrated. */
const answer = (name: string) => `'use client'
import { useState } from 'react'
export function ${name}() {
  const [n] = useState(1)
  return <strong data-testid="${name.toLowerCase()}">ANSWER_{n}</strong>
}
`

/** A server fn only client code calls: the last settlement run builds it (the check runs). */
const lateFn = `import { createServerFn } from '@tanstack/react-start'
export const late = createServerFn().handler(() => 'LATE')
`

/**
 * A route at `/nested` whose button calls `outer` (`src/nested/outer.tsx`)
 * and shows its tree in `[data-testid=late]`, a button calling `late`
 * (`lateFn`, at `src/nested/late.ts`), and `head` before the route's
 * options (imports, a `loader`).
 */
const lateRoute = (head: { imports?: string; loader?: string } = {}) =>
  `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import type { ReactNode } from 'react'
import { outer } from '../nested/outer'
import { late } from '../nested/late'
${head.imports ?? ''}
export const Route = createFileRoute('/nested')({
  ${head.loader ?? ''}
  component: Page,
})
function Page() {
  const [node, setNode] = useState<ReactNode>(null)
  const [state, setState] = useState('none')
  return (
    <main>
      <ClientOnly fallback={<span>loading</span>}>
        <button data-testid="outer" onClick={() => outer().then((n) => { setNode(n as ReactNode); setState('answered') }, (error) => setState('error ' + error))}>
          outer {state}
        </button>
        <button onClick={() => late()}>late</button>
      </ClientOnly>
      <div data-testid="late">{node}</div>
    </main>
  )
}
`

/** Clicks `lateRoute`'s `outer` button and returns the tree's text. */
async function clickOuter(
  server: Parameters<typeof openRscPage>[0],
): Promise<string> {
  const page = await openRscPage(server, '/nested', {
    registerCleanup: onTestFinished,
  })
  await waitForHydration(page)
  await page.page.locator('[data-testid=outer]').click()
  await answeredText(
    page,
    '[data-testid=outer]',
    (text) => text.includes('answered') || text.includes('error'),
  )
  return page.text('[data-testid=late]')
}

// F4 (G6)
test(
  "the build warns of a 'use client' component only a late server fn renders",
  async () => {
    const server = await startRscRsbuildPreviewServer({ files })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: true,
    })
  },
  timeout,
)

// F1 (G2): `Inner` is also a module of the client build, through a route
// that renders it from client code: its file is in the client build, and
// still no client reference of the late server fn's.
test(
  'the warning also when a route renders the component from client code',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        ...files,
        'src/routes/twin.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { Inner } from '../nested/Inner'
export const Route = createFileRoute('/twin')({ component: () => <main><Inner /></main> })
`,
      },
    })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: true,
    })
  },
  timeout,
)

// F3 (G5): a client plugin makes the client compilation watch `Inner`'s
// file (a file dependency, no module).
test(
  "the warning also when a client plugin watches the component's file",
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files,
      tools: {
        rspack: (
          config: { plugins: Array<unknown> },
          { environment }: { environment: { name: string } },
        ) => {
          if (environment.name !== 'client') {
            return
          }
          config.plugins.push({
            apply(compiler: any) {
              compiler.hooks.thisCompilation.tap(
                'watch-inner',
                (compilation: any) => {
                  compilation.hooks.finishModules.tap('watch-inner', () => {
                    compilation.fileDependencies.add(
                      `${compiler.context}/src/nested/Inner.tsx`,
                    )
                  })
                },
              )
            },
          })
        },
      },
    })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: true,
    })
  },
  timeout,
)

// What Rspack compiled as a client reference, not the file's own text: a
// component of an installed package whose entry starts with the directive.
test(
  "the warning for an installed package's 'use client' component",
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        ...files,
        'node_modules/review-ui/package.json': JSON.stringify({
          name: 'review-ui',
          type: 'module',
          exports: './index.js',
        }),
        'node_modules/review-ui/index.js': `'use client'
import { createElement, useState } from 'react'
export function Badge() {
  const [n] = useState(1)
  return createElement('strong', null, 'BADGE_' + n)
}
`,
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Badge } from 'review-ui'
export const outer = createServerFn().handler(() => renderServerComponent(<section>nested <Badge /></section>))
`,
      },
    })
    expect({
      errors: server.errors,
      warned:
        findDiagnostics(server.messages, {
          file: 'node_modules/review-ui/index.js',
          root: server.root,
        }).length > 0,
    }).toEqual({ errors: [], warned: true })
  },
  timeout,
)

// A loader of the app adds the directive: the file has none.
test(
  'the warning for a component a loader makes a client component',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        ...files,
        'directive.cjs': `module.exports = (source) => "'use client'\\n" + source
`,
        'src/nested/Inner.tsx': files['src/nested/Inner.tsx'].replace(
          "'use client'\n",
          '',
        ),
      },
      tools: {
        rspack: (config: { module: { rules: Array<unknown> } }) => {
          config.module.rules.unshift({
            test: /Inner\.tsx$/,
            enforce: 'pre',
            use: [path.join(process.cwd(), 'directive.cjs')],
          })
        },
      },
    })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: true,
    })
  },
  timeout,
)

// The Flight id Rspack registers a proxy under, and keys the manifest by,
// is the module's path and query, which the proxy's literal spells its own
// way: a directory with an accented name (escaped, `\xe9`), a query with a
// double quote (a single-quoted literal), a fragment (no part of the id).
// Each component only the late server fn renders is named, by its id.
// (Astra re-check of aabc2282da: none warned, the click failed.)
test(
  'the warning for components whose Flight id the proxy spells unlike their file',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        'src/café/Inner.tsx': answer('Inner'),
        'src/nested/Quoted.tsx': answer('Quoted'),
        'src/nested/Part.tsx': answer('Part'),
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from '../café/Inner'
import { Quoted } from './Quoted.tsx?title="blue"'
import { Part } from './Part.tsx?flavour=blue#one'
export const outer = createServerFn().handler(() => renderServerComponent(<section><Inner /><Quoted /><Part /></section>))
`,
        'src/nested/late.ts': lateFn,
        'src/routes/nested.tsx': lateRoute(),
      },
    })
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({
      errors: [],
      warned: [
        'src/café/Inner.tsx (Inner): index',
        'src/nested/Part.tsx?flavour=blue (Part): index',
        'src/nested/Quoted.tsx?title="blue" (Quoted): index',
      ],
    })
  },
  timeout,
)

// Two fragments of one file are two modules with one Flight id: a server
// fn a route's loader calls renders `./Inner.tsx#two`, the late one
// `./Inner.tsx#one`. The manifest has the id: nothing warns and the late
// tree renders.
test(
  'no warning for a late fragment of a file whose Flight id the manifest has',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        'src/nested/Inner.tsx': answer('Inner'),
        'src/nested/early.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner.tsx#two'
export const early = createServerFn().handler(() => renderServerComponent(<div><Inner /></div>))
`,
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner.tsx#one'
export const outer = createServerFn().handler(() => renderServerComponent(<section><Inner /></section>))
`,
        'src/nested/late.ts': lateFn,
        'src/routes/nested.tsx': lateRoute({
          imports: `import { early } from '../nested/early'`,
          loader: 'loader: async () => ({ tree: await early() }),',
        }),
      },
    })
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({ errors: [], warned: [] })
    expect(await clickOuter(server)).toBe('ANSWER_1')
  },
  timeout,
)

// A `'use client'` file the server code reaches as an asset (a URL of the
// file, not a module) is no client reference: the late server fn renders no
// component, nothing warns.
test(
  "no warning for a 'use client' file a server fn has only the URL of",
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        'src/nested/Inner.tsx': files['src/nested/Inner.tsx'],
        'src/nested/deep.ts': files['src/nested/deep.ts'],
        'src/nested/source.ts': `import { createServerFn } from '@tanstack/react-start'
const file = new URL('./Inner.tsx', import.meta.url)
export const source = createServerFn().handler(() => 'file ' + file.pathname.split('/').pop())
`,
        'src/nested/late.ts': `import { createServerFn } from '@tanstack/react-start'
export const late = createServerFn().handler(() => 'LATE')
`,
        'src/routes/nested.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { source } from '../nested/source'
import { late } from '../nested/late'
export const Route = createFileRoute('/nested')({
  loader: () => source(),
  component: () => (
    <main>
      {Route.useLoaderData()}
      <ClientOnly fallback={null}>
        <button onClick={() => late()}>late</button>
      </ClientOnly>
    </main>
  ),
})
`,
      },
    })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: false,
    })
  },
  timeout,
)

// A plugin's asynchronous `done` taps on both compilers (artifact upload):
// the client compiler can finish between the server's manifest and its
// check; the check still reads the server compilation's manifest.
test(
  "the warning also when the client compiler's done falls inside the server's",
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files,
      tools: {
        rspack: (config: { plugins: Array<unknown> }) => {
          config.plugins.push({
            apply(compiler: any) {
              const wait = compiler.name === 'client' ? 250 : 700
              compiler.hooks.done.tapPromise(
                { name: 'publish-artifacts', stage: -2 },
                () => new Promise((resolve) => setTimeout(resolve, wait)),
              )
            },
          })
        },
      },
    })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: true,
    })
  },
  timeout,
)

// F2 (G3): a server fn a route's loader calls (reached before the client
// handoff) renders `Inner` too: the client build has its reference, both
// clicks answer and nothing warns.
test(
  'a component a server fn the build reaches first renders: both clicks answer, no warning',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        ...files,
        'src/nested/early.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner'
export const early = createServerFn().handler(() => renderServerComponent(<div>early <Inner /></div>))
`,
        'src/routes/early.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { early } from '../nested/early'
export const Route = createFileRoute('/early')({
  loader: async () => ({ tree: await early() }),
  component: () => <main>{Route.useLoaderData().tree}</main>,
})
`,
      },
    })
    expect({ errors: server.errors, warned: namesInner(server) }).toEqual({
      errors: [],
      warned: false,
    })
    const page = await openRscPage(server, '/nested', {
      registerCleanup: onTestFinished,
    })
    await waitForHydration(page)
    await page.page.locator('[data-testid=outer]').click()
    await page.page.locator('[data-testid=inner]').click()
    expect(
      await answeredText(
        page,
        '[data-testid=inner]',
        (text) => text.includes('MARK_') || text.includes('error'),
      ),
    ).toBe('inner MARK_DEEP')
  },
  timeout,
)

// A server adapter of the app imports Rspack's `registerClientReference` to
// reference `Inner` by its id; a server fn a route's loader calls renders
// `Inner` too, so the manifest has it, and a server fn only client code
// calls makes the last run build something (the check runs). The adapter
// is no client reference Rspack compiled (it registers what its caller
// names, or another file, not itself): nothing warns, the page shows both
// trees. Its registration's id is its caller's, or a literal a loader
// writes beside one of the adapter's own file, in another call (generated
// instrumentation tracing where it runs).
// (Astra re-checks: of 2f32f533ee, the caller's id; of aabc2282da, the
// tracing call. The adapter was reported.)
const adapters = [
  {
    adapter: 'registers the id its caller passes',
    source: `import { registerClientReference } from 'react-server-dom-rspack/server'
export const ref = (id: string, name: string) => registerClientReference(function () {}, id, name)
`,
    use: `declare const INNER_ID: string
const Inner = ref(INNER_ID, 'Inner') as unknown as () => null`,
    tools: {
      rspack: (
        config: { context: string; plugins: Array<unknown> },
        {
          rspack,
        }: { rspack: { DefinePlugin: new (values: object) => unknown } },
      ) => {
        config.plugins.push(
          new rspack.DefinePlugin({
            INNER_ID: JSON.stringify(
              path.join(config.context, 'src/nested/Inner.tsx'),
            ),
          }),
        )
      },
    },
  },
  {
    adapter: 'passes its own file to an unrelated call',
    source: `import { registerClientReference as register } from 'react-server-dom-rspack/server'
function trace(make: () => unknown, file: string, name: string) {
  return make()
}
export const ref = () => trace(function () { return register(function () {}, __INNER_FILE__, "Inner") }, __FILE__, "ref")
`,
    use: `const Inner = ref() as unknown as () => null`,
    files: {
      'trace-files.cjs': `const path = require('node:path')
module.exports = function (source) {
  return source
    .replaceAll('__INNER_FILE__', JSON.stringify(path.join(this.context, 'Inner.tsx')))
    .replaceAll('__FILE__', JSON.stringify(this.resourcePath))
}
`,
    },
    tools: {
      rspack: (config: { module: { rules: Array<unknown> } }) => {
        config.module.rules.unshift({
          test: /wireAdapter\.ts$/,
          enforce: 'pre',
          use: [path.join(process.cwd(), 'trace-files.cjs')],
        })
      },
    },
  },
]
test.for(adapters)(
  'no warning for a server adapter that $adapter',
  { timeout },
  async ({ source, use, files: extra, tools }) => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        ...extra,
        'src/nested/Inner.tsx': answer('Inner'),
        'src/nested/wireAdapter.ts': source,
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ref } from './wireAdapter'
${use}
export const outer = createServerFn().handler(() => renderServerComponent(<section>outer <Inner /></section>))
`,
        'src/nested/normal.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner'
export const normal = createServerFn().handler(() => renderServerComponent(<section>normal <Inner /></section>))
`,
        'src/nested/late.ts': lateFn,
        'src/routes/nested.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { normal } from '../nested/normal'
import { outer } from '../nested/outer'
import { late } from '../nested/late'
export const Route = createFileRoute('/nested')({
  loader: async () => {
    const [first, second] = await Promise.all([normal(), outer()])
    return { first, second }
  },
  component: () => (
    <main>
      {Route.useLoaderData().first}
      {Route.useLoaderData().second}
      <ClientOnly fallback={null}>
        <button onClick={() => late()}>late</button>
      </ClientOnly>
    </main>
  ),
})
`,
      },
      tools,
    })
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({ errors: [], warned: [] })
    const page = await openRscPage(server, '/nested', {
      registerCleanup: onTestFinished,
    })
    await waitForHydration(page)
    expect(
      await page.page.locator('[data-testid=inner]').allTextContents(),
    ).toEqual(['ANSWER_1', 'ANSWER_1'])
  },
)

// A second server entry (in the RSC layer) and its client entry: the second
// entry imports `Inner`, so its manifest has it; the late server fn renders
// it for `index`, whose manifest lacks it. Each entry's manifest is checked
// against what that entry's server graph references: `index` is named. Cold,
// and a second `rsbuild build` restored from the persistent cache.
// (Astra re-check of 2f32f533ee: no warning, the click fails.)
const secondEntry = {
  files: {
    ...files,
    'src/second.ts': `import { Inner } from './nested/Inner'
export function renderSecond() {
  return Inner
}
`,
    'src/empty.ts': `export const empty = 1
`,
  },
  tools: {
    rspack: (config: { name?: string; entry: Record<string, unknown> }) => {
      if (config.name === 'ssr') {
        config.entry.second = {
          import: ['./src/second.ts'],
          layer: 'react-server-components',
        }
      }
      if (config.name === 'client') {
        config.entry.second = { import: ['./src/empty.ts'] }
      }
    },
  },
}
/** Whether a report names `Inner` as missing from `index`'s manifest only. */
const namesInnerForIndex = (server: {
  messages: Array<string>
  root: string
}) =>
  findDiagnostics(server.messages, {
    file: 'src/nested/Inner.tsx',
    root: server.root,
  }).some((diagnostic) => diagnostic.text.includes('(entry index)'))

const builds: Array<{
  build: string
  options: Partial<Parameters<typeof startRscRsbuildPreviewServer>[0]>
}> = [
  { build: 'cold', options: {} },
  {
    build: 'warm',
    options: { performance: { buildCache: true }, buildAgainWith: {} },
  },
]
test.for(builds)(
  'a $build build warns of a component the late server fn renders for an entry whose manifest lacks it',
  { timeout },
  async ({ options }) => {
    const server = await startRscRsbuildPreviewServer({
      ...secondEntry,
      ...options,
    })
    expect({
      errors: server.errors,
      warned: namesInnerForIndex(server),
    }).toEqual({ errors: [], warned: true })
  },
)

// The other direction: a route's loader renders an installed package's
// component for `index` (its manifest has it), and the second entry
// renders a component of the app; Rsbuild puts both entries' packages in
// one chunk, so the second entry's chunks hold the package's component,
// which its graph does not import and its manifest lacks. Nothing warns.
test(
  'no warning for a component an entry has only in a chunk it shares with another entry',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      ...secondEntry,
      files: {
        'node_modules/review-ui/package.json': JSON.stringify({
          name: 'review-ui',
          type: 'module',
          exports: './index.js',
        }),
        'node_modules/review-ui/index.js': `'use client'
import { createElement, useState } from 'react'
export function Badge() {
  const [n] = useState(1)
  return createElement('strong', null, 'BADGE_' + n)
}
`,
        'src/nested/Inner.tsx': files['src/nested/Inner.tsx'],
        'src/nested/deep.ts': files['src/nested/deep.ts'],
        'src/nested/early.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Badge } from 'review-ui'
export const early = createServerFn().handler(() => renderServerComponent(<div>early <Badge /></div>))
`,
        'src/nested/late.ts': `import { createServerFn } from '@tanstack/react-start'
export const late = createServerFn().handler(() => 'LATE')
`,
        'src/routes/nested.tsx': `import { ClientOnly, createFileRoute } from '@tanstack/react-router'
import { early } from '../nested/early'
import { late } from '../nested/late'
export const Route = createFileRoute('/nested')({
  loader: async () => ({ tree: await early() }),
  component: () => (
    <main>
      {Route.useLoaderData().tree}
      <ClientOnly fallback={null}>
        <button onClick={() => late()}>late</button>
      </ClientOnly>
    </main>
  ),
})
`,
        'src/second.ts': secondEntry.files['src/second.ts'],
        'src/empty.ts': secondEntry.files['src/empty.ts'],
      },
    })
    expect({
      errors: server.errors,
      warned: server.messages.some((message) =>
        message.includes('is a client reference of the RSC build'),
      ),
    }).toEqual({ errors: [], warned: false })
  },
  timeout,
)

// Two entries load their components through one `import()` chunk name: the
// late-reached server fn of `index` imports `Inner` as `panel`, the second
// entry imports `Other` as `panel`, so both entries' chunk groups hold one
// `panel` group with both. Each entry's manifest has what its own graph
// imports. With `index`'s server fn also called by a route's loader (its
// manifest has `Inner`), nothing warns and the click renders `Inner`, cold
// and from the persistent cache; without, `Inner` is named for `index`
// only. (Astra re-check of aabc2282da: `Inner` was also named for
// `second`, and `Other` for `index`.)
const sharedChunkName = (loader: boolean) => ({
  ...secondEntry,
  files: {
    'src/nested/Inner.tsx': answer('Inner'),
    'src/nested/Other.tsx': answer('Other'),
    'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const outer = createServerFn().handler(async () => {
  const { Inner } = await import(/* webpackChunkName: 'panel' */ './Inner')
  return renderServerComponent(<section><Inner /></section>)
})
`,
    'src/nested/late.ts': lateFn,
    'src/routes/nested.tsx': lateRoute(
      loader
        ? { loader: 'loader: async () => ({ tree: await outer() }),' }
        : {},
    ),
    'src/second.ts': `export const two = () => import(/* webpackChunkName: 'panel' */ './nested/Other').then((m) => m.Other)
`,
    'src/empty.ts': secondEntry.files['src/empty.ts'],
  },
})
test.for(builds)(
  'a $build build: no warning for components two entries load through one import() chunk name',
  { timeout },
  async ({ options }) => {
    const server = await startRscRsbuildPreviewServer({
      ...sharedChunkName(true),
      ...options,
    })
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({ errors: [], warned: [] })
    expect(await clickOuter(server)).toBe('ANSWER_1')
  },
)
test(
  'the warning names only the entry whose graph imports the component through a shared chunk name',
  async () => {
    const server = await startRscRsbuildPreviewServer(sharedChunkName(false))
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({ errors: [], warned: ['src/nested/Inner.tsx (Inner): index'] })
  },
  timeout,
)

// The late server fn starts a worker whose module imports `Inner`: the
// worker's chunk group runs a runtime of its own, which `index` does not
// load, so `Inner` is no reference of `index`'s. Nothing warns, the server
// fn answers. (Astra re-check of aabc2282da: quiet; a walk into the
// worker's block warned.)
test(
  'no warning for a component only a worker the late server fn starts imports',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        'src/nested/Inner.tsx': answer('Inner'),
        'src/nested/worker-only.ts': `import { Inner } from './Inner'
self.onmessage = () => self.postMessage(String(Inner))
`,
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
export const outer = createServerFn().handler(() => {
  const start = () => new Worker(new URL(/* webpackChunkName: 'isolated-worker' */ './worker-only.ts', import.meta.url))
  return String(start).length > 0 ? 'WORKER_FACTORY' : 'NO'
})
`,
        'src/nested/late.ts': lateFn,
        'src/routes/nested.tsx': lateRoute(),
      },
    })
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({ errors: [], warned: [] })
    expect(await clickOuter(server)).toBe('WORKER_FACTORY')
  },
  timeout,
)

// An installed package's side-effect-free barrel re-exports two client
// components: the late server fn of `index` renders `Button` through it,
// the second entry `Dialog`. The barrel's re-export of each is used in one
// entry's runtime only: `Button` is named for `index`, nothing else.
test(
  "the warning names only the entry whose runtime uses a barrel's component",
  async () => {
    const server = await startRscRsbuildPreviewServer({
      ...secondEntry,
      files: {
        'node_modules/ui-kit/package.json': JSON.stringify({
          name: 'ui-kit',
          type: 'module',
          sideEffects: false,
          exports: './index.js',
        }),
        'node_modules/ui-kit/index.js': `export { Button } from './Button.js'
export { Dialog } from './Dialog.js'
`,
        'node_modules/ui-kit/Button.js': `'use client'
import { createElement } from 'react'
export function Button() {
  return createElement('b', null, 'BUTTON')
}
`,
        'node_modules/ui-kit/Dialog.js': `'use client'
import { createElement } from 'react'
export function Dialog() {
  return createElement('b', null, 'DIALOG')
}
`,
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Button } from 'ui-kit'
export const outer = createServerFn().handler(() => renderServerComponent(<section><Button /></section>))
`,
        'src/nested/late.ts': lateFn,
        'src/routes/nested.tsx': lateRoute(),
        'src/second.ts': `import { Dialog } from 'ui-kit'
export const two = () => Dialog
`,
        'src/empty.ts': secondEntry.files['src/empty.ts'],
      },
    })
    expect({
      errors: server.errors,
      warned: flightWarnings(server),
    }).toEqual({
      errors: [],
      warned: ['node_modules/ui-kit/Button.js (Button): index'],
    })
  },
  timeout,
)
