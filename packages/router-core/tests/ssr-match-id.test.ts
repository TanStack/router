import { describe, expect, it } from 'vitest'
import {
  dehydrateSsrManifestRouteId,
  dehydrateSsrMatchId,
  hydrateSsrManifestRouteId,
} from '../src/ssr/ssr-match-id'

describe('ssr match id codec', () => {
  it('removes forward slashes in dehydrated ids', () => {
    const dehydratedId = dehydrateSsrMatchId(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )

    expect(dehydratedId).not.toContain('/')
    expect(dehydratedId).not.toContain('\0')
  })

  it('leaves ids without slashes unchanged', () => {
    expect(dehydrateSsrMatchId('plain-id')).toBe('plain-id')
  })

  it('keeps distinct slash-delimited ids distinct', () => {
    expect(dehydrateSsrMatchId('/posts/1')).not.toBe(
      dehydrateSsrMatchId('/posts1'),
    )
  })
})

describe('ssr manifest route id codec', () => {
  it.each([
    '__root__',
    '/',
    '/app/_authenticated/_dashboard',
    '/(blog)/(posts)/article_123',
    '/reports#draft',
    '/reports/draft',
    '/reports%23draft',
    '/reports%2Fdraft#%',
  ])('round-trips %s without forward slashes', (id) => {
    const dehydratedId = dehydrateSsrManifestRouteId(id)

    expect(dehydratedId).not.toContain('/')
    expect(hydrateSsrManifestRouteId(dehydratedId)).toBe(id)
  })

  it('keeps a literal hash distinct from an encoded slash', () => {
    const hashId = dehydrateSsrManifestRouteId('/reports#draft')
    const slashId = dehydrateSsrManifestRouteId('/reports/draft')

    expect(hashId).not.toBe(slashId)
    expect(hydrateSsrManifestRouteId(hashId)).toBe('/reports#draft')
    expect(hydrateSsrManifestRouteId(slashId)).toBe('/reports/draft')
  })

  it.each(['__root__', '/reports#draft', '/reports%23draft'])(
    'leaves raw manifest key %s from older servers unchanged',
    (id) => {
      expect(hydrateSsrManifestRouteId(id)).toBe(id)
    },
  )
})
