/**
 * `vite build --watch` of a Start app whose client watcher is closed while
 * its first build runs (a program that drives the builder closes it, as
 * Vite's CLI does on a signal): Start's `buildApp` ends, and builds no other
 * environment. It waited for the client's first build to end, which a closed
 * watcher never reports, and stayed pending for ever.
 * Source: external review of #8817 (design-routeset-v5.md §2.4,
 * `close-orchestration.mjs`).
 */
import { expect, test } from 'vitest'
import { buildStart } from '../build-start'
import type { ViteBuilder } from 'vite'

const timeout = 60_000

test(
  "vite build --watch: a client watcher closed during the first build ends Start's buildApp, and no server build starts",
  async () => {
    let outcome: string | undefined
    const builds: Array<[string, string]> = []
    const closeDuringFirstBuild = async (builder: ViteBuilder) => {
      const watchers: Array<{ close: () => Promise<void> }> = []
      // (a delegate of the builder that keeps the watchers it returns)
      const build: ViteBuilder['build'] = async (environment) => {
        const output = await builder.build(environment)
        if ('on' in output) {
          watchers.push(output)
          output.on('event', (event) => {
            builds.push([environment.name, event.code])
            if (
              environment.name === 'client' &&
              event.code === 'BUNDLE_START'
            ) {
              void output.close()
            }
          })
        }
        return output
      }
      const running = builder.config.builder!.buildApp({ ...builder, build })
      outcome = await Promise.race([
        running.then(
          () => 'ended',
          (error: unknown) => `rejected: ${String(error)}`,
        ),
        new Promise<string>((resolve) =>
          setTimeout(() => resolve('pending'), 10_000),
        ),
      ])
      await Promise.all(watchers.map((watcher) => watcher.close()))
    }
    // (the harness then finds no outputs: no environment finished a build)
    await expect(
      buildStart({
        files: {
          'client-entry.ts': `export const marker = 'MARK_CLIENT'\n`,
          'ssr-entry.ts': `export const marker = 'MARK_SSR'\n`,
        },
        entry: { client: 'client-entry.ts', ssr: 'ssr-entry.ts' },
        viteConfig: { build: { watch: {} } },
        viteBuild: closeDuringFirstBuild,
      }),
    ).rejects.toThrow('expected client and SSR outputs, got none')
    expect(outcome).toBe('ended')
    expect(builds.filter(([name]) => name !== 'client')).toEqual([])
  },
  timeout,
)
