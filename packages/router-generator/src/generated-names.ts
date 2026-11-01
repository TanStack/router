/** A binding family emitted from one canonical route/package identity. */
export interface GeneratedName {
  key: string
  preferred: string
  suffixes: ReadonlyArray<string>
}

/**
 * Allocate complete binding families together. Sorting canonical identities
 * makes allocations independent of directory order, checkout paths and caches.
 */
export function allocateGeneratedNames(
  entries: ReadonlyArray<GeneratedName>,
  reserved: Iterable<string>,
): Map<string, string> {
  const occupied = new Set(reserved)
  const names = new Map<string, string>()
  for (const entry of [...entries].sort((a, b) =>
    a.key < b.key ? -1 : a.key > b.key ? 1 : 0,
  )) {
    if (names.has(entry.key)) {
      continue
    }
    let candidate = entry.preferred
    let index = 1
    while (entry.suffixes.some((suffix) => occupied.has(candidate + suffix))) {
      candidate = `${entry.preferred}_${++index}`
    }
    for (const suffix of entry.suffixes) {
      occupied.add(candidate + suffix)
    }
    names.set(entry.key, candidate)
  }
  return names
}

export const routeBindingSuffixes = [
  'RouteImport',
  'Route',
  'RouteChildren',
  'RouteWithChildren',
] as const

export const moduleBindingSuffixes = [
  'Router',
  'InstalledRouters',
  'InstalledRoutesById',
  'InstalledHostParams',
  'HostedRouter',
  'RouteModule',
  'StartModules',
  ...routeBindingSuffixes.map((suffix) => `Module${suffix}`),
] as const

export const generatedPublicNames = [
  'Link',
  'createLink',
  'linkOptions',
  'Navigate',
  'useNavigate',
  'redirect',
  'MatchRoute',
  'useMatchRoute',
  'useRouter',
  'getRouteApi',
  'useMatch',
  'useMatches',
  'useParentMatches',
  'useChildMatches',
  'useLoaderData',
  'useLoaderDeps',
  'useSearch',
  'useParams',
  'useRouteContext',
  'useLocation',
  'useRouterState',
  'useLinkProps',
  'useBlocker',
  'notFound',
  'isScopedMatch',
  'createFileRoute',
  'createModuleRoot',
  'createServerFn',
  'createMiddleware',
  'createStartModule',
  'ValidateLinkOptions',
  'ValidateLinkOptionsArray',
  'ValidateNavigateOptions',
  'ValidateNavigateOptionsArray',
  'ValidateRedirectOptions',
  'ValidateRedirectOptionsArray',
  'ValidateFromPath',
  'ValidateToPath',
  'ValidateSearch',
  'ValidateParams',
  'ValidateId',
  'ValidateUseSearchOptions',
  'ValidateUseParamsOptions',
  'RouteModuleRouter',
  'RouteModuleRegister',
  'rootRouteImport',
  'routeTree',
  'FileRoutesByPath',
  'FileRoutesByFullPath',
  'FileRoutesByTo',
  'FileRoutesById',
  'FileRouteTypes',
  'RootRouteChildren',
  'rootRouteChildren',
  'MountedModuleHostParams',
  'RouteModuleRoutesById',
  'mountRouteModule',
  'lazyFn',
  'lazyRouteComponent',
  'InstallationRoutesById',
  'ScopeRouter',
  'ScopedRouter',
  'RouteScope',
  'HostedRouter',
] as const
