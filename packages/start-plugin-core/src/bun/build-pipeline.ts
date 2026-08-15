import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'pathe'
import { createBunAliasAndVirtualPlugin } from './bun-plugins'
import { createCssAssetsPlugin } from './css-assets-plugin'
import { createBunImportProtectionPlugin } from './import-protection'
import { createSolidServerAliasPlugin } from './solid-server-alias'
import {
  enrichBunClientBuildFromSourcemaps,
  normalizeBunClientBuild,
  toClientRelativeFileName,
} from './normalized-client-build'
import { BUN_ENVIRONMENT_NAMES } from './types'
import { copyPublicDirToClient } from './copy-public-dir'
import type { BunCoreOptions } from './types'
import type { CompileStartFrameworkOptions } from '../types'
import type { createBunCompilerHosts } from './start-compiler-host'
import type { createBunRouterSession } from './start-router-plugin'
import type { createBunVirtualModuleStore } from './virtual-modules'
import type { TanStackStartOutputConfig } from '../schema'
import type { ResolvedStartConfig } from '../types'
import type { BunResolvedEntryAliases } from './planning'

export type BunBuildContext = {
  startConfig: TanStackStartOutputConfig
  resolvedStartConfig: ResolvedStartConfig
  entryAliases: BunResolvedEntryAliases
  define: Record<string, string>
  virtualModules: ReturnType<typeof createBunVirtualModuleStore>
  compilers: ReturnType<typeof createBunCompilerHosts>
  routerSession: ReturnType<typeof createBunRouterSession>
  outDirs: { client: string; server: string }
  publicBase: string
  refreshResolver: () => void
  setPluginAdapters: (runtime: 'client' | 'server') => void
  mode: 'dev' | 'build'
  bunOpts?: BunCoreOptions
  emittedCss?: Map<string, string>
  framework: CompileStartFrameworkOptions
}

export async function buildBunClient(ctx: BunBuildContext) {
  await mkdir(ctx.outDirs.client, { recursive: true })
  ctx.setPluginAdapters('client')

  const bunOpts = ctx.bunOpts
  const minify =
    bunOpts?.minify ?? (ctx.mode === 'build')
  const emittedCss = ctx.emittedCss ?? new Map<string, string>()

  const cssPlugin = createCssAssetsPlugin({
    root: ctx.resolvedStartConfig.root,
    clientOutDir: ctx.outDirs.client,
    publicBase: ctx.publicBase,
    css: bunOpts?.css,
    srcDirectory: ctx.resolvedStartConfig.srcDirectory,
    onCssEmitted: ({ filePath, css }) => {
      emittedCss.set(filePath, css)
    },
  })
  const extraPlugins = [
    ...(bunOpts?.plugins ?? []),
    ...(bunOpts?.clientPlugins ?? []),
  ]

  const result = await Bun.build({
    entrypoints: [ctx.entryAliases.client],
    outdir: ctx.outDirs.client,
    target: 'browser',
    format: 'esm',
    packages: 'bundle',
    splitting: true,
    sourcemap: 'linked',
    minify,
    naming: {
      entry: 'assets/[name]-[hash].js',
      chunk: 'assets/[name]-[hash].js',
      asset: 'assets/[name]-[hash].[ext]',
    },
    define: ctx.define,
    plugins: [
      ...extraPlugins,
      cssPlugin,
      createBunAliasAndVirtualPlugin({
        aliases: ctx.entryAliases.alias,
        virtualModules: ctx.virtualModules,
      }),
      ctx.routerSession.createCodeSplitterPlugin('client'),
      ctx.compilers.createTransformPlugin('client'),
      createBunImportProtectionPlugin({
        envName: BUN_ENVIRONMENT_NAMES.client,
        envType: 'client',
        root: ctx.resolvedStartConfig.root,
        srcDirectory: ctx.resolvedStartConfig.srcDirectory,
        importProtection: ctx.startConfig.importProtection,
        mode: ctx.mode,
      }),
    ],
  })

  if (!result.success) {
    const message = result.logs.map(String).join('\n')
    throw new Error(`[tanstack-start-bun] Client build failed:\n${message}`)
  }

  const outputs = result.outputs.map((o) => ({
    path: o.path,
    fileName: toClientRelativeFileName(o.path, ctx.outDirs.client),
    kind: o.kind,
    sourcemapPath: `${o.path}.map`,
  }))

  let clientBuild = normalizeBunClientBuild({
    outputs,
    clientOutDir: ctx.outDirs.client,
  })
  clientBuild = await enrichBunClientBuildFromSourcemaps({
    clientBuild,
    outputs,
  })

  ctx.virtualModules.updateManifest({
    clientBuild,
    publicBase: ctx.publicBase,
    scriptFormat: 'module',
    inlineCss: {
      enabled: ctx.startConfig.server.build.inlineCss.enabled,
      transformAssets: ctx.startConfig.server.build.inlineCss.transformAssets,
    },
  })
  ctx.refreshResolver()

  return { result, clientBuild }
}

