import { spawn } from 'node:child_process'
import { access, mkdir, readFile, readdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { isMap, parseDocument } from 'yaml'

const NATIVE_SCRIPT_VITE_VERSION = '^7.3.6'
const NATIVE_SCRIPT_PNPM_BUILD_POLICY = {
  '@nativescript/core': true,
  '@parcel/watcher': true,
  esbuild: true,
  lmdb: false,
  'msgpackr-extract': false,
  nativescript: true,
} as const

export type NativeScriptPackageManager = 'npm' | 'pnpm' | 'yarn'

export interface NativeScriptInitOptions {
  root?: string
  appId?: string
  routerFile?: string
  serverFnBase?: string
  serverPort?: number
  packageManager?: NativeScriptPackageManager
  adapterVersion?: string
  templateDirectory?: string
  install?: boolean
  force?: boolean
}

export interface NativeScriptInitResult {
  root: string
  mode: 'router' | 'start'
  appId: string
  packageManager: NativeScriptPackageManager
  created: Array<string>
  updated: Array<string>
  unchanged: Array<string>
}

interface PackageJson {
  name?: string
  main?: string
  scripts?: Record<string, string>
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  [key: string]: unknown
}

interface ManagedFile {
  relativePath: string
  contents: Buffer
  merge?: boolean
}

export class NativeScriptScaffoldConflictError extends Error {
  conflicts: Array<string>

  constructor(conflicts: Array<string>) {
    super(
      `NativeScript initialization would overwrite existing configuration:\n${conflicts
        .map((file) => `- ${file}`)
        .join(
          '\n',
        )}\nRerun with --force only if these files should be replaced.`,
    )
    this.name = 'NativeScriptScaffoldConflictError'
    this.conflicts = conflicts
  }
}

function normalizePath(file: string): string {
  return file.split(path.sep).join('/')
}

function stripModuleExtension(file: string): string {
  return file.replace(/\.(?:[cm]?[jt]sx?)$/, '')
}

function asModuleSpecifier(fromDirectory: string, file: string): string {
  const relative = normalizePath(
    path.relative(fromDirectory, stripModuleExtension(file)),
  )
  return relative.startsWith('.') ? relative : `./${relative}`
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file)
    return true
  } catch {
    return false
  }
}

function findPackageManager(root: string): NativeScriptPackageManager {
  let directory = root
  for (;;) {
    if (existsSync(path.join(directory, 'pnpm-lock.yaml'))) {
      return 'pnpm'
    }
    if (existsSync(path.join(directory, 'yarn.lock'))) {
      return 'yarn'
    }
    if (existsSync(path.join(directory, 'package-lock.json'))) {
      return 'npm'
    }

    const parent = path.dirname(directory)
    if (parent === directory) {
      return 'npm'
    }
    directory = parent
  }
}

function findPnpmWorkspaceFile(root: string): string {
  let directory = root
  for (;;) {
    const workspaceFile = path.join(directory, 'pnpm-workspace.yaml')
    if (existsSync(workspaceFile)) {
      return workspaceFile
    }

    const parent = path.dirname(directory)
    if (parent === directory) {
      return path.join(root, 'pnpm-workspace.yaml')
    }
    directory = parent
  }
}

async function createPnpmWorkspaceFile(
  root: string,
  force: boolean,
  conflicts: Array<string>,
): Promise<ManagedFile> {
  const workspaceFile = findPnpmWorkspaceFile(root)
  const relativePath = normalizePath(path.relative(root, workspaceFile))
  const current = (await fileExists(workspaceFile))
    ? await readFile(workspaceFile, 'utf8')
    : ''
  const document = parseDocument(current)

  if (document.errors.length) {
    throw new Error(
      `Could not update ${workspaceFile}: ${document.errors[0]?.message}`,
    )
  }
  if (document.contents === null) {
    document.set('allowBuilds', {})
  }
  if (!isMap(document.contents)) {
    throw new Error(
      `Could not update ${workspaceFile}: the document root must be a YAML map.`,
    )
  }

  const allowBuilds = document.get('allowBuilds', true)
  if (allowBuilds !== undefined && !isMap(allowBuilds)) {
    if (!force) {
      conflicts.push(`${relativePath}#allowBuilds`)
      return {
        relativePath,
        contents: Buffer.from(current),
        merge: true,
      }
    } else {
      document.set('allowBuilds', {})
    }
  }

  for (const [packageName, allowed] of Object.entries(
    NATIVE_SCRIPT_PNPM_BUILD_POLICY,
  )) {
    const field = `${relativePath}#allowBuilds.${packageName}`
    const currentValue = document.getIn(['allowBuilds', packageName])
    if (allowed && currentValue === false && !force) {
      conflicts.push(field)
    } else if (allowed && currentValue !== true) {
      document.setIn(['allowBuilds', packageName], true)
    } else if (!allowed && typeof currentValue !== 'boolean') {
      document.setIn(['allowBuilds', packageName], false)
    }
  }

  return {
    relativePath,
    contents: Buffer.from(String(document)),
    merge: true,
  }
}

