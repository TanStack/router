import { expect, it, vi } from 'vitest'

// Own file so the module graph is fresh: nothing else has loaded prettier yet.
const state = vi.hoisted(() => ({ prettierLoaded: false }))

vi.mock('prettier', async (importOriginal) => {
  state.prettierLoaded = true
  return importOriginal()
})

it('does not load prettier until format() is called', async () => {
  const { Generator, format } = await import('../src')
  expect(Generator).toBeDefined()
  expect(state.prettierLoaded).toBe(false)

  await format('const x = 1', { quoteStyle: 'single', semicolons: false })
  expect(state.prettierLoaded).toBe(true)
})
