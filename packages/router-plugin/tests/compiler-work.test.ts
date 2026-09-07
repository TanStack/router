import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import type { UnpluginBuildContext, UnpluginOptions } from 'unplugin'

const filename = normalizePath(path.resolve('src/routes/todos.tsx'))

async function createPlugins() {
  const context = createRouterPluginContext()
  context.routesByFile.set(filename, { routeId: '/todos' })
  const plugins = createRouterCodeSplitterPlugin(
    { target: 'react', autoCodeSplitting: true },
    context,
  ) as Array<UnpluginOptions>
  const hook = plugins[0]!.vite!.configResolved!
  const config = {
    root: process.cwd(),
    command: 'serve',
    plugins: [],
  } as never
  if (typeof hook === 'function') {
    await hook.call({} as never, config)
  } else {
    await hook.handler.call({} as never, config)
  }
  return plugins
}

async function transform(
  plugin: UnpluginOptions,
  code: string,
  id = filename,
  context: Partial<UnpluginBuildContext> = {},
) {
  const hook = plugin.transform!
  if (typeof hook === 'function') {
    throw new Error('Expected object transform')
  }
  const result = await hook.handler.call(context as never, code, id)
  if (typeof result === 'string') {
    throw new Error('Expected compiler result')
  }
  return result
}

function fixture(name: string) {
  return readFile(
    path.join(__dirname, 'code-splitter/test-files/react', name),
    'utf8',
  )
}

describe('reference transform output', () => {
  it.each(['shared-variable.tsx', 'inline.tsx', 'useStateDestructure.tsx'])(
    'transforms repeated and changed %s source consistently',
    async (name) => {
      const [reference] = await createPlugins()
      const code = await fixture(name)
      const updatedCode = code + '\nexport const updated = true'
      for (const source of [code, code, updatedCode]) {
        const result = await transform(reference!, source)
        expect(result?.code).toContain('createFileRoute(')
        const [freshReference] = await createPlugins()
        const freshResult = await transform(freshReference!, source)
        expect(result).toEqual(freshResult)
      }
    },
  )
})

describe('compiler source maps', () => {
  it.each(['webpack', 'rspack'] as const)(
    '%s preserves transformed code and incoming source maps',
    async (framework) => {
      const plugins = await createPlugins()
      const code = await fixture('shared-variable.tsx')
      for (const [index, suffix] of [
        '',
        '?tsr-split=component',
        '?tsr-shared=1',
      ].entries()) {
        const plugin = plugins[index]!
        const id = filename + suffix
        const baseline = await transform(plugin, code, id)
        expect(baseline).toBeTruthy()
        expect(baseline!.map).toMatchObject({
          sources: [id],
          sourcesContent: [code],
          mappings: expect.any(String),
        })
        for (const inputSourceMap of [undefined, null, baseline!.map]) {
          const result = await transform(plugin, code, id, {
            getNativeBuildContext: () =>
              ({
                framework,
                inputSourceMap,
              }) as ReturnType<
                NonNullable<UnpluginBuildContext['getNativeBuildContext']>
              >,
          })
          expect(result!.code).toBe(baseline!.code)
          if (inputSourceMap != null) {
            expect(result!.map).toEqual(baseline!.map)
          }
        }
      }
    },
  )
})