async function createGitIgnoreFile(root: string): Promise<ManagedFile> {
  const relativePath = '.gitignore'
  const gitIgnoreFile = path.join(root, relativePath)
  const current = (await fileExists(gitIgnoreFile))
    ? await readFile(gitIgnoreFile, 'utf8')
    : ''
  const existingEntries = new Set(
    current.split(/\r?\n/).map((line) => line.trim()),
  )
  const missingEntries = ['.ns-vite-build/', 'hooks/', 'platforms/'].filter(
    (entry) => !existingEntries.has(entry),
  )
  if (missingEntries.length === 0) {
    return {
      relativePath,
      contents: Buffer.from(current),
      merge: true,
    }
  }

  const separator =
    current.length === 0 ? '' : current.endsWith('\n') ? '\n' : '\n\n'
  return {
    relativePath,
    contents: Buffer.from(
      `${current}${separator}# NativeScript\n${missingEntries.join('\n')}\n`,
    ),
    merge: true,
  }
}

function sanitizeAppName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/^@/, '')
    .replace(/[^a-z0-9]+/g, '')
  return sanitized || 'app'
}

function validateReactVersion(version: string): void {
  const normalized = version
    .replace(/^workspace:/, '')
    .replace(/^npm:react@/, '')
    .trim()
  const react19Version = 'v?19(?:\\.(?:\\d+|x|\\*)){0,2}(?:-[0-9A-Za-z.-]+)?'
  const react20UpperBound = 'v?20(?:\\.0){0,2}(?:-0)?'
  const supportsOnlyReact19 =
    new RegExp(`^(?:[~^])?${react19Version}$`).test(normalized) ||
    new RegExp(`^>=\\s*${react19Version}\\s+<\\s*${react20UpperBound}$`).test(
      normalized,
    )

  if (!supportsOnlyReact19) {
    throw new Error(
      `NativeScript initialization requires React 19, but found ${JSON.stringify(version)}.`,
    )
  }
}

function validateServerFnBase(serverFnBase: string): void {
  let url: URL
  try {
    url = new URL(serverFnBase)
  } catch {
    throw new Error(
      `NativeScript server function base must be an absolute URL, but found ${JSON.stringify(serverFnBase)}.`,
    )
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.search ||
    url.hash
  ) {
    throw new Error(
      `NativeScript server function base must be an HTTP(S) URL without a query string or hash, but found ${JSON.stringify(serverFnBase)}.`,
    )
  }
}

function normalizePackageVersionRange(
  packageName: string,
  version: string,
): string {
  const workspaceVersion = version.startsWith('workspace:')
    ? version.slice('workspace:'.length)
    : version
  const aliasPrefix = `npm:${packageName}@`
  return workspaceVersion.startsWith(aliasPrefix)
    ? workspaceVersion.slice(aliasPrefix.length)
    : workspaceVersion
}

function supportsNativeScriptVite(version: string): boolean {
  const range = normalizePackageVersionRange('vite', version).trim()
  const simpleRange = range.match(
    /^(?:[~^])?v?7\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/,
  )
  if (simpleRange) {
    return Number(simpleRange[1]) >= 3
  }

  return /^>=\s*7\.3\.0\s+<\s*8(?:\.0\.0)?$/.test(range)
}

function validateAppId(appId: string): void {
  if (!/^[A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z][A-Za-z0-9]*)+$/.test(appId)) {
    throw new Error(
      `Invalid NativeScript application id "${appId}". Use reverse-DNS notation such as com.example.app.`,
    )
  }
}

