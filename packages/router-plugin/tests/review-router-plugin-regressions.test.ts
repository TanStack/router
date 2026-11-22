/**
 * Failing regression tests for Critical, High & Medium bugs found during review
 * of PR #8817 in `@tanstack/router-plugin`.
 */
import { describe, expect, test } from 'vitest'
import { BuildError } from '@tanstack/compiler-test-utils/build-harness'
import { tanstackRouter as tanstackRouterEsbuild } from '../src/esbuild'
import { TanStackRouterCodeSplitterWebpack } from '../src/webpack'
import { build, routeApp } from './build-harness'
import { loadRoute } from './route-app'

const RP = '@tanstack/react-router'

describe('PR #8817 review regressions in @tanstack/router-plugin', () => {
  test('webpack host does not throw TypeError when compiler.options.cache is null', () => {
    const compilerPlugin = TanStackRouterCodeSplitterWebpack({
      target: 'react',
      autoCodeSplitting: true,
    })
    const fakeCompiler = {
      context: process.cwd(),
      options: {
        mode: 'development',
        target: 'web',
        cache: null,
        module: { rules: [] },
        watchOptions: {},
      },
      hooks: {
        beforeRun: { tap: () => {} },
        watchRun: { tap: () => {} },
        thisCompilation: { tap: () => {} },
        afterCompile: { tapAsync: () => {} },
        done: { tap: () => {} },
        watchClose: { tap: () => {} },
        shutdown: { tap: () => {} },
      },
    }
    expect(() => compilerPlugin.apply(fakeCompiler as any)).not.toThrow(
      TypeError,
    )
  })

  test('esbuild plugin refuses codeSplittingOptions.deleteNodes when autoCodeSplitting is false', () => {
    expect(() =>
      tanstackRouterEsbuild({
        target: 'react',
        autoCodeSplitting: false,
        codeSplittingOptions: { deleteNodes: ['server'] },
      }),
    ).toThrow()
  })

  test('splits the last (winning) duplicate component option instead of the dead first one', async () => {
    const route = await loadRoute(
      `import { createFileRoute } from '${RP}'
const Dead = () => 'MARK_DEAD'
export const Route = createFileRoute('/dup')({
  component: Dead,
  component: () => 'MARK_LIVE',
})
`,
      { routeId: '/dup' },
    )
    expect(await route.isLazy('component')).toBe(true)
    const rendered = await route.run<string>(`return await render('component')`)
    expect(rendered).toBe('MARK_LIVE')
  })

  test(
    'rejects a second createFileRoute call imported under a second alias',
    { timeout: 60_000 },
    async () => {
      const source = `import { createFileRoute, createFileRoute as cfr2 } from '${RP}'
export const Route = createFileRoute('/')({ component: () => <p>ok</p> })
export const extra = cfr2('/' as any)({ staticData: { x: 1 } })
`
      const failure = await build({
        bundler: 'vite',
        env: 'client',
        files: routeApp(source, { env: 'client' }),
      }).then(
        () => null,
        (error: unknown) => error,
      )
      expect(failure).toBeInstanceOf(BuildError)
    },
  )
})
