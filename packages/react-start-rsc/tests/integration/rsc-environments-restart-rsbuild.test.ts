/**
 * Rsbuild dev with RSC on the persistent cache (`performance.buildCache`),
 * edits made while the server was stopped, of files both compile
 * environments of the server compiler (`ssr`, `rsc`) hold
 * (`rsc-environments-app.ts`): the restarted server restores each module
 * with the plan and the import-protection record of its own environment,
 * builds again the ones the edit made stale, and judges again what another
 * session reported, in each environment.
 * Source: RSC model v2 §2.5 (rows for A5 and A6: the restore groups modules
 * by compile environment before the plan dedupe and the record replay).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, describe, expect, test } from 'vitest'
import { startRscRsbuildDevServer } from './rsc-app'
import {
  environmentsFiles,
  expectPage,
  labelModule,
  recorder,
  summary,
} from './rsc-environments-app'
import type { RsbuildDevServer } from '@tanstack/compiler-test-utils/rsbuild-dev-server'

const timeout = 60_000

/** `#where`'s files, with `marker` in their texts. */
const whereFiles = (marker: string) => ({
  'src/where/server.ts': `export const where = () => 'MARK_WHERE_SERVER_${marker}'\n`,
  'src/where/plain.ts': `export const where = () => 'MARK_WHERE_PLAIN_${marker}'\n`,
})

describe('Rsbuild dev with RSC, restarted on the persistent cache after offline edits', () => {
  const { violations, start } = recorder('mock')
  let server: RsbuildDevServer
  afterAll(async () => {
    // (none when the start failed)
    await (server as RsbuildDevServer | undefined)?.close()
  })

  /** Stops the server, writes `files`, and starts it again on its cache. */
  async function restartAfter(files: Record<string, string>) {
    await server.stop()
    for (const [file, content] of Object.entries(files)) {
      await writeFile(path.join(server.root, file), content)
    }
    server = await server.restart()
  }

  test(
    "a first start reports each environment's denied import",
    async () => {
      server = await startRscRsbuildDevServer({
        browser: true,
        // (the server lives across this file's tests)
        registerCleanup: () => {},
        start,
        config: { performance: { buildCache: true } },
        files: { ...environmentsFiles, ...whereFiles('A') },
      })
      const html = await expectPage(server.url!, {
        route: expect.stringContaining('MARK_WHERE_PLAIN_A'),
        server: expect.stringContaining('MARK_WHERE_SERVER_A'),
        boxes: 2,
      } as never)
      expect(html).not.toContain('MARK_SECRET')
      expect(summary(violations)).toEqual([
        'rsc server file label.ts -> ./secret.client',
        'ssr server file label.ts -> ./secret.client',
      ])
    },
    timeout,
  )

  test(
    'an edit of what both environments read: each shows it, and each reports its denied import again',
    async () => {
      const since = violations.length
      await restartAfter(whereFiles('B'))
      // (the cache restored the modules the edit left alone)
      expect(server.rebuiltBy.ssr).not.toContain('src/routes/__root.tsx')
      const html = await expectPage(server.url!, {
        route: expect.stringContaining('MARK_WHERE_PLAIN_B'),
        server: expect.stringContaining('MARK_WHERE_SERVER_B'),
        boxes: 2,
      } as never)
      expect(html).not.toContain('MARK_SECRET')
      expect(summary(violations.slice(since))).toEqual([
        'rsc server file label.ts -> ./secret.client',
        'ssr server file label.ts -> ./secret.client',
      ])
    },
    timeout,
  )

  test(
    "an edit removing the denied import from the file of both: each environment's module is real, and nothing is reported",
    async () => {
      const since = violations.length
      await restartAfter({ 'src/lib/label.ts': labelModule(false) })
      await expectPage(server.url!, {
        route: 'MARK_WHERE_PLAIN_B',
        server: 'MARK_WHERE_SERVER_B',
        boxes: 2,
      })
      expect(violations.slice(since)).toEqual([])
    },
    timeout,
  )

  test(
    'an edit restoring it: each environment reports it again',
    async () => {
      const since = violations.length
      await restartAfter({ 'src/lib/label.ts': labelModule(true) })
      const html = await expectPage(server.url!, {
        route: expect.stringContaining('MARK_WHERE_PLAIN_B'),
        server: expect.stringContaining('MARK_WHERE_SERVER_B'),
        boxes: 2,
      } as never)
      expect(html).not.toContain('MARK_SECRET')
      expect(summary(violations.slice(since))).toEqual([
        'rsc server file label.ts -> ./secret.client',
        'ssr server file label.ts -> ./secret.client',
      ])
    },
    timeout,
  )
})
