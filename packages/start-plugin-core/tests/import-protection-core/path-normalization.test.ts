/**
 * `normalizeFilePath` of import protection: the query is stripped and the
 * path normalised, and the memo stays correct past its bound (it holds two
 * generations of ids; a session that sees many distinct ids keeps getting
 * the right answer, for an id seen long ago as much as for a new one).
 */
import { describe, expect, test } from 'vitest'
import {
  normalizeFilePath,
  stripQueryAndHash,
} from '../../src/import-protection/utils'
import { normalizePath } from '../../src/utils'

describe('normalizeFilePath', () => {
  test('strips the query and normalises the path', () => {
    expect(
      normalizeFilePath(
        '/app/src/./routes/../routes/a.tsx?tsr-split=component',
      ),
    ).toBe('/app/src/routes/a.tsx')
    expect(normalizeFilePath('/app/src/project #2/a.ts')).toBe(
      '/app/src/project #2/a.ts',
    )
  })

  test('answers correctly for many more distinct ids than the memo holds', () => {
    const ids: Array<string> = []
    for (let i = 0; i < 20_000; i++) {
      ids.push(
        `/app/src/section${i % 31}/../section${i % 31}/item-${i}.tsx?tsr-split=${i % 3}`,
      )
    }
    const expected = ids.map((id) => normalizePath(stripQueryAndHash(id)))
    // first sight, then again after every other id was seen (the memo rolled over several times)
    for (let i = 0; i < ids.length; i++) {
      expect(normalizeFilePath(ids[i]!)).toBe(expected[i])
    }
    for (let i = 0; i < ids.length; i++) {
      expect(normalizeFilePath(ids[i]!)).toBe(expected[i])
    }
  })
})
