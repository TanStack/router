/**
 * The generator's configuration errors, read through `getConfig` (and
 * `tsr.config.json`) like the bundler plugins and the CLI do, and an error of
 * a run: each fails once, as the thrown error (the caller prints it), with
 * nothing printed before it, and an invalid option is named with its
 * problem (the router plugin's own formatting, SPEC P14), not a raw schema
 * error.
 * Source: diagnostics spike (2026-11-24), inventory flag 16, agreed change
 * A4 (G14, G17, G27).
 */
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect } from 'vitest'
import { captureDiagnostics } from '@tanstack/compiler-test-utils/diagnostic-channel'
import { Generator, getConfig } from '../src'
import { configOf, createApp, fileRoute, rootRoute } from './app'
import { test } from './test'
import type { Config } from '../src'

/** What `run` throws, and what it printed meanwhile. */
async function failure(run: () => unknown) {
  const { result: error, diagnostics } = await captureDiagnostics(async () => {
    try {
      await run()
    } catch (error) {
      return error as Error
    }
    return undefined
  })
  return { error, printed: diagnostics.map((d) => d.text) }
}

describe('generator configuration errors', () => {
  test('an invalid option fails naming it, once', async ({ appRoot }) => {
    const root = await createApp(appRoot, {})
    const { error, printed } = await failure(() =>
      getConfig({ quoteStyle: 'backtick' } as unknown as Partial<Config>, root),
    )
    expect(error).toBeInstanceOf(Error)
    expect(error!.name).toBe('Error')
    expect(error!.message).toMatch(/^\[tanstack-router\] Invalid router/)
    expect(error!.message).toMatch(/\n {2}quoteStyle: /)
    expect(printed).toEqual([])
  })

  test('an invalid option of tsr.config.json fails naming it and the file', async ({
    appRoot,
  }) => {
    const root = await createApp(appRoot, {
      'tsr.config.json': JSON.stringify({ quoteStyle: 'backtick' }),
    })
    const { error } = await failure(() => getConfig({}, root))
    expect(error!.message).toMatch(/\n {2}quoteStyle: /)
    expect(error!.message).toContain('tsr.config.json')
  })

  // Source: the reviews of the implementation (Astra 5: a directory read
  // as "not valid JSON: EISDIR"; Gemini P3-1: `[]` spread as options).
  test('a tsr.config.json that cannot be read fails with its read error', async ({
    appRoot,
  }) => {
    const root = await createApp(appRoot, { 'tsr.config.json/x': '' })
    const { error } = await failure(() => getConfig({}, root))
    expect((error as NodeJS.ErrnoException).code).toBe('EISDIR')
  })

  test.for(['[]', 'null', '"src/routes"'])(
    'a tsr.config.json holding %s fails naming the file',
    async (json, { appRoot }) => {
      const root = await createApp(appRoot, { 'tsr.config.json': json })
      const { error } = await failure(() => getConfig({}, root))
      expect(error!.message).toBe(
        `[tanstack-router] ${path.join(root, 'tsr.config.json')} must hold an object of options.`,
      )
    },
  )

  test('experimental.enableCodeSplitting fails once, with its migration', async ({
    appRoot,
  }) => {
    const root = await createApp(appRoot, {})
    const { error, printed } = await failure(() =>
      getConfig(
        { experimental: { enableCodeSplitting: true } } as Partial<Config>,
        root,
      ),
    )
    expect(error!.message).toContain('autoCodeSplitting')
    expect(printed).toEqual([])
  })
})

describe('a run that fails', () => {
  test('a route group configuration file fails the run once, printing nothing', async ({
    appRoot,
  }) => {
    const root = await createApp(appRoot, {
      'src/routes/__root.tsx': rootRoute(),
      'src/routes/(group).tsx': fileRoute('/', `{ component: () => 'x' }`),
    })
    const config = configOf(root, { disableLogging: false })
    await writeFile(path.join(root, 'src/routes/(group).index.tsx'), '')
    const { error, printed } = await failure(() =>
      new Generator({ config, root }).run(),
    )
    expect(error!.message).toContain('route group')
    expect(printed).toEqual([])
  })
})
