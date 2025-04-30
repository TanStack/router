import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { copyPublicAssets, prepare } from 'nitropack'
import type { Nitro } from 'nitropack'

export async function buildNitroEnvironment(
  nitro: Nitro,
  build: () => Promise<any>,
) {
  await prepare(nitro)
  await copyPublicAssets(nitro)
  await build()

  const publicDir = nitro.options.output.publicDir

  // As a part of the build process, the `.vite/` directory
  // is copied over from `.tanstack-start/build/client-dist/`
  // to the `publicDir` (e.g. `.output/public/`).
  // This directory (containing the vite manifest) should not be
  // included in the final build, so we remove it here.
  const viteDir = path.resolve(publicDir, '.vite')
  if (await fsp.stat(viteDir).catch(() => false)) {
    await fsp.rm(viteDir, { recursive: true, force: true })
  }

  await nitro.close()
}
