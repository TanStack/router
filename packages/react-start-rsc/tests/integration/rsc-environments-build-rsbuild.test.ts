/**
 * An Rsbuild production build with RSC: the server compiler builds two
 * compile environments, `ssr` (its SSR layer) and `rsc` (its RSC layer),
 * and a file both import is a module of each (`rsc-environments-app.ts`).
 * - `allowImport` is asked once per import and environment, `env` naming
 *   the environment (`rsc`, `ssr`), as on Vite;
 * - a denied import of the `rsc` environment is its edge module, a virtual
 *   file of the server compiler, which is written and resolves: the build
 *   serves the mock and reports each environment's import;
 * - the `rsc` environment's rules are the server rules, as when reports
 *   named it `ssr` (user decision 1: the name changed, the rules did not);
 * - a worker (a child compiler of the client) that imports a server fn the
 *   page calls compiles as the client: it gets the client stub, with the
 *   page's function id, and no handler code;
 * - a child compiler of the server maps its modules through their layer, as
 *   its parent does: a child entry in the RSC layer is of `rsc` (A15).
 * Source: RSC model v2 §2.5 (rows for A2, A14, A15 and the `allowImport`
 * call count; user decisions 1 and 2, 11-20); the child of the server as
 * the phase 1 review gave it (Astra's report Part B: 88dded8da0 reports it
 * in `ssr`).
 */
import { describe, expect, test } from 'vitest'
import {
  calls,
  environmentsFiles,
  labelModule,
  recorder,
  rendered,
  summary,
} from './rsc-environments-app'
import { openRscPage, startRscRsbuildPreviewServer } from './rsc-serial'

const timeout = 60_000

const secretViolations = [
  'rsc server file label.ts -> ./secret.client',
  'ssr server file label.ts -> ./secret.client',
]

describe('Rsbuild build with RSC: a file in both compile environments', () => {
  test(
    'allowImport is asked once for each environment of an import a file of both makes',
    async () => {
      const { asked, start } = recorder('error', () => true)
      const server = await startRscRsbuildPreviewServer({
        start,
        files: environmentsFiles,
      })
      expect(server.errors).toEqual([])
      const response = await fetch(new URL('/', server.url))
      expect({
        status: response.status,
        ...rendered(await response.text()),
      }).toEqual({
        status: 200,
        route: 'MARK_SECRET MARK_WHERE_PLAIN',
        server: 'MARK_SECRET MARK_WHERE_SERVER',
        boxes: 2,
      })
      expect(calls(asked).sort()).toEqual(secretViolations)
    },
    timeout,
  )

  test(
    "a denied import of the rsc environment is served its mock, and each environment's is reported",
    async () => {
      const { violations, start } = recorder('mock')
      const server = await startRscRsbuildPreviewServer({
        start,
        files: environmentsFiles,
      })
      expect(server.errors).toEqual([])
      const response = await fetch(new URL('/', server.url))
      const html = await response.text()
      expect(response.status).toBe(200)
      expect(rendered(html)).toEqual({
        route: expect.stringContaining('MARK_WHERE_PLAIN'),
        server: expect.stringContaining('MARK_WHERE_SERVER'),
        boxes: 2,
      })
      expect(html).not.toContain('MARK_SECRET')
      expect(summary(violations)).toEqual(secretViolations)
    },
    timeout,
  )
})

/**
 * A server fn whose handler (the `rsc` environment's provider) reads a file
 * and a specifier each rule list names: the server's file pattern
 * (`*.client.*`), marker (`client-only`) and a user's server specifier
 * deny; the client's (`*.server.*`, `server-only`, a user's client
 * specifier) do not.
 */
