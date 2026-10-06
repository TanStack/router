import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRouterCodeSplitterPlugin } from '../src/core/router-code-splitter-plugin'
import { createRouterHmrPlugin } from '../src/core/router-hmr-plugin'
import { createRouterPluginContext } from '../src/core/router-plugin-context'
import { normalizePath } from '../src/core/utils'
import { getModuleErrors } from './validate-module'
import type { Config } from '../src/core/config'
import type { TransformResult, UnpluginOptions } from 'unplugin'

const referencePluginName =
  'tanstack-router:code-splitter:compile-reference-file'
const virtualPluginName = 'tanstack-router:code-splitter:compile-virtual-file'
const sharedPluginName = 'tanstack-router:code-splitter:compile-shared-file'

function routeFile(name: string) {
  return normalizePath(path.join(process.cwd(), `src/routes/${name}.tsx`))
}

function getCode(result: TransformResult | null | undefined) {
  if (!result) {
    return null
  }
  return typeof result === 'string' ? result : result.code
}

function runTransform(plugin: UnpluginOptions, code: string, id: string) {
  const transform = plugin.transform
  if (!transform || typeof transform === 'function') {
    throw new Error('Expected object transform')
  }
  return getCode(
    transform.handler.call({} as never, code, id) as
      | TransformResult
      | null
      | undefined,
  )
}

/** Drives the three code-splitter transforms the way a bundler does. */
async function createSplitter(
  options: Partial<Config>,
  routes: Record<string, string>,
) {
  const context = createRouterPluginContext()
  for (const [file, routeId] of Object.entries(routes)) {
    context.routesByFile.set(file, { routeId })
  }
  const plugins = createRouterCodeSplitterPlugin(
    { target: 'react', autoCodeSplitting: true, ...options },
    context,
  )
  const pluginArray = Array.isArray(plugins) ? plugins : [plugins]
  const byName = (name: string) => {
    const plugin = pluginArray.find((candidate) => candidate.name === name)
    if (!plugin) {
      throw new Error(`Code-splitter plugin "${name}" not found`)
    }
    return plugin
  }
  const hook = byName(referencePluginName).vite?.configResolved
  const config = {
    root: process.cwd(),
    command: 'build',
    plugins: [{ name: referencePluginName }],
  } as never
  if (typeof hook === 'function') {
    await hook.call({} as never, config)
  } else if (hook) {
    await hook.handler.call({} as never, config)
  }
  return {
    reference: (code: string, id: string) =>
      runTransform(byName(referencePluginName), code, id),
    virtual: (code: string, id: string) =>
      runTransform(byName(virtualPluginName), code, id),
    shared: (code: string, id: string) =>
      runTransform(byName(sharedPluginName), code, id),
  }
}

const routeSource = (name: string) => `
import { createFileRoute } from '@tanstack/react-router'
const state = { name: ${JSON.stringify(name)} }
export const Route = createFileRoute('/${name}')({
  loader: () => state,
  head: () => ({ meta: [{ title: state.name }] }),
  component: () => <p>{state.name}</p>,
  errorComponent: () => <p>error in ${name}</p>,
})
`

