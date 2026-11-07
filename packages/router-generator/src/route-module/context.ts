import crypto from 'node:crypto'
import { existsSync, realpathSync } from 'node:fs'
import path from 'node:path'
import { cleanPath } from '@tanstack/router-core'
import { generatedPublicNames } from '../generated-names'
import { getManifestPath, readManifest } from './manifest'
import {
  findPackageRoot,
  getDefaultNamespace,
  getInstallationKey,
  readRouteModuleDeclaration,
  resolveModulePackageRoot,
} from './declaration'
import type { ManifestInstalledModule, RouteModuleManifest } from './manifest'
import type {
  ModuleInclude,
  RouteModuleDeclaration,
  RouteModulesOption,
} from './declaration'

export interface ScopeModule {
  moduleId: string
  /**
   * What the namespace addresses: the module id, or `<moduleId>#<as>` for one
   * installation of a module installed several times.
   */
  key: string
  namespace: string
  /**
   * Package whose contract (`<pkg>/route-types`) provides the types: the
   * module itself (`Router`) or the module that installs it
   * (`InstalledRouters[key]`).
   */
  contractPackage: string
  /**
   * Root ids whose matches the namespace's match guard accepts: the module's
   * own root and the roots of the modules installed below it.
   */
  matchRoots: Array<string>
  /**
   * Set when path params lie above the module in this package's route tree:
   * the module this package mounts on the way to it (itself when mounted
   * directly). Links through its namespace then pass those params.
   */
  hostedThrough?: string
}

/**
 * A module installed in another module's subtree, as `manifest.modules` lists
 * it. Used modules are described from their package.json files, which know
 * no mount paths.
 */
export type DeclaredInstallation = Pick<
  ManifestInstalledModule,
  'id' | 'key' | 'includedBy'
>

export interface ResolvedMount {
  include: ModuleInclude
  moduleId: string
  /** The module id, or `<moduleId>#<as>` when it is installed several times. */
  key: string
  /** The installation name of a module installed several times. */
  as: string | undefined
  packageRoot: string
  manifest: RouteModuleManifest
  /**
   * `manifest.modules` as this package installs them: the mounted module
   * itself under its installation key, included by this package.
   */
  installed: Array<ManifestInstalledModule & { includedBy: string }>
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
  /** Mounted modules, whose installed routes are visible by id. */
  includedContracts: Array<string>
  /** Modules this package uses without mounting them: they get stand-ins in the declaration build. */
  usedContracts: Array<string>
  /** Modules with a generated namespace. */
  scope: Array<ScopeModule>
  /** Changes whenever the generated output may change. */
  hash: string
}

function fail(declaration: RouteModuleDeclaration, message: string): never {
  throw new Error(`[route modules] ${declaration.packageName}: ${message}`)
}

function memoize<TKey, TValue>(
  cache: Map<TKey, TValue>,
  key: TKey,
  compute: () => TValue,
): TValue {
  if (!cache.has(key)) {
    cache.set(key, compute())
  }
  return cache.get(key) as TValue
}

/**
 * Resolves the packages and files one generation needs, each once: the
 * includes of every used module are walked from the same files the mounts are
 * read from. An invalid declaration throws, naming its file.
 */
function createDeclarationReader() {
  const roots = new Map<string, string | undefined>()
  const declarations = new Map<string, RouteModuleDeclaration | undefined>()
  const realpaths = new Map<string, string>()
  return {
    realpath: (file: string) =>
      memoize(realpaths, file, () => realpathSync(file)),
    /** The package root of `moduleId` as seen from `fromPackageRoot`. */
    resolve: (moduleId: string, fromPackageRoot: string) =>
      memoize(roots, `${fromPackageRoot}\0${moduleId}`, () =>
        resolveModulePackageRoot(moduleId, fromPackageRoot),
      ),
    /** The module declaration at `packageRoot`; `undefined` for other packages. */
    read: (packageRoot: string) =>
      memoize(declarations, packageRoot, () => {
        const declaration = readRouteModuleDeclaration(packageRoot, undefined)
        return declaration?.mode === 'module' ? declaration : undefined
      }),
  }
}

type DeclarationReader = ReturnType<typeof createDeclarationReader>

