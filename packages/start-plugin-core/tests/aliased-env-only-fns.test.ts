import { expect, test } from 'vitest'
import { compileStartModule } from './compile-start-module'

test('transforms an aliased re-export of createClientOnlyFn next to createServerOnlyFn on the server', async () => {
  const output = await compileStartModule({
    env: 'server',
    files: {
      '/test/src/env.ts': `export { createClientOnlyFn as clientOnly } from '@tanstack/react-start'`,
    },
    code: `import { createServerOnlyFn } from '@tanstack/react-start'
import { clientOnly } from './env'
import { secret } from './secret.server'
import { readWindow } from './browser'
export const serverValue = createServerOnlyFn(() => secret())
export const clientValue = clientOnly(() => readWindow())`,
  })
  // The client-only implementation (and its browser import) must not reach SSR.
  expect(output).not.toContain('readWindow')
  expect(output).toContain(
    'createClientOnlyFn() functions can only be called on the client!',
  )
})
