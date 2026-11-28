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
import { expect } from 'vitest'
import {
  environmentsFiles,
  expectPage,
  labelModule,
  recorder,
  summary,
} from './rsc-environments-app'
import { test } from './test'

const timeout = 60_000

/** `#where`'s files, with `marker` in their texts. */
const whereFiles = (marker: string) => ({
  'src/where/server.ts': `export const where = () => 'MARK_WHERE_SERVER_${marker}'\n`,
  'src/where/plain.ts': `export const where = () => 'MARK_WHERE_PLAIN_${marker}'\n`,
})

test(
  'Rsbuild dev with RSC, restarted on the persistent cache after offline edits: each environment shows what both read and reports its denied import, as the edits remove and restore it',
  async ({ startRscRsbuildDevServer }) => {
    const { violations, start } = recorder('mock')
    let server = await startRscRsbuildDevServer({
      browser: true,
      start,
      config: { performance: { buildCache: true } },
      files: { ...environmentsFiles, ...whereFiles('A') },
    })
    const both = [
      'rsc server file label.ts -> ./secret.client',
      'ssr server file label.ts -> ./secret.client',
    ]
    /** The page shows `marker`'s labels (`route`: exactly), and what was reported since `since`. */
    const expectAt = async (
      checkpoint: string,
      marker: string,
      reported: Array<string>,
      since: number,
      exact = false,
    ) => {
      const html = await expectPage(
        server.url!,
        {
          route: exact
            ? `MARK_WHERE_PLAIN_${marker}`
            : expect.stringContaining(`MARK_WHERE_PLAIN_${marker}`),
          server: exact
            ? `MARK_WHERE_SERVER_${marker}`
            : expect.stringContaining(`MARK_WHERE_SERVER_${marker}`),
          boxes: 2,
        } as never,
        checkpoint,
      )
      if (!exact) {
        expect.soft(html, checkpoint).not.toContain('MARK_SECRET')
      }
      expect
        .soft(summary(violations.slice(since)), checkpoint)
        .toEqual(reported)
    }
    /** Stops the server, writes `files`, and starts it again on its cache. */
    const restartAfter = async (files: Record<string, string>) => {
      const since = violations.length
      await server.stop()
      for (const [file, content] of Object.entries(files)) {
        await writeFile(path.join(server.root, file), content)
      }
      server = await server.restart()
      return since
    }

    await expectAt(
      "a first start reports each environment's denied import",
      'A',
      both,
      0,
    )

    let since = await restartAfter(whereFiles('B'))
    // (the cache restored the modules the edit left alone)
    expect.soft(server.rebuiltBy.ssr).not.toContain('src/routes/__root.tsx')
    await expectAt(
      'an edit of what both environments read: each shows it, and each reports its denied import again',
      'B',
      both,
      since,
    )

    since = await restartAfter({ 'src/lib/label.ts': labelModule(false) })
    await expectAt(
      "an edit removing the denied import from the file of both: each environment's module is real, and nothing is reported",
      'B',
      [],
      since,
      true,
    )

    since = await restartAfter({ 'src/lib/label.ts': labelModule(true) })
    await expectAt(
      'an edit restoring it: each environment reports it again',
      'B',
      both,
      since,
    )
  },
  4 * timeout,
)