export async function buildBunServer(ctx: BunBuildContext) {
  await mkdir(ctx.outDirs.server, { recursive: true })
  ctx.setPluginAdapters('server')

  const bunOpts = ctx.bunOpts
  const minify =
    bunOpts?.minify ?? (ctx.mode === 'build')

  const cssPlugin = createCssAssetsPlugin({
    root: ctx.resolvedStartConfig.root,
    clientOutDir: ctx.outDirs.client,
    publicBase: ctx.publicBase,
    css: bunOpts?.css,
    srcDirectory: ctx.resolvedStartConfig.srcDirectory,
  })
  const solidServerAlias =
    ctx.framework === 'solid'
      ? createSolidServerAliasPlugin({ root: ctx.resolvedStartConfig.root })
      : null
  const extraPlugins = [
    ...(bunOpts?.plugins ?? []),
    ...(bunOpts?.serverPlugins ?? []),
  ]

  const result = await Bun.build({
    entrypoints: [ctx.entryAliases.server],
    outdir: ctx.outDirs.server,
    target: 'bun',
    format: 'esm',
    packages: 'bundle',
    splitting: false,
    sourcemap: 'linked',
    minify,
    // Solid: enable `solid` so @tanstack/solid-router resolves to dist/source
    // JSX that babel-preset-solid can SSR-compile. Also alias solid-js to server.
    ...(ctx.framework === 'solid' ? { conditions: ['solid', 'node'] } : {}),
    naming: {
      entry: 'server.js',
    },
    define: ctx.define,
    plugins: [
      ...extraPlugins,
      ...(solidServerAlias ? [solidServerAlias] : []),
      cssPlugin,
      createBunAliasAndVirtualPlugin({
        aliases: ctx.entryAliases.alias,
        virtualModules: ctx.virtualModules,
      }),
      ctx.routerSession.createCodeSplitterPlugin('server'),
      ctx.compilers.createTransformPlugin('server'),
      createBunImportProtectionPlugin({
        envName: BUN_ENVIRONMENT_NAMES.server,
        envType: 'server',
        root: ctx.resolvedStartConfig.root,
        srcDirectory: ctx.resolvedStartConfig.srcDirectory,
        importProtection: ctx.startConfig.importProtection,
        mode: ctx.mode,
      }),
    ],
  })

  if (!result.success) {
    const message = result.logs.map(String).join('\n')
    throw new Error(`[tanstack-start-bun] Server build failed:\n${message}`)
  }

  return result
}

export async function writeBunHostEntry(serverOutDir: string) {
  const { generateHostEntrySource } = await import('./static-host')
  await writeFile(
    join(serverOutDir, 'host.js'),
    generateHostEntrySource(),
    'utf8',
  )
}

export async function copyBunPublicAssets(opts: {
  root: string
  clientOutDir: string
  publicDir?: string
}) {
  return copyPublicDirToClient(opts)
}
