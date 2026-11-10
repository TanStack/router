/**
 * Rsbuild dev, a checkout: files that read each other are written a few
 * milliseconds apart, so Rspack's watcher reports them in separate batches
 * (Rsbuild watches with no aggregate timeout) while the compilation of the
 * first batch runs. Each module ends compiled against the final files.
 * The second write of the deterministic variant comes from a plugin of the
 * app's (`watchRun`), as a code generator's would.
 */
import { writeFileSync } from 'node:fs'
import { open } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { startRsbuildStartDevServer } from '../../rsbuild-dev-server'
import type { RsbuildPlugin, Rspack } from '@rsbuild/core'

const timeout = 90_000
const compileTimeout = 30_000

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/** `src/lib/l.ts`: `base` is a plain object, then a server fn builder. */
const plainL = `export const base = { handler: (fn: () => Promise<string>) => fn }\n`
const builderL = `import { createServerFn } from '@tanstack/react-start'
export const base = createServerFn()
`
/**
 * `src/lib/a.ts` builds `a` on `l.ts`'s `base` (its compile reads `l.ts`)
 * and exports `b`: a plain object, then a server fn builder of its own.
 */
const plainA = `import { base } from './l'
export const a = base.handler(async () => 'MARK_A')
export const b = { handler: (fn: () => Promise<string>) => fn }
`
const builderA = `import { createServerFn } from '@tanstack/react-start'
import { base } from './l'
export const a = base.handler(async () => 'MARK_A')
export const b = createServerFn()
`

/**
 * The app: `page.ts` builds a function on `a.ts`'s `b` (its compile reads
 * `a.ts`, not `l.ts`); `importers` more modules build on `l.ts`'s `base`.
 */
function checkoutApp(importers: number) {
  const extra = Array.from({ length: importers }, (_, i) => `u${i}`)
  return {
    'src/lib/l.ts': plainL,
    'src/lib/a.ts': plainA,
    'src/page.ts': `import { b } from './lib/a'
export const page = b.handler(async () => 'MARK_PAGE')
`,
    ...Object.fromEntries(
      extra.map((name) => [
        `src/${name}.ts`,
        `import { base } from './lib/l'
export const ${name} = base.handler(async () => 'MARK_U')
`,
      ]),
    ),
    'src/entry.ts': `import { a } from './lib/a'
import { page } from './page'
${extra.map((name) => `import { ${name} } from './${name}'`).join('\n')}
console.log(a, page${extra.map((name) => `, ${name}`).join('')})
`,
  }
}

/**
 * A plugin of the app's that writes `src/lib/a.ts` (`builderA`) from the
 * first `watchRun` whose changed files hold `src/lib/l.ts` once `arm()` was
 * called, before the other plugins' `watchRun` taps: the second file of a
 * checkout lands while the compilation of the first one starts.
 */
function writeOnWatchRun(): RsbuildPlugin & { arm: () => void } {
  let armed = false
  return {
    name: 'test:write-on-watch-run',
    arm: () => {
      armed = true
    },
    setup(api) {
      api.modifyRspackConfig((config) => {
        config.plugins.push({
          apply(compiler: Rspack.Compiler) {
            compiler.hooks.watchRun.tap(
              { name: 'test:write-on-watch-run', stage: -100 },
              (c) => {
                const root = api.context.rootPath
                const l = path.join(root, 'src/lib/l.ts')
                if (
                  armed &&
                  [...(c.modifiedFiles ?? [])].some(
                    (file) => path.normalize(file) === l,
                  )
                ) {
                  armed = false
                  writeFileSync(path.join(root, 'src/lib/a.ts'), builderA)
                }
              },
            )
          },
        })
      })
    },
  }
}

describe('Rsbuild dev: a dependent saved while its dependency is invalidated', () => {
  // A checkout writes `l.ts`, then `a.ts` while the compilation of `l.ts`'s
  // batch starts (a plugin writes it from `watchRun`). That compilation's
  // invalidation finds `a.ts` stale (it read `l.ts`'s `base`) and builds it;
  // `a.ts`'s own event, in the next batch, must still re-plan `page.ts`,
  // which read `a.ts`'s `b`: `b` became a builder, so `page`'s handler leaves
  // the client. With 300 more importers of `l.ts`'s `base`, all stale too.
  // Bug: the session recorded the files an invalidation found stale with a
  // `stat` taken then, which saw the second write; that file's own event
  // matched the record and was skipped, so `page.ts` kept the plan of the
  // old `a.ts` (its handler stayed in the client) until `a.ts` was saved
  // again.
  // Source: F3-1 / F7-1 (Fable review 2026-11-10, F3-cache-repro; the
  // shape: review of design 3 steps 0-1).
  test.for([
    { name: 'one importer of the dependency', importers: 0 },
    { name: '300 importers of the dependency', importers: 300 },
  ])(
    'still re-plans its importers ($name)',
    async ({ importers }) => {
      const writer = writeOnWatchRun()
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        config: { plugins: [writer] },
        files: checkoutApp(importers),
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_PAGE')
      writer.arm()
      await server.write({ 'src/lib/l.ts': builderL })
      await server.settle()
      expect(server.errors).toEqual([])
      const output = await client()
      expect(output).not.toContain('MARK_A')
      expect(output).not.toContain('MARK_PAGE')
    },
    timeout,
  )

  // The same checkout with `l.ts` saved in place (truncated, then written),
  // and `a.ts` saved 5 to 20 ms after the truncation, before `l.ts`'s text
  // lands: Rspack reports the truncation alone, and that compilation's
  // invalidation reads `l.ts` again until its text is there. Each gap starts
  // from the first files, restored one at a time.
  // Source: as above.
  test(
    'still re-plans its importers when the dependency is saved in place',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: checkoutApp(0),
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      for (const gap of [5, 10, 15, 20]) {
        expect(await client()).toContain('MARK_PAGE')
        const l = await open(path.join(server.root, 'src/lib/l.ts'), 'r+')
        try {
          await l.truncate(0)
          await sleep(gap)
          await server.write({ 'src/lib/a.ts': builderA })
          await sleep(5)
          await l.write(builderL, 0)
        } finally {
          await l.close()
        }
        await server.settle()
        expect(server.errors).toEqual([])
        const output = await client()
        expect(output, `${gap} ms apart`).not.toContain('MARK_A')
        expect(output, `${gap} ms apart`).not.toContain('MARK_PAGE')
        await server.edit({ 'src/lib/a.ts': plainA })
        await server.edit({ 'src/lib/l.ts': plainL })
      }
    },
    timeout,
  )

  // The control: the same edits, each one compiled before the next (passes
  // with the session's record of file events too).
  test(
    're-plans its importers when the edits compile one at a time',
    async () => {
      const server = await startRsbuildStartDevServer({
        compileTimeout,
        files: checkoutApp(0),
      })
      const client = async () =>
        Object.values(await server.outputs('client')).join('\n')
      expect(server.errors).toEqual([])
      expect(await client()).toContain('MARK_PAGE')
      await server.edit({ 'src/lib/l.ts': builderL })
      await server.edit({ 'src/lib/a.ts': builderA })
      expect(server.errors).toEqual([])
      const output = await client()
      expect(output).not.toContain('MARK_A')
      expect(output).not.toContain('MARK_PAGE')
    },
    timeout,
  )
})
