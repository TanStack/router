import { describe, expect, it } from 'vitest'
import { dehydrateSsrMatchId, hydrateSsrMatchId } from '../src/ssr/ssr-match-id'

describe('ssr match id codec', () => {
  it('removes crawler-normalizable path separators in dehydrated ids', () => {
    const dehydratedId = dehydrateSsrMatchId(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )
    const crawlerNormalized = dehydratedId
      .replaceAll('\0', '/')
      .replaceAll('\uFFFD', '/')

    expect(dehydratedId).not.toContain('/')
    expect(dehydratedId).not.toContain('\0')
    expect(crawlerNormalized).not.toContain('/$orgId')
    expect(crawlerNormalized).not.toContain('$projectId')
    expect(hydrateSsrMatchId(dehydratedId)).toBe(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )
  })

  it('leaves ids without slashes unchanged', () => {
    const id = 'plain-id'

    expect(dehydrateSsrMatchId(id)).toBe(id)
    expect(hydrateSsrMatchId(id)).toBe(id)
  })

  it('decodes browser-normalized replacement chars back to slashes', () => {
    expect(hydrateSsrMatchId('\uFFFDposts\uFFFD1')).toBe('/posts/1')
  })

  it('round trips ids that start with the encoded prefix', () => {
    const id = '__TSR__route-id'
    const dehydratedId = dehydrateSsrMatchId(id)

    expect(dehydratedId).not.toBe(id)
    expect(hydrateSsrMatchId(dehydratedId)).toBe(id)
  })

  it('leaves invalid encoded-prefix ids unchanged for backwards compatibility', () => {
    expect(hydrateSsrMatchId('__TSR__not-valid-base64%')).toBe(
      '__TSR__not-valid-base64%',
    )
  })
})
