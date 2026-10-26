/**
 * Minimal build hosts for the import-protection witness tests: a Vite
 * (Rolldown) plugin and an Rspack plugin + loader that wire the session
 * the way a Start host does:
 * compile every in-scope module with the `import-edges` planner,
 * `afterCompile`, serve edge modules, read the survival witness after
 * tree-shaking, `decide`, and rebuild to the fixed point on a veto.
 * Internal tests of the host-agnostic modules (not oracle tests).
 */
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import {
  RawFactsCache,
  compileModule,
  createCompilerCaches,
} from '@tanstack/router-utils/compiler'
import { createAppDirectory } from '@tanstack/compiler-test-utils/app-directory'
import {
  resolveViteEdgeModuleId,
  rspackEdgeModuleIds,
} from '../../../src/import-protection/edge-modules'
import { createImportProtection } from '../../../src/import-protection/session'
import {
  discardBundle,
  readRolldownWitness,
  readRspackWitness,
  rolldownGraphView,
  rspackGraphView,
} from '../../../src/import-protection/witness'
import type {
  CompilerCaches,
  EnvInfo,
  HostServices,
} from '@tanstack/router-utils/compiler'
import type { ImportProtection } from '../../../src/import-protection/session'
import type { ViolationInfo } from '../../../src/import-protection/trace'
import type { WitnessCase } from './cases'
import type { Plugin } from 'vite'

const run = promisify(execFile)
const here = path.dirname(fileURLToPath(import.meta.url))

export interface BuildOutcome {
  root: string
  /** `importer -> specifier` of every `onViolation` call, in order. */
  calls: Array<string>
  /** `importer -> specifier` of the final reports. */
  reported: Array<string>
  passes: number
  error: string | null
  /** The `OUT …` lines the built program prints (null when it was not run). */
  out: string | null
}

export interface BuildOptions {
  behavior?: 'error' | 'mock'
  /** Edges (`importer -> specifier`) whose `onViolation` returns false. */
  veto?: Array<string>
  /** Run the built program. */
  runOutput?: boolean
}

async function materialize(c: WitnessCase, bundler: string): Promise<string> {
  const root = await createAppDirectory(here, `ip-${bundler}-`)
  for (const [rel, code] of Object.entries(c.files)) {
    const file = path.join(root, rel)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, code)
  }
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n')
  return root
}

function session(
  c: WitnessCase,
  root: string,
  opts: BuildOptions,
  calls: Array<string>,
  ids?: ReturnType<typeof rspackEdgeModuleIds>,
) {
  const label = (info: ViolationInfo) =>
    `${path.relative(root, info.importer)} -> ${info.specifier}`
  const ip = createImportProtection({
    options: {
      behavior: opts.behavior ?? 'mock',
      mockAccess: 'off',
      ignoreImporters: ['src/exempt/**'],
      ...(c.denied && { client: { files: c.denied } }),
      onViolation: (info) => {
        const l = label(info as ViolationInfo)
        calls.push(l)
        return opts.veto?.includes(l) ? false : undefined
      },
    },
    root,
    srcDirectory: path.join(root, 'src'),
    mode: 'build',
    ids,
  })!
  const rawFacts = new RawFactsCache({
    readFile: (p) => fs.promises.readFile(p, 'utf8').catch(() => null),
    loadVirtual: () => Promise.resolve(null),
    markerSpecifiers: ip.markerSpecifiers,
  })
  const caches = createCompilerCaches(rawFacts)
  const env = ip.env('client', 'client')
  return { ip, rawFacts, caches, env, label }
}

const envInfo = (bundler: EnvInfo['bundler']): EnvInfo => ({
  name: 'client',
  type: 'client',
  mode: 'build',
  bundler,
  framework: null,
  conditions: ['browser'],
  routerSplit: false,
})

/** Compiles one module the way a host transform/loader does; null: untouched. */
async function compile(
  ip: ImportProtection,
  caches: CompilerCaches,
  host: HostServices,
  id: string,
  code: string,
  bundler: EnvInfo['bundler'],
): Promise<{ code: string; diagnostics: Array<string> } | null> {
  const out = await compileModule(
    {
      id,
      code,
      env: envInfo(bundler),
      planners: [ip.planner],
      config: { configKey: ip.config.configKey, perPlanner: {} },
      wantMap: false,
    },
    host,
    caches,
  )
  if (!out) {
    return null
  }
  ip.env('client').afterCompile(id, out)
  return {
    code: out.code,
    diagnostics: out.diagnostics
      .filter((d) => d.severity === 'error')
      .map((d) => d.message),
  }
}

