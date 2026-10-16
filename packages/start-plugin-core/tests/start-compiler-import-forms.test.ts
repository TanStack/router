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
import {
  callProvider,
  clientOnlyError,
  compileFor,
  evaluateModule,
  importSources,
  serverOnlyError,
  settle,
} from './regression-helpers'
import { getModuleErrors } from '@tanstack/compiler-test-utils/validate-module'
import type { Framework, ModuleStub, Output } from './regression-helpers'

const frameworks: Array<Framework> = ['react', 'solid', 'vue']

const stubs: Record<string, ModuleStub> = {
  './db.server': { db: { x: () => 'x' } },
  './chart.client': { chart: () => 'chart', Chart: () => '<chart>' },
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
  }) => Promise<void>
}

const constructs: Array<Construct> = [
  {
    name: 'createServerFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}({ method: 'GET' }).handler(async () => db.x())`)}`,
    check: async ({ client, ssr, provider, framework }) => {
      expect(importSources(client)).not.toContain('./db.server')
      expect(importSources(ssr)).not.toContain('./db.server')
      for (const [output, code] of [
        ['client', client],
        ['ssr', ssr],
      ] as const) {
        const { fn } = await evaluateModule(code, stubs, { framework })
        expect(fn, output).toEqual({ rpc: { [output]: expect.any(String) } })
        // The caller keeps the builder options (the runtime reads `method`).
        expect(fn.options, output).toEqual({ method: 'GET' })
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
      expect(importSources(client)).not.toContain('./db.server')
      // The client runtime's `.server()` throws: the client evaluates only
      // without it; the server keeps it.
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
      expect(importSources(client)).not.toContain('./db.server')
      expect(importSources(ssr)).not.toContain('./chart.client')
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
      expect(importSources(client)).not.toContain('./db.server')
      expect(
        settle((await evaluateModule(client, stubs, { framework })).fn),
      ).toBe(serverOnlyError)
      expect((await evaluateModule(ssr, stubs, { framework })).fn()).toBe('x')
    },
  },
  {
    name: 'createClientOnlyFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}(() => chart())`)}`,
    check: async ({ client, ssr, framework }) => {
      expect(importSources(ssr)).not.toContain('./chart.client')
      expect((await evaluateModule(client, stubs, { framework })).fn()).toBe(
        'chart',
      )
      expect(settle((await evaluateModule(ssr, stubs, { framework })).fn)).toBe(
        clientOnlyError,
      )
    },
  },
]

/**
 * Compiles every output of `code` (the source itself where the compiler
 * leaves it untouched) and checks each is a valid module.
 */
async function compileOutputs(code: string, framework: Framework) {
  const compiled = {} as Record<Output, string>
  for (const output of ['client', 'ssr', 'provider'] as const) {
    compiled[output] =
      (await compileFor(output, code, { framework })).code ?? code
    expect(await getModuleErrors(compiled[output]), output).toEqual([])
  }
  return compiled
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
      })
    })
  })

  // `<ClientOnly>` comes from the router package.
  describe('<ClientOnly>', () => {
    const router = `@tanstack/${framework}-router`
    /** `ClientOnly` renders its fallback on the server, its children on the client. */
    const routerStub = (env: 'client' | 'server') => ({
      [router]: {
        ClientOnly: (props: { children?: string; fallback?: string }) =>
          (env === 'server' ? props.fallback : props.children) ?? '',
      },
    })

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
      expect(importSources(compiled.ssr)).not.toContain('./chart.client')
      const ssr = await evaluateModule(
        compiled.ssr,
        { ...stubs, ...routerStub('server') },
        { framework },
      )
      expect(ssr.Page()).toBe('<div><p>loading</p></div>')
      const client = await evaluateModule(
        compiled.client,
        { ...stubs, ...routerStub('client') },
        { framework },
      )
      expect(client.Page()).toBe('<div><chart></div>')
    }

    test('through a renamed import', async () => {
      await checkBoundary(`import { ClientOnly as CO } from '${router}'`, 'CO')
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
