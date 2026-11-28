/**
 * A file the router's webpack/Rspack loader rule matches by its extension
 * but that is no route reaches the bundler as the bytes it came as: an
 * MPEG transport stream segment named `.ts`, imported as an asset, is
 * emitted unchanged. A route file that starts with a byte order mark is
 * still compiled (split).
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, test } from 'vitest'
import { build, routeApp, routeHead, ssrRenderEntry } from '../build-harness'

const timeout = 60_000

/** Four 188-byte transport stream packets: a sync byte, then bytes that are no UTF-8. */
const clip = new Uint8Array(188 * 4).map((_, i) =>
  i % 188 === 0 ? 0x47 : (i * 37 + 0x80) & 0xff,
)

/** The app's own rules leave `media/` to the asset rule, as an app serving video segments would. */
function mediaAsAssets(options: Record<string, unknown>) {
  const module = options.module as { rules: Array<Record<string, unknown>> }
  for (const rule of module.rules) {
    if ('include' in rule) {
      rule.exclude = /[\\/]media[\\/]/
    }
  }
  module.rules.push({
    test: /[\\/]media[\\/].*\.ts$/,
    type: 'asset/resource',
    generator: { filename: 'clip.out' },
  })
}

describe.each(['webpack', 'rspack'] as const)('%s', (bundler) => {
  test(
    'a binary .ts file imported as an asset is emitted byte for byte',
    async () => {
      const result = await build({
        bundler,
        files: {
          ...routeApp(
            `${routeHead()}export const Route = createFileRoute('/')({ component: () => <p>index</p> })\n`,
            {
              files: {
                'entry.ts': `${ssrRenderEntry}export { default as clip } from './media/clip.ts'\n`,
              },
            },
          ),
          'media/clip.ts': clip,
        },
        configure: mediaAsAssets,
      })
      const emitted = await readFile(path.join(result.outDir, 'clip.out'))
      expect(emitted.length).toBe(clip.length)
      expect(emitted.equals(clip)).toBe(true)
    },
    timeout,
  )

  test(
    'a route file that starts with a byte order mark is split',
    async () => {
      const result = await build({
        bundler,
        files: routeApp(
          `\uFEFF${routeHead()}export const Route = createFileRoute('/')({ component: () => <p>MARK_BOM_COMPONENT</p> })\n`,
        ),
      })
      expect(result.where('MARK_BOM_COMPONENT')).toBe('lazy')
    },
    timeout,
  )
})
