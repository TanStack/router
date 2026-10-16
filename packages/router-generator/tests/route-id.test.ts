/** Controls of the shared `routeIdOf` helper (route-id.ts). */
import { describe, expect, test } from 'vitest'
import { evaluateRouteFile, routeIdOf } from './route-id'

describe('routeIdOf', () => {
  test.each(['react', 'solid', 'vue'])(
    'returns the id a %s route file creates its Route with',
    async (framework) => {
      expect(
        await routeIdOf(`import { createFileRoute } from '@tanstack/${framework}-router'
export const Route = createFileRoute('/posts/$id')({ component: () => null })`),
      ).toBe('/posts/$id')
    },
  )

  test('reads the id of a lazy file route', async () => {
    expect(
      await routeIdOf(`import { createLazyFileRoute } from '@tanstack/react-router'
export const Route = createLazyFileRoute('/lazy')({})`),
    ).toBe('/lazy')
  })

  test('fails on a module that does not evaluate', async () => {
    await expect(
      routeIdOf(`import { createFileRoute } from '@tanstack/react-router'
export const Route = createFileRoute('/a')({})
export const Route = 1`),
    ).rejects.toThrow()
    await expect(
      routeIdOf(`import { createFileRoute, Missing } from '@tanstack/react-router'
export const Route = createFileRoute('/a')({ component: Missing })`),
    ).rejects.toThrow()
  })

  test('evaluateRouteFile provides the other router exports it is given', async () => {
    const exports = await evaluateRouteFile(
      `import Router, { createFileRoute, Link } from '@tanstack/react-router'
export const used = [Router, Link]
export const Route = createFileRoute('/a')({})`,
      ['default', 'Link'],
    )
    expect(exports.used).toEqual(['default', 'Link'])
    expect(exports.Route.id).toBe('/a')
  })
})
