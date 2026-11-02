import path from 'node:path'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { z } from 'zod'

const moduleReferenceSchema = z.union([
  z.string(),
  z.object({
    module: z.string(),
    /** Name of the generated namespace for this module. */
    as: z.string().optional(),
  }),
])

const includeSchema = z.union([
  z.string(),
  z.object({
    module: z.string(),
    /** Id of the host route the module is mounted under (default: the root). */
    parent: z.string().optional(),
    /** Static path of the module root relative to `parent`. */
    at: z.string().optional(),
    /**
     * Name of the generated namespace, and of the installation when the
     * module is included more than once.
     */
    as: z.string().optional(),
  }),
])

/** `routeModules` generator option: the modules an application installs. */
export const routeModulesOptionSchema = z.object({
  includes: z.array(includeSchema).optional(),
  uses: z.array(moduleReferenceSchema).optional(),
})

/** `tanstack.router.module` in a package's `package.json`. */
export const moduleDeclarationSchema = z.union([
  z.literal(true),
  routeModulesOptionSchema,
])

export type RouteModulesOption = z.infer<typeof routeModulesOptionSchema>
export type ModuleDeclaration = z.infer<typeof moduleDeclarationSchema>

export interface ModuleReference {
  moduleId: string
  namespace: string
}

export interface ModuleInclude extends ModuleReference {
  parent?: string
  at?: string
  /** The `as` of the include, if given. */
  as?: string
}

/**
 * The route-module role of the package a generator runs for:
 * - `module`: the package is a route module (`tanstack.router.module`); its
 *   routes have qualified ids and it publishes a contract.
 * - `host`: an application that installs route modules (`routeModules`
 *   option); its own routes are unchanged.
 */
export interface RouteModuleDeclaration {
  mode: 'module' | 'host'
  packageRoot: string
  packageName: string
  /** Module id (module mode). */
  moduleId?: string
  includes: Array<ModuleInclude>
  /** Modules whose routing APIs this package explicitly consumes. */
  uses: Array<ModuleReference>
  dependencies: Array<string>
}

interface PackageJson {
  name?: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  tanstack?: { router?: { module?: unknown } }
}

export function findPackageRoot(start: string): string | undefined {
  let dir = path.resolve(start)
  for (;;) {
    if (existsSync(path.join(dir, 'package.json'))) {
      return dir
    }
    const parent = path.dirname(dir)
    if (parent === dir) {
      return undefined
    }
    dir = parent
  }
}

export function readPackageJson(packageRoot: string): PackageJson {
  return JSON.parse(
    readFileSync(path.join(packageRoot, 'package.json'), 'utf8'),
  )
}

/**
 * The default namespace of a module: the last segment of its package name,
 * camel-cased (`@acme/user-account` -> `userAccount`).
 */
export function getDefaultNamespace(moduleId: string): string {
  const lastSegment = moduleId.split('/').pop()!
  const camel = lastSegment.replace(/[-_.]+([a-zA-Z0-9])/g, (_, c: string) =>
    c.toUpperCase(),
  )
  const identifier = camel.replace(/[^a-zA-Z0-9_$]/g, '')
  return /^[0-9]/.test(identifier) ? `_${identifier}` : identifier
}

function toReference(reference: z.infer<typeof moduleReferenceSchema>) {
  const moduleId = typeof reference === 'string' ? reference : reference.module
  return {
    moduleId,
    namespace:
      (typeof reference === 'string' ? undefined : reference.as) ??
      getDefaultNamespace(moduleId),
  }
}

function toInclude(include: z.infer<typeof includeSchema>): ModuleInclude {
  if (typeof include === 'string') {
    return toReference(include)
  }
  return {
    ...toReference({ module: include.module, as: include.as }),
    parent: include.parent,
    at: include.at,
    as: include.as,
  }
}

function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => `${issue.path.join('.') || '<root>'}: ${issue.message}`)
    .join('; ')
}

/**
 * Reads the route-module declaration of the package that contains `root`, or
 * returns `undefined` for an ordinary application.
 */
export function readRouteModuleDeclaration(
  root: string,
  inlineOption: RouteModulesOption | undefined,
): RouteModuleDeclaration | undefined {
  const packageRoot = findPackageRoot(root)
  const packageJson = packageRoot ? readPackageJson(packageRoot) : undefined
  const rawDeclaration = packageJson?.tanstack?.router?.module

  if (rawDeclaration === undefined && inlineOption === undefined) {
    return undefined
  }

  if (!packageRoot || !packageJson) {
    throw new Error(
      `Route modules require a package.json, but none was found above "${root}".`,
    )
  }
  const packageName = packageJson.name
  if (!packageName) {
    throw new Error(
      `Route modules require a package name in "${path.join(packageRoot, 'package.json')}".`,
    )
  }

  const dependencies = [
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
  ]

  if (rawDeclaration !== undefined) {
    if (inlineOption !== undefined) {
      throw new Error(
        `"${packageName}" declares "tanstack.router.module" in its package.json and also passes "routeModules" to the router generator. Declare its modules in one place: package.json for route modules, the "routeModules" option only for applications.`,
      )
    }
    const parsed = moduleDeclarationSchema.safeParse(rawDeclaration)
    if (!parsed.success) {
      throw new Error(
        `Invalid "tanstack.router.module" in "${path.join(packageRoot, 'package.json')}": ${formatZodError(parsed.error)}`,
      )
    }
    const declaration = parsed.data === true ? {} : parsed.data
    return {
      mode: 'module',
      packageRoot,
      packageName,
      moduleId: packageName,
      includes: (declaration.includes ?? []).map(toInclude),
      uses: (declaration.uses ?? []).map(toReference),
      dependencies,
    }
  }

  const parsed = routeModulesOptionSchema.safeParse(inlineOption)
  if (!parsed.success) {
    throw new Error(
      `Invalid "routeModules" option: ${formatZodError(parsed.error)}`,
    )
  }
  return {
    mode: 'host',
    packageRoot,
    packageName,
    includes: (parsed.data.includes ?? []).map(toInclude),
    uses: (parsed.data.uses ?? []).map(toReference),
    dependencies,
  }
}

/**
 * Resolves the package root of `moduleId` as seen from `fromPackageRoot`,
 * following symlinks (pnpm workspace links) to the real directory.
 */
export function resolveModulePackageRoot(
  moduleId: string,
  fromPackageRoot: string,
): string | undefined {
  const require = createRequire(path.join(fromPackageRoot, 'package.json'))
  try {
    return path.dirname(
      realpathSync(require.resolve(`${moduleId}/package.json`)),
    )
  } catch {
    // Packages without `"./package.json"` in their exports cannot be read
    // through the resolver; fall back to the node_modules link.
    let dir = fromPackageRoot
    for (;;) {
      const candidate = path.join(dir, 'node_modules', moduleId, 'package.json')
      if (existsSync(candidate)) {
        return path.dirname(realpathSync(candidate))
      }
      const parent = path.dirname(dir)
      if (parent === dir) {
        return undefined
      }
      dir = parent
    }
  }
}

/** Whether a package declares itself a route module. */
export function isRouteModulePackage(packageRoot: string): boolean {
  return readPackageJson(packageRoot).tanstack?.router?.module !== undefined
}
