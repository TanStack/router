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

  await nitro.close()
}
