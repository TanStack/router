import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'pathe'
import { afterEach, describe, expect, test } from 'vitest'
import { createRsbuild } from '@rsbuild/core'
import { tanStackStartRsbuild } from '../../src/rsbuild/plugin'
import { createRsbuildEnvironmentDefaults } from '../../src/rsbuild/planning'
import type { RsbuildConfig } from '@rsbuild/core'

const roots: Array<string> = []
const publicAssetDistPath = {
  css: 'assets/css',
  cssAsync: 'assets/css/async',
  svg: 'assets/svg',
  font: 'assets/font',
  wasm: 'assets/wasm',
  image: 'assets/image',
  media: 'assets/media',
  assets: 'assets/assets',
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) =>
      rm(root, {
        recursive: true,
        force: true,
      }),
    ),
  )
})

async function getNormalizedConfig(
  opts: {
    config?: RsbuildConfig
  } = {},
) {
  const root = await mkdtemp(join(tmpdir(), 'tss-rsbuild-config-'))
  const srcDirectory = join(root, 'src')
  const { config = {} } = opts
  roots.push(root)

  await mkdir(srcDirectory)
  await Promise.all(
    ['client.ts', 'router.ts', 'server.ts', 'start.ts'].map((file) =>
      writeFile(join(srcDirectory, file), 'export {}\n'),
    ),
  )

  const rsbuild = await createRsbuild({
    cwd: root,
    config: {
      ...config,
      logLevel: 'error',
      plugins: [
        tanStackStartRsbuild({
          framework: 'react',
          defaultEntryPaths: {
            client: join(srcDirectory, 'client.ts'),
            server: join(srcDirectory, 'server.ts'),
            start: join(srcDirectory, 'start.ts'),
          },
          providerEnvironmentName: 'ssr',
          ssrIsProvider: true,
        }),
      ],
    },
  })

  await rsbuild.initConfigs({ action: 'dev' })
  return rsbuild.getNormalizedConfig()
}

describe('createRsbuildEnvironmentDefaults', () => {
  test('creates all client defaults', () => {
    expect(
      createRsbuildEnvironmentDefaults({
        environmentName: 'client',
        config: {},
        isDev: false,
        rscEnabled: false,
        serverFnProviderEnv: 'ssr',
      }),
    ).toEqual({
      output: {
        module: true,
        distPath: {
          root: 'dist/client',
          ...publicAssetDistPath,
          js: 'assets/js',
          jsAsync: 'assets/js/async',
        },
      },
      splitChunks: {
        preset: 'none',
        chunks: 'async',
      },
    })
  })

  test('creates all development and RSC server defaults', () => {
    expect(
      createRsbuildEnvironmentDefaults({
        environmentName: 'ssr',
        config: {},
        isDev: true,
        rscEnabled: true,
        serverFnProviderEnv: 'ssr',
      }),
    ).toEqual({
      output: {
        module: false,
        distPath: {
          root: 'dist/server',
          ...publicAssetDistPath,
        },
      },
      splitChunks: {
        preset: 'single-vendor',
      },
    })
  })

  test('only adds the server module and splitting defaults when enabled', () => {
    const defaults = createRsbuildEnvironmentDefaults({
      environmentName: 'ssr',
      config: {},
      isDev: false,
      rscEnabled: false,
      serverFnProviderEnv: 'ssr',
    })

    expect(defaults.output?.module).toBeUndefined()
    expect(defaults.splitChunks).toBeUndefined()
  })

  test('creates all standalone server function provider defaults', () => {
    expect(
      createRsbuildEnvironmentDefaults({
        environmentName: 'server-fn',
        config: {},
        isDev: true,
        rscEnabled: false,
        serverFnProviderEnv: 'server-fn',
      }),
    ).toEqual({
      output: {
        module: false,
        distPath: {
          root: 'dist/server/server-fn',
          ...publicAssetDistPath,
        },
      },
    })
  })

  test('does not create defaults for unmanaged environments', () => {
    expect(
      createRsbuildEnvironmentDefaults({
        environmentName: 'worker',
        config: {},
        isDev: true,
        rscEnabled: false,
        serverFnProviderEnv: 'server-fn',
      }),
    ).toEqual({})
  })

  test.each([
    {
      scope: 'root',
      config: {
        output: { module: false },
        splitChunks: { preset: 'single-vendor' },
      } satisfies RsbuildConfig,
    },
    {
      scope: 'environment',
      config: {
        environments: {
          client: {
            output: { module: false },
            splitChunks: { preset: 'single-vendor' },
          },
          ssr: {
            output: { module: true },
            splitChunks: { preset: 'none' },
          },
          'server-fn': {
            output: { module: true },
          },
        },
      } satisfies RsbuildConfig,
    },
  ])(
    'omits defaults for fields configured at the $scope level',
    ({ config }) => {
      const getDefaults = (environmentName: string, rscEnabled: boolean) =>
        createRsbuildEnvironmentDefaults({
          environmentName,
          config,
          isDev: true,
          rscEnabled,
          serverFnProviderEnv: 'server-fn',
        })

      const client = getDefaults('client', false)
      expect(client.output?.module).toBeUndefined()
      expect(client.splitChunks).toBeUndefined()

      const server = getDefaults('ssr', true)
      expect(server.output?.module).toBeUndefined()
      expect(server.splitChunks).toBeUndefined()

      const provider = getDefaults('server-fn', false)
      expect(provider.output?.module).toBeUndefined()
    },
  )
})

describe('Rsbuild framework default config', () => {
  test('applies Start defaults instead of Rsbuild-generated defaults', async () => {
    const config = await getNormalizedConfig()
    const client = config.environments.client!
    const server = config.environments.ssr!

    expect(client.output.module).toBe(true)
    expect(client.output.distPath).toMatchObject({
      root: 'dist/client',
      js: 'assets/js',
      jsAsync: 'assets/js/async',
      css: 'assets/css',
      cssAsync: 'assets/css/async',
    })
    expect(client.splitChunks).toEqual({
      preset: 'none',
      chunks: 'async',
    })
    expect(server.output.module).toBe(false)
  })

  test('lets explicit user config override Start defaults', async () => {
    const config = await getNormalizedConfig({
      config: {
        output: {
          distPath: {
            css: 'custom-css',
          },
        },
        environments: {
          client: {
            output: {
              module: false,
              distPath: 'custom/client',
            },
            splitChunks: {
              preset: 'default',
            },
          },
          ssr: {
            output: {
              module: true,
              distPath: 'custom/server',
            },
          },
        },
      },
    })
    const client = config.environments.client!
    const server = config.environments.ssr!

    expect(client.output.module).toBe(false)
    expect(client.output.distPath).toMatchObject({
      root: 'custom/client',
      css: 'custom-css',
      js: 'assets/js',
    })
    expect(client.splitChunks).toEqual({
      preset: 'default',
    })
    expect(server.output.module).toBe(true)
    expect(server.output.distPath.root).toBe('custom/server')
  })
})
