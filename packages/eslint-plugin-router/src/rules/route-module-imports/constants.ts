/**
 * Routing APIs a route module's generated scope (`routeScope.gen.ts`) exports
 * typed against the module's own routes. Keep in step with `scopeApis` in
 * `packages/router-generator/src/route-module/emit.ts`.
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
  'useLinkProps',
  'useBlocker',
  'notFound',
] as const

/** Root route constructors; a route module's root is `createModuleRoot`. */
export const rootRouteConstructors = [
  'createRootRoute',
  'createRootRouteWithContext',
] as const

/** Start APIs a Start route module's scope exports. */
export const scopedStartApis = [
  'createServerFn',
  'createMiddleware',
  'createStartModule',
] as const
