/**
 * Kept: the sole coverage of a Start path no oracle test reaches yet: an
 * export resolver bounded to some modules, and the unbounded lookup of the
 * same barrel beside it (a `<Hydrate>` package boundary fixture would have
 * to tell all four answers apart). Builder values read through
 * destructuring are start-plugin-core's builder shapes (quoted keys, a
 * start instance, defaults, nested patterns).
 */
import { describe, expect, it } from 'vitest'
import { MemoryHost } from './helpers'
import type { Planner, RecognizerTable } from '../src/compiler'

const TABLE: RecognizerTable = {
  factories: {
    'toy-start': {
      createServerFn: 'serverFn',
      createIsomorphicFn: 'isoFn',
      createServerOnlyFn: 'serverOnly',
      createStart: 'start',
    },
  },
  builderKinds: new Set(['serverFn', 'isoFn', 'middleware']),
  terminal: { serverFn: 'serverFn', isoFn: 'isoFn', middleware: 'middleware' },
  envOnlyKinds: { serverOnly: 'server' },
  startKind: 'start',
  startMembers: { createMiddleware: 'middleware' },
}

describe('export resolution', () => {
  it('a resolver within some modules leaves a re-export of another unresolved and skips its star, apart from the full memo', async () => {
    const host = new MemoryHost({
      files: {
        '/app/barrel.ts': `export { createServerFn } from './lib/named'\nexport * from './lib/star'\n`,
        '/app/lib/named.ts': `export { createServerFn } from 'toy-start'\n`,
        '/app/lib/star.ts': `export { createServerOnlyFn } from 'toy-start'\n`,
      },
      recognizer: TABLE,
    })
    const seen: Record<string, unknown> = {}
    const planner: Planner = {
      name: 'toy-within',
      tier: 1,
      gate: () => true,
      async prefetch(_t0, ctx) {
        const target = (await ctx.resolve('./barrel'))!
        const within = ctx.resolver.within((id) => !id.includes('/lib/'))
        seen.withinNamed = await within.resolve(target, 'createServerFn')
        seen.withinStar = await within.resolve(target, 'createServerOnlyFn')
        seen.named = await ctx.resolver.resolve(target, 'createServerFn')
        seen.star = await ctx.resolver.resolve(target, 'createServerOnlyFn')
      },
      plan() {},
    }
    await host.compile('/app/m.ts', [planner], {
      code: `import { createServerFn } from './barrel'\nexport const x = createServerFn\n`,
    })
    expect(seen).toMatchObject({
      withinNamed: {
        k: 'found',
        value: { t: 'importRef', specifier: './lib/named' },
      },
      withinStar: { k: 'absent' },
      named: { k: 'found', value: { t: 'factory', kind: 'serverFn' } },
      star: { k: 'found', value: { t: 'factory', kind: 'serverOnly' } },
    })
  })
})