async function findRouterFile(
  root: string,
  configuredFile: string | undefined,
): Promise<string> {
  if (configuredFile) {
    const resolved = path.resolve(root, configuredFile)
    if (!(await fileExists(resolved))) {
      throw new Error(`Router module does not exist: ${resolved}`)
    }
    return resolved
  }

  const candidates = [
    'src/router.tsx',
    'src/router.ts',
    'src/router/index.tsx',
    'src/router/index.ts',
    'app/router.tsx',
    'app/router.ts',
  ]
  for (const candidate of candidates) {
    const resolved = path.join(root, candidate)
    if (await fileExists(resolved)) {
      return resolved
    }
  }

  throw new Error(
    'Could not find the app router module. Pass --router-file with the module that exports getRouter, router, or a default router.',
  )
}

function resolveTemplateDirectory(): string {
  try {
    const require = createRequire(path.join(process.cwd(), 'package.json'))
    const packageJson = require.resolve('@tanstack/router-cli/package.json')
    return path.join(path.dirname(packageJson), 'src/templates/nativescript')
  } catch {
    const candidates = [
      path.resolve(
        path.dirname(process.argv[1] ?? process.cwd()),
        '../src/templates/nativescript',
      ),
      path.resolve(
        process.cwd(),
        'node_modules/@tanstack/router-cli/src/templates/nativescript',
      ),
      path.resolve(
        process.cwd(),
        'packages/router-cli/src/templates/nativescript',
      ),
    ]
    const directory = candidates.find((candidate) => existsSync(candidate))
    if (directory) {
      return directory
    }
    throw new Error('Could not locate the NativeScript scaffold resources.')
  }
}

async function collectFiles(
  directory: string,
  relativeDirectory = '',
): Promise<Array<ManagedFile>> {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    withFileTypes: true,
  })
  const files: Array<ManagedFile> = []

  for (const entry of entries) {
    const relativePath = path.join(relativeDirectory, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(directory, relativePath)))
    } else if (entry.isFile()) {
      files.push({
        relativePath: normalizePath(relativePath),
        contents: await readFile(path.join(directory, relativePath)),
      })
    }
  }

  return files
}

function textFile(relativePath: string, contents: string): ManagedFile {
  return {
    relativePath,
    contents: Buffer.from(contents),
  }
}

function createNativeScriptConfig(
  appId: string,
  packageManager: NativeScriptPackageManager,
): string {
  return `import type { NativeScriptConfig } from '@nativescript/core'

export default {
  id: ${JSON.stringify(appId)},
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  bundler: 'vite',
  bundlerConfigPath: 'vite.native.config.ts',
  android: {
    v8Flags: '--expose_gc',
    markingMode: 'none',
  },
  cli: {
    packageManager: ${JSON.stringify(packageManager)},
    additionalPathsToClean: ['.ns-vite-build'],
  },
} satisfies NativeScriptConfig
`
}

function createStartViteConfig(
  serverFnBase: string | undefined,
  serverPort: number,
): string {
  const configuredBase = serverFnBase
    ? ` ?? ${JSON.stringify(serverFnBase)}`
    : ''

  return `import { reactConfig } from '@nativescript/vite/react'
import { tanstackStartNativeScript } from '@tanstack/react-start/plugin/nativescript'
import { defineConfig, mergeConfig } from 'vite'

function getServerFnBase(mode: string): string {
  const configured = process.env.TSS_SERVER_FN_BASE${configuredBase}
  if (configured) {
    return configured
  }
  if (mode === 'production') {
    throw new Error(
      'Set TSS_SERVER_FN_BASE to the deployed absolute Start server-function URL before building the native app.',
    )
  }
  return process.env.TSS_NATIVE_PLATFORM === 'android'
    ? 'http://10.0.2.2:${serverPort}/_serverFn/'
    : 'http://127.0.0.1:${serverPort}/_serverFn/'
}

export default defineConfig(({ mode }) =>
  mergeConfig(reactConfig({ mode }), {
    resolve: {
      preserveSymlinks: false,
    },
    plugins: [
      tanstackStartNativeScript({
        serverFnBase: getServerFnBase(mode),
        serverFnMode: mode === 'production' ? 'build' : 'dev',
        nativeRootRoute: 'src/native/root-route.tsx',
      }),
    ],
  }),
)
`
}

