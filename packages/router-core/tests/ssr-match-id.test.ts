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

  it('decodes browser-normalized replacement chars back to slashes', () => {
    expect(hydrateSsrMatchId('\uFFFDposts\uFFFD1')).toBe('/posts/1')
  })

  it('still decodes legacy null-byte delimiters for backward compatibility', () => {
    // Payloads emitted before the switch to U+FFFD encoded slashes as U+0000.
    // hydrateSsrMatchId keeps the legacy decode branch so an in-flight payload
    // from a previous deploy still hydrates correctly.
    const nullChar = String.fromCharCode(0)
    expect(hydrateSsrMatchId(`${nullChar}posts${nullChar}1`)).toBe('/posts/1')
  })

  it('does not emit control characters that are invalid in SSR HTML', () => {
    const dehydratedId = dehydrateSsrMatchId(
      '/$orgId/projects/$projectId//acme/projects/dashboard/{}',
    )

    // U+0000 and the other C0 control characters trigger a
    // control-character-in-input-stream parse error when the dehydrated id is
    // inlined into the SSR <script> payload, so the codec must never emit them.
    const nullChar = String.fromCharCode(0)
    expect(dehydratedId).not.toContain(nullChar)

    const hasControlChar = dehydratedId
      .split('')
      .some((char) => char.charCodeAt(0) <= 0x1f)
    expect(hasControlChar).toBe(false)
  })
})
