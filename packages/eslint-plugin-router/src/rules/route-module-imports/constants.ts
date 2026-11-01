/**
 * Routing APIs a route module's generated scope (`routeScope.gen.ts`) exports
 * typed against the module's own routes.
 */
export const scopedRouterApis = [
  'createFileRoute',
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
] as const

/** Root route constructors; a route module's root is `createModuleRoot`. */
export const rootRouteConstructors = [
  'createRootRoute',
  'createRootRouteWithContext',
] as const

/** Start APIs a Start route module's scope exports. */
export const scopedStartApis = ['createServerFn', 'createStartModule'] as const