function createRouterViteConfig(): string {
  return `import { reactConfig } from '@nativescript/vite/react'
import { tanstackRouterGenerator } from '@tanstack/router-plugin/vite'
import { tanstackReactNativeScript } from '@tanstack/react-nativescript-router/vite'
import { defineConfig, mergeConfig } from 'vite'

export default defineConfig(({ mode }) =>
  mergeConfig(reactConfig({ mode }), {
    resolve: {
      preserveSymlinks: false,
    },
    plugins: [
      tanstackReactNativeScript({
        nativeRootRoute: 'src/native/root-route.tsx',
      }),
      tanstackRouterGenerator({ target: 'react' }),
    ],
  }),
)
`
}

function createNativeEntry(routerImport: string, isStart: boolean): string {
  const startImport = isStart
    ? "import { configureNativeScriptStart } from '@tanstack/react-start/nativescript'\n"
    : ''
  const initialize = isStart
    ? '  initialize: () => configureNativeScriptStart(),\n'
    : ''

  return `import { startNativeScriptApp } from '@tanstack/react-nativescript-router'
import type { AnyRouter } from '@tanstack/react-nativescript-router'
${startImport}import * as routerModule from ${JSON.stringify(routerImport)}

type AppRouterModule = {
  getRouter?: () => AnyRouter
  router?: AnyRouter
  default?: AnyRouter | (() => AnyRouter)
}

function resolveRouter(): AnyRouter {
  const module = routerModule as unknown as AppRouterModule
  if (module.getRouter) {
    return module.getRouter()
  }
  if (module.router) {
    return module.router
  }
  if (typeof module.default === 'function') {
    return module.default()
  }
  if (module.default) {
    return module.default
  }
  throw new Error(
    'The router module must export getRouter(), router, or a default router.',
  )
}

void startNativeScriptApp({
  router: resolveRouter(),
${initialize}})
`
}

function createNativeRootRoute(): string {
  return `import { Outlet, createRootRoute } from '@tanstack/react-router'

export const Route = createRootRoute({
  component: Outlet,
})
`
}

function createNativeJsxTypes(): string {
  return `import 'react'

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      absolutelayout: Record<string, unknown>
      actionbar: Record<string, unknown>
      actionitem: Record<string, unknown>
      contentview: Record<string, unknown>
      docklayout: Record<string, unknown>
      flexboxlayout: Record<string, unknown>
      frame: Record<string, unknown>
      gridlayout: Record<string, unknown>
      navigationbutton: Record<string, unknown>
      page: Record<string, unknown>
      rootlayout: Record<string, unknown>
      scrollview: Record<string, unknown>
      stacklayout: Record<string, unknown>
      textfield: Record<string, unknown>
      textview: Record<string, unknown>
      wraplayout: Record<string, unknown>
    }
  }
}
`
}

function mergeManagedRecord(
  current: Record<string, string> | undefined,
  additions: Record<string, string>,
  section: string,
  force: boolean,
  conflicts: Array<string>,
): Record<string, string> {
  const next = { ...current }
  for (const [key, value] of Object.entries(additions)) {
    if (current?.[key] && current[key] !== value && !force) {
      conflicts.push(`package.json#${section}.${key}`)
      continue
    }
    next[key] = current?.[key] && !force ? current[key] : value
  }
  return next
}

function addMissingDependencies(
  current: Record<string, string> | undefined,
  additions: Record<string, string>,
): Record<string, string> {
  return { ...additions, ...current }
}

