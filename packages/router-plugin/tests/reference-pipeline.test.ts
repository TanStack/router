import { readFile } from 'node:fs/promises'
import path from 'node:path'
import * as t from '@babel/types'
import { describe, expect, it, vi } from 'vitest'
import { parseAst } from '@tanstack/router-utils'
import {
  compileCodeSplitReferenceRoute,
  compileCodeSplitSharedRoute,
  compileCodeSplitVirtualRoute,
  computeSharedBindingsFromAst,
  detectCodeSplitGroupingsFromAst,
} from '../src/core/code-splitter/compilers'
import { getFrameworkHmrCompilerPlugins } from '../src/core/code-splitter/plugins/framework-plugins'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import type { Config } from '../src/core/config'
import type { CodeSplitCompilerPlugin } from '../src/core/code-splitter/plugins'
import type { CodeSplitGroupings } from '../src/core/constants'

vi.mock('@tanstack/router-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/router-utils')>()
  return { ...actual, parseAst: vi.fn(actual.parseAst) }
})

async function createHarness(
  options: Partial<Config> = {},
  command: 'serve' | 'build' = 'serve',
  extension: 'ts' | 'tsx' = 'tsx',
) {
  const filename = normalizePath(
    path.resolve(`src/routes/pipeline.${extension}`),
  )
  const context = createRouterPluginContext()
  context.routesByFile.set(filename, { routeId: '/pipeline' })
  const result = createRouterCodeSplitterPlugin(options, context)
  const plugins = Array.isArray(result) ? result : [result]
  const reference = plugins[0]!
  const hook = reference.vite!.configResolved!
  const config = {
    root: process.cwd(),
    command,
    plugins: [{ name: reference.name }],
  } as never
  if (typeof hook === 'function') {
    await hook.call({} as never, config)
  } else {
    await hook.handler.call({} as never, config)
  }

  return {
    filename,
    transform(code: string, query = '') {
      const plugin = query.startsWith('?tsr-shared')
        ? plugins[2]!
        : query
          ? plugins[1]!
          : reference
      const transform = plugin.transform!
      if (typeof transform === 'function') {
        throw new Error('Expected object transform')
      }
      return transform.handler.call({} as never, code, `${filename}${query}`)
    },
  }
}

