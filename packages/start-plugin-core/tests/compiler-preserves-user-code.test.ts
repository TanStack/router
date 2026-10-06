import { describe, expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'

// The compiler removes code that only served a transformed call. Declarations
// that merely reference themselves (or each other) are still live user code:
// their initializers run side effects and must survive.
const selfReferencingCode = [
  {
    name: 'a store subscription that unsubscribes itself',
    sideEffect: 'store.subscribe(',
    code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { store } from './store'
const unsubscribe = store.subscribe(() => {
  if (store.state.done) unsubscribe()
})
export const value = createIsomorphicFn().server(() => 1).client(() => 2)`,
  },
  {
    name: 'an interval that clears itself',
    sideEffect: 'setInterval(',
    code: `import { createServerFn } from '@tanstack/react-start'
let ticks = 0
const interval = setInterval(() => {
  ticks++
  if (ticks > 3) clearInterval(interval)
}, 1000)
export const fn = createServerFn().handler(async () => 1)`,
  },
  {
    name: 'mutually-referencing declarations',
    sideEffect: 'createPersister(',
    code: `import { createServerFn } from '@tanstack/react-start'
import { createPersister } from './persist'
const persister = createPersister({ onRestore: () => restore() })
function restore() {
  persister.restore()
}
export const fn = createServerFn().handler(async () => 1)`,
  },
  {
    name: 'a self-referencing local inside an exported function',
    sideEffect: 'new MutationObserver(',
    code: `import { createServerFn } from '@tanstack/react-start'
export function useObserver() {
  const observer = new MutationObserver(() => observer.disconnect())
  return 1
}
export const fn = createServerFn().handler(async () => 1)`,
  },
]

describe('Start compiler keeps self-referencing user code', () => {
  describe.each(['client', 'server'] as const)('%s', (env) => {
    test.each(selfReferencingCode)('$name', async ({ code, sideEffect }) => {
      const output = await compileStartModule({ env, code })
      expect(output).toContain(sideEffect)
    })
  })
})