async function runProgram(file: string): Promise<string> {
  try {
    // (no colours: a number would print with escapes under FORCE_COLOR)
    const { stdout } = await run(process.execPath, [file], {
      timeout: 10_000,
      env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
    })
    return stdout
      .split('\n')
      .filter((l) => l.startsWith('OUT'))
      .join(' | ')
  } catch (error) {
    return `THROWS: ${String((error as { stderr?: string }).stderr ?? error)}`
  }
}

/** A Vite production build of the case's client with the session's plugin (Start's build loop: rebuild to the fixed point). */
export async function buildWithVite(
  c: WitnessCase,
  opts: BuildOptions = {},
): Promise<BuildOutcome> {
  const { createBuilder } = await import('vite')
  const root = await materialize(c, 'vite')
  const calls: Array<string> = []
  const { ip, caches, rawFacts, env, label } = session(c, root, opts, calls)
  let reported: Array<string> = []
  const plugin: Plugin = {
    name: 'test:import-protection',
    enforce: 'pre',
    resolveId(source) {
      return resolveViteEdgeModuleId(source)
    },
    load(id) {
      const load = ip.load(id)
      return load
        ? { code: load.code, moduleSideEffects: load.moduleSideEffects }
        : null
    },
    async transform(code, id) {
      if (id.startsWith('\0') || id.includes('/node_modules/')) {
        return null
      }
      const host: HostServices = {
        resolve: async (specifier, importer) => {
          const r = await this.resolve(specifier, importer, { skipSelf: true })
          return r ? { id: r.id, external: r.external === true } : null
        },
        readFile: (p) => fs.promises.readFile(p, 'utf8').catch(() => null),
        loadVirtual: () => Promise.resolve(null),
        rawFacts,
      }
      const out = await compile(ip, caches, host, id, code, 'vite')
      if (out?.diagnostics.length) {
        this.error(out.diagnostics[0]!)
      }
      return out ? { code: out.code, map: null } : null
    },
    async generateBundle(_options, bundle) {
      const live = readRolldownWitness(bundle as never, env.witness())
      const result = await env.decide(
        live,
        rolldownGraphView((id) => this.getModuleInfo(id)),
      )
      if (result.needPass) {
        discardBundle(bundle)
        return
      }
      const reports = env.buildReports()
      reported = reports.map((r) => label(r.info))
      const failure = reports.find((r) => r.severity === 'error')
      if (failure) {
        this.error(failure.message)
      }
    },
  }
  const builder = await createBuilder({
    root,
    configFile: false,
    logLevel: 'silent',
    cacheDir: path.join(root, '.vite'),
    plugins: [plugin],
    build: {
      outDir: 'dist',
      emptyOutDir: true,
      target: 'esnext',
      modulePreload: false,
      rolldownOptions: {
        input: { entry: path.join(root, c.entry ?? 'src/entry.ts') },
        output: {
          format: 'es',
          entryFileNames: '[name].mjs',
          chunkFileNames: '[name]-[hash].mjs',
        },
      },
    },
  })
  env.beginLogicalBuild()
  let error: string | null = null
  try {
    await env.build.runToFixedPoint(() =>
      builder.build(builder.environments.client!),
    )
  } catch (e) {
    error = String((e as Error).message)
  }
  const entry = path.join(root, 'dist/entry.mjs')
  return {
    root,
    calls,
    reported,
    passes: env.build.passes,
    error,
    out:
      opts.runOutput && !error && fs.existsSync(entry)
        ? await runProgram(entry)
        : null,
  }
}

type LoaderHost = (
  loader: {
    resource: string
    getResolve: (
      options?: object,
    ) => (context: string, request: string) => Promise<string>
    _module?: { buildInfo?: Record<string, unknown> }
  },
  code: string,
) => Promise<string | null>

const HOSTS = Symbol.for('tanstack.start.ip.witness-hosts')
const loaderHosts = ((globalThis as Record<symbol, unknown>)[HOSTS] ??= new Map<
  string,
  LoaderHost
>()) as Map<string, LoaderHost>

