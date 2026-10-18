/**
 * Not part of the compiler test corpus (out of scope: characterisation of
 * virtual route configs the docs do not describe; the spec, J1.7, leaves
 * them open).
 */
import path from 'node:path'
import { expect, test } from 'vitest'
import {
  physical,
  rootRoute as virtualRootRoute,
} from '@tanstack/virtual-file-routes'
import { createApp, fileRoute, generate, rootRoute } from '../app'

// A layout route file at the root of a physical directory merged at the
// current level would be a second route at the root route's path: today the
// generator rejects it with an error naming the file.
test('a layout route file at the root of a directory merged at the root level fails the generator with an error naming it', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/merged/route.tsx': fileRoute('/wrong'),
  })

  const error = await generate(root, {
    virtualRouteConfig: virtualRootRoute('__root.tsx', [
      physical('', 'merged'),
    ]),
  }).then(
    () => undefined,
    (e: unknown) => e as Error,
  )
  expect(error).toBeInstanceOf(Error)
  expect(error?.message).toContain(
    path.join(root, 'src/routes/merged/route.tsx'),
  )
})
