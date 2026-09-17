import { describe, expect, it } from 'vitest'
import { dehydrateSsrMatchId, hydrateSsrMatchId } from '../src/ssr/ssr-match-id'

describe('ssr match id codec', () => {
  it('removes forward slashes in dehydrated ids', () => {
    const dehydratedId = dehydrateSsrMatchId(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )

    expect(dehydratedId).not.toContain('/')
    expect(hydrateSsrMatchId(dehydratedId)).toBe(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )
  })

  it('leaves ids without slashes unchanged', () => {
    const id = 'plain-id'

    expect(dehydrateSsrMatchId(id)).toBe(id)
    expect(hydrateSsrMatchId(id)).toBe(id)
  })

  it('round-trips reserved and browser-normalized characters', () => {
    const id = '~/\0/\uFFFD/~0/~r'
    const dehydratedId = dehydrateSsrMatchId(id)
    const normalize = (value: string) => value.replaceAll('\0', '\uFFFD')

    expect(hydrateSsrMatchId(normalize(dehydratedId))).toBe(id)
    expect(normalize(dehydrateSsrMatchId('/r'))).not.toBe(
      normalize(dehydrateSsrMatchId('\uFFFDr')),
    )
  })

  it('decodes browser-normalized replacement chars back to slashes', () => {
    const normalized = dehydrateSsrMatchId('/posts/1').replaceAll(
      '\0',
      '\uFFFD',
    )

    expect(hydrateSsrMatchId(normalized)).toBe('/posts/1')
  })
})
