/**
 * Every Start construct is recognised however its factory is imported (a
 * renamed import, a member of a namespace import) or its result wrapped (a
 * TypeScript `as` or `satisfies`), in each framework: the client keeps no
 * server code or import, and each environment follows the runtime contract
 * of its environment (a server fn the client calls through the server, an
 * environment branch, a throwing env-only fn, a fallback), observed through
 * the public Start host (`./start-host`): the client in a real page, the
 * server in the SSR environment and in a real request.
 * Replaces the Rename / StarImport snapshot fixtures of the createServerFn,
 * createMiddleware, createIsomorphicFn, envOnly and ClientOnly suites and
 * envOnlyExportedAlias (N1; gaps SF5, MW4, CO4, SF24).
 */
import { beforeAll, describe, expect, test } from 'vitest'
import { expectNotLoaded } from '@tanstack/compiler-test-utils/importers'
import {
  callFromClient,
  callOnServer,
  clientOnlyError,
  fromPage,
  inPage,
  serveCase,
  serverOnlyError,
  settle,
  useStartHosts,
} from './regression-helpers'
import type {
  Framework,
  PageSettled,
  ServedCase,
  StartCase,
} from './regression-helpers'

const frameworks: Array<Framework> = ['react', 'solid', 'vue']

const hosts = useStartHosts()

/** The real modules the constructs read. */
const moduleFiles = {
  'db.server.ts': `export const db = { x: () => 'x' }\n`,
  'chart.client.ts': `export const chart = () => 'chart'\nexport const Chart = () => '<chart>'\n`,
}

/** The client does not load the server-only module. */
async function expectClientFree(served: StartCase) {
  expectNotLoaded(await served.loads(), ['./db.server'])
}

/** The SSR environment does not load the client-only module. */
async function expectServerFree(served: StartCase) {
  expectNotLoaded(await served.serverLoads(), ['./chart.client'])
}