/** An Rsbuild production build (Rspack, Rsbuild's defaults) with the session's plugin and loader (needAdditionalPass to the fixed point). */
export async function buildWithRsbuild(
  c: WitnessCase,
  opts: BuildOptions = {},
): Promise<BuildOutcome> {
  const { createRsbuild } = await import('@rsbuild/core')
  const root = await materialize(c, 'rsbuild')
  const virtualDir = path.join(
    root,
    'node_modules/.virtual/tanstack-start/import-protection',
  )
  const ids = rspackEdgeModuleIds(virtualDir)
  const calls: Array<string> = []
  const { ip, caches, rawFacts, env, label } = session(
    c,
    root,
    opts,
    calls,
    ids,
  )
  let reported: Array<string> = []
  // the host writes edge modules as files before the importer's dependencies resolve
  ip.onEdgeModule((file, load) => {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, load.code)
  })
  loaderHosts.set(root, async (loader, code) => {
    const resolve = loader.getResolve({})
    const host: HostServices = {
      resolve: async (specifier, importer) => {
        try {
          const dir = path.dirname(importer.split('?')[0]!)
          return { id: await resolve(dir, specifier) }
        } catch {
          return null
        }
      },
      readFile: (p) => fs.promises.readFile(p, 'utf8').catch(() => null),
      loadVirtual: () => Promise.resolve(null),
      rawFacts,
    }
    const out = await compile(ip, caches, host, loader.resource, code, 'rspack')
    if (out?.diagnostics.length) {
      throw new Error(out.diagnostics[0])
    }
    return out ? out.code : null
  })
  const plugin = {
    apply(compiler: any) {
      const { Compilation, WebpackError } = compiler.webpack
      compiler.hooks.beforeRun.tap('test:import-protection', () =>
        env.beginLogicalBuild(),
      )
      compiler.hooks.thisCompilation.tap(
        'test:import-protection',
        (compilation: any) => {
          compilation.hooks.processAssets.tapPromise(
            {
              name: 'test:import-protection',
              stage: Compilation.PROCESS_ASSETS_STAGE_ADDITIONAL,
            },
            async () => {
              const live = readRspackWitness(compilation, env.witness())
              const result = await env.decide(
                live,
                rspackGraphView(compilation),
              )
              if (result.needPass) {
                return
              }
              const reports = env.buildReports()
              reported = reports.map((r) => label(r.info))
              for (const r of reports) {
                ;(r.severity === 'error'
                  ? compilation.errors
                  : compilation.warnings
                ).push(new WebpackError(r.message))
              }
            },
          )
          compilation.hooks.needAdditionalPass.tap(
            'test:import-protection',
            () => env.build.needPass,
          )
        },
      )
    },
  }
  let error: string | null = null
  try {
    const rsbuild = await createRsbuild({
      cwd: root,
      loadEnv: false,
      rsbuildConfig: {
        mode: 'production',
        logLevel: 'silent',
        source: { entry: { entry: `./${c.entry ?? 'src/entry.ts'}` } },
        output: {
          target: 'node',
          filenameHash: false,
          cleanDistPath: true,
          distPath: { root: 'dist' },
        },
        performance: { printFileSize: false },
        tools: {
          rspack(config: any) {
            config.plugins.push(plugin)
            config.module.rules.unshift(
              {
                test: /\.[cm]?[jt]sx?$/,
                exclude: /[\\/]node_modules[\\/]/,
                enforce: 'pre',
                use: [{ loader: path.join(here, 'ip-loader.mjs') }],
              },
              {
                test: /[\\/]import-protection[\\/][^\\/]+[\\/]runtime\.mjs$/,
                sideEffects: false,
              },
            )
          },
        },
      },
    })
    const result = await rsbuild.build()
    await (result as { close?: () => Promise<void> } | undefined)?.close?.()
  } catch (e) {
    error = String((e as Error).message)
  } finally {
    loaderHosts.delete(root)
  }
  const entry = path.join(root, 'dist/entry.js')
  return {
    root,
    calls,
    reported,
    passes: env.build.passes,
    error,
    out:
      opts.runOutput && !error && fs.existsSync(entry)
        ? await runProgram(entry)
        : null,
  }
}