function createPackageJson(
  current: PackageJson,
  mode: 'router' | 'start',
  adapterVersion: string,
  routerVersion: string,
  serverPort: number,
  packageManager: NativeScriptPackageManager,
  force: boolean,
  conflicts: Array<string>,
): PackageJson {
  const isStart = mode === 'start'
  if (current.main && current.main !== 'src/native/index.tsx' && !force) {
    conflicts.push('package.json#main')
  }

  const scripts: Record<string, string> = {
    'native:ios': isStart
      ? `concurrently --kill-others-on-fail --names start,ios "${packageManager} run native:server" "wait-on http-get://127.0.0.1:${serverPort} && cross-env TSS_NATIVE_PLATFORM=ios ns debug ios --no-hmr"`
      : 'cross-env TSS_NATIVE_PLATFORM=ios ns debug ios --no-hmr',
    'native:android': isStart
      ? `concurrently --kill-others-on-fail --names start,android "${packageManager} run native:server" "wait-on http-get://127.0.0.1:${serverPort} && cross-env TSS_NATIVE_PLATFORM=android ns debug android --no-hmr"`
      : 'cross-env TSS_NATIVE_PLATFORM=android ns debug android --no-hmr',
    'native:build:ios':
      'cross-env TSS_NATIVE_PLATFORM=ios ns build ios --release --env.production',
    'native:build:android':
      'cross-env TSS_NATIVE_PLATFORM=android ns build android --release --env.production',
    'native:clean': 'ns clean',
  }
  if (isStart) {
    scripts['native:server'] = `vite dev --host 0.0.0.0 --port ${serverPort}`
  }

  const dependencies = {
    '@nativescript-community/react': '^19.0.0',
    '@nativescript/core': '^9.0.20',
    '@tanstack/react-nativescript-router': adapterVersion,
    dominative: '^0.1.3',
    'react-nativescript': 'npm:@nativescript-community/react@^19.0.0',
    'undom-ng': '^1.1.2',
  }
  const devDependencies: Record<string, string> = {
    '@nativescript/android': '^9.0.5',
    '@nativescript/ios': '^9.0.3',
    '@nativescript/types': '^9.0.0',
    '@nativescript/vite': '2.0.3',
    'cross-env': '^10.1.0',
    nativescript: '^9.0.6',
  }
  if (isStart) {
    devDependencies.concurrently = '^9.2.1'
    devDependencies['wait-on'] = '^9.0.3'
  } else {
    devDependencies['@tanstack/router-plugin'] = routerVersion
  }

  const nextDependencies = addMissingDependencies(
    current.dependencies,
    dependencies,
  )
  const nextDevDependencies = addMissingDependencies(
    current.devDependencies,
    devDependencies,
  )
  const viteDependencies = [
    ['dependencies', current.dependencies, nextDependencies],
    ['devDependencies', current.devDependencies, nextDevDependencies],
  ] as const
  let hasVite = false
  for (const [
    section,
    currentDependencies,
    nextDependenciesForSection,
  ] of viteDependencies) {
    const currentVite = currentDependencies?.vite
    if (!currentVite) {
      continue
    }
    hasVite = true
    if (supportsNativeScriptVite(currentVite)) {
      continue
    }
    if (force) {
      nextDependenciesForSection.vite = NATIVE_SCRIPT_VITE_VERSION
    } else {
      conflicts.push(`package.json#${section}.vite`)
    }
  }
  if (!hasVite) {
    nextDevDependencies.vite = NATIVE_SCRIPT_VITE_VERSION
  }

  return {
    ...current,
    main: current.main && !force ? current.main : 'src/native/index.tsx',
    scripts: mergeManagedRecord(
      current.scripts,
      scripts,
      'scripts',
      force,
      conflicts,
    ),
    dependencies: nextDependencies,
    devDependencies: nextDevDependencies,
  }
}

async function installDependencies(
  root: string,
  packageManager: NativeScriptPackageManager,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(packageManager, ['install'], {
      cwd: root,
      stdio: 'inherit',
    })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (code === 0) {
        resolve()
      } else {
        reject(
          new Error(
            `${packageManager} install failed${
              signal ? ` with signal ${signal}` : ` with exit code ${code}`
            }.`,
          ),
        )
      }
    })
  })
}