const rulesFiles = {
  'package.json': JSON.stringify({
    name: 'app',
    private: true,
    type: 'module',
    imports: {
      '#server-denied': './src/rules/plain-a.ts',
      '#client-denied': './src/rules/plain-b.ts',
    },
  }),
  'src/rules/plain-a.ts': `export const a = () => 'A'\n`,
  'src/rules/plain-b.ts': `export const b = () => 'B'\n`,
  'src/rules/data.server.ts': `export const data = () => 'DATA'\n`,
  'src/rules/ui.client.ts': `export const ui = () => 'UI'\n`,
  'src/rules/server-marked.ts': `import '@tanstack/react-start/server-only'
export const sm = () => 'SM'
`,
  'src/rules/client-marked.ts': `import '@tanstack/react-start/client-only'
export const cm = () => 'CM'
`,
  'src/rules/fns.ts': `import { createServerFn } from '@tanstack/react-start'
import { a } from '#server-denied'
import { b } from '#client-denied'
import { data } from './data.server'
import { ui } from './ui.client'
import { sm } from './server-marked'
import { cm } from './client-marked'
export const readRules = createServerFn().handler(() =>
  [a, b, data, ui, sm, cm].map((read) => String(typeof read === 'function')).join(' '),
)
`,
  'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { readRules } from '../rules/fns'
export const Route = createFileRoute('/')({
  loader: () => readRules(),
  component: () => <p data-testid="rules">{Route.useLoaderData()}</p>,
})
`,
}

describe('Rsbuild build with RSC: the rsc environment', () => {
  test(
    'its imports are judged by the server rules, and reported as rsc of type server',
    async () => {
      const { violations, start } = recorder('mock')
      const server = await startRscRsbuildPreviewServer({
        start: {
          ...start,
          importProtection: {
            ...start.importProtection,
            server: { specifiers: ['#server-denied'] },
            client: { specifiers: ['#client-denied'] },
          },
        },
        files: rulesFiles,
      })
      expect(server.errors).toEqual([])
      expect(summary(violations)).toEqual([
        'rsc server file fns.ts -> ./ui.client',
        'rsc server marker fns.ts -> ./client-marked',
        'rsc server specifier fns.ts -> #server-denied',
      ])
    },
    timeout,
  )
})

/** What the plugins use of Rspack's compiler (structural: the package has no `@rsbuild/core` types). */
interface CompilerLike {
  context: string
  rspack: {
    EntryPlugin: new (context: string, entry: string, options: object) => object
    webworker: { WebWorkerTemplatePlugin: new () => object }
  }
  hooks: {
    make: {
      tapPromise: (
        name: string,
        run: (compilation: {
          createChildCompiler: (
            name: string,
            output: object,
            plugins: Array<object>,
          ) => {
            runAsChild: (callback: (error?: Error | null) => void) => void
          }
        }) => Promise<void>,
      ) => void
    }
  }
}

/**
 * The app's own Rspack plugin: builds `src/<name>.ts` in a child compiler
 * of the compiler's compilation, emitted as `<name>.js` (what a worker or
 * service-worker plugin does): with `worker`, as a web worker; with
 * `layer`, its entry in that Rspack layer.
 */
const childCompilerPlugin = (
  name: string,
  { worker = false, layer }: { worker?: boolean; layer?: string },
) => ({
  apply(compiler: CompilerLike) {
    compiler.hooks.make.tapPromise(`app:${name}`, (compilation) => {
      const child = compilation.createChildCompiler(
        `app-${name}`,
        { filename: `${name}.js`, chunkFilename: `${name}-[name].js` },
        [
          new compiler.rspack.EntryPlugin(
            compiler.context,
            `./src/${name}.ts`,
            { name, ...(layer !== undefined && { layer }) },
          ),
          ...(worker
            ? [new compiler.rspack.webworker.WebWorkerTemplatePlugin()]
            : []),
        ],
      )
      return new Promise<void>((resolve, reject) => {
        child.runAsChild((error) => (error ? reject(error) : resolve()))
      })
    })
  },
})

/** Rsbuild's `tools.rspack` adding `plugin` to the compiler of `environment`. */
const withPlugin = (environment: string, plugin: object) => ({
  rspack: (
    config: { plugins?: Array<unknown> },
    context: { environment: { name: string } },
  ) => {
    if (context.environment.name === environment) {
      ;(config.plugins ??= []).push(plugin)
    }
  },
})

describe('Rsbuild build with RSC: a worker of the client', () => {
  test(
    "a server fn the page calls is the client's stub in the worker, of the same id",
    async () => {
      const server = await startRscRsbuildPreviewServer({
        files: {
          'src/lib/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const readShared = createServerFn().handler(() => 'MARK_SHARED')
`,
          'src/worker.ts': `import { readShared } from './lib/fns'
self.onmessage = () => {
  self.postMessage(readShared.url)
}
`,
          'src/routes/index.tsx': `import { createFileRoute } from '@tanstack/react-router'
import { readShared } from '../lib/fns'
export const Route = createFileRoute('/')({
  loader: () => readShared(),
  component: () => (
    <p data-testid="page" data-url={readShared.url}>
      {'page ' + Route.useLoaderData()}
    </p>
  ),
})
`,
        },
        tools: withPlugin(
          'client',
          childCompilerPlugin('worker', { worker: true }),
        ),
      })
      expect(server.errors).toEqual([])
      const page = await openRscPage(server, '/')
      await page
        .locator('[data-testid=page]', { hasText: /page MARK_SHARED/ })
        .waitFor({ timeout: 5_000 })
      const fromWorker = await page.evaluate(
        () =>
          new Promise<string>((resolve) => {
            const worker = new Worker('/worker.js')
            worker.onmessage = (event) => resolve(String(event.data))
            worker.onerror = (event) => resolve(`error ${event.message}`)
            worker.postMessage(null)
          }),
      )
      const fromPage = await page
        .locator('[data-testid=page]')
        .getAttribute('data-url')
      expect(fromWorker).toBe(fromPage)
      expect(fromWorker).toMatch(/^\//)
      const worker = await fetch(new URL('/worker.js', server.url))
      expect(await worker.text()).not.toContain('MARK_SHARED')
    },
    timeout,
  )
})

describe('Rsbuild build with RSC: a child compiler of the server', () => {
  // A15: a child's request maps through its issuer's layer, as its
  // parent's modules do: a child entry in the RSC layer is of `rsc`
  test(
    "a denied import of a child compiler's module in the RSC layer is reported in rsc and fails the build",
    async () => {
      const { violations, start } = recorder('error')
      const error = await startRscRsbuildPreviewServer({
        start,
        files: {
          ...environmentsFiles,
          'src/lib/label.ts': labelModule(false),
          'src/child.ts': `import { secretLabel } from './lib/secret.client'
;(globalThis as { child?: string }).child = secretLabel()
`,
        },
        tools: withPlugin(
          'ssr',
          childCompilerPlugin('child', { layer: 'react-server-components' }),
        ),
      }).then(
        () => null,
        (e: unknown) => e,
      )
      expect(error).not.toBeNull()
      expect(summary(violations)).toEqual([
        'rsc server file child.ts -> ./lib/secret.client',
      ])
    },
    timeout,
  )
})