describe('reference pipeline', () => {
  it('parses the reference source once per transform', async () => {
    const harness = await createHarness({}, 'build')
    const code = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/pipeline')({ component: () => <div /> })`
    vi.mocked(parseAst).mockClear()
    await harness.transform(code)
    expect(parseAst).toHaveBeenCalledTimes(1)
  })

  it('parses once with identifier options and shared destructured bindings', async () => {
    const onRouteOptions = vi.fn()
    const harness = await createHarness(
      {
        codeSplittingOptions: {
          compilerPlugins: [{ name: 'observe-sharing', onRouteOptions }],
        },
      },
      'build',
    )
    const code = await readFile(
      new URL(
        './code-splitter/test-files/react/shared-identifier-options.tsx',
        import.meta.url,
      ),
      'utf8',
    )
    vi.mocked(parseAst).mockClear()
    await harness.transform(code)
    expect(parseAst).toHaveBeenCalledTimes(1)
    expect(onRouteOptions).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        opts: expect.objectContaining({
          sharedBindings: new Set(['read', 'render', 'seed']),
        }),
      }),
    )
  })

  it('preserves filename-dependent TypeScript parsing', async () => {
    const harness = await createHarness({}, 'build', 'ts')
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const value = <string>'typescript'
export const Route = createFileRoute('/pipeline')({ loader: () => value, component: () => value })`
    const result = await harness.transform(code)
    expect(result).toMatchObject({
      code: expect.stringContaining('tsr-shared=1'),
    })
  })

  it.each(['react', 'solid', 'vue'] as const)(
    'preserves %s compiler hooks, HMR and sourcemaps after analysis',
    async (targetFramework) => {
      const fixture = await readFile(
        new URL(
          './code-splitter/test-files/react/shared-identifier-options.tsx',
          import.meta.url,
        ),
        'utf8',
      )
      const code = fixture.replace(
        '@tanstack/react-router',
        `@tanstack/${targetFramework}-router`,
      )
      for (const hmrStyle of ['vite', 'webpack'] as const) {
        const observed: Array<Array<string>> = []
        const mutationPlugin: CodeSplitCompilerPlugin = {
          name: 'remove-loader-after-analysis',
          onRouteOptions({ routeOptions, opts }) {
            observed.push([...opts.sharedBindings!].sort())
            // Removing one consumer must not retroactively change sharing.
            routeOptions.properties = routeOptions.properties.filter(
              (prop) =>
                !(
                  t.isObjectProperty(prop) &&
                  t.isIdentifier(prop.key, { name: 'loader' })
                ),
            )
            return { modified: true }
          },
        }
        const harness = await createHarness({
          target: targetFramework,
          plugin: { hmr: { style: hmrStyle } },
          codeSplittingOptions: { compilerPlugins: [mutationPlugin] },
        })
        const { filename } = harness
        const { groupings } = detectCodeSplitGroupingsFromAst(
          parseAst({
            code,
            filename,
          }),
        )
        const sharedBindings = computeSharedBindingsFromAst(
          parseAst({ code, filename }),
          groupings!,
        )
        const baseline = compileCodeSplitReferenceRoute({
          code,
          filename,
          id: filename,
          codeSplitGroupings: groupings!,
          targetFramework,
          sharedBindings,
          addHmr: true,
          hmrStyle,
          hmrRouteId: '/pipeline',
          compilerPlugins: [
            ...(getFrameworkHmrCompilerPlugins({
              targetFramework,
              hmrStyle,
            }) ?? []),
            mutationPlugin,
          ],
        })
        const candidate = await harness.transform(code)
        expect(candidate).toMatchObject({
          code: baseline!.code,
          map: baseline!.map,
        })
        expect(baseline!.map?.sourcesContent).toEqual([code])
        expect(observed).toEqual([
          ['read', 'render', 'seed'],
          ['read', 'render', 'seed'],
        ])
      }
    },
  )

  it.each(['serve', 'build'] as const)(
    'refreshes reference, virtual and shared output across source changes in %s',
    async (command) => {
      const harness = await createHarness(
        { codeSplittingOptions: { addHmr: false } },
        command,
      )
      for (const name of ['a', 'b', undefined, 'a']) {
        const code = `
import { createFileRoute } from '@tanstack/react-router'
${name ? `const ${name} = { value: '${name}' }` : ''}
export const Route = createFileRoute('/pipeline')({
  loader: () => ${name ? `${name}.value` : "'none'"},
  component: () => <div>{${name ? `${name}.value` : "'none'"}}</div>,
})`
        const { filename } = harness
        const sharedBindings = computeSharedBindingsFromAst(
          parseAst({ code, filename }),
          defaultCodeSplitGroupings,
        )
        expect([...sharedBindings]).toEqual(name ? [name] : [])
        const reference = compileCodeSplitReferenceRoute({
          code,
          filename,
          id: filename,
          targetFramework: 'react',
          codeSplitGroupings: defaultCodeSplitGroupings,
          sharedBindings,
          addHmr: false,
        })!
        const virtual = compileCodeSplitVirtualRoute({
          code,
          filename: `${filename}?tsr-split=component`,
          splitTargets: ['component'],
          sharedBindings,
        })
        for (const [query, expected] of [
          ['', reference],
          ['?tsr-split=component', virtual],
        ] as const) {
          expect(await harness.transform(code, query)).toMatchObject({
            code: expected.code,
            map: expected.map,
          })
          expect(expected.map?.sourcesContent).toEqual([code])
        }
        const shared = await harness.transform(code, '?tsr-shared=1')
        if (name) {
          const expected = compileCodeSplitSharedRoute({
            code,
            filename: `${filename}?tsr-shared=1`,
            sharedBindings,
          })
          expect(shared).toMatchObject({
            code: expected.code,
            map: expected.map,
          })
          expect(expected.map?.sourcesContent).toEqual([code])
          expect(expected.code).toContain(`export { ${name} }`)
        } else {
          expect(shared).toBeNull()
        }
      }
    },
  )

  it('preserves scope-aware mutations and binding inspection across compiler hooks', async () => {
    const observations: Array<Array<string>> = []
    const compilerPlugins: Array<CodeSplitCompilerPlugin> = [
      {
        name: 'rename-and-insert',
        onRouteOptions({ programPath, insertionPath }) {
          programPath.scope.rename('message', 'renamedMessage')
          insertionPath.insertBefore(
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('injected'),
                t.identifier('renamedMessage'),
              ),
            ]),
          )
          programPath.scope.crawl()
          return { modified: true }
        },
      },
      {
        name: 'inspect-renamed-bindings',
        onRouteOptions({ programPath, routeOptions }) {
          expect(programPath.scope.hasBinding('message')).toBe(false)
          const renamed = programPath.scope.getBinding('renamedMessage')!
          const inserted = programPath.scope.getBinding('injected')!
          observations.push([
            renamed.identifier.name,
            inserted.identifier.name,
            ...renamed.referencePaths.map((reference) => {
              t.assertIdentifier(reference.node)
              return reference.node.name
            }),
          ])
          routeOptions.properties.push(
            t.objectProperty(
              t.identifier('context'),
              t.arrowFunctionExpression([], t.identifier('injected')),
            ),
          )
          programPath.scope.crawl()
          expect(programPath.scope.getBinding('injected')!.referenced).toBe(
            true,
          )
          return { modified: true }
        },
      },
    ]
    const harness = await createHarness(
      { codeSplittingOptions: { compilerPlugins } },
      'build',
    )
    const code = `
import { createFileRoute } from '@tanstack/react-router'
const message = 'scope-visible'
const options = { loader: () => message, component: () => <div>page</div> }
export const Route = createFileRoute('/pipeline')(options)`
    const baseline = compileCodeSplitReferenceRoute({
      code,
      filename: harness.filename,
      id: harness.filename,
      codeSplitGroupings: defaultCodeSplitGroupings,
      targetFramework: 'react',
      compilerPlugins,
    })!
    const candidate = await harness.transform(code)
    expect(candidate).toMatchObject({ code: baseline.code, map: baseline.map })
    expect(baseline.code).toContain('const injected = renamedMessage')
    expect(baseline.code).toContain('context: () => injected')
    expect(observations).toHaveLength(2)
    expect(observations[1]).toEqual(observations[0])
  })

  it('preserves Start client deletion, shared extraction and server-only import DCE', async () => {
    // The client router integration in both Vite and Rsbuild uses these keys.
    const deleteNodes = ['ssr', 'server', 'headers']
    const harness = await createHarness(
      { codeSplittingOptions: { deleteNodes } },
      'build',
    )
    const code = `
import { createFileRoute } from '@tanstack/react-router'
import { serverPolicy, handleRequest, makeHeaders } from './server-only'
const shared = { title: 'client-visible' }
export const Route = createFileRoute('/pipeline')({
  ssr: () => serverPolicy(),
  server: { handlers: { GET: () => handleRequest() } },
  headers: () => makeHeaders(),
  loader: () => shared.title,
  component: () => <div>{shared.title}</div>,
})`
    const sharedBindings = computeSharedBindingsFromAst(
      parseAst({ code, filename: harness.filename }),
      defaultCodeSplitGroupings,
    )
    expect([...sharedBindings]).toEqual(['shared'])
    const baseline = compileCodeSplitReferenceRoute({
      code,
      filename: harness.filename,
      id: harness.filename,
      codeSplitGroupings: defaultCodeSplitGroupings,
      targetFramework: 'react',
      deleteNodes: new Set(deleteNodes),
      sharedBindings,
    })!
    expect(await harness.transform(code)).toMatchObject({
      code: baseline.code,
      map: baseline.map,
    })
    expect(baseline.code).not.toMatch(
      /server-only|serverPolicy|handleRequest|makeHeaders|ssr:|server:|headers:/,
    )
    expect(baseline.code).toContain('tsr-shared=1')
    expect(baseline.code).toContain('$$splitComponentImporter')
    expect(baseline.map?.sourcesContent).toEqual([code])
  })

  it.each([
    {
      sourceGroups: undefined,
      callbackGroups: undefined,
      expected: [['loader']],
    },
    {
      sourceGroups: undefined,
      callbackGroups: [['component']],
      expected: [['component']],
    },
    {
      sourceGroups: [['loader', 'component']],
      callbackGroups: [['component']],
      expected: [['loader', 'component']],
    },
    { sourceGroups: [], callbackGroups: [['component']], expected: [] },
  ] as Array<{
    sourceGroups?: CodeSplitGroupings
    callbackGroups?: CodeSplitGroupings
    expected: CodeSplitGroupings
  }>)(
    'preserves grouping precedence: $sourceGroups / $callbackGroups',
    async ({ sourceGroups, callbackGroups, expected }) => {
      const splitBehavior = vi.fn(() => callbackGroups)
      const harness = await createHarness({
        codeSplittingOptions: {
          addHmr: false,
          defaultBehavior: [['loader']],
          splitBehavior,
        },
      })
      const code = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/pipeline')({
  ${sourceGroups ? `codeSplitGroupings: ${JSON.stringify(sourceGroups)},` : ''}
  loader: () => 'data', component: () => <div>page</div>,
})`
      const baseline = compileCodeSplitReferenceRoute({
        code,
        filename: harness.filename,
        id: harness.filename,
        codeSplitGroupings: expected,
        targetFramework: 'react',
        addHmr: false,
      })
      const candidate = await harness.transform(code)
      if (baseline === null) {
        expect(candidate).toBeNull()
      } else {
        expect(candidate).toMatchObject({
          code: baseline.code,
          map: baseline.map,
        })
      }
      expect(splitBehavior).toHaveBeenCalledExactlyOnceWith({
        routeId: '/pipeline',
      })
    },
  )

  it('validates callback groups even when the source specifies groups', async () => {
    const onRouteOptions = vi.fn()
    const harness = await createHarness({
      codeSplittingOptions: {
        splitBehavior: () => [['invalid']] as unknown as CodeSplitGroupings,
        compilerPlugins: [{ name: 'observe', onRouteOptions }],
      },
    })
    const code = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/pipeline')({
  codeSplitGroupings: ${JSON.stringify(defaultCodeSplitGroupings)},
  component: () => <div>page</div>,
})`
    expect(() => harness.transform(code)).toThrow(
      'The groupings returned when using `splitBehavior`',
    )
    expect(onRouteOptions).not.toHaveBeenCalled()
  })
})