/** Resolves and validates a module this package declares in `includes` or `uses`. */
function resolveDeclaredModule(
  declaration: RouteModuleDeclaration,
  reader: DeclarationReader,
  moduleId: string,
  relation: 'includes' | 'uses',
  onFile: ((file: string) => void) | undefined,
): RouteModuleDeclaration {
  if (moduleId === declaration.moduleId) {
    fail(
      declaration,
      `a module cannot ${relation === 'includes' ? 'include' : 'use'} itself.`,
    )
  }
  // A mounted module runs in the package: it must be a runtime dependency. A
  // used module only needs to be resolvable for its types.
  const declared =
    relation === 'includes'
      ? declaration.dependencies
      : [...declaration.dependencies, ...declaration.devDependencies]
  if (!declared.includes(moduleId)) {
    fail(
      declaration,
      `"${moduleId}" is listed in "${relation}" but is not a dependency. Add it to ${
        relation === 'includes'
          ? '"dependencies" (or "peerDependencies")'
          : '"dependencies", "devDependencies" or "peerDependencies"'
      } in package.json.`,
    )
  }
  const packageRoot = reader.resolve(moduleId, declaration.packageRoot)
  if (!packageRoot) {
    fail(
      declaration,
      `cannot resolve "${moduleId}" from "${declaration.packageRoot}". Install the workspace dependencies.`,
    )
  }
  onFile?.(path.join(packageRoot, 'package.json'))
  const resolved = reader.read(packageRoot)
  if (!resolved) {
    fail(
      declaration,
      `"${moduleId}" is not a route module: its package.json has no "tanstack.router.module".`,
    )
  }
  return resolved
}

/**
 * Walks `includes` from `root` through package.json files and reports every
 * installed module as `manifest.modules` lists it. Include cycles have no
 * generation order and are rejected here, before any manifest is read;
 * otherwise they would surface as the missing manifest of whichever module
 * generates first. Unresolvable includes are left to their includer's own
 * generation.
 */
