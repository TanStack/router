import { describe, expect, it } from 'vitest'
import { noteInput } from '../checkpoints/08-tests/src/server/note-input'

const validNote = {
  slug: 'server-html',
  title: 'Reading server HTML',
  body: 'Inspect the response before hydration.',
  category: 'Testing',
}

describe('new note input', () => {
  it('trims human-readable fields before storage', () => {
    expect(
      noteInput.parse({
        ...validNote,
        title: '  Reading server HTML  ',
        body: '  Inspect the response before hydration.  ',
        category: '  Testing  ',
      }),
    ).toEqual(validNote)
  })

  it.each([
    '',
    'UPPERCASE',
    'two words',
    '../private',
    '-leading',
    'trailing-',
  ])('rejects the invalid slug %j', (slug) => {
    expect(noteInput.safeParse({ ...validNote, slug }).success).toBe(false)
  })

  it.each(['title', 'body', 'category'])(
    'rejects a whitespace-only %s',
    (field) => {
      expect(
        noteInput.safeParse({ ...validNote, [field]: '   ' }).success,
      ).toBe(false)
    },
  )

  it('rejects a title longer than the storage contract', () => {
    expect(
      noteInput.safeParse({ ...validNote, title: 'a'.repeat(121) }).success,
    ).toBe(false)
  })
})
