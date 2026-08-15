import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { join } from 'pathe'
import type { BunNitroOptions } from './types'

export interface BunNitroBuildResult {
  /** Final public assets directory (typically `.output/public`) */
  publicDir: string
  /** Nitro server output directory (typically `.output/server`) */
  serverDir: string
  /** Nitro output root (typically `.output`) */
  outputDir: string
}

async function importNitroBuilder(root: string): Promise<
  typeof import('nitro/builder')
> {
  try {
    // Resolve from the app root (optional peer), not from this package.
    const requireFromApp = createRequire(join(root, 'package.json'))
    const builderPath = requireFromApp.resolve('nitro/builder')
    return (await import(pathToFileURL(builderPath).href)) as typeof import(
      'nitro/builder'
    )
  } catch (err) {
    throw new Error(
      `[tanstack-start-bun] bun.nitro requires the optional peer dependency "nitro" (Nitro 3). Install it in the app (e.g. \`npm install nitro\`).\n` +
        `Original error: ${err instanceof Error ? err.message : String(err)}`,
    )
  }
}

/**
 * After dual `Bun.build`, optionally re-package with Nitro 3 (programmatic API).
 * Mirrors `nitro-v2-vite-plugin` post-build `createNitro`, not `nitro/vite`.
 */
export async function runBunNitroBuild(opts: {
  root: string
  clientOutDir: string
  serverEntry: string
  publicBase: string
  nitro: BunNitroOptions
}): Promise<BunNitroBuildResult> {
  const builder = await importNitroBuilder(opts.root)
  const { createNitro, prepare, copyPublicAssets, build } = builder

  const userConfig = (opts.nitro.config ?? {}) as Record<string, unknown>
  const outputDir =
    (typeof userConfig.output === 'object' &&
    userConfig.output &&
    typeof (userConfig.output as { dir?: string }).dir === 'string'
      ? (userConfig.output as { dir: string }).dir
      : undefined) ?? join(opts.root, '.output')

  const baseURL =
    typeof userConfig.baseURL === 'string'
      ? userConfig.baseURL
      : opts.publicBase === '/'
        ? undefined
        : opts.publicBase

  const userPublicAssets = Array.isArray(userConfig.publicAssets)
    ? (userConfig.publicAssets as Array<Record<string, unknown>>)
    : []

  if (userConfig.serverEntry !== undefined) {
    console.warn(
      '[tanstack-start-bun] bun.nitro.config.serverEntry is ignored; Start always injects dist/server/server.js as the web handler.',
    )
  }

  const nitro = await createNitro({
    rootDir: opts.root,
    ...userConfig,
    ...(baseURL ? { baseURL } : {}),
    preset:
      opts.nitro.preset ??
      (userConfig.preset as string | undefined) ??
      'node-server',
    output: {
      ...((typeof userConfig.output === 'object' && userConfig.output) || {}),
      dir: outputDir,
    },
    // Avoid scanning the app for Nitro file routes; Start owns routing.
    scanDirs:
      userConfig.scanDirs !== undefined
        ? (userConfig.scanDirs as string[])
        : [],
    // Start-owned SSR handler — never allow user config to replace it.
    serverEntry: {
      handler: opts.serverEntry,
      format: 'web',
    },
    publicAssets: [
      {
        dir: opts.clientOutDir,
        baseURL: '/',
        maxAge: 31536000,
      },
      ...userPublicAssets,
    ],
  })

  try {
    await prepare(nitro)
    await copyPublicAssets(nitro)
    await build(nitro)
  } finally {
    await nitro.close()
  }

  return {
    publicDir: nitro.options.output.publicDir,
    serverDir: nitro.options.output.serverDir,
    outputDir: nitro.options.output.dir,
  }
}
