import { transformWithOxc } from 'vite'
import { describe, expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'
import { declarationOf, getModuleErrors } from './validate-module'

// TypeScript erases type positions, so a declaration whose binding only appears
// in a type is still live JavaScript: its initializer runs once at import time.
const typeOnlyReferencedCode = [
  {
    name: 'a registration whose result only types a parameter',
    sideEffect: /registerAnalytics\(\s*['"]posts['"]\s*\)/,
    declared: ['analytics'],
    imported: './analytics',
    code: `import { createServerFn } from '@tanstack/react-start'
import { registerAnalytics } from './analytics'
const analytics = registerAnalytics('posts')
type Analytics = typeof analytics
export function describeClient(client?: Analytics) {
  return client ? 'custom' : 'default'
}
export const getPosts = createServerFn().handler(async () => [])`,
  },
  {
    name: 'a store only referenced by a global augmentation',
    sideEffect: /createStore\(\s*\{\s*persist:\s*true\s*\}\s*\)/,
    declared: ['store'],
    imported: './store',
    code: `import { createIsomorphicFn } from '@tanstack/react-start'
import { createStore } from './store'
const store = createStore({ persist: true })
declare global {
  interface Window {
    appStore?: typeof store
  }
}
export const getKind = createIsomorphicFn()
  .server(() => 'server')
  .client(() => 'client')`,
  },
]

describe('Start compiler keeps declarations only referenced from types', () => {
  describe.each(['client', 'server'] as const)('%s', (env) => {
    test.each(typeOnlyReferencedCode)(
      '$name',
      async ({ code, sideEffect, declared, imported }) => {
        const output = await compileStartModule({ env, code })
        expect(output).toMatch(sideEffect)
        for (const name of declared) {
          expect(output).toMatch(declarationOf(name))
        }
        expect(output).toContain(imported)
        expect(await getModuleErrors(output!)).toEqual([])
      },
    )
  })

  test('in the server function provider module', async () => {
    const { code, sideEffect } = typeOnlyReferencedCode[0]!
    const output = await compileStartModule({
      env: 'server',
      code,
      provider: true,
    })
    expect(output).toMatch(sideEffect)
  })
})

describe('Start compiler accepts TypeScript type and value exports sharing a name', () => {
  const code = `import { createServerFn } from '@tanstack/react-start'
export type User = { id: string; name: string }
function User(id: string, name: string): User {
  return { id, name }
}
export { User }
export const getUser = createServerFn().handler(async () => User('1', 'Ada'))`

  test.each(['client', 'server'] as const)('%s', async (env) => {
    const output = await compileStartModule({ env, code })
    expect(output).toMatch(/export \{ User \}/)
    expect(output).toMatch(declarationOf('getUser'))
    expect(await getModuleErrors(output!)).toEqual([])
  })

  test('in the server function provider module', async () => {
    const output = await compileStartModule({
      env: 'server',
      code,
      provider: true,
    })
    expect(output).toContain('createServerRpc')
    expect(await getModuleErrors(output!)).toEqual([])
  })
})

describe('Start compiler output with the classic JSX runtime', () => {
  // With `jsx: "react"` (classic runtime) JSX compiles to React.createElement,
  // so a React import that the TypeScript source only uses for types is needed.
  test.each(['client', 'server'] as const)(
    'keeps the React import a %s module needs for JSX',
    async (env) => {
      const output = await compileStartModule({
        env,
        code: `import * as React from 'react'
import { createServerFn } from '@tanstack/react-start'
export const getGreeting = createServerFn().handler(async () => 'hi')
export function Greeting({ children }: { children: React.ReactNode }) {
  return <p>{children}</p>
}`,
      })
      const { code } = await transformWithOxc(output!, 'module.tsx', {
        jsx: { runtime: 'classic' },
      })
      expect(code).toContain('React.createElement')
      expect(code).toMatch(/import \* as React from ['"]react['"]/)
    },
  )
})
