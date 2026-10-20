/**
 * Every Start construct is recognised however its factory is imported (a
 * renamed import, a member of a namespace import) or its result wrapped (a
 * TypeScript `as` or `satisfies`), in each framework: the client output
 * keeps no server code or import, and each output follows the runtime contract of its
 * environment (RPC, environment branch, throwing stub, fallback).
 * Replaces the Rename / StarImport snapshot fixtures of the createServerFn,
 * createMiddleware, createIsomorphicFn, envOnly and ClientOnly suites and
 * envOnlyExportedAlias (N1; gaps SF5, MW4, CO4, SF24).
 */
import { describe, expect, test } from 'vitest'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callProvider,
  callerRpcId,
  clientOnlyError,
  compileCode,
  compileFor,
  createServerGraph,
  evaluateModule,
  moduleLoads,
  renderToHtml,
  serverOnlyError,
  settle,
} from './regression-helpers'
import type { Framework, ModuleStub, Output } from './regression-helpers'
import type { ServerFn } from '../src/start-compiler/types'

const frameworks: Array<Framework> = ['react', 'solid', 'vue']

const stubs: Record<string, ModuleStub> = {
  './db.server': { db: { x: () => 'x' } },
  './chart.client': { chart: () => 'chart', Chart: () => '<chart>' },
}

/** The client output does not load the server-only module. */
async function expectClientFree(client: string, framework: Framework) {
  expectNotLoaded(await moduleLoads(client, { framework }), ['./db.server'])
}

/** The SSR output does not load the client-only module. */
async function expectServerFree(ssr: string, framework: Framework) {
  expectNotLoaded(await moduleLoads(ssr, { framework, env: 'server' }), [
    './chart.client',
  ])
}

/** How the factory `name` of `pkg` is imported and its call written. */
interface Form {
  imports: (pkg: string, name: string) => string
  callee: (name: string) => string
  wrap: (expression: string) => string
}

const forms: Record<string, Form> = {
  'a renamed import': {
    imports: (pkg, name) => `import { ${name} as renamed } from '${pkg}'`,
    callee: () => 'renamed',
    wrap: (expression) => expression,
  },
  'a namespace member': {
    imports: (pkg) => `import * as Start from '${pkg}'`,
    callee: (name) => `Start.${name}`,
    wrap: (expression) => expression,
  },
  'a call result wrapped in as': {
    imports: (pkg, name) => `import { ${name} as renamed } from '${pkg}'`,
    callee: () => 'renamed',
    wrap: (expression) => `(${expression}) as any`,
  },
  'a call result wrapped in satisfies': {
    imports: (pkg, name) => `import { ${name} as renamed } from '${pkg}'`,
    callee: () => 'renamed',
    wrap: (expression) => `(${expression}) satisfies unknown`,
  },
}

/** A Start construct: the module creating it and the checks of each output. */
interface Construct {
  name: string
  /** The export `fn` (or `mw`), created by calling `callee`. */
  code: (callee: string, wrap: Form['wrap']) => string
  check: (outputs: {
    client: string
    ssr: string
    provider: string
    framework: Framework
    serverImport: string
    /** The server fns the client reported. */
    serverFns: Record<string, ServerFn>
  }) => Promise<void>
}

const constructs: Array<Construct> = [
  {
    name: 'createServerFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}({ method: 'POST' }).handler(async () => db.x())`)}`,
    check: async ({ client, ssr, provider, framework, serverFns }) => {
      await expectClientFree(client, framework)
      const clientFn = (await evaluateModule(client, stubs, { framework })).fn
      expect(callerRpcId(clientFn)).toEqual(expect.any(String))
      expect(serverFns).toHaveProperty(callerRpcId(clientFn)!)
      const graph = createServerGraph(
        { ssr, provider, framework, serverFns },
        stubs,
      )
      const ssrFn = (await graph.ssr()).fn
      expect(await ssrFn()).toBe('x')
      // The callers keep the builder options (Start exposes `method`).
      for (const [output, fn] of [
        ['client', clientFn],
        ['ssr', ssrFn],
      ] as const) {
        expect(fn.method, output).toBe('POST')
      }
      expect(
        await callProvider({ ssr, provider, framework }, 'fn', stubs),
      ).toBe('x')
    },
  },
  {
    name: 'createMiddleware',
    code: (callee, wrap) =>
      `export const mw = ${wrap(`${callee}({ type: 'function' }).server(async ({ next }) => {
  db.x()
  return next()
})`)}`,
    check: async ({ client, ssr, framework }) => {
      await expectClientFree(client, framework)
      // The client drops `.server()`; the server keeps it.
      expect(
        (await evaluateModule(client, stubs, { framework })).mw.options,
      ).toEqual({ type: 'function' })
      expect(
        (await evaluateModule(ssr, stubs, { framework, env: 'server' })).mw
          .options.server,
      ).toBeTypeOf('function')
    },
  },
  {
    name: 'createIsomorphicFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}().server(() => db.x()).client(() => chart())`)}`,
    check: async ({ client, ssr, framework }) => {
      await expectClientFree(client, framework)
      await expectServerFree(ssr, framework)
      expect((await evaluateModule(client, stubs, { framework })).fn()).toBe(
        'chart',
      )
      expect((await evaluateModule(ssr, stubs, { framework })).fn()).toBe('x')
    },
  },
  {
    name: 'createServerOnlyFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}(() => db.x())`)}`,
    check: async ({ client, ssr, framework }) => {
      await expectClientFree(client, framework)
      expect(
        settle((await evaluateModule(client, stubs, { framework })).fn),
      ).toEqual(serverOnlyError)
      expect((await evaluateModule(ssr, stubs, { framework })).fn()).toBe('x')
    },
  },
  {
    name: 'createClientOnlyFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}(() => chart())`)}`,
    check: async ({ client, ssr, framework }) => {
      await expectServerFree(ssr, framework)
      expect((await evaluateModule(client, stubs, { framework })).fn()).toBe(
        'chart',
      )
      expect(
        settle((await evaluateModule(ssr, stubs, { framework })).fn),
      ).toEqual(clientOnlyError)
    },
  },
]

