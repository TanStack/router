import crypto from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { cleanPath } from '@tanstack/router-core'
import { generatedPublicNames } from '../generated-names'
import { getManifestPath, readManifest } from './manifest'
import {
  findPackageRoot,
  getDefaultNamespace,
  isRouteModulePackage,
  readRouteModuleDeclaration,
  resolveModulePackageRoot,
} from './declaration'
import type { RouteModuleManifest } from './manifest'
import type {
  ModuleInclude,
  RouteModuleDeclaration,
  RouteModulesOption,
} from './declaration'

/** Where the types of a module in scope come from. */
export interface ModuleTypeSource {
  /** Package whose contract (`<pkg>/route-types`) provides the types. */
  contractPackage: string
  /**
   * `null`: the module is that package itself (`Router`,
   * `InstalledRoutesById`). Otherwise the module is installed by that package
   * and is read from its `InstalledRouters`.
   */
  installedBy: string | null
  /** Key of an installed router in the provider contract. */
  installedKey?: string
}

export interface ScopeModule {
  moduleId: string
  /**
   * What the namespace addresses: the module id, or `<moduleId>#<as>` for one
   * installation of a module installed several times.
   */
  key: string
  namespace: string
  source: ModuleTypeSource
  /**
   * Set when path params lie above the module in this package's route tree:
   * the module this package mounts on the way to it (itself when mounted
   * directly). Links through its namespace then pass those params.
   */
  hostedThrough?: string
}

export interface ResolvedMount {
  include: ModuleInclude
  moduleId: string
  /** The module id, or `<moduleId>#<as>` when it is installed several times. */
  key: string
  /** The installation name of a module installed several times. */
  as: string | undefined
  packageRoot: string
  manifest: RouteModuleManifest
  /** Current real paths resolved through the provider dependency graph. */
  routeFiles: Array<{ file: string; routeId: string }>
  clientTrees: Array<{ filePath: string; clientFilePath: string }>
  /** Static mount path relative to the parent (`undefined`: pathless). */
  at: string | undefined
}

/** TanStack Start usage of a package. */
export interface RouteModuleStart {
  /** The framework's Start package (`@tanstack/react-start`). */
  package: string
  /**
   * The Start file next to the route tree, if any: a module's fragment
   * (`export const start`) or an application's `startInstance`.
   */
  file: string | undefined
}

export interface RouteModuleContext {
  declaration: RouteModuleDeclaration
  /** Allocated private binding families shared by this generation. */
  identifiers: Map<string, string>
  manifests: Map<string, RouteModuleManifest>
  mounts: Array<ResolvedMount>
  /** Set when the package depends on the framework's Start package. */
  start: RouteModuleStart | undefined
  /** Mounted modules whose runtime entry exports Start fragments. */
  startMounts: Array<string>
  /**
   * Whether this module's runtime entry exports `startModules`: it has a
   * fragment or mounts modules that export fragments.
   */
  exportsStartModules: boolean
  /** Files whose creation or removal changes the context. */
  watchFiles: Array<string>
  /** Direct dependencies whose installed routes are visible by id. */
  visibleContracts: Array<string>
  /** Modules with a generated namespace. */
  scope: Array<ScopeModule>
  /** Modules this package installs more than once. */
  installedSeveralTimes: Set<string>
  /** Manifest files the context was built from (watch relevance). */
  dependencyFiles: Array<string>
  /** Changes whenever the generated output may change. */
  hash: string
}

function fail(declaration: RouteModuleDeclaration, message: string): never {
  throw new Error(`[route modules] ${declaration.packageName}: ${message}`)
}

function loadDependency(
  declaration: RouteModuleDeclaration,
  moduleId: string,
  relation: 'includes' | 'uses',
  onWatchFile?: (file: string) => void,
) {
  if (moduleId === declaration.moduleId) {
    fail(
      declaration,
      `a module cannot ${relation === 'includes' ? 'include' : 'use'} itself.`,
    )
  }
  if (!declaration.dependencies.includes(moduleId)) {
    fail(
      declaration,
      `"${moduleId}" is listed in "${relation}" but is not a dependency. Add it to "dependencies" (or "peerDependencies") in package.json.`,
    )
  }
  const packageRoot = resolveModulePackageRoot(
    moduleId,
    declaration.packageRoot,
  )
  if (!packageRoot) {
    fail(
      declaration,
      `cannot resolve "${moduleId}" from "${declaration.packageRoot}". Install the workspace dependencies.`,
    )
  }
  onWatchFile?.(path.join(packageRoot, 'package.json'))
  onWatchFile?.(getManifestPath(packageRoot))
  if (!isRouteModulePackage(packageRoot)) {
    fail(
      declaration,
      `"${moduleId}" is not a route module: its package.json has no "tanstack.router.module".`,
    )
  }
  const manifest = readManifest(packageRoot)
  if (!manifest) {
    fail(
      declaration,
      `"${moduleId}" has no route module manifest at "${getManifestPath(packageRoot)}". Run "tsr generate" in "${packageRoot}" first (for example with a "dependsOn": ["^generate"] task dependency).`,
    )
  }
  return { packageRoot, manifest }
}