export async function initializeNativeScript(
  options: NativeScriptInitOptions = {},
): Promise<NativeScriptInitResult> {
  const root = path.resolve(options.root ?? process.cwd())
  const packageJsonPath = path.join(root, 'package.json')
  if (!(await fileExists(packageJsonPath))) {
    throw new Error(`No package.json found in ${root}`)
  }

  const currentPackageJson = JSON.parse(
    await readFile(packageJsonPath, 'utf8'),
  ) as PackageJson
  const allDependencies = {
    ...currentPackageJson.devDependencies,
    ...currentPackageJson.dependencies,
  }
  const mode = allDependencies['@tanstack/react-start'] ? 'start' : 'router'
  if (
    !allDependencies['@tanstack/react-router'] &&
    !allDependencies['@tanstack/react-start']
  ) {
    throw new Error(
      'NativeScript initialization requires a React app using @tanstack/react-router or @tanstack/react-start.',
    )
  }
  if (!allDependencies.react) {
    throw new Error('NativeScript initialization requires React 19.')
  }
  validateReactVersion(allDependencies.react)
  if (options.serverFnBase) {
    validateServerFnBase(options.serverFnBase)
  }

  const packageManager = options.packageManager ?? findPackageManager(root)
  const appId =
    options.appId ??
    `org.nativescript.${sanitizeAppName(currentPackageJson.name ?? 'app')}`
  validateAppId(appId)

  const routerFile = await findRouterFile(root, options.routerFile)
  const nativeDirectory = path.join(root, 'src/native')
  const routerImport = asModuleSpecifier(nativeDirectory, routerFile)
  const serverPort = options.serverPort ?? 3000
  if (!Number.isInteger(serverPort) || serverPort < 1 || serverPort > 65535) {
    throw new Error(`Invalid server port: ${serverPort}`)
  }

  const adapterVersion = options.adapterVersion ?? 'latest'
  const routerVersion =
    allDependencies['@tanstack/react-router'] ??
    allDependencies['@tanstack/react-start'] ??
    'latest'
  const conflicts: Array<string> = []
  const managedFiles: Array<ManagedFile> = [
    textFile(
      'nativescript.config.ts',
      createNativeScriptConfig(appId, packageManager),
    ),
    textFile(
      'vite.native.config.ts',
      mode === 'start'
        ? createStartViteConfig(options.serverFnBase, serverPort)
        : createRouterViteConfig(),
    ),
    textFile(
      'src/native/index.tsx',
      createNativeEntry(routerImport, mode === 'start'),
    ),
    textFile('src/native/root-route.tsx', createNativeRootRoute()),
    textFile('src/native/jsx.d.ts', createNativeJsxTypes()),
  ]

  const templateDirectory =
    options.templateDirectory ?? resolveTemplateDirectory()
  const resourceFiles = await collectFiles(
    path.join(templateDirectory, 'App_Resources'),
  )
  managedFiles.push(
    ...resourceFiles.map((file) => ({
      relativePath: `App_Resources/${file.relativePath}`,
      contents: file.contents,
    })),
  )
  managedFiles.push(await createGitIgnoreFile(root))

  if (packageManager === 'pnpm') {
    managedFiles.push(
      await createPnpmWorkspaceFile(root, options.force ?? false, conflicts),
    )
  }

  const created: Array<string> = []
  const updated: Array<string> = []
  const unchanged: Array<string> = []
  for (const file of managedFiles) {
    const destination = path.join(root, file.relativePath)
    if (!(await fileExists(destination))) {
      created.push(file.relativePath)
      continue
    }
    const current = await readFile(destination)
    if (current.equals(file.contents)) {
      unchanged.push(file.relativePath)
    } else if (options.force || file.merge) {
      updated.push(file.relativePath)
    } else {
      conflicts.push(file.relativePath)
    }
  }

  const nextPackageJson = createPackageJson(
    currentPackageJson,
    mode,
    adapterVersion,
    routerVersion,
    serverPort,
    packageManager,
    options.force ?? false,
    conflicts,
  )
  const nextPackageJsonContents = `${JSON.stringify(nextPackageJson, null, 2)}\n`
  const currentPackageJsonContents = await readFile(packageJsonPath, 'utf8')
  if (nextPackageJsonContents === currentPackageJsonContents) {
    unchanged.push('package.json')
  } else {
    updated.push('package.json')
  }

  if (conflicts.length) {
    throw new NativeScriptScaffoldConflictError(conflicts.sort())
  }

  for (const file of managedFiles) {
    if (
      !created.includes(file.relativePath) &&
      !updated.includes(file.relativePath)
    ) {
      continue
    }
    const destination = path.join(root, file.relativePath)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, file.contents)
  }
  if (!unchanged.includes('package.json')) {
    await writeFile(packageJsonPath, nextPackageJsonContents)
  }

  if (options.install ?? true) {
    await installDependencies(root, packageManager)
  }

  return {
    root,
    mode,
    appId,
    packageManager,
    created: created.sort(),
    updated: updated.sort(),
    unchanged: unchanged.sort(),
  }
}
