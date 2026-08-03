import { describe, expect, it } from 'vitest'
import { compileCodeSplitReferenceRoute } from '../../router-plugin/src/core/code-splitter/compilers'
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