/**
 * Compiles every output of `code` (the source itself where the compiler
 * leaves it untouched) and checks each is a valid module.
 */
async function compileOutputs(code: string, framework: Framework) {
  const compiled = {} as Record<Output, string>
  let serverFns: Record<string, ServerFn> = {}
  for (const output of ['client', 'ssr', 'provider'] as const) {
    const result = await compileFor(output, code, { framework })
    compiled[output] = result.code ?? code
    expect(await getModuleErrors(compiled[output]), output).toEqual([])
    if (output === 'client') {
      serverFns = result.serverFns
    }
  }
  return { ...compiled, serverFns }
}

/** The imports a construct's code reads, besides the factory. */
const moduleImports = `import { db } from './db.server'
import { chart } from './chart.client'`

describe.each(frameworks)('%s', (framework) => {
  const pkg = `@tanstack/${framework}-start`

  describe.each(constructs)('$name', (construct) => {
    test.each(Object.keys(forms))('through %s', async (formName) => {
      const form = forms[formName]!
      const code = `${form.imports(pkg, construct.name)}
${moduleImports}
${construct.code(form.callee(construct.name), form.wrap)}`
      const compiled = await compileOutputs(code, framework)
      await construct.check({
        client: compiled.client,
        ssr: compiled.ssr,
        provider: compiled.provider,
        framework,
        serverImport: './db.server',
        serverFns: compiled.serverFns,
      })
    })
  })

  // A factory a project module re-exports under a new name, called as a
  // member of a namespace import of that module: renamed imports, namespace
  // members and re-exports are all recognised forms (SPEC J4.5, §2.1). Each
  // env-only factory, next to a server fn and alone in its module.
  describe('a renamed env-only factory read through a namespace import of a project module', () => {
    const files = {
      '/test/src/factory.ts': `export { createServerOnlyFn as serverOnly, createClientOnlyFn as clientOnly } from '${pkg}'`,
    }
    const envStubs: Record<string, ModuleStub> = {
      './db.server': { db: { x: () => 'server-only-value' } },
      './chart.client': { chart: () => 'client-only-value' },
    }
    const options = { framework, files }
    const serverOptions = { ...options, env: 'server' as const }

    /** A call of the namespace member `factory.<member>`, and its checks. */
    interface EnvOnlyCall {
      name: string
      code: string
      check: (outputs: { client: string; ssr: string }) => Promise<void>
    }

    const calls: Array<EnvOnlyCall> = [
      {
        name: 'createServerOnlyFn',
        code: `import * as factory from './factory'
import { db } from './db.server'
export const impl = factory.serverOnly(() => db.x())`,
        check: async ({ client, ssr }) => {
          expectNotLoaded(
            await moduleLoads(client, { ...options, stubs: envStubs }),
            ['./db.server'],
          )
          expect(
            settle((await evaluateModule(client, envStubs, options)).impl),
          ).toEqual(serverOnlyError)
          expect(
            (await evaluateModule(ssr, envStubs, serverOptions)).impl(),
          ).toBe('server-only-value')
        },
      },
      {
        name: 'createClientOnlyFn',
        code: `import * as factory from './factory'
import { chart } from './chart.client'
export const impl = factory.clientOnly(() => chart())`,
        check: async ({ client, ssr }) => {
          expectNotLoaded(
            await moduleLoads(ssr, { ...serverOptions, stubs: envStubs }),
            ['./chart.client'],
          )
          expect(
            settle((await evaluateModule(ssr, envStubs, serverOptions)).impl),
          ).toEqual(clientOnlyError)
          expect((await evaluateModule(client, envStubs, options)).impl()).toBe(
            'client-only-value',
          )
        },
      },
    ]

    /** Compiles `code` for the client and SSR, each a valid module, and checks `call`. */
    async function expectEnvOnly(call: EnvOnlyCall, code: string) {
      const compiled = {} as Record<'client' | 'ssr', string>
      for (const output of ['client', 'ssr'] as const) {
        compiled[output] = (await compileCode(output, code, options)) ?? code
        expect(await getModuleErrors(compiled[output]), output).toEqual([])
      }
      await call.check(compiled)
    }

    test.each(calls)(
      '$name next to a server fn: the other environment neither loads nor runs the implementation',
      async (call) => {
        await expectEnvOnly(
          call,
          `import { createServerFn } from '${pkg}'
${call.code}
export const fn = createServerFn().handler(async () => 'fn')`,
        )
      },
    )

    // Bug: the bundler plugins choose the modules the Start compiler
    // transforms by their text (a factory name such as
    // `createServerOnlyFn`, or `.handler(`). A module whose only Start call
    // is `factory.serverOnly(...)` names none, so it is left untransformed;
    // the same module next to a server fn is compiled (rows above). Same
    // cause as the renamed re-export pin "client builds compile a renamed
    // createServerOnlyFn re-export ..." in known-bugs-start-compiler.test.ts.
    // Impact: the client bundle gets the server-only implementation and the
    // modules it imports, and runs it; the client-only mirror runs during
    // SSR.
    // Source: start-compiler/compiler.ts `KindDetectionPatterns` and
    // `detectKindsInCode` (used by vite/start-compiler-plugin/plugin.ts and
    // rsbuild/start-compiler-host.ts). Outcome twin of the printed-code
    // implementation test outside-compiler-corpus/
    // compiler-member-call-receivers.test.ts (from #8758).
    test.fails.each(calls)(
      '$name alone in its module: the other environment neither loads nor runs the implementation',
      async (call) => {
        await expectEnvOnly(call, call.code)
      },
    )
  })

  // `<ClientOnly>` comes from the router package (SPEC J4.11): the server
  // outputs render the fallback only, without loading the modules only the
  // children use; the client keeps the children.
  describe('<ClientOnly>', () => {
    const router = `@tanstack/${framework}-router`
    /**
     * The router package with a probe `ClientOnly` that renders both the
     * fallback and the children it is given (no model of the real one,
     * whose client render needs a hydrated page: integration/
     * clientOnlyJSX.test.ts): what each output passes it is visible.
     */
    const probeRouter = {
      [router]: {
        Link: () => null,
        ClientOnly: (props: { children?: unknown; fallback?: unknown }) => [
          props.fallback,
          '|',
          props.children,
        ],
      },
    }
    const chartStub = {
      './chart.client': { Chart: () => '<chart>' },
    }

    /** Checks a `<ClientOnly>` boundary written as `tag`, imported by `imports`. */
    async function checkBoundary(imports: string, tag: string) {
      const code = `${imports}
import { Chart } from './chart.client'
export const Page = () => (
  <div>
    <${tag} fallback={<p>loading</p>}>
      <Chart />
    </${tag}>
  </div>
)`
      const compiled = await compileOutputs(code, framework)
      expectNotLoaded(
        await moduleLoads(compiled.ssr, {
          stubs: probeRouter,
          framework,
          env: 'server',
        }),
        ['./chart.client'],
      )
      const ssr = await evaluateModule(
        compiled.ssr,
        { ...chartStub, ...probeRouter },
        { framework, env: 'server' },
      )
      const ssrHtml = await renderToHtml(ssr.Page())
      expect(ssrHtml).toContain('<p>loading</p>')
      expect(ssrHtml).not.toContain('chart')
      const client = await evaluateModule(
        compiled.client,
        { ...chartStub, ...probeRouter },
        { framework },
      )
      expect(await renderToHtml(client.Page())).toContain('&lt;chart&gt;')
      if (framework === 'react') {
        // The real React `ClientOnly` renders the server output's fallback.
        const real = await evaluateModule(compiled.ssr, chartStub, {
          env: 'server',
        })
        expect(await renderToHtml(real.Page())).toBe(
          '<div><p>loading</p></div>',
        )
      }
    }

    test.each([
      `import { ClientOnly as CO } from '${router}'`,
      `import { Link, ClientOnly as CO } from '${router}'`,
      `import{ClientOnly as CO}from '${router}'`,
    ])('through a renamed import: %s', async (imports) => {
      await checkBoundary(imports, 'CO')
    })

    // Bug: `<ClientOnly>` is detected by the `<ClientOnly` / imported
    // `ClientOnly` text, so a boundary written as a member of a namespace
    // import (`<Router.ClientOnly>`) is never compiled.
    // Impact: the SSR output keeps the children and the client-only modules
    // they import: browser-only code runs during SSR.
    // Source: gap CO4 (gaps/start-env.md), N1 import-forms table.
    test.fails('through a namespace member', async () => {
      await checkBoundary(
        `import * as Router from '${router}'`,
        'Router.ClientOnly',
      )
    })
  })
})
