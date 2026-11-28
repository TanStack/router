import { describe, expect, it, vi } from 'vitest'
import {
  compileRouteModules,
  expectValidModules,
  head,
} from './regression-helpers'
import type * as RouterUtils from '@tanstack/router-utils'

// `findReferencedIdentifiers` comes from babel-dead-code-elimination, which
// can resolve its own copy of @babel/traverse (pnpm installs two when the
// versions differ). The compiler's later `babel.traverse` then cannot reuse
// the scope that pass cached. Clearing the cache after the pass behaves the
// same way in a single-copy install.
vi.mock('@tanstack/router-utils', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterUtils>()
  const { traverse } = await import('@babel/core')
  return {
    ...actual,
    findReferencedIdentifiers: (
      ...args: Parameters<typeof actual.findReferencedIdentifiers>
    ) => {
      const refs = actual.findReferencedIdentifiers(...args)
      traverse.cache.clear()
      return refs
    },
  }
})

describe('a split route option whose value is a shared binding', () => {
  it.each(['notFoundComponent', 'errorComponent'])(
    'exports the shared import as %s',
    async (option) => {
      const { modules, sharedBindings } = compileRouteModules(`${head}
export const Route = createFileRoute('/posts/$id')({
  component: PostRoute,
  ${option}: Fallback,
})

function Fallback() {
  return <p>Fallback</p>
}

function PostRoute() {
  const post = usePost()
  if (!post) return <Fallback />
  return <p>{post.title}</p>
}

declare function usePost(): { title: string } | undefined
`)

      expect(sharedBindings).toEqual(['Fallback'])
      expect(modules[`virtual ${option}`]).toContain(
        `export { Fallback as ${option} }`,
      )
      await expectValidModules(modules)
    },
  )
})
