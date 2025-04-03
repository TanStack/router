import { promises as fsp } from 'node:fs'
import path from 'node:path'
import { version } from 'nitropack/meta'
import { copyPublicAssets, prepare } from 'nitropack'
import type { Nitro } from 'nitropack'

export async function buildNitroEnvironment(
  nitro: Nitro,
  build: () => Promise<any>,
) {
  await prepare(nitro)
  await copyPublicAssets(nitro)
  await build()

  const presetsWithConfig = [
    'awsAmplify',
    'awsLambda',
    'azure',
    'cloudflare',
    'firebase',
    'netlify',
    'vercel',
  ]

  const buildInfo = {
    date: /* @__PURE__ */ new Date().toJSON(),
    preset: nitro.options.preset,
    framework: nitro.options.framework,
    versions: {
      nitro: version,
    },
    commands: {
      preview: nitro.options.commands.preview,
      deploy: nitro.options.commands.deploy,
    },
    config: {
      ...Object.fromEntries(
        presetsWithConfig.map((key) => [key, (nitro.options as any)[key]]),
      ),
    },
  }

  const buildInfoPath = path.resolve(nitro.options.output.dir, 'nitro.json')

  await fsp.writeFile(buildInfoPath, JSON.stringify(buildInfo, null, 2))

  const publicDir = nitro.options.output.publicDir

  // As a part of the build process, the `.vite/` directory
  // is copied over from `node_modules/.tanstack-start/client-dist/`
  // to the `publicDir` (e.g. `.output/public/`).
  // This directory (containing the vite manifest) should not be
  // included in the final build, so we remove it here.
  const viteDir = path.resolve(publicDir, '.vite')
  if (await fsp.stat(viteDir).catch(() => false)) {
    await fsp.rm(viteDir, { recursive: true, force: true })
  }

  await nitro.close()
}
