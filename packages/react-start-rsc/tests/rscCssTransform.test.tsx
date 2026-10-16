/**
 * @vitest-environment node
 */
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createDevServer } from '@tanstack/compiler-test-utils/dev-server'
import { createModuleGraph } from '@tanstack/compiler-test-utils/module-linker'
import { describe, expect, onTestFinished, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../start-plugin-core/src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../start-plugin-core/src/start-compiler/config'
import { startCompilerPlugin } from '../../start-plugin-core/src/vite/start-compiler-plugin/plugin'
import { createRscCssCompilerTransforms } from '../src/plugin/rscCssTransform'
import { configureRsc } from '../src/plugin/vite'
import { createRscCssEnvelope } from '../src/rscCssEnvelope'
import type { StartCompilerImportTransform } from '../../start-plugin-core/src/types'

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'

/**
 * Compiles `code` with the RSC CSS transforms like the Start plugin does for
 * the `rsc` environment (`env: 'server'`, the default) or for the client
 * (`env: 'client'`), in a build (default) or in dev. `warn` receives the
 * warnings the compiler and its transforms report; `compilerTransforms` are
 * added after the RSC CSS ones.
 */
async function compileWithRscCssTransform(opts: {
  code: string
  id?: string | undefined
  env?: 'client' | 'server' | undefined
  mode?: 'build' | 'dev' | undefined
  loadCssExpression?: string | undefined
  serverFnProviderOnly?: boolean | undefined
  warn?: ((message: string) => void) | undefined
  compilerTransforms?: Array<StartCompilerImportTransform> | undefined
}) {
  const env = opts.env ?? 'server'
  const compilerTransforms = [
    ...createRscCssCompilerTransforms({
      loadCssExpression:
        opts.loadCssExpression ?? 'import.meta.viteRsc.loadCss()',
      serverFnProviderOnly: opts.serverFnProviderOnly,
    }),
    ...(opts.compilerTransforms ?? []),
  ]

  const compiler = new StartCompiler({
    env,
    envName: env === 'client' ? 'client' : 'rsc',
    root: '/test',
    framework: 'react',
    providerEnvName: 'rsc',
    mode: opts.mode ?? 'build',
    lookupKinds: getLookupKindsForEnv(env, { compilerTransforms }),
    lookupConfigurations: getLookupConfigurationsForEnv(env, 'react', {
      compilerTransforms,
    }),
    compilerTransforms,
    getKnownServerFns: () => ({}),
    loadModule: async () => {},
    resolveId: async (id) => id,
  })

  const result = await compiler.compile({
    id: opts.id ?? '/test/src/route.tsx',
    code: opts.code,
    detectedKinds: detectKindsInCode(opts.code, env, {
      compilerTransforms,
    }),
    warn: opts.warn,
  })

  return result?.code ?? null
}

describe('compileWithRscCssTransform', () => {
  const code = `
    import { renderServerComponent } from '@tanstack/react-start/rsc'

    export const renderable = renderServerComponent(<Card />)
  `

  test('compiles for the rsc environment by default, and for the client with env', async () => {
    expect(await compileWithRscCssTransform({ code })).toContain('loadCss')
    expect(await compileWithRscCssTransform({ code, env: 'client' })).toBeNull()
  })

  test('warn receives the warnings of the compiler transforms', async () => {
    const warnings: Array<string> = []
    const warning: StartCompilerImportTransform = {
      name: 'warns',
      environment: 'server',
      imports: [
        {
          libName: '@tanstack/react-start/rsc',
          rootExport: 'renderServerComponent',
        },
      ],
      detect: /\brenderServerComponent\b/,
      transform: (_, context) => context.warn?.(`warned in ${context.id}`),
    }
    await compileWithRscCssTransform({
      code,
      compilerTransforms: [warning],
      warn: (message) => warnings.push(message),
    })
    expect(warnings).toEqual(['warned in /test/src/route.tsx'])
    await compileWithRscCssTransform({
      code,
      warn: (message) => warnings.push(message),
    })
    expect(warnings).toHaveLength(1)
  })
})

/** A call of a stubbed RSC render API. */
interface RenderCall {
  api: string
  args: Array<unknown>
}

/**
 * Compiles `code` with the RSC CSS transforms (see
 * `compileWithRscCssTransform`) and evaluates it as a real ES module: JSX
 * renders to text (`<>{css}<Card /></>` is `csscard`), the CSS loader returns
 * `css`, `Card`, `A` and `B` render `card`, `a` and `b`, `flag` is `true` and
 * `args` is `['x']`. The RSC render APIs (both `@tanstack/react-start/rsc`
 * and `@tanstack/react-start-rsc`) record their calls and return what the
 * runtime renders: `renderToReadableStream` its payload,
 * `renderServerComponent` (async) and `createCompositeComponent` their
 * argument in the CSS envelope of the runtime when they receive CSS. Returns
 * the module's namespace, the calls and the compiler warnings.
 */
async function evaluateCompiled(
  code: string,
  options: Omit<Parameters<typeof compileWithRscCssTransform>[0], 'code'> = {},
) {
  const id = options.id ?? '/test/src/route.tsx'
  const warnings: Array<string> = []
  const compiled = await compileWithRscCssTransform({
    ...options,
    code,
    id,
    warn: (message) => warnings.push(message),
  })
  const calls: Array<RenderCall> = []
  const record = (api: string, args: Array<unknown>) => {
    calls.push({ api, args })
  }
  const rsc = {
    renderToReadableStream: (...args: Array<unknown>) => {
      record('renderToReadableStream', args)
      return args[0]
    },
    renderServerComponent: async (...args: Array<any>) => {
      record('renderServerComponent', args)
      return createRscCssEnvelope(args[0], args[1])
    },
    createCompositeComponent: (...args: Array<any>) => {
      record('createCompositeComponent', args)
      return createRscCssEnvelope(args[0], args[1])
    },
  }
  const loadCss = { loadCss: () => 'css' }
  const graph = createModuleGraph({
    modules: { [id]: compiled ?? code },
    stubs: {
      '@tanstack/react-start/rsc': rsc,
      '@tanstack/react-start-rsc': rsc,
    },
    scope: () => ({
      Card: () => 'card',
      A: () => 'a',
      B: () => 'b',
      flag: true,
      args: ['x'],
    }),
    importMeta: () => ({ viteRsc: loadCss, rspackRsc: loadCss }),
  })
  return { module: await graph.import(id), calls, warnings }
}

/** `value` in the CSS envelope of the runtime, with the CSS `css`. */
const withCss = (value: unknown) =>
  createRscCssEnvelope(value, { __tanstackStartRscCss: 'css' })

describe('RSC CSS compiler transforms', () => {
  test('every supported render API receives the CSS of the module', async () => {
    const { module } = await evaluateCompiled(`
import {
  createCompositeComponent,
  renderServerComponent,
  renderToReadableStream,
} from '@tanstack/react-start/rsc'

export const renderable = renderServerComponent(<Card kind="renderable" />)
export const composite = createCompositeComponent(() => ({
  Card: <Card kind="composite" />,
}))
export const stream = renderToReadableStream(<Card kind="stream" />)
`)
    expect(await module.renderable).toEqual(withCss('card'))
    expect(module.composite).toEqual(withCss(expect.any(Function)))
    expect(module.stream).toBe('csscard')
  })

  const apis = [
    {
      api: 'renderServerComponent',
      call: (callee: string) => `await ${callee}(<Card />)`,
      expected: withCss('card'),
    },
    {
      api: 'createCompositeComponent',
      call: (callee: string) => `${callee}(() => <Card />)`,
      expected: withCss(expect.any(Function)),
    },
    {
      api: 'renderToReadableStream',
      call: (callee: string) => `${callee}(<Card />)`,
      expected: 'csscard',
    },
  ]
  const importForms = [
    {
      form: 'a named import',
      module: (api: string, from: string) =>
        `import { ${api} } from '${from}'\nexport const value = `,
      callee: (api: string) => api,
    },
    {
      form: 'a renamed import',
      module: (api: string, from: string) =>
        `import { ${api} as rsc } from '${from}'\nexport const value = `,
      callee: () => 'rsc',
    },
    {
      form: 'a namespace import',
      module: (_api: string, from: string) =>
        `import * as RSC from '${from}'\nexport const value = `,
      callee: (api: string) => `RSC.${api}`,
    },
  ]
  test.each(
    importForms.flatMap((form) =>
      ['@tanstack/react-start/rsc', '@tanstack/react-start-rsc'].flatMap(
        (from) => apis.map((api) => ({ ...form, ...api, from })),
      ),
    ),
  )(
    '$api through $form of $from receives the CSS',
    async ({ api, call, expected, module, callee, from }) => {
      const { module: evaluated } = await evaluateCompiled(
        module(api, from) + call(callee(api)),
      )
      expect(evaluated.value).toEqual(expected)
    },
  )

  test('honors provider-only transforms for Rsbuild', async () => {
    const source = `
      import { renderServerComponent } from '@tanstack/react-start/rsc'

      export const renderable = renderServerComponent(<Card />)
    `
    const options = {
      loadCssExpression: 'import.meta.rspackRsc.loadCss()',
      serverFnProviderOnly: true,
    }

    const caller = await evaluateCompiled(source, options)
    const provider = await evaluateCompiled(source, {
      ...options,
      id: `/test/src/route.tsx?${TSS_SERVERFN_SPLIT_PARAM}`,
    })

    expect(await caller.module.renderable).toBe('card')
    expect(await provider.module.renderable).toEqual(withCss('card'))
  })

  test('the client compile loads no CSS', async () => {
    const code = `
      import { renderServerComponent } from '@tanstack/react-start/rsc'
      export const renderable = renderServerComponent(<Card />)
    `
    const { module } = await evaluateCompiled(code, { env: 'client' })
    expect(await module.renderable).toBe('card')
    expect(await compileWithRscCssTransform({ code, env: 'client' })).toBeNull()
  })

  test.each([
    { wrapped: '(<Card />)' },
    { wrapped: '<Card /> as any' },
    { wrapped: '<Card />!' },
    { wrapped: '(<><Card /></>) satisfies unknown' },
  ])(
    'renderToReadableStream($wrapped) streams the CSS',
    async ({ wrapped }) => {
      const { module } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(${wrapped})
`)
      expect(module.stream).toBe('csscard')
    },
  )

  // Loosened: calls with arguments the transform does not handle are left as
  // they are (goals below).
  test('calls outside the transform constraints keep their arguments', async () => {
    const { module, calls } = await evaluateCompiled(`
import {
  renderServerComponent,
  renderToReadableStream,
} from '@tanstack/react-start/rsc'

const node = <Card />
export const existingOptions = renderServerComponent(<Card />, {
  alreadyConfigured: true,
})
export const nonJsxStream = renderToReadableStream(node)
export const conditional = renderToReadableStream(flag ? <A /> : <B />)
export const spread = renderToReadableStream(...args)
`)
    await module.existingOptions
    expect(
      calls.find((call) => call.api === 'renderServerComponent')?.args[1],
    ).toMatchObject({ alreadyConfigured: true })
    expect(module.nonJsxStream).toContain('card')
    expect(module.conditional).toContain('a')
    expect(module.spread).toBe('x')
    expect(
      calls.filter((call) => call.api === 'renderToReadableStream').at(-1)
        ?.args,
    ).toEqual(['x'])
  })

  // Bug: the transform skips `renderToReadableStream` calls with more than one
  // argument (rscCssTransform.ts `args.length !== 1`).
  // Impact: a stream rendered with options (e.g. `onError`) has no CSS, so its
  // styles never arrive.
  // Source: decision D8 (a).
  test.fails(
    'renderToReadableStream(<JSX />, options) streams the CSS and keeps the options',
    async () => {
      const { module, calls } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const options = { onError: () => {} }
export const stream = renderToReadableStream(<Card />, options)
`)
      expect(module.stream).toBe('csscard')
      expect(calls[0]!.args[1]).toBe(module.options)
    },
  )

  // Bug: the transform only wraps an argument that is JSX itself, not a
  // conditional or logical expression whose branches are all JSX, which is
  // as safe to wrap.
  // Impact: a stream of a conditionally chosen element has no CSS, so its
  // styles never arrive.
  // Source: decision D8 (b).
  test.fails.each([
    { argument: 'flag ? <A /> : <B />' },
    { argument: 'flag && <A />' },
  ])(
    'renderToReadableStream($argument) streams the CSS',
    async ({ argument }) => {
      const { module } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(${argument})
`)
      expect(module.stream).toBe('cssa')
    },
  )

  const unknownArguments = [
    {
      name: 'an identifier',
      code: `const node = <Card />\nexport const stream = renderToReadableStream(node)`,
    },
    {
      name: 'a spread',
      code: `export const stream = renderToReadableStream(...args)`,
    },
  ]

  // Bug: the transform silently skips a `renderToReadableStream` argument it
  // cannot see the JSX of (a variable, a spread).
  // Impact: the stream has no CSS, so its styles never arrive, and nothing
  // tells the developer.
  // Source: decision D8 (c): warn in dev only.
  test.fails.each(unknownArguments)(
    'dev: renderToReadableStream with $name warns',
    async ({ code }) => {
      const { warnings } = await evaluateCompiled(
        `import { renderToReadableStream } from '@tanstack/react-start/rsc'\n${code}`,
        { mode: 'dev' },
      )
      expect(warnings).toEqual([
        expect.stringContaining('renderToReadableStream'),
      ])
    },
  )

  test.each(unknownArguments)(
    'build: renderToReadableStream with $name does not warn',
    async ({ code }) => {
      const { warnings } = await evaluateCompiled(
        `import { renderToReadableStream } from '@tanstack/react-start/rsc'\n${code}`,
      )
      expect(warnings).toEqual([])
    },
  )

  // A plain-data model is skipped on purpose (its elements are not the
  // stream's root), without a warning.
  test('dev: renderToReadableStream with a plain-data model does not warn', async () => {
    const { module, warnings } = await evaluateCompiled(
      `import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream({ card: <Card /> })`,
      { mode: 'dev' },
    )
    expect(module.stream).toEqual({ card: 'card' })
    expect(warnings).toEqual([])
  })
})

// Which environments of a Vite dev server with the Start compiler plugin, set
// up like the RSC integration, load CSS: only the RSC environment.
test('dev server: only the RSC environment loads the CSS of a render call', async () => {
  const rsc = configureRsc()
  const server = await createDevServer({
    dir: path.dirname(fileURLToPath(import.meta.url)),
    prefix: '.rsc-css-dev-server-',
    registerCleanup: onTestFinished,
    files: {
      'node_modules/@tanstack/react-start/package.json': JSON.stringify({
        name: '@tanstack/react-start',
        type: 'module',
        exports: { './rsc': './rsc.js' },
      }),
      'node_modules/@tanstack/react-start/rsc.js': `export const renderServerComponent = async (node) => node\n`,
      'src/a.tsx': `import { renderServerComponent } from '@tanstack/react-start/rsc'
export const renderable = renderServerComponent(<div />)
`,
    },
    config: { environments: { rsc: { consumer: 'server' } } },
    plugins: [
      startCompilerPlugin({
        framework: 'react',
        environments: [
          { name: 'client', type: 'client' },
          { name: 'ssr', type: 'server' },
          { name: rsc.envName, type: 'server' },
        ],
        providerEnvName: rsc.envName,
        compilerTransforms: rsc.compilerTransforms,
      }),
    ],
  })
  const loadsCss = async (environment: string) =>
    (await server.transform('/src/a.tsx', environment)).includes('loadCss')
  expect({
    client: await loadsCss('client'),
    ssr: await loadsCss('ssr'),
    rsc: await loadsCss('rsc'),
  }).toEqual({ client: false, ssr: false, rsc: true })
}, 30_000)

// Each test asserts correct behaviour for a bug on main and is marked .fails;
// remove .fails when the bug is fixed.
describe('known bugs', () => {
  // Control for the pin below (same harness).
  test('renderToReadableStream renders the CSS before the JSX argument', async () => {
    const { module } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(<Card />)
`)
    expect(module.stream).toBe('csscard')
  })

  // Bug: a comment before the JSX argument of `renderToReadableStream` is
  // moved into the generated CSS fragment, where it becomes JSX text.
  // Impact: the comment is rendered into the RSC payload as visible text.
  test.fails.each([
    { name: 'a block comment', argument: `/* the card */ <Card />` },
    {
      name: 'a line comment',
      argument: `
  // the card
  <Card />,
`,
    },
  ])(
    'renderToReadableStream does not render $name before the JSX argument',
    async ({ argument }) => {
      const { module } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(${argument})
`)
      expect(module.stream).toBe('csscard')
    },
  )

  // Control for the pin below (same harness).
  test('renderServerComponent receives the CSS', async () => {
    const { module } = await evaluateCompiled(`
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const rendered = renderServerComponent(<Card />)
`)
    expect(await module.rendered).toEqual(withCss('card'))
  })

  // Bug: a call whose result is immediately member-called
  // (`renderServerComponent(...).then()`) is recorded as the inner call of a
  // method chain and never visited as a candidate itself. Same root cause as
  // the `createServerOnlyFn(...).bind()` pin in
  // start-plugin-core/tests/known-bugs-start-compiler.test.ts.
  // Impact: the server component renders without its CSS.
  test.fails(
    'renderServerComponent receives the CSS when its result is chained',
    async () => {
      const { module } = await evaluateCompiled(`
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const rendered = renderServerComponent(<Card />).then((value) => value)
`)
      expect(await module.rendered).toEqual(withCss('card'))
    },
  )
})
