import { existsSync, promises as fsp } from 'node:fs'
import path from 'pathe'
import { prerender } from './prerender'
import { createLogger } from './utils'
import type { TanStackStartOutputConfig } from './schema'

type NitroLike = {
  options: {
    rootDir: string
    output?: {
      dir?: string
      publicDir?: string
    }
    preset?: string
  }
}

type PrerenderMode = 'vite-preview' | 'nitro-server'

export function resolveNitroOutputPaths(nitro: NitroLike) {
  const rootDir = nitro.options.rootDir
  const output = nitro.options.output ?? {}
  const outputDir = resolveNitroPath(rootDir, output.dir ?? '.output')
  const publicDir = resolveNitroPath(
    rootDir,
    output.publicDir ?? path.join(output.dir ?? '.output', 'public'),
  )

  return { outputDir, publicDir }
}

export async function prerenderWithNitro({
  startConfig,
  nitro,
  mode,
  configFile,
}: {
  startConfig: TanStackStartOutputConfig
  nitro: NitroLike
  mode: PrerenderMode
  configFile?: string
}) {
  const logger = createLogger('prerender')
  const { outputDir, publicDir } = resolveNitroOutputPaths(nitro)

  if (mode === 'vite-preview') {
    const nitroJsonPath = path.join(outputDir, 'nitro.json')
    if (!existsSync(nitroJsonPath)) {
      await writeNitroBuildInfo({
        outputDir,
        preset: nitro.options.preset,
      })
    }

    logger.info('Prerendering pages using vite.preview()...')
    await prerender({
      startConfig,
      outputDir: publicDir,
      configFile,
    })
    return
  }

  logger.info('Prerendering pages using Nitro server...')
  await prerender({
    startConfig,
    outputDir: publicDir,
    nitroServerPath: path.join(outputDir, 'server/index.mjs'),
  })
}

async function writeNitroBuildInfo({
  outputDir,
  preset,
}: {
  outputDir: string
  preset?: string
}) {
  const logger = createLogger('prerender')
  logger.info('Writing nitro.json for vite.preview()...')

  const buildInfo = {
    date: new Date().toJSON(),
    preset,
    framework: { name: 'tanstack-start' },
    versions: {},
    commands: {
      preview: `node ${path.join(outputDir, 'server/index.mjs')}`,
    },
  }

  const buildInfoPath = path.join(outputDir, 'nitro.json')
  await fsp.writeFile(buildInfoPath, JSON.stringify(buildInfo, null, 2))
}

function resolveNitroPath(rootDir: string, value: string) {
  return path.isAbsolute(value) ? value : path.resolve(rootDir, value)
}
