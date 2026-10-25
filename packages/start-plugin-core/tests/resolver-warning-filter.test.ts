import { describe, expect, test } from 'vitest'
import { composeOnwarn, isResolverChunkingHint } from '../src/vite/planning'

const hint = {
  code: 'INEFFECTIVE_DYNAMIC_IMPORT',
  message:
    'src/layout.ts is dynamically imported by \\0%23tanstack-start-server-fn-resolver but also statically imported by src/entry.ts, dynamic import will not move module into another chunk.',
}
const appHint = {
  code: 'INEFFECTIVE_DYNAMIC_IMPORT',
  message:
    'src/heavy.ts is dynamically imported by src/page.ts but also statically imported by src/entry.ts, dynamic import will not move module into another chunk.',
}

describe("Rolldown's chunking hint for the server-fn resolver", () => {
  test('is told from the same hint about app code', () => {
    expect(isResolverChunkingHint(hint)).toBe(true)
    expect(isResolverChunkingHint(appHint)).toBe(false)
    expect(
      isResolverChunkingHint({
        code: 'CIRCULAR_DEPENDENCY',
        message: hint.message,
      }),
    ).toBe(false)
  })

  test("is dropped; every other warning reaches the app's handler, else Rolldown's", () => {
    const seen: Array<string> = []
    const defaultHandler = (w: { message: string }) =>
      seen.push(`default ${w.code}`)
    const withApp = composeOnwarn((w, next) => {
      seen.push(`app ${w.code}`)
      next(w)
    })
    withApp(hint, defaultHandler)
    withApp(appHint, defaultHandler)
    const withoutApp = composeOnwarn(undefined)
    withoutApp(hint, defaultHandler)
    withoutApp(appHint, defaultHandler)
    expect(seen).toEqual([
      'app INEFFECTIVE_DYNAMIC_IMPORT',
      'default INEFFECTIVE_DYNAMIC_IMPORT',
      'default INEFFECTIVE_DYNAMIC_IMPORT',
    ])
  })
})