function hasPathParams(path: string) {
  return /\$/.test(path)
}

/** The part of a full path up to its last segment with path params. */
export function getHostPath(fullPath: string): string | undefined {
  return /^.*\$[^/]*/.exec(fullPath)?.[0]
}

/**
 * The id of a module route in the installation of `mount`:
 * `<moduleId>#<as>:/…` for `<moduleId>:/…` when the module is installed
 * several times.
 */
export function getInstallationRouteId(
  mount: ResolvedMount,
  routeId: string,
): string {
  return mount.as !== undefined && routeId.startsWith(`${mount.moduleId}:`)
    ? mount.key + routeId.slice(mount.moduleId.length)
    : routeId
}

/**
 * Resolves everything a generator run needs about route modules: the package's
 * own declaration, the modules it mounts and the modules visible in its scope.
 */
export function resolveRouteModuleContext(opts: {
  root: string
  routeModules: RouteModulesOption | undefined
  /** Publish candidate watch paths even when a provider is not generated yet. */
  onWatchFile?: (file: string) => void
  /**
   * The framework's Start package (`@tanstack/react-start`) and the directory
   * of the generated route tree, where a Start file lives. Callers that only
   * need the mounted modules omit them.
   */
  start?: { package: string; generatedDirectory: string }
}): RouteModuleContext | undefined {
  const declaration = readRouteModuleDeclaration(opts.root, opts.routeModules)
  if (!declaration) {
    return undefined
  }

  const manifests = new Map<string, RouteModuleManifest>()
  const dependencyFiles: Array<string> = []
  const scope = new Map<string, ScopeModule>()
  const namespaceOwners = new Map<string, string>()
  const visibleContracts = new Set<string>()

  const addToScope = (
    moduleId: string,
    namespace: string,
    source: ModuleTypeSource,
    hostedThrough?: string,
    key = moduleId,
  ) => {
    if (scope.has(key)) {
      return
    }
    if (
      !/^[A-Za-z_$][\w$]*$/.test(namespace) ||
      generatedPublicNames.includes(namespace as any) ||
      [
        'default',
        'import',
        'export',
        'class',
        'function',
        'const',
        'let',
        'var',
        'new',
        'return',
        'delete',
        'void',
        'typeof',
        'instanceof',
        'in',
        'yield',
        'await',
        'enum',
        'implements',
        'interface',
        'package',
        'private',
        'protected',
        'public',
        'static',
        'null',
        'true',
        'false',
        'this',
        'super',
        'extends',
        'try',
        'catch',
        'finally',
        'throw',
        'if',
        'else',
        'for',
        'while',
        'switch',
        'case',
        'break',
        'continue',
        'do',
        'with',
        'debugger',
      ].includes(namespace)
    ) {
      fail(
        declaration,
        `the namespace "${namespace}" is not an available JavaScript identifier. Choose a different "as" that does not conflict with generated routing exports.`,
      )
    }
    const owner = namespaceOwners.get(namespace)
    if (owner !== undefined) {
      fail(
        declaration,
        `the modules "${owner}" and "${moduleId}" both get the namespace "${namespace}". Choose another one with "as".`,
      )
    }
    namespaceOwners.set(namespace, moduleId)
    scope.set(key, { moduleId, key, namespace, source, hostedThrough })
  }

  /**
   * Adds the modules installed by a dependency. `hostParams`: whether this
   * package mounts the dependency under path params.
   */
  const addInstalledSubtree = (
    contractPackage: string,
    manifest: RouteModuleManifest,
    mounted?: { hostParams: boolean; key: string },
  ) => {
    for (const installed of manifest.modules) {
      if (installed.id === manifest.id) {
        continue
      }
      addToScope(
        installed.id,
        getDefaultNamespace(installed.id),
        {
          contractPackage,
          installedBy: contractPackage,
          installedKey: installed.key,
        },
        mounted && (mounted.hostParams || hasPathParams(installed.mountPath))
          ? mounted.key
          : undefined,
        installed.key,
      )
    }
  }

  // Modules this package mounts. A module included several times is
  // installed once per include, each named with `as`.
  const mounts: Array<ResolvedMount> = []
  const seenIncludes = new Set<string>()
  const installedSeveralTimes = new Set(
    declaration.includes
      .map((include) => include.moduleId)
      .filter((moduleId, index, all) => all.indexOf(moduleId) !== index),
  )
  for (const moduleId of installedSeveralTimes) {
    if (declaration.mode === 'module') {
      fail(
        declaration,
        `"${moduleId}" is included more than once. Only an application can install a route module several times.`,
      )
    }
    const names = new Set<string>()
    for (const include of declaration.includes) {
      if (include.moduleId !== moduleId) {
        continue
      }
      if (include.as !== undefined && names.has(include.as)) {
        fail(
          declaration,
          `two installations of "${moduleId}" are named "${include.as}". Name each installation with its own "as".`,
        )
      }
      names.add(include.as!)
      if (include.as === undefined) {
        fail(
          declaration,
          `"${moduleId}" is included more than once. Name every installation with "as".`,
        )
      }
      // `as` names the installation's namespace.
      if (!/^[A-Za-z_$][\w$]*$/.test(include.as)) {
        fail(
          declaration,
          `the installation "${include.as}" of "${moduleId}" must be named with a JavaScript identifier.`,
        )
      }
    }
  }
  for (const include of declaration.includes) {
    const { packageRoot, manifest } = loadDependency(
      declaration,
      include.moduleId,
      'includes',
      opts.onWatchFile,
    )
    manifests.set(include.moduleId, manifest)
    if (!seenIncludes.has(include.moduleId)) {
      seenIncludes.add(include.moduleId)
      dependencyFiles.push(getManifestPath(packageRoot))
    }
    const at =
      include.at === undefined
        ? undefined
        : cleanPath(`/${include.at}`).replace(/\/$/, '') || undefined
    if (at !== undefined && hasPathParams(at)) {
      fail(
        declaration,
        `"${include.moduleId}" must be mounted at a static path, but "${at}" has path params.`,
      )
    }
    const as = include.as
    if (
      installedSeveralTimes.has(include.moduleId) &&
      manifest.modules.length > 1
    ) {
      fail(
        declaration,
        `"${include.moduleId}" installs other route modules, so it can be installed only once.`,
      )
    }
    const key =
      as === undefined ? include.moduleId : `${include.moduleId}#${as}`
    mounts.push({
      include,
      moduleId: include.moduleId,
      key,
      as,
      packageRoot,
      manifest,
      routeFiles: resolveManifestRouteFiles(packageRoot, manifest),
      clientTrees: manifest.clientTrees.map(({ owner, file, clientFile }) => ({
        filePath: resolveManifestFile(packageRoot, owner, file),
        clientFilePath: resolveManifestFile(packageRoot, owner, clientFile),
      })),
      at:
        at === undefined || at === '/' || at === ''
          ? undefined
          : `/${at.replace(/^\/+|\/+$/g, '')}`,
    })
    visibleContracts.add(include.moduleId)
    // Route ids contain the path params of their own and their parents' paths.
    const hostParams = hasPathParams(include.parent ?? '')
    addToScope(
      include.moduleId,
      include.namespace,
      { contractPackage: include.moduleId, installedBy: null },
      hostParams ? key : undefined,
      key,
    )
    addInstalledSubtree(include.moduleId, manifest, { hostParams, key })
  }

  // A module installed twice in the tree is ambiguous, unless every
  // installation is named.
  const installedBy = new Map<string, string>()
  for (const mount of mounts) {
    for (const installed of mount.manifest.modules) {
      if (installed.id === mount.moduleId && mount.as !== undefined) {
        installedBy.set(mount.key, declaration.packageName)
        continue
      }
      const includer = installed.includedBy ?? declaration.packageName
      const previous = installedBy.get(installed.id)
      if (previous !== undefined) {
        fail(
          declaration,
          `"${installed.id}" is installed twice: by "${previous}" and by "${includer}". A route module can be mounted once per route tree.`,
        )
      }
      installedBy.set(installed.id, includer)
    }
  }

  // Modules this package references without mounting them.
  const uses = declaration.uses
  for (const use of uses) {
    if (seenIncludes.has(use.moduleId)) {
      continue
    }
    const { packageRoot, manifest } = loadDependency(
      declaration,
      use.moduleId,
      'uses',
      opts.onWatchFile,
    )
    manifests.set(use.moduleId, manifest)
    dependencyFiles.push(getManifestPath(packageRoot))
    if (
      installedBy.has(use.moduleId) ||
      installedSeveralTimes.has(use.moduleId)
    ) {
      // Already visible through the module that installs it.
      continue
    }
    visibleContracts.add(use.moduleId)
    addToScope(use.moduleId, use.namespace, {
      contractPackage: use.moduleId,
      installedBy: null,
    })
    addInstalledSubtree(use.moduleId, manifest)
  }

  // The final application must install every module that is used.
  if (declaration.mode === 'host') {
    for (const mount of mounts) {
      for (const installed of mount.manifest.modules) {
        for (const used of installed.uses) {
          if (
            !installedBy.has(used) &&
            !mounts.some((mount) => mount.moduleId === used)
          ) {
            fail(
              declaration,
              `"${installed.id}" uses routes of "${used}", which is not installed. Add "${used}" to the "includes" of this application or of one of its modules.`,
            )
          }
        }
      }
    }
    for (const use of uses) {
      if (
        !installedBy.has(use.moduleId) &&
        !mounts.some((mount) => mount.moduleId === use.moduleId)
      ) {
        fail(
          declaration,
          `this application uses routes of "${use.moduleId}", which is not installed. Add it to "includes".`,
        )
      }
    }
  }

  // TanStack Start: fragments are composed upward to the application.
  const startOptions = opts.start
  const startFileCandidates = startOptions
    ? ['start.ts', 'start.tsx'].map((file) =>
        path.join(startOptions.generatedDirectory, file),
      )
    : []
  for (const file of startFileCandidates) {
    opts.onWatchFile?.(file)
  }
  const start: RouteModuleStart | undefined =
    startOptions && declaration.dependencies.includes(startOptions.package)
      ? {
          package: startOptions.package,
          file: startFileCandidates.find((file) => existsSync(file)),
        }
      : undefined
  const startMounts = [
    ...new Set(
      mounts
        .filter((mount) => mount.manifest.startModules)
        .map((mount) => mount.moduleId),
    ),
  ]
  if (startOptions && declaration.mode === 'host' && startMounts.length > 0) {
    if (!start) {
      fail(
        declaration,
        `"${startMounts[0]}" has a TanStack Start fragment. Install it in a TanStack Start application, which depends on "${startOptions.package}".`,
      )
    }
    if (!start.file) {
      fail(
        declaration,
        `"${startMounts[0]}" has a TanStack Start fragment. Install it in "${startFileCandidates[0]}": export const startInstance = createStart(() => ({ extends: startModules })), with startModules from "./startModules.gen".`,
      )
    }
  }
  const exportsStartModules =
    declaration.mode === 'module' && (!!start?.file || startMounts.length > 0)

  const hash = crypto
    .createHash('sha256')
    .update(
      JSON.stringify({
        declaration,
        manifests: [...manifests].map(([id, manifest]) => [
          id,
          manifest.topologyToken,
        ]),
        mounts: mounts.map((mount) => [
          mount.key,
          mount.include.parent,
          mount.at,
          mount.manifest.topologyToken,
        ]),
        scope: [...scope.values()],
        start,
      }),
    )
    .digest('hex')
    .slice(0, 16)

  return {
    declaration,
    identifiers: new Map(),
    manifests,
    mounts,
    start,
    startMounts,
    exportsStartModules,
    watchFiles: start ? startFileCandidates : [],
    visibleContracts: [...visibleContracts],
    scope: [...scope.values()],
    installedSeveralTimes,
    dependencyFiles,
    hash,
  }
}

