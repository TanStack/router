import { describe, expect, test } from 'vitest'
import { notFound } from '../src'
import { dehydrateMatch } from '../src/ssr/ssr-server'
import { hydrateSsrMatchId } from '../src/ssr/ssr-match-id'
import type { AnyRouteMatch } from '../src'

function normalizeCrawlerCandidate(id: string) {
  return id.replaceAll('\0', '/').replaceAll('\uFFFD', '/')
}

describe('SSR route id dehydration', () => {
  test('hides internal match ids and notFound route ids from slash-normalizing crawlers', () => {
    const routeId = '/_layout/posts/$postId'
    const matchId = `${routeId}/posts/1`
    const dehydratedMatch = dehydrateMatch({
      id: matchId,
      routeId,
      updatedAt: 1,
      status: 'notFound',
      error: notFound({ routeId }),
      ssr: true,
      _nonReactive: {},
    } as AnyRouteMatch)

    const normalizedMatchId = normalizeCrawlerCandidate(dehydratedMatch.i)
    const normalizedErrorRouteId = normalizeCrawlerCandidate(
      (dehydratedMatch.e as any).routeId,
    )

    expect(normalizedMatchId).not.toContain('/_layout')
    expect(normalizedMatchId).not.toContain('$postId')
    expect(normalizedErrorRouteId).not.toContain('/_layout')
    expect(normalizedErrorRouteId).not.toContain('$postId')
    expect(hydrateSsrMatchId(dehydratedMatch.i)).toBe(matchId)
    expect(hydrateSsrMatchId((dehydratedMatch.e as any).routeId)).toBe(routeId)
  })
})