describe('code-splitter plugin pipeline', () => {
  it('compiles a split module the same way when its id has extra query parameters', async () => {
    const file = routeFile('query')
    const code = routeSource('query')
    const splitter = await createSplitter({}, { [file]: '/query' })
    const reference = splitter.reference(code, file)
    expect(reference).toContain('tsr-split=component')

    const virtual = splitter.virtual(code, `${file}?tsr-split=component`)
    expect(virtual).toContain('state.name')
    expect(splitter.virtual(code, `${file}?tsr-split=component&t=123`)).toBe(
      virtual,
    )
    expect(splitter.virtual(code, `${file}?t=123&tsr-split=component`)).toBe(
      virtual,
    )
    expect(splitter.shared(code, `${file}?tsr-shared=1&t=123`)).toBe(
      splitter.shared(code, `${file}?tsr-shared=1`),
    )
  })

  it('recompiles a route identically after many other routes were compiled', async () => {
    const names = Array.from({ length: 140 }, (_, index) => `route${index}`)
    const splitter = await createSplitter(
      {},
      Object.fromEntries(names.map((name) => [routeFile(name), `/${name}`])),
    )
    const compileAll = (name: string) => {
      const file = routeFile(name)
      const code = routeSource(name)
      return {
        reference: splitter.reference(code, file),
        component: splitter.virtual(code, `${file}?tsr-split=component`),
        errorComponent: splitter.virtual(
          code,
          `${file}?tsr-split=errorComponent`,
        ),
        shared: splitter.shared(code, `${file}?tsr-shared=1`),
      }
    }
    const first = compileAll('route0')
    expect(first.shared).toContain('"route0"')
    expect(first.errorComponent).toContain('error in route0')
    for (const name of names.slice(1)) {
      compileAll(name)
    }
    expect(compileAll('route0')).toEqual(first)
  })

  it('splits by the plugin-level splitBehavior for the route id', async () => {
    const file = routeFile('behavior')
    const code = routeSource('behavior')
    const splitter = await createSplitter(
      {
        codeSplittingOptions: {
          splitBehavior: ({ routeId }) =>
            routeId === '/behavior'
              ? [['loader', 'component', 'errorComponent']]
              : undefined,
        },
      },
      { [file]: '/behavior' },
    )
    const reference = splitter.reference(code, file)!
    expect(reference).toContain('tsr-split=component---errorComponent---loader')
    expect(reference).not.toMatch(/tsr-split=component["']/)
    const virtual = splitter.virtual(
      code,
      `${file}?tsr-split=component---errorComponent---loader`,
    )!
    expect(virtual).toContain('error in behavior')
    expect(await getModuleErrors(virtual)).toEqual([])
  })

  it('rejects invalid splitBehavior groupings', async () => {
    const file = routeFile('invalid')
    const splitter = await createSplitter(
      {
        codeSplittingOptions: {
          splitBehavior: () => [['component'], ['component']],
        },
      },
      { [file]: '/invalid' },
    )
    expect(() => splitter.reference(routeSource('invalid'), file)).toThrow(
      'The groupings returned when using `splitBehavior` for the route',
    )
  })

  it('deletes the configured route options from the reference module', async () => {
    const file = routeFile('deleted')
    const splitter = await createSplitter(
      { codeSplittingOptions: { deleteNodes: ['head'] } },
      { [file]: '/deleted' },
    )
    const reference = splitter.reference(routeSource('deleted'), file)!
    expect(reference).not.toContain('head')
    expect(reference).toContain('loader')
  })

  it('reports a split module id without a split value', async () => {
    const file = routeFile('missing')
    const splitter = await createSplitter({}, { [file]: '/missing' })
    expect(() =>
      splitter.virtual(routeSource('missing'), `${file}?tsr-split=`),
    ).toThrow('The split value for the virtual route')
  })

  it('leaves a shared module id alone when its route has no shared bindings', async () => {
    const file = routeFile('unshared')
    const code = `
import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/unshared')({
  component: () => <p>unshared</p>,
})
`
    const splitter = await createSplitter({}, { [file]: '/unshared' })
    expect(splitter.reference(code, file)).toContain('tsr-split=component')
    expect(splitter.shared(code, `${file}?tsr-shared=1`)).toBeNull()
  })
})

describe('route HMR plugin without code splitting', () => {
  const file = routeFile('hmr')
  const code = `
import { createFileRoute } from '@tanstack/solid-router'
export const Route = createFileRoute('/hmr')({
  component: () => <p>hmr</p>,
})
`
  function transformWith(options: Partial<Config>) {
    const context = createRouterPluginContext()
    context.routesByFile.set(file, { routeId: '/hmr' })
    const plugin = createRouterHmrPlugin(options, context)
    return runTransform(plugin as UnpluginOptions, code, file)
  }

  it.each(['solid', 'vue'] as const)(
    'appends Vite HMR handling to %s routes without changing them',
    async (target) => {
      const output = transformWith({ target })!
      expect(output).toContain('import.meta.hot')
      expect(output).toContain('"/hmr"')
      expect(output).toContain('<p>hmr</p>')
      expect(output).not.toContain('TSRComponent')
      expect(await getModuleErrors(output)).toEqual([])
    },
  )

  it('uses webpack HMR with the generated route id for non-React routes', async () => {
    const output = transformWith({
      target: 'solid',
      plugin: { hmr: { style: 'webpack' } },
    })!
    expect(output).toContain('import.meta.webpackHot')
    expect(output).not.toContain('import.meta.hot.')
    expect(output).toContain('"/hmr"')
    expect(output).not.toContain('__react_refresh_utils__')
    expect(await getModuleErrors(output)).toEqual([])
  })
})