/**
 * The package roots of every route module installed by a package (directly or
 * through other modules): their files are compiled as part of the application.
 */
export function getInstalledRouteModuleDirectories(
  context: RouteModuleContext | undefined,
): Array<string> {
  const directories = new Set<string>()
  for (const mount of context?.mounts ?? []) {
    directories.add(mount.packageRoot)
    for (const { file } of mount.routeFiles) {
      const packageRoot = findPackageRoot(path.dirname(file))
      if (packageRoot) {
        directories.add(packageRoot)
      }
    }
  }
  return [...directories]
}

/** Resolve portable paths from each provider's own dependency context. */
function resolveManifestFile(
  packageRoot: string,
  owner: Array<string>,
  file: string,
) {
  let root = packageRoot
  for (const packageName of owner) {
    const next = resolveModulePackageRoot(packageName, root)
    if (!next) {
      throw new Error(
        `[route modules] Cannot resolve route source owner "${packageName}" from "${root}". Install the provider dependencies and regenerate its manifest.`,
      )
    }
    root = next
  }
  return realpathSync(path.resolve(root, file))
}

export function resolveManifestRouteFiles(
  packageRoot: string,
  manifest: RouteModuleManifest,
) {
  return manifest.routeFiles.map(({ owner, file, routeId }) => ({
    file: resolveManifestFile(packageRoot, owner, file),
    routeId,
  }))
}
