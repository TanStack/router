/**
 * Not part of the compiler test corpus (harness controls, SYNTHESIS S7-001,
 * S7-002, S7-004, S7-006, S7-007, S7-008 and the prose half of S7-003):
 * these check the Start build harness (build-harness.ts) and the Rsbuild
 * dev-server harness (rsbuild-dev-server.ts) themselves, with each bundler:
 * what `where()` reports and `run()` runs in each environment, the request
 * SSR scripts run in, that warnings and errors reach the test on
 * every channel, the wording of the server entry's answer to an unknown id,
 * and the client runs of the Rsbuild dev server in a real browser. A correct
 * compiler rewrite does not change them; the corpus tests that use the
 * harness decide the compiler's outcomes (e.g.
 * `integration/start-build-rpc-and-routes.test.ts`).
 */
import { describe, expect, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import {
  StartBuildError,
  buildStart,
  callByIdExports,
  callByIdPrelude,
  startBundlers,
} from '../../build-harness'
import {
  clientPage,
  runInClient,
  runRsbuildClient,
  startRsbuildDevServer,
} from '../../rsbuild-dev-server'

const timeout = 60_000

/** An entry that loads `MARK_EAGER` with it and `MARK_LAZY` on demand. */
const loadingFiles = {
  'src/eager.ts': `export const eager = () => 'MARK_EAGER'\n`,
  'src/lazy.ts': `export const lazy = () => 'MARK_LAZY'\n`,
  'src/entry.ts': `export { eager } from './eager'
export const loadLazy = async () => (await import('./lazy')).lazy()
export const hasDocument = () => typeof document !== 'undefined'
`,
}

describe.each(startBundlers)('%s', (bundler) => {
  test(
    'where() tells code loaded with the entry, on demand and nowhere apart',
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: loadingFiles,
        entry: 'src/entry.ts',
      })
      for (const build of [client, ssr]) {
        expect({
          env: build.env,
          eager: build.where('MARK_EAGER'),
          lazy: build.where('MARK_LAZY'),
          absent: build.where('MARK_ABSENT'),
        }).toEqual({
          env: build.env,
          eager: 'eager',
          lazy: 'lazy',
          absent: 'nowhere',
        })
      }
    },
    timeout,
  )

  test(
    "run() runs each environment's entry, with a DOM on the client only",
    async () => {
      const { client, ssr } = await buildStart({
        bundler,
        files: loadingFiles,
        entry: 'src/entry.ts',
      })
      const script = `return [entry.hasDocument(), entry.eager(), await entry.loadLazy()]`
      expect({
        client: (await client.run(script)).result,
        ssr: (await ssr.run(script)).result,
      }).toEqual({
        client: [true, 'MARK_EAGER', 'MARK_LAZY'],
        ssr: [false, 'MARK_EAGER', 'MARK_LAZY'],
      })
    },
    timeout,
  )

  // The prose half of the corpus test "a server fn is Start's RPC on the
  // client" (start-build-rpc-and-routes.test.ts), which checks only that
  // an unknown id is rejected: Start's server entry says the server fn is
  // not found.
  test(
    'the server entry answers a call of an unknown id with a "not found" error',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createServerFn } from '@tanstack/react-start'
export const greet = createServerFn().handler(async () => 'hello')
`,
          'src/client-entry.ts': `export { greet } from './fns'\n`,
          'src/ssr-entry.ts': `export { greet } from './fns'
${callByIdExports}`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      const { result } = await ssr.run(`${callByIdPrelude}
try {
  await callById('unknown-id')
  return 'resolved'
} catch (error) {
  return error.message
}`)
      expect(result).toMatch(/not found/)
    },
    timeout,
  )

  // SSR scripts run inside a real request of the app (`inAppRequest`):
  // Start's server entry serves a request for the app's probe route, and
  // Start's own runtime reads the context it opened.
  test(
    'SSR scripts run inside a request of the app that Start’s server entry serves',
    async () => {
      const { ssr } = await buildStart({
        bundler,
        files: {
          'src/fns.ts': `import { createMiddleware, createServerFn } from '@tanstack/react-start'
const middleware = createMiddleware({ type: 'function' }).server(
  ({ next, context }) =>
    next({ context: { fromMiddleware: 'MARK_MIDDLEWARE', given: context } }),
)
export const inspect = createServerFn()
  .middleware([middleware])
  .handler(async ({ context, method }) => ({ method, context }))
`,
          'src/client-entry.ts': `export { inspect } from './fns'\n`,
          'src/ssr-entry.ts': `export { inspect } from './fns'
