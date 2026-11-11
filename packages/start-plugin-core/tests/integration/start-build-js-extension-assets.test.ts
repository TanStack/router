/**
 * A file Start's Rsbuild loader rule matches by its extension but that it
 * does not compile (a dependency's file naming nothing of Start) reaches
 * Rspack as the bytes it came as: an MPEG transport stream segment named
 * `.ts`, imported as an asset, is emitted unchanged. The same file among
 * the app's own, which Start compiles, fails the build naming the file
 * (R97), and the fix its message gives (another extension) builds it.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from 'vitest'
import { expectDiagnostic } from '@tanstack/compiler-test-utils/diagnostics'
import { StartBuildError, buildStart } from '../build-harness'

const timeout = 60_000

/** Four 188-byte transport stream packets: a sync byte, then bytes that are no UTF-8. */
const clip = new Uint8Array(188 * 4).map((_, i) =>
  i % 188 === 0 ? 0x47 : (i * 37 + 0x80) & 0xff,
)

test(
  'Rsbuild: a binary .ts file of a dependency imported as an asset is emitted byte for byte',
  async () => {
    const result = await buildStart({
      bundler: 'rsbuild',
      // (the server's: Rspack's runtime of a client bundle whose one
      // module is an asset reads a name it never declares, which the
      // harness's dangling-name check refuses)
      entry: { client: 'client.ts', ssr: 'entry.ts' },
      files: {
        'client.ts': `export {}\n`,
        'node_modules/clips/package.json': JSON.stringify({ name: 'clips' }),
        'node_modules/clips/media/clip.ts': clip,
        'entry.ts': `export { default as clip } from 'clips/media/clip.ts'\n`,
      },
      // the app's own rules leave the package's `media/` to the asset rule,
      // as an app serving its video segments would
      rsbuildConfig: {
        source: { exclude: [/[\\/]media[\\/]/] },
        tools: {
          rspack: {
            module: {
              rules: [
                {
                  test: /[\\/]media[\\/].*\.ts$/,
                  type: 'asset/resource',
                  generator: { filename: 'clip.out' },
                },
              ],
            },
          },
        },
      },
    })
    const emitted = await readFile(path.join(result.ssr.outDir, 'clip.out'))
    expect(emitted.length).toBe(clip.length)
    expect(emitted.equals(clip)).toBe(true)
  },
  timeout,
)

/**
 * An app whose client imports `media/clip.<extension>` as an asset (the
 * app's rules leave `media/` to the asset rule) next to a module of its own.
 * A development build: the harness's dangling-name check of production
 * client builds refuses Rspack's runtime of such a bundle (an uncalled
 * `__webpack_require__` reads `__webpack_modules__`, which it never
 * declares).
 */
const appWithClip = (extension: string) =>
  ({
    bundler: 'rsbuild',
    mode: 'development',
    files: {
      [`media/clip.${extension}`]: clip,
      'src/greeting.ts': `export const greeting = 'MARK_GREETING'\n`,
      'entry.ts': `export { greeting } from './src/greeting'\nexport { default as clip } from './media/clip.${extension}'\n`,
    },
    rsbuildConfig: {
      source: { exclude: [/[\\/]media[\\/]/] },
      tools: {
        rspack: {
          module: {
            rules: [
              {
                test: /[\\/]media[\\/]clip\./,
                type: 'asset/resource',
                generator: { filename: 'clip.out' },
              },
            ],
          },
        },
      },
    },
  }) as const

test(
  'Rsbuild: a binary .ts file of the app fails the build naming it, and builds under another extension',
  async () => {
    const error = await buildStart(appWithClip('ts')).then(
      () => expect.fail('the build succeeded'),
      (failure: unknown) => {
        if (!(failure instanceof StartBuildError)) {
          throw failure
        }
        return failure
      },
    )
    expectDiagnostic(error.diagnostics, {
      severity: 'error',
      file: 'media/clip.ts',
      root: error.root,
    })
    // the fix the message gives
    const result = await buildStart(appWithClip('seg'))
    const emitted = await readFile(path.join(result.client.outDir, 'clip.out'))
    expect(emitted.equals(clip)).toBe(true)
  },
  timeout,
)
