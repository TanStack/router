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
 * package's component, a loader's directive; an asset of the file is none)
 * and the manifest of its own server compilation (a plugin's asynchronous
 * `done` on both compilers).
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
// names, not itself): nothing warns, the page shows both trees.
// (Astra re-check of 2f32f533ee: the adapter was reported.)
test(
  'no warning for a server adapter that registers a client reference itself',
  async () => {
    const server = await startRscRsbuildPreviewServer({
      files: {
        'src/nested/Inner.tsx': `'use client'
import { useState } from 'react'
export function Inner() {
  const [n] = useState(1)
  return <strong data-testid="inner">ANSWER_{n}</strong>
}
`,
        'src/nested/wireAdapter.ts': `import { registerClientReference } from 'react-server-dom-rspack/server'
export const ref = (id: string, name: string) => registerClientReference(function () {}, id, name)
`,
        'src/nested/outer.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { ref } from './wireAdapter'
declare const INNER_ID: string
const Inner = ref(INNER_ID, 'Inner') as unknown as () => null
export const outer = createServerFn().handler(() => renderServerComponent(<section>outer <Inner /></section>))
`,
        'src/nested/normal.tsx': `import { createServerFn } from '@tanstack/react-start'
import { renderServerComponent } from '@tanstack/react-start/rsc'
import { Inner } from './Inner'
export const normal = createServerFn().handler(() => renderServerComponent(<section>normal <Inner /></section>))
`,
        'src/nested/late.ts': `import { createServerFn } from '@tanstack/react-start'
export const late = createServerFn().handler(() => 'LATE')
`,
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
    })
    expect({
      errors: server.errors,
      warned:
        findDiagnostics(server.messages, {
          file: 'src/nested/wireAdapter.ts',
          root: server.root,
        }).length > 0 || namesInner(server),
    }).toEqual({ errors: [], warned: false })
    const page = await openRscPage(server, '/nested', {
      registerCleanup: onTestFinished,
    })
    await waitForHydration(page)
    expect(
      await page.page.locator('[data-testid=inner]').allTextContents(),
    ).toEqual(['ANSWER_1', 'ANSWER_1'])
  },
  timeout,
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
