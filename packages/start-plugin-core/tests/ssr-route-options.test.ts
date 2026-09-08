import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitReferenceRoute,
  computeSharedBindings,
} from '../../router-plugin/src/core/code-splitter/compilers'
import {
  createSsrRouteOptionPruningPlugin,
  withSsrRouteOptionPruning,
} from '../src/start-router-plugin/ssr-route-options'
import type { CodeSplitCompilerPlugin } from '@tanstack/router-plugin'

type StaticSsrOption = true | false | 'data-only'

const optionNames = [
  'component',
  'loader',
  'beforeLoad',
  'pendingComponent',
  'errorComponent',
  'notFoundComponent',
  'head',
  'headers',
] as const

describe('SSR route option pruning', () => {
  it.each([
    [false, ['component', 'loader', 'beforeLoad']],
    ['data-only', ['component']],
    [undefined, []],
    [true, []],
  ] as const)(
    'removes server-unused options for %s routes',
    (usage, removed) => {
      const code = compile(usage)
      const removedOptions = new Set<string>(removed)

      optionNames.forEach((name) => {
        if (removedOptions.has(name)) {
          expect(code).not.toContain(`${name}-marker`)
        } else {
          expect(code).toContain(`${name}-marker`)
        }
      })
    },
  )

  it('removes dependencies used only by pruned route options', () => {
    const result = compileCodeSplitReferenceRoute({
      code: `
import { createFileRoute } from '@tanstack/react-router'
import { readFile, readdir } from 'node:fs/promises'
import { ClientOnlyComponent } from './client-only-component'

export const Route = createFileRoute('/client-only')({
  component: ClientOnlyComponent,
  beforeLoad: () => readFile('before-load'),
  loader: () => readdir('loader'),
  headers: () => ({ 'x-retained': 'true' }),
})
`,
      filename: 'client-only.tsx',
      id: 'client-only.tsx',
      addHmr: false,
      codeSplitGroupings: [],
      targetFramework: 'react',
      serverSsr: false,
      compilerPlugins: [createSsrRouteOptionPruningPlugin()],
    })

    expect(result?.code).toContain('x-retained')
    expect(result?.code).not.toContain('client-only-component')
    expect(result?.code).not.toContain('node:fs/promises')
  })

  it('preserves existing compiler plugins', () => {
    const existingPlugin: CodeSplitCompilerPlugin = { name: 'existing' }
    const existingOptions = {
      addHmr: true,
      compilerPlugins: [existingPlugin],
    }
    const options = withSsrRouteOptionPruning(existingOptions, {
      addHmr: false,
      deleteNodes: undefined,
    })

    expect(options.compilerPlugins.map((plugin) => plugin.name)).toEqual([
      'tanstack-start:ssr-route-option-pruning',
      'existing',
    ])
  })

  it.each([false, 'data-only'] as const)(
    'prunes %s options before generating split imports',
    (serverSsr) => {
      const code = `
import { createFileRoute } from '@tanstack/react-router'
const shared = () => 'shared-loader-component'
export const Route = createFileRoute('/client')({
  component: () => shared(),
  loader: () => shared(),
  pendingComponent: () => 'pending-retained',
  head: () => ({ meta: [{ title: 'head-retained' }] }),
})`
      const codeSplitGroupings = [['component'], ['loader']] as Array<
        Array<'component' | 'loader'>
      >
      const result = compileCodeSplitReferenceRoute({
        code,
        filename: 'client.tsx',
        id: 'client.tsx',
        addHmr: false,
        codeSplitGroupings,
        targetFramework: 'react',
        serverSsr,
        sharedBindings: computeSharedBindings({
          code,
          filename: 'client.tsx',
          codeSplitGroupings,
        }),
        compilerPlugins: [createSsrRouteOptionPruningPlugin()],
      })!
      expect(result.code).not.toContain('tsr-split=component')
      expect(result.code).toContain('pending-retained')
      expect(result.code).toContain('head-retained')
      if (serverSsr === false) {
        expect(result.code).not.toContain('tsr-split')
        expect(result.code).not.toContain('tsr-shared')
        expect(result.code).not.toContain('shared-loader-component')
      } else {
        expect(result.code).toContain('tsr-split=loader')
      }
    },
  )
})

function compile(serverSsr: StaticSsrOption | undefined) {
  const code = `
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/usage')({
  component: () => 'component-marker',
  loader: () => 'loader-marker',
  beforeLoad: () => 'beforeLoad-marker',
  pendingComponent: () => 'pendingComponent-marker',
  errorComponent: () => 'errorComponent-marker',
  notFoundComponent: () => 'notFoundComponent-marker',
  head: () => ({ meta: [{ title: 'head-marker' }] }),
  headers: () => ({ 'x-marker': 'headers-marker' }),
})
`
  const result = compileCodeSplitReferenceRoute({
    code,
    filename: 'usage.tsx',
    id: 'usage.tsx',
    addHmr: false,
    codeSplitGroupings: [],
    targetFramework: 'react',
    serverSsr,
    compilerPlugins: [createSsrRouteOptionPruningPlugin()],
  })

  return result?.code ?? code
}
