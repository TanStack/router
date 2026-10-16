import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import {
  StartCompiler,
  detectKindsInCode,
  getLookupKindsForEnv,
} from '../../start-plugin-core/src/start-compiler/compiler'
import { getLookupConfigurationsForEnv } from '../../start-plugin-core/src/start-compiler/config'
import { createRscCssCompilerTransforms } from '../src/plugin/rscCssTransform'
import type { StartCompilerImportTransform } from '../../start-plugin-core/src/types'

const TSS_SERVERFN_SPLIT_PARAM = 'tss-serverfn-split'

/**
 * Compiles `code` with the RSC CSS transforms like the Start plugin does for
 * the `rsc` environment (`env: 'server'`, the default) or for the client
 * (`env: 'client'`). `warn` receives the warnings the compiler and its
 * transforms report; `compilerTransforms` are added after the RSC CSS ones.
 */
async function compileWithRscCssTransform(opts: {
  code: string
  id?: string | undefined
  env?: 'client' | 'server' | undefined
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
    mode: 'build',
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

describe('RSC CSS compiler transforms', () => {
  test('injects Vite CSS resources into all supported RSC render APIs', async () => {
    const code = await compileWithRscCssTransform({
      code: `
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
      `,
    })

    expect(code).toMatchInlineSnapshot(`
      "import { createCompositeComponent, renderServerComponent, renderToReadableStream } from '@tanstack/react-start/rsc';
      export const renderable = renderServerComponent(<Card kind="renderable" />, {
        __tanstackStartRscCss: import.meta.viteRsc.loadCss()
      });
      export const composite = createCompositeComponent(() => ({
        Card: <Card kind="composite" />
      }), {
        __tanstackStartRscCss: import.meta.viteRsc.loadCss()
      });
      export const stream = renderToReadableStream(<>{import.meta.viteRsc.loadCss()}<Card kind="stream" /></>);"
    `)
  })

  test('does not rewrite calls outside the transform constraints', async () => {
    const code = await compileWithRscCssTransform({
      code: `
        import {
          renderServerComponent,
          renderToReadableStream,
        } from '@tanstack/react-start/rsc'

        const node = <Card />
        export const existingOptions = renderServerComponent(<Card />, {
          alreadyConfigured: true,
        })
        export const nonJsxStream = renderToReadableStream(node)
      `,
    })

    expect(code).toMatchInlineSnapshot(`
      "import { renderServerComponent, renderToReadableStream } from '@tanstack/react-start/rsc';
      const node = <Card />;
      export const existingOptions = renderServerComponent(<Card />, {
        alreadyConfigured: true
      });
      export const nonJsxStream = renderToReadableStream(node);"
    `)
  })

  test('honors provider-only transforms for Rsbuild', async () => {
    const source = `
      import { renderServerComponent } from '@tanstack/react-start/rsc'

      export const renderable = renderServerComponent(<Card />)
    `

    const callerCode = await compileWithRscCssTransform({
      code: source,
      loadCssExpression: 'import.meta.rspackRsc.loadCss()',
      serverFnProviderOnly: true,
    })

    const providerCode = await compileWithRscCssTransform({
      code: source,
      id: `/test/src/route.tsx?${TSS_SERVERFN_SPLIT_PARAM}`,
      loadCssExpression: 'import.meta.rspackRsc.loadCss()',
      serverFnProviderOnly: true,
    })

    expect({ callerCode, providerCode }).toMatchInlineSnapshot(`
      {
        "callerCode": "import { renderServerComponent } from '@tanstack/react-start/rsc';
      export const renderable = renderServerComponent(<Card />);",
        "providerCode": "import { renderServerComponent } from '@tanstack/react-start/rsc';
      export const renderable = renderServerComponent(<Card />, {
        __tanstackStartRscCss: import.meta.rspackRsc.loadCss()
      });",
      }
    `)
  })

  test('detects transform imports without enabling them outside server builds', () => {
    const compilerTransforms: Array<StartCompilerImportTransform> =
      createRscCssCompilerTransforms({
        loadCssExpression: 'import.meta.viteRsc.loadCss()',
      })

    const code = `
      import { renderServerComponent } from '@tanstack/react-start/rsc'
      export const renderable = renderServerComponent(<Card />)
    `

    expect(detectKindsInCode(code, 'server', { compilerTransforms }))
      .toMatchInlineSnapshot(`
      Set {
        "External:react-rsc-render-server-component-css",
      }
    `)
    expect(
      detectKindsInCode(code, 'client', { compilerTransforms }),
    ).toMatchInlineSnapshot(`Set {}`)
  })

  test('rewrites render APIs imported from @tanstack/react-start-rsc', async () => {
    const code = await compileWithRscCssTransform({
      code: `
        import { renderServerComponent } from '@tanstack/react-start-rsc'

        export const renderable = renderServerComponent(<Card />)
      `,
    })

    expect(code).toContain(
      '__tanstackStartRscCss: import.meta.viteRsc.loadCss()',
    )
  })

  test.each([
    { wrapped: '(<Card />)', bare: '<Card />' },
    { wrapped: '<Card /> as any', bare: '<Card />' },
    { wrapped: '<Card />!', bare: '<Card />' },
    { wrapped: '(<><Card /></>) satisfies unknown', bare: '<><Card /></>' },
  ])(
    'streams $wrapped like the bare JSX it wraps',
    async ({ wrapped, bare }) => {
      const compileStream = (element: string) =>
        compileWithRscCssTransform({
          code: `
            import { renderToReadableStream } from '@tanstack/react-start/rsc'

            export const stream = renderToReadableStream(${element})
          `,
        })

      const bareCode = await compileStream(bare)
      expect(bareCode).toContain('import.meta.viteRsc.loadCss()')
      expect(await compileStream(wrapped)).toBe(bareCode)
    },
  )

  test('does not stream JSX that is not the whole argument', async () => {
    const code = await compileWithRscCssTransform({
      code: `
        import { renderToReadableStream } from '@tanstack/react-start/rsc'

        export const conditional = renderToReadableStream(flag ? <A /> : <B />)
        export const spread = renderToReadableStream(...args)
      `,
    })

    expect(code).toContain('renderToReadableStream(...args)')
    expect(code).not.toContain('loadCss')
  })
})

// Each test asserts correct behaviour for a bug on main and is marked .fails;
// remove .fails when the bug is fixed.
describe('known bugs', () => {
  const dataUrl = (code: string) =>
    `data:text/javascript,${encodeURIComponent(code)}`

  /**
   * Compiles `code` with `loadCss()` as the CSS expression and evaluates it:
   * JSX becomes `{ type, children }` trees, components are called (`Card`
   * renders `card`) and the RSC render APIs return the arguments they are
   * called with (`renderServerComponent`, which is async, resolves to them).
   */
  async function evaluateCompiled(code: string) {
    const compiled = await compileWithRscCssTransform({
      code,
      loadCssExpression: 'loadCss()',
    })
    const { code: javascript } = await transformWithOxc(
      compiled ?? code,
      'route.tsx',
      { jsx: { runtime: 'classic', pragma: 'h', pragmaFrag: 'Fragment' } },
    )
    const rsc = dataUrl(`const args = (...values) => values
export const renderToReadableStream = args
export const renderServerComponent = async (...values) => values
export const createCompositeComponent = args`)
    const linked = javascript.replace(
      /(["'])@tanstack\/react-start\/rsc\1/,
      JSON.stringify(rsc),
    )
    return import(
      /* @vite-ignore */ dataUrl(`const Fragment = 'Fragment'
const h = (type, props, ...children) =>
  typeof type === 'function' ? type({ ...props, children }) : { type, children }
const loadCss = () => 'css'
const Card = () => 'card'
${linked}`)
    )
  }

  /** The text nodes of an evaluated element tree. */
  const texts = (node: unknown): Array<string> => {
    if (typeof node === 'string') {
      return [node]
    }
    if (Array.isArray(node)) {
      return node.flatMap(texts)
    }
    return texts((node as { children?: unknown } | null)?.children ?? [])
  }

  test('evaluateCompiled renders the CSS before the JSX argument', async () => {
    const { stream } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(<Card />)
`)
    expect(texts(stream)).toEqual(['css', 'card'])
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
      const { stream } = await evaluateCompiled(`
import { renderToReadableStream } from '@tanstack/react-start/rsc'
export const stream = renderToReadableStream(${argument})
`)
      expect(texts(stream)).toEqual(['css', 'card'])
    },
  )

  test('evaluateCompiled passes the CSS to renderServerComponent', async () => {
    const { rendered } = await evaluateCompiled(`
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const rendered = renderServerComponent(<Card />)
`)
    const [, options] = await rendered
    expect(options).toEqual({ __tanstackStartRscCss: 'css' })
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
      const { rendered } = await evaluateCompiled(`
import { renderServerComponent } from '@tanstack/react-start/rsc'
export const rendered = renderServerComponent(<Card />).then((value) => value)
`)
      const [, options] = await rendered
      expect(options).toEqual({ __tanstackStartRscCss: 'css' })
    },
  )
})
