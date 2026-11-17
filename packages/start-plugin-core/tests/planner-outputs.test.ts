/**
 * The Start planners on the compiler core, in process (not oracle: a fast
 * check of the output shapes of `start-env` and `rsc-css` on an in-memory
 * host, before the public Start host of the oracle tests exercises them).
 */
import { describe, expect, test } from 'vitest'
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '@tanstack/router-utils/compiler'
import { startRecognizer } from '../src/compiler/recognizer'
import { START_ENV, startPlanners } from '../src/planners'
import type { StartEnvConfig } from '../src/planners'
import type {
  CompileOutput,
  CompilerCaches,
  EnvInfo,
  HostServices,
} from '@tanstack/router-utils/compiler'

class Host implements HostServices {
  readonly rawFacts: RawFactsCache
  readonly caches: CompilerCaches
  constructor(readonly files: Record<string, string>) {
    this.rawFacts = new RawFactsCache({
      readFile: (p) => Promise.resolve(this.files[p] ?? null),
      loadVirtual: () => Promise.resolve(null),
      recognizer: startRecognizer(),
    })
    this.caches = createCompilerCaches(this.rawFacts)
  }
  resolve(specifier: string, importer: string) {
    if (!specifier.startsWith('.')) {
      return Promise.resolve(null)
    }
    const dir = importer.split('?')[0]!.replace(/\/[^/]*$/, '')
    const joined = `${dir}/${specifier}`.replace(/\/\.\//g, '/')
    for (const c of [joined, `${joined}.ts`, `${joined}.tsx`]) {
      if (c in this.files) {
        return Promise.resolve({ id: c })
      }
    }
    return Promise.resolve(null)
  }
  readFile(p: string) {
    return Promise.resolve(this.files[p] ?? null)
  }
  loadVirtual() {
    return Promise.resolve(null)
  }
}

type Env = 'client' | 'ssr' | 'ssr-caller' | 'rsc'

function envInfo(env: Env): EnvInfo {
  return {
    name: env === 'ssr-caller' ? 'ssr' : env,
    type: env === 'client' ? 'client' : 'server',
    isProvider: env === 'ssr' || env === 'rsc',
    mode: 'build',
  }
}

async function compile(
  files: Record<string, string>,
  env: Env,
  id = '/app/module.tsx',
  opts: Partial<StartEnvConfig> = {},
): Promise<CompileOutput | null> {
  const host = new Host(files)
  const config: StartEnvConfig = {
    framework: 'react',
    root: '/app',
    providerSeparate: env === 'ssr-caller' || env === 'rsc',
    idMode: 'default',
    ...opts,
  }
  return compileModule(
    {
      id,
      code: files[id.split('?')[0]!]!,
      env: envInfo(env),
      planners: startPlanners({ rscCss: env === 'rsc' }),
      config: {
        configKey: 'cfg',
        perPlanner: {
          [START_ENV]: config,
          'rsc-css': { loadCssExpression: 'import.meta.viteRsc.loadCss()' },
        },
      },
      wantMap: false,
    },
    host,
    host.caches,
  )
}

/** The client output's diagnostics of `code`: severity, the source text each is at, and the message. */
async function clientDiagnostics(code: string) {
  const out = (await compile({ '/app/module.tsx': code }, 'client'))!
  return out.diagnostics.map((d) => ({
    severity: d.severity,
    at: d.range!.start,
    text: code.slice(d.range!.start, d.range!.end),
    message: d.message,
  }))
}

const FLOW_PLACES =
  'passed to a function, stored in an object, an array, a class field or another variable, awaited, rendered…'

describe('start-env: escape messages name the shape and a fix that compiles', () => {
  const mwHead = `import { createClientOnlyFn, createIsomorphicFn, createMiddleware, createServerFn, createStart } from '@tanstack/react-start'
const a = createMiddleware({ type: 'function' }).server(({ next }) => next())
const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
`
  const openMiddlewareFix =
    "To attach its server code later, keep it in its own `const` (export it to share it) and call `.server(…)` on that `const`. Otherwise pass it to `.middleware([…])` or to `createStart`'s `functionMiddleware` / `requestMiddleware` directly (or in an unexported `const` array only they read), or end its chain with `.server(({ next }) => next())`."
  const openMiddleware = (name: string, places: string) =>
    `\`${name}\` is a middleware without \`.server()\`, used where the compiler cannot follow it (${places}), so the compiler cannot be sure no \`.server()\` is attached to it there, which would ship server code to the client. ${openMiddlewareFix}`

  test('an open middleware returned from an isomorphic implementation', async () => {
    const code = `${mwHead}const mws = createIsomorphicFn().server(() => [a, b]).client(() => [b])
export const startInstance = createStart(() => ({ functionMiddleware: mws() }))
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.lastIndexOf('[b]') + 1,
        text: 'b',
        message: openMiddleware(
          'b',
          'returned from an isomorphic implementation, whose calls the compiler does not follow',
        ),
      },
    ])
  })

  test('an open middleware composed of others, returned from an isomorphic implementation', async () => {
    const code = `${mwHead}const both = createMiddleware({ type: 'function' }).middleware([a, b])
const mws = createIsomorphicFn().server(() => [a, b]).client(() => [both])
export const startInstance = createStart(() => ({ functionMiddleware: mws() }))
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('[both]') + 1,
        text: 'both',
        message: openMiddleware(
          'both',
          'returned from an isomorphic implementation, whose calls the compiler does not follow',
        ),
      },
    ])
  })

  test('an open middleware returned from a `createClientOnlyFn` implementation', async () => {
    const code = `${mwHead}const mws = createClientOnlyFn(() => [b])
export const startInstance = createStart(() => ({ functionMiddleware: mws() }))
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.lastIndexOf('[b]') + 1,
        text: 'b',
        // (a `.server()` of its own compiles, but such a list reaching Start throws on the server)
        message:
          "`b` is a middleware without `.server()`, used where the compiler cannot follow it (returned from a `createClientOnlyFn` implementation, whose calls the compiler does not follow), so the compiler cannot be sure no `.server()` is attached to it there, which would ship server code to the client. `createClientOnlyFn` throws when called on the server, and Start reads middleware lists there too: pass the middleware to `.middleware([…])` or to `createStart`'s `functionMiddleware` / `requestMiddleware` directly (or in an unexported `const` array only they read).",
      },
    ])
  })

  test('an open middleware stored in an object', async () => {
    const code = `${mwHead}const cfg = { list: [b] }
export const fn = createServerFn().middleware(cfg.list).handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('[b]') + 1,
        text: 'b',
        message: openMiddleware('b', FLOW_PLACES),
      },
    ])
  })

  test('a middleware kept in an object, its server code attached later', async () => {
    const code = `${mwHead}const mws = { open: createMiddleware({ type: 'function' }) }
export const m = mws.open.server(({ next }) => next())
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf("createMiddleware({ type: 'function' }) }"),
        text: "createMiddleware({ type: 'function' })",
        message: `A middleware without \`.server()\` is used where the compiler cannot follow it (${FLOW_PLACES}), so the compiler cannot be sure no \`.server()\` is attached to it there, which would ship server code to the client. ${openMiddlewareFix}`,
      },
    ])
  })

  const isoHead = `import { createIsomorphicFn } from '@tanstack/react-start'
import { QueryCache } from 'some-lib'
`
  const keepsServerBehaviour =
    '`.server(() => undefined)` keeps what it does on the server now (without one, it returns `undefined` there).'
  const isoFnFlow = (subject: string) =>
    `${subject} where the compiler cannot follow it (${FLOW_PLACES}), so the compiler cannot be sure no \`.server()\` implementation is attached to it there, which would ship server code to the client. Give it one where it is defined: ${keepsServerBehaviour}`

  test('a client-only isomorphic fn passed to code the compiler does not see', async () => {
    const code = `${isoHead}export const cache = new QueryCache({ onError: createIsomorphicFn().client(() => 'client') })
const tick = createIsomorphicFn().client(() => 'tick')
setTimeout(tick, 0)
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('createIsomorphicFn().client('),
        text: "createIsomorphicFn().client(() => 'client')",
        message: isoFnFlow(
          'An isomorphic fn without a `.server()` implementation is used',
        ),
      },
      {
        severity: 'error',
        at: code.indexOf('tick, 0'),
        text: 'tick',
        message: isoFnFlow(
          '`tick` is an isomorphic fn without a `.server()` implementation, used',
        ),
      },
    ])
  })

  test('a client-only isomorphic fn returned from a function the compiler cannot summarise', async () => {
    const code = `${isoHead}export function pick(on: boolean) {
  if (on) { return createIsomorphicFn().client(() => 1) }
  return createIsomorphicFn().client(() => 2)
}
`
    const diagnostics = await clientDiagnostics(code)
    expect(diagnostics.map((d) => [d.severity, d.text])).toEqual([
      ['error', 'createIsomorphicFn().client(() => 1)'],
      ['error', 'createIsomorphicFn().client(() => 2)'],
    ])
    for (const d of diagnostics) {
      expect(d.message).toBe(
        `A function that returns a TanStack Start builder must return it from its single top-level \`return\` (or an arrow body) and must not be async, a generator, a method or a getter: the compiler cannot follow it otherwise, so server code attached to the builder would ship to the client. Split it into one factory per builder. Or give the isomorphic fn a \`.server()\` implementation where it is defined: ${keepsServerBehaviour}`,
      )
    }
  })

  test('an open middleware returned from a function the compiler cannot summarise', async () => {
    const code = `${mwHead}function makeB(on: boolean) {
  if (!on) { return createMiddleware({ type: 'function' }).client(({ next }) => next()) }
  return b
}
export const fn = createServerFn().middleware([makeB(true)]).handler(async () => 'x')
`
    const diagnostics = await clientDiagnostics(code)
    expect(diagnostics.map((d) => [d.severity, d.text])).toEqual([
      [
        'error',
        "createMiddleware({ type: 'function' }).client(({ next }) => next())",
      ],
      ['error', 'b'],
    ])
    for (const d of diagnostics) {
      expect(d.message).toBe(
        "A function that returns a TanStack Start builder must return it from its single top-level `return` (or an arrow body) and must not be async, a generator, a method or a getter: the compiler cannot follow it otherwise, so server code attached to the builder would ship to the client. Split it into one factory per builder. Or end the middleware's chain with `.server(({ next }) => next())`.",
      )
    }
  })
  const flowHead = `import { createIsomorphicFn, createMiddleware, createServerFn, createStart } from '@tanstack/react-start'
const register = (x: unknown) => x
`
  const where = `where the compiler cannot follow it (${FLOW_PLACES})`

  test('a server fn builder in a `const`, passed to a function', async () => {
    const code = `${flowHead}const base = createServerFn()
register(base)
export const fn = base.handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('base)'),
        text: 'base',
        message: `\`base\` is a server fn builder without \`.handler()\`, used ${where}, so a handler attached to it there would ship to the client. Keep the builder in its own \`const\` (export it to share it) and call \`.handler(…)\` on that \`const\` where you define each server function, or call \`.handler(…)\` before passing it on.`,
      },
    ])
  })

  test('a server fn builder created inside a call', async () => {
    const code = `${flowHead}export const fn = (register(createServerFn()) as any).handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('createServerFn()'),
        text: 'createServerFn()',
        message: `A server fn builder without \`.handler()\` is used ${where}, so a handler attached to it there would ship to the client. Keep the builder in its own \`const\` (export it to share it) and call \`.handler(…)\` on that \`const\` where you define each server function, or call \`.handler(…)\` before passing it on.`,
      },
    ])
  })

  test('a factory passed to a function', async () => {
    const code = `${flowHead}const make = (f: any) => f()
export const fn = make(createServerFn).handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('createServerFn)'),
        text: 'createServerFn',
        message: `\`createServerFn\` is a TanStack Start factory, used ${where}, so server code attached to what it creates there would ship to the client. Call it directly where you need what it creates: the compiler follows each call's chain, and the \`const\` holding it.`,
      },
    ])
  })

  test('a function returning a builder, passed to a function', async () => {
    const code = `${flowHead}const make = () => createServerFn()
register(make)
export const fn = make().handler(async () => 'x')
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('make)'),
        text: 'make',
        message: `\`make\` returns a server fn builder without \`.handler()\`, and is used ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`,
      },
    ])
  })

  test('an isomorphic fn returning an open middleware, passed to a function', async () => {
    const code = `${flowHead}const a = createMiddleware({ type: 'function' }).server(({ next }) => next())
const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
const mw = createIsomorphicFn().server(() => a).client(() => b)
register(mw)
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('mw)'),
        text: 'mw',
        message: `\`mw\` returns a middleware without \`.server()\`, and is used ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`,
      },
    ])
  })

  test("a builder's options passed on, written to, or their middleware list read", async () => {
    const code = `${flowHead}const base = createServerFn({ method: 'POST' })
export const method = base.options.method
const { validator } = base.options
register(base.options)
base.options.validator = (data: unknown) => data
export const mws = base.options.middleware
export const fn = base.handler(async () => validator)
`
    const options = (builder: string) =>
      `\`${builder}.options\` is used where the compiler cannot follow it (passed on, stored, written to, or its \`middleware\` list read), so server code attached to the builder through it would ship to the client. Read each option you need by name where you use it (\`${builder}.options.method\`).`
    expect(await clientDiagnostics(code)).toEqual(
      [
        'base.options)',
        'base.options.validator =',
        'base.options.middleware',
      ].map((needle) => ({
        severity: 'error',
        at: code.indexOf(needle),
        text: 'base.options',
        message: options('base'),
      })),
    )
  })

  test('a factory returned from a getter or a method', async () => {
    const code = `${flowHead}const own = { get make() { return createServerFn } }
const api = { make() { return createMiddleware } }
export const o = [own, api]
`
    const returned = (factory: string, from: string) =>
      `\`${factory}\` is a TanStack Start factory, returned from ${from}, whose result the compiler does not follow, so server code attached to what it creates would ship to the client. Call \`${factory}\` directly where you need what it creates, instead of returning it: the compiler follows each call's chain.`
    expect((await clientDiagnostics(code)).sort((a, b) => a.at - b.at)).toEqual(
      [
        {
          severity: 'error',
          at: code.indexOf('createServerFn }'),
          text: 'createServerFn',
          message: returned('createServerFn', 'a getter'),
        },
        {
          severity: 'error',
          at: code.indexOf('createMiddleware }'),
          text: 'createMiddleware',
          message: returned('createMiddleware', 'a method'),
        },
      ],
    )
  })

  test('a start instance passed to a function', async () => {
    const code = `${flowHead}const si = createStart(() => ({}))
register(si)
export const startInstance = si
`
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('si)'),
        text: 'si',
        message: `\`si\` is a start instance, used ${where}, so server code attached there to a middleware it creates would ship to the client. Call its \`.createMiddleware()\` directly where you need a middleware.`,
      },
    ])
  })
  test('the implementation of a `createClientOnlyFn` returning an open middleware', async () => {
    const code =
      `${flowHead}const b = createMiddleware({ type: 'function' }).client(({ next }) => next())
const mw = createClientOnlyFn(() => b)
export const startInstance = createStart(() => ({ functionMiddleware: [mw()] }))
`.replace('createIsomorphicFn,', 'createClientOnlyFn, createIsomorphicFn,')
    expect(await clientDiagnostics(code)).toEqual([
      {
        severity: 'error',
        at: code.indexOf('() => b'),
        text: '() => b',
        message: `A function returning a middleware without \`.server()\` is used ${where}, so server code attached to what it returns there would ship to the client. Call it directly where you use its result: the compiler follows a call of it like the value it returns.`,
      },
    ])
  })
})