function walkIncludes(
  declaration: RouteModuleDeclaration,
  root: RouteModuleDeclaration,
  reader: DeclarationReader,
  onInclude: (
    installed: DeclaredInstallation,
    packageRoot: string | undefined,
  ) => void,
) {
  const visit = (current: RouteModuleDeclaration, chain: Array<string>) => {
    for (const include of current.includes) {
      if (include.moduleId === current.moduleId) {
        // Self-includes get their own diagnostic.
        continue
      }
      const start = chain.indexOf(include.moduleId)
      if (start !== -1) {
        const cycle = [...chain.slice(start), include.moduleId]
        fail(
          declaration,
          `${cycle
            .map((id, index) =>
              index === 0
                ? `"${id}" includes`
                : index === cycle.length - 1
                  ? `"${id}"`
                  : `"${id}", which includes`,
            )
            .join(
              ' ',
            )}. Route modules cannot include each other; link into another module's routes with "uses".`,
        )
      }
      const packageRoot = reader.resolve(include.moduleId, current.packageRoot)
      onInclude(
        {
          id: include.moduleId,
          key: getInstallationKey(include.moduleId, include.as),
          includedBy: current.packageName,
        },
        packageRoot,
      )
      const next = packageRoot && reader.read(packageRoot)
      if (next) {
        visit(next, [...chain, include.moduleId])
      }
    }
  }
  visit(root, [root.moduleId ?? root.packageName])
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
  const reader = createDeclarationReader()
  // Rejects include cycles; the files it reads serve the mounts below.
  walkIncludes(declaration, declaration, reader, () => {})

  const scope = new Map<string, ScopeModule>()
  const namespaceOwners = new Map<string, string>()

  /**
   * Gives a module a namespace. `installed` lists the modules the contract
   * package installs: the namespace's match guard accepts the module's routes
   * and those of the modules installed below it.
   */
  const addToScope = (
    moduleId: string,
    namespace: string,
    contractPackage: string,
    installed: Array<DeclaredInstallation>,
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
    const matchRoots = new Set([`${key}:`])
    const addBelow = (includer: string) => {
      for (const entry of installed) {
        if (entry.includedBy === includer) {
          matchRoots.add(`${entry.key}:`)
          addBelow(entry.id)
        }
      }
    }
    addBelow(moduleId)
    scope.set(key, {
      moduleId,
      key,
      namespace,
      contractPackage,
      matchRoots: [...matchRoots],
      hostedThrough,
    })
  }

  /**
   * Adds the modules installed by a dependency. `hostedThrough` names the
   * installation whose host params links through the namespace must pass.
   * The dependency itself and this package (which a used module may include)
   * get no entry.
   */
  const addInstalledSubtree = <T extends DeclaredInstallation>(
    contractPackage: string,
    installed: Array<T>,
    hostedThrough?: (entry: T) => string | undefined,
  ) => {
    for (const entry of installed) {
      if (entry.id === contractPackage || entry.id === declaration.moduleId) {
        continue
      }
      addToScope(
        entry.id,
        getDefaultNamespace(entry.id),
        contractPackage,
        installed,
        hostedThrough?.(entry),
        entry.key,
      )
    }
  }

  // Modules this package mounts. A module included several times is
  // installed once per include, each named with `as`.
  const mounts: Array<ResolvedMount> = []
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
    // A mounted module's manifest describes the subtree this package installs.
    const { packageRoot } = resolveDeclaredModule(
      declaration,
      reader,
      include.moduleId,
      'includes',
      opts.onWatchFile,
    )
    opts.onWatchFile?.(getManifestPath(packageRoot))
    const manifest = readManifest(packageRoot)
    if (!manifest) {
      fail(
        declaration,
        `"${include.moduleId}" has no route module manifest at "${getManifestPath(packageRoot)}". Run "tsr generate" in "${packageRoot}" first (for example with a "dependsOn": ["^generate"] task dependency).`,
      )
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
    const key = getInstallationKey(include.moduleId, as)
    const installed = manifest.modules.map((entry) =>
      entry.id === include.moduleId
        ? { ...entry, key, includedBy: declaration.packageName }
        : { ...entry, includedBy: entry.includedBy ?? declaration.packageName },
    )
    mounts.push({
      include,
      moduleId: include.moduleId,
      key,
      as,
      packageRoot,
      manifest,
      installed,
      routeFiles: manifest.routeFiles.map(({ owner, file, routeId }) => ({
        file: resolveManifestFile(reader, packageRoot, owner, file),
        routeId,
      })),
      clientTrees: manifest.clientTrees.map(({ owner, file, clientFile }) => ({
        filePath: resolveManifestFile(reader, packageRoot, owner, file),
        clientFilePath: resolveManifestFile(
          reader,
          packageRoot,
          owner,
          clientFile,
        ),
      })),
      at:
        at === undefined || at === '/' || at === ''
          ? undefined
          : `/${at.replace(/^\/+|\/+$/g, '')}`,
    })
    // Route ids contain the path params of their own and their parents' paths.
    const hostParams = hasPathParams(include.parent ?? '')
    addToScope(
      include.moduleId,
      include.namespace,
      include.moduleId,
      installed,
      hostParams ? key : undefined,
      key,
    )
    addInstalledSubtree(include.moduleId, installed, (entry) =>
      hostParams || hasPathParams(entry.mountPath) ? key : undefined,
    )
  }

  // A module installed twice in the tree is ambiguous, unless every
  // installation is named.
  const installedBy = new Map<string, string>()
  for (const mount of mounts) {
    for (const entry of mount.installed) {
      if (entry.id === mount.moduleId && mount.as !== undefined) {
        installedBy.set(mount.key, declaration.packageName)
        continue
      }
      const previous = installedBy.get(entry.id)
      if (previous !== undefined) {
        fail(
          declaration,
          `"${entry.id}" is installed twice: by "${previous}" and by "${entry.includedBy}". A route module can be mounted once per route tree.`,
        )
      }
      installedBy.set(entry.id, entry.includedBy)
    }
  }

  // Modules this package references without mounting them. They are read
  // from package.json files only: their contracts enter the type program
  // through the generated namespaces, never the generation itself, so two
  // modules can use each other and generate in any order.
  const uses = declaration.uses
  const usedContracts: Array<string> = []
  for (const use of uses) {
    if (mounts.some((mount) => mount.moduleId === use.moduleId)) {
      continue
    }
    const used = resolveDeclaredModule(
      declaration,
      reader,
      use.moduleId,
      'uses',
      opts.onWatchFile,
    )
    const installed: Array<DeclaredInstallation> = []
    walkIncludes(declaration, used, reader, (entry, packageRoot) => {
      installed.push(entry)
      if (packageRoot) {
        opts.onWatchFile?.(path.join(packageRoot, 'package.json'))
      }
    })
    if (installedBy.has(use.moduleId)) {
      // Already visible through the module that installs it.
      continue
    }
    usedContracts.push(use.moduleId)
    addToScope(use.moduleId, use.namespace, use.moduleId, installed)
    addInstalledSubtree(use.moduleId, installed)
  }

  // The final application must install every module that is used.
  if (declaration.mode === 'host') {
    for (const mount of mounts) {
      for (const entry of mount.installed) {
        for (const used of entry.uses) {
          if (
            !installedBy.has(used) &&
            !mounts.some((mount) => mount.moduleId === used)
          ) {
            fail(
              declaration,
              `"${entry.id}" uses routes of "${used}", which is not installed. Add "${used}" to the "includes" of this application or of one of its modules.`,
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
        // Dependency lists only gate diagnostics; they do not shape output.
        declaration: {
          mode: declaration.mode,
          moduleId: declaration.moduleId,
          packageName: declaration.packageName,
          includes: declaration.includes,
          uses: declaration.uses,
        },
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
    mounts,
    start,
    startMounts,
    exportsStartModules,
    includedContracts: [...new Set(mounts.map((mount) => mount.moduleId))],
    usedContracts,
    scope: [...scope.values()],
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
  reader: DeclarationReader,
  packageRoot: string,
  owner: Array<string>,
  file: string,
) {
  let root = packageRoot
  for (const packageName of owner) {
    const next = reader.resolve(packageName, root)
    if (!next) {
      throw new Error(
        `[route modules] Cannot resolve route source owner "${packageName}" from "${root}". Install the provider dependencies and regenerate its manifest.`,
      )
    }
    root = next
  }
  return reader.realpath(path.resolve(root, file))
}
