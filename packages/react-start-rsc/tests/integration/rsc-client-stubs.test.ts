/**
 * The client entry of `@tanstack/react-start-rsc` (its `import` condition:
 * what the client and SSR environments resolve) exports stubs of the RSC
 * helpers, which only run when code escaped the compiler: each throws on
 * call, with an explanation in development and a short message in a
 * production build (the explanation is development-only).
 */
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  createCompositeComponent,
  renderServerComponent,
  renderToReadableStream,
} from '@tanstack/react-start-rsc'

const helpers = {
  renderServerComponent: () => renderServerComponent(null as never),
  createCompositeComponent: () => createCompositeComponent(null as never),
  renderToReadableStream: () => renderToReadableStream(null),
}

afterEach(() => {
  vi.unstubAllEnvs()
})

/** The message `call` throws (synchronously or as a rejection) with `NODE_ENV` set to `env`. */
async function thrown(call: () => unknown, env: string): Promise<string> {
  vi.stubEnv('NODE_ENV', env)
  try {
    await call()
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
  throw new Error(`no throw with NODE_ENV=${env}`)
}

describe.each(Object.entries(helpers))('%s', (name, call) => {
  test('throws in development and in production, explaining only in development', async () => {
    const development = await thrown(call, 'development')
    const production = await thrown(call, 'production')
    expect(production).toContain(name)
    expect(development.startsWith(production)).toBe(true)
    expect(development.length).toBeGreaterThan(production.length)
  })
})
