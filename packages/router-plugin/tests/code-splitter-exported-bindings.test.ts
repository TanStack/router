import { describe, expect, it } from 'vitest'
import {
  compileCodeSplitVirtualRoute,
  computeSharedBindings,
} from '../src/core/code-splitter/compilers'
import { defaultCodeSplitGroupings } from '../src/core/constants'
import { declarationOf, getModuleErrors } from './validate-module'

const filename = 'route.tsx'

/** Compiles the default split chunk holding the route component. */
function compileComponentChunk(code: string) {
  const sharedBindings = computeSharedBindings({
    code,
    filename,
    codeSplitGroupings: defaultCodeSplitGroupings,
  })
  return compileCodeSplitVirtualRoute({
    code,
    filename: `${filename}?tsr-split=component`,
    splitTargets: ['component'],
    sharedBindings: sharedBindings.size > 0 ? sharedBindings : undefined,
  }).code
}

// Other modules import these bindings from the route file. A second
// initialization in the split chunk would be a different context or store
// instance, so the chunk must import the route module's binding, even when the
// binding is built from private objects or call results the chunk also reads.
describe('split chunks import exported route-file variables', () => {
  it.each([
    {
      name: 'a context created from a private object',
      exported: 'ThemeContext',
      code: `import { createContext, useContext } from 'react'
import { createFileRoute } from '@tanstack/react-router'
const config = { theme: 'light' }
export const ThemeContext = createContext(config)
function Page() {
  const value = useContext(ThemeContext)
  return <p>{value === config ? 'default' : value.theme}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    },
    {
      name: 'a store built from a private object',
      exported: 'store',
      code: `import { createFileRoute } from '@tanstack/react-router'
const defaults = { count: 0 }
export const store = { ...defaults }
function Page() {
  store.count++
  return <p>{store.count - defaults.count}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    },
    {
      name: 'a cache built from a private call result',
      exported: 'cache',
      code: `import { createFileRoute } from '@tanstack/react-router'
import { load } from './data'
const initial = load()
export const cache = new Map(initial)
function Page() {
  return <p>{cache.size === initial.length ? 'fresh' : 'changed'}</p>
}
export const Route = createFileRoute('/')({ component: Page })
`,
    },
  ])('imports $name', async ({ code, exported }) => {
    const chunk = compileComponentChunk(code)
    expect(chunk).not.toMatch(declarationOf(exported))
    expect(chunk).toMatch(
      new RegExp(String.raw`import \{[^}]*\b${exported}\b[^}]*\} from`),
    )
    expect(await getModuleErrors(chunk)).toEqual([])
  })
})
