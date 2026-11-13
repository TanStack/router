/**
 * A server fn module whose state is written through a local name (a
 * function's parameter, a `for…of` variable) when it loads: a value read
 * from that state before the write keeps the value the source reads, also
 * when only a handler uses it (the handler's own module loads on the first
 * call, R149 answer A). Production server builds on Vite and Rsbuild, run
 * by Start's server entry (review round 1, findings F2-1 and F2-2).
 */
import { describe, expect, test } from 'vitest'
import { buildStart, startBundlers } from '../build-harness'

const timeout = 60_000

const head = `import { createServerFn } from '@tanstack/react-start'\n`

const files = {
  'src/param.ts': `${head}const cfg = { url: 'a' }
const snapshot = cfg.url
function set(o: { url: string }) { o.url = 'b' }
set(cfg)
export const getCfg = () => cfg.url
export const viaParam = createServerFn().handler(async () => snapshot + '/' + cfg.url)
`,
  'src/for-of.ts': `${head}const cfgs = [{ url: 'a' }]
const snapshot = cfgs[0]!.url
for (const c of cfgs) { c.url = 'b' }
export const count = () => cfgs.length
export const viaForOf = createServerFn().handler(async () => snapshot + '/' + cfgs[0]!.url)
`,
  'src/entry.ts': `export * from './param'\nexport * from './for-of'\n`,
}

describe.each(startBundlers)('%s build', (bundler) => {
  test(
    'round 1 F2-1/F2-2: a handler reads the value its module read at load before a write through a local name',
    async () => {
      const build = await buildStart({
        bundler,
        minify: false,
        files,
        entry: 'src/entry.ts',
      })
      const { result } = await build.ssr.run(`return {
  cfg: entry.getCfg(),
  viaParam: await entry.viaParam(),
  count: entry.count(),
  viaForOf: await entry.viaForOf(),
}`)
      expect(result).toEqual({
        cfg: 'b',
        viaParam: 'a/b',
        count: 1,
        viaForOf: 'a/b',
      })
    },
    timeout,
  )
})