export { getRequest } from '@tanstack/react-start/server'
`,
        },
        entry: { client: 'src/client-entry.ts', ssr: 'src/ssr-entry.ts' },
      })
      // Without a request context, Start's runtime throws ("No Start
      // context found"); the request is the one sent for the probe route.
      const { result } = await ssr.run(`return {
  called: await entry.inspect(),
  request: new URL(entry.getRequest().url).pathname,
}`)
      expect(result).toEqual({
        called: {
          method: 'GET',
          context: { fromMiddleware: 'MARK_MIDDLEWARE', given: {} },
        },
        request: '/harness-probe',
      })
    },
    timeout,
  )

  test(
    "the bundler's warnings reach the result of each environment and the build's channel, and a clean app has none",
    async () => {
      const warned = await buildStart({
        bundler,
        files: {
          // Vite (Rolldown) warns about direct `eval`, Rspack about an
          // import of an expression.
          'src/warned.ts': `export const evaluate = (code: string) => eval(code)
export const load = (name: string) => import(name)
`,
          'src/entry.ts': `export { evaluate, load } from './warned'\n`,
        },
        entry: 'src/entry.ts',
      })
      const clean = await buildStart({
        bundler,
        files: loadingFiles,
        entry: 'src/entry.ts',
      })
      const naming = (warnings: Array<string>) =>
        warnings.some((warning) => warning.includes('warned.ts'))
      expect({
        warnedClient: naming(warned.client.warnings.map(({ text }) => text)),
        warnedSsr: naming(warned.ssr.warnings.map(({ text }) => text)),
        warnedChannel: naming(warned.diagnostics.map(({ text }) => text)),
        cleanClient: clean.client.warnings,
        cleanSsr: clean.ssr.warnings,
        cleanChannel: clean.diagnostics.filter(
          ({ severity }) => severity !== 'info',
        ),
      }).toEqual({
        warnedClient: true,
        warnedSsr: true,
        warnedChannel: true,
        cleanClient: [],
        cleanSsr: [],
        cleanChannel: [],
      })
    },
    timeout,
  )

  test(
    "a failing build rejects with the bundler's errors, and with what it printed",
    async () => {
      const failure = await buildStart({
        bundler,
        files: {
          'src/entry.ts': `export { value } from './missing-module'\n`,
        },
        entry: 'src/entry.ts',
        // A plugin of the app that prints while the build runs.
        ...(bundler === 'vite'
          ? {
              viteConfig: {
                plugins: [
                  {
                    name: 'prints',
                    buildStart: () => console.warn('MARK_PRINTED'),
                  },
                ],
              },
            }
          : {
              rsbuildConfig: {
                plugins: [
                  {
                    name: 'prints',
                    setup: (api) =>
                      api.onBeforeBuild(() => console.warn('MARK_PRINTED')),
                  },
                ],
              },
            }),
      }).catch((error: unknown) => error)
      expect(failure).toBeInstanceOf(BuildError)
      expect(failure).toBeInstanceOf(StartBuildError)
      expect((failure as BuildError).errors.join('\n')).toMatch(
        /missing-module/,
      )
      const texts = (failure as StartBuildError).diagnostics.map(
        ({ text }) => text,
      )
      expect(texts.some((text) => text.includes('MARK_PRINTED'))).toBe(true)
      expect(texts.some((text) => text.includes('missing-module'))).toBe(true)
    },
    timeout,
  )
})

// The Rsbuild dev-server harness (rsbuild-dev-server.ts) runs the client
// code in the dev server's page in a real browser, not in Node: browser-only
// APIs exist, the page is the dev server's, and what the code logs and
// throws while the page loads reaches the test.
test(
  'Rsbuild dev: client runs happen in the dev server’s page in a real browser',
  async () => {
    const server = await startRsbuildDevServer({
      ...clientPage,
      files: {
        'src/entry.ts': `;(globalThis as Record<string, unknown>).fromEntry = [
  typeof document.createElement('div').append,
  typeof customElements.define,
  location.origin,
]
console.log('MARK_LOG')
console.warn('MARK_WARN', new Error('MARK_ERROR'))
`,
      },
    })
    expect(
      await runInClient(
        server,
        `return [...globalThis.fromEntry, document.readyState]`,
      ),
    ).toEqual({
      result: ['function', 'function', new URL(server.url!).origin, 'complete'],
    })
    expect(await runInClient(server, `throw new Error('MARK_THROWN')`)).toEqual(
      { error: 'MARK_THROWN' },
    )
    expect(await runRsbuildClient(server, { levels: true })).toEqual([
      'log: MARK_LOG',
      'warn: MARK_WARN MARK_ERROR',
    ])
    expect(await runRsbuildClient(server)).toEqual([
      'MARK_LOG',
      'MARK_WARN MARK_ERROR',
    ])

    await server.edit({
      'src/entry.ts': `throw new Error('MARK_LOAD_ERROR')\n`,
    })
    await expect(runRsbuildClient(server)).rejects.toThrow('MARK_LOAD_ERROR')
    await expect(runInClient(server, 'return 1')).rejects.toThrow(
      'MARK_LOAD_ERROR',
    )
  },
  timeout,
)