/** What calling `call` (a page expression) in the page gives (`settle`). */
async function settleInPage(served: StartCase, call: string) {
  return fromPage(
    await inPage<PageSettled>(served, `return settle(() => ${call})`),
  )
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

/** A Start construct: the module creating it and the checks of each env. */
interface Construct {
  name: string
  /** The export `fn` (or `mw`), created by calling `callee`. */
  code: (callee: string, wrap: Form['wrap']) => string
  check: (served: ServedCase) => Promise<void>
}

const constructs: Array<Construct> = [
  {
    name: 'createServerFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}({ method: 'POST' }).handler(async () => db.x())`)}`,
    check: async (served) => {
      await expectClientFree(served)
      // The callers keep the builder options (Start exposes `method`), and
      // the client's server fn is Start's fetcher (its public `url`).
      expect(
        await inPage(
          served,
          `return { url: typeof module.fn.url, method: module.fn.method }`,
        ),
      ).toEqual({ url: 'string', method: 'POST' })
      expect((await served.ssr()).fn.method, 'ssr').toBe('POST')
      // Called from server code, and from the client through the server.
      expect(await callOnServer(served, 'module.fn')).toBe('x')
      expect(await callFromClient(served, 'module.fn')).toBe('x')
    },
  },
  {
    name: 'createMiddleware',
    code: (callee, wrap) =>
      `export const mw = ${wrap(`${callee}({ type: 'function' }).server(async ({ next }) => {
  db.x()
  return next()
})`)}`,
    check: async (served) => {
      await expectClientFree(served)
      // The client drops `.server()`; the server keeps it.
      expect(
        await inPage(
          served,
          `return Object.fromEntries(Object.entries(module.mw.options).filter(([, value]) => value !== undefined).map(([key, value]) => [key, typeof value === 'function' ? '<function>' : value]))`,
        ),
      ).toEqual({ type: 'function' })
      expect((await served.ssr()).mw.options.server).toBeTypeOf('function')
    },
  },
  {
    name: 'createIsomorphicFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}().server(() => db.x()).client(() => chart())`)}`,
    check: async (served) => {
      await expectClientFree(served)
      await expectServerFree(served)
      expect(await inPage(served, 'return module.fn()')).toBe('chart')
      expect((await served.ssr()).fn()).toBe('x')
    },
  },
  {
    name: 'createServerOnlyFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}(() => db.x())`)}`,
    check: async (served) => {
      await expectClientFree(served)
      expect(await settleInPage(served, 'module.fn()')).toEqual(serverOnlyError)
      expect((await served.ssr()).fn()).toBe('x')
    },
  },
  {
    name: 'createClientOnlyFn',
    code: (callee, wrap) =>
      `export const fn = ${wrap(`${callee}(() => chart())`)}`,
    check: async (served) => {
      await expectServerFree(served)
      expect(await inPage(served, 'return module.fn()')).toBe('chart')
      const ssr = await served.ssr()
      expect(settle(() => ssr.fn())).toEqual(clientOnlyError)
    },
  },
]

/** The imports a construct's code reads, besides the factory. */
const moduleImports = `import { db } from './db.server'
import { chart } from './chart.client'`

/**
 * What renders a module's `Page` with the framework's real renderers: on
 * the server to HTML (`html()`, in the SSR environment), and mounted in the
 * page (`mount()`, giving the container). Vue has no renderer here (no Vue
 * JSX transform in the host; see the `<ClientOnly>` tests).
 */
const renderFiles: Partial<Record<Framework, Record<string, string>>> = {
  react: {
    'render.server.tsx': `import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import { Page } from './module'
export const html = () => renderToString(createElement(Page))
`,
    'render.client.tsx': `import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { Page } from './module'
export function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  createRoot(container).render(createElement(Page))
  return container
}
`,
  },
  solid: {
    'render.server.tsx': `import { renderToString } from 'solid-js/web'
import { Page } from './module'
export const html = () => renderToString(() => <Page />)
`,
    'render.client.tsx': `import { render } from 'solid-js/web'
import { Page } from './module'
export function mount() {
  const container = document.createElement('div')
  document.body.append(container)
  render(() => <Page />, container)
  return container
}
`,
  },
}

describe.each(frameworks)('%s', (framework) => {
  const pkg = `@tanstack/${framework}-start`
  const host = () => hosts(framework)
  // The framework's host (dev server and page) starts before its tests.
  beforeAll(async () => {
    await (await host()).page()
  }, 60_000)

  describe.each(constructs)('$name', (construct) => {
    test.each(Object.keys(forms))('through %s', async (formName) => {
      const form = forms[formName]!
      const code = `${form.imports(pkg, construct.name)}
${moduleImports}
${construct.code(form.callee(construct.name), form.wrap)}`
      const served = await serveCase(await host(), {
        'module.tsx': code,
        ...moduleFiles,
      })
      await construct.check(served)
    })
  })

  // A factory a project module re-exports under a new name, called as a
  // member of a namespace import of that module: renamed imports, namespace
  // members and re-exports are all recognised forms (SPEC J4.5, §2.1). Each
  // env-only factory, next to a server fn and alone in its module.
  describe('a renamed env-only factory read through a namespace import of a project module', () => {
    const files = {
      'factory.ts': `export { createServerOnlyFn as serverOnly, createClientOnlyFn as clientOnly } from '${pkg}'\n`,
      'db.server.ts': `export const db = { x: () => 'server-only-value' }\n`,
      'chart.client.ts': `export const chart = () => 'client-only-value'\n`,
    }

    /** A call of the namespace member `factory.<member>`, and its checks. */
    interface EnvOnlyCall {
      name: string
      code: string
      check: (served: StartCase) => Promise<void>
    }

    const calls: Array<EnvOnlyCall> = [
      {
        name: 'createServerOnlyFn',
        code: `import * as factory from './factory'
import { db } from './db.server'
export const impl = factory.serverOnly(() => db.x())`,
        check: async (served) => {
          expectNotLoaded(await served.loads(), ['./db.server'])
          expect(await settleInPage(served, 'module.impl()')).toEqual(
            serverOnlyError,
          )
          expect((await served.ssr()).impl()).toBe('server-only-value')
        },
      },
      {
        name: 'createClientOnlyFn',
        code: `import * as factory from './factory'
import { chart } from './chart.client'
export const impl = factory.clientOnly(() => chart())`,
        check: async (served) => {
          expectNotLoaded(await served.serverLoads(), ['./chart.client'])
          const ssr = await served.ssr()
          expect(settle(() => ssr.impl())).toEqual(clientOnlyError)
          expect(await inPage(served, 'return module.impl()')).toBe(
            'client-only-value',
          )
        },
      },
    ]

    /** Serves `code` (both environments evaluate it) and checks `call`. */
    async function expectEnvOnly(call: EnvOnlyCall, code: string) {
      const served = await serveCase(await host(), {
        'module.tsx': code,
        ...files,
      })
      await call.check(served)
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
  // renders the fallback only, without loading the modules only the
  // children use; the client keeps the children and renders them.
  describe('<ClientOnly>', () => {
    const router = `@tanstack/${framework}-router`
    const chartFile = {
      'chart.client.tsx': `export const Chart = () => '<chart>'\n`,
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
      const served = await serveCase(await host(), {
        'module.tsx': code,
        ...chartFile,
        ...renderFiles[framework],
      })
      expectNotLoaded(await served.serverLoads(), ['./chart.client'])
      // The client keeps the children's module.
      expect(await served.loads()).toContain('./chart.client')
      if (!renderFiles[framework]) {
        return
      }
      // The real renderers: the server renders the fallback, the client the
      // children.
      const { html } = await served.ssr('render.server.tsx')
      const ssrHtml = html() as string
      expect(ssrHtml).toContain('loading')
      expect(ssrHtml).not.toContain('chart')
      expect(
        await inPage(
          served,
          `const container = module.mount()
for (let i = 0; i < 200 && !container.textContent.includes('<chart>'); i++) {
  await new Promise((resolve) => setTimeout(resolve, 10))
}
const text = container.textContent
container.remove()
return text`,
          { file: 'render.client.tsx' },
        ),
      ).toContain('<chart>')
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
    // Impact: the SSR environment keeps the children and the client-only
    // modules they import: browser-only code runs during SSR.
    // Source: gap CO4 (gaps/start-env.md), N1 import-forms table.
    test.fails('through a namespace member', async () => {
      await checkBoundary(
        `import * as Router from '${router}'`,
        'Router.ClientOnly',
      )
    })
  })
})
