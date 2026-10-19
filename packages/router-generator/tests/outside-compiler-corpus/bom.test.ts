/**
 * Not part of the compiler test corpus (out of scope: SPEC §2.1 selects
 * BOM-free UTF-8 sources; FIX-PLAN GEN-28). Characterisation of route files
 * starting with a UTF-8 BOM: the generator keeps it when it fixes the file.
 * The same upkeep without a BOM is tested in generator-options.test.ts and
 * route-file-upkeep.test.ts.
 */
import { describe, expect, test } from 'vitest'
import { createApp, generate, read, rootRoute } from '../app'
import { routeCallOf } from '../route-id'

const bom = '﻿'
const router = `'@tanstack/react-router'`

describe('route files starting with a UTF-8 BOM', () => {
  test.each([
    {
      name: 'an id the generator fixes',
      file: 'posts.tsx',
      source: `${bom}import { createFileRoute } from ${router}

export const Route = createFileRoute('/old')({})
`,
      expected: { constructor: 'createFileRoute', id: '/posts' },
    },
    {
      name: 'an id the generator fixes, with CRLF line endings',
      file: 'posts.tsx',
      source: `${bom}import { createFileRoute } from ${router}\r\n\r\nexport const Route = createFileRoute('/old')({})\r\n`,
      expected: { constructor: 'createFileRoute', id: '/posts' },
    },
    {
      name: 'a lazy route file created with createFileRoute',
      file: 'posts.lazy.tsx',
      source: `${bom}import { createFileRoute } from ${router}\r\n\r\nexport const Route = createFileRoute('/posts')({})\r\n`,
      expected: { constructor: 'createLazyFileRoute', id: '/posts' },
    },
    {
      name: 'a stale import of the other constructor',
      file: 'posts.tsx',
      source: `${bom}// 😀
import { createLazyFileRoute } from ${router}
import { createFileRoute } from ${router}
export const Route = createFileRoute('/old')({})
`,
      expected: { constructor: 'createFileRoute', id: '/posts' },
    },
  ])('$name keeps the BOM', async ({ file, source, expected }) => {
    const root = await createApp({
      'src/routes/__root.tsx': rootRoute(),
      [`src/routes/${file}`]: source,
    })
    await generate(root)

    const written = await read(root, `src/routes/${file}`)
    expect(written.startsWith(bom)).toBe(true)
    expect(routeCallOf(written.slice(1))).toEqual(expected)
  })

  // Bug: the generator adds a missing route constructor import at the very
  // start of the file, before a UTF-8 BOM.
  // Source: src/transform/transform.ts:560 (`s.prepend` of the import).
  // Impact: the BOM ends up after the import, as a stray zero-width
  // character on the second line, and the file no longer starts with it.
  test.fails(
    'a route file starting with a UTF-8 BOM keeps it when the route constructor import is added',
    async () => {
      const root = await createApp({
        'src/routes/__root.tsx': rootRoute(),
        'src/routes/posts.tsx': `${bom}export const Route = createFileRoute('/old')({})\n`,
      })
      await generate(root)

      const written = await read(root, 'src/routes/posts.tsx')
      expect(written.startsWith(bom)).toBe(true)
      expect(routeCallOf(written.slice(1)).id).toBe('/posts')
    },
  )
})
