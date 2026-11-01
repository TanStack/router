import { expectTypeOf, test } from 'vitest'
import type { orgSettings } from '../src/routeScope.gen'

test('every generated validation alias preserves its namespace contract', () => {
  type Options = { to: '/profile'; params: { orgId: '7' } }
  const options: Options = { to: '/profile', params: { orgId: '7' } }
  const link: orgSettings.ValidateLinkOptions<Options> = options
  const links: orgSettings.ValidateLinkOptionsArray<readonly [Options]> = [
    options,
  ]
  const navigate: orgSettings.ValidateNavigateOptions<Options> = options
  const navigations: orgSettings.ValidateNavigateOptionsArray<
    readonly [Options]
  > = [options]
  const redirect: orgSettings.ValidateRedirectOptions<Options> = options
  const redirects: orgSettings.ValidateRedirectOptionsArray<
    readonly [Options]
  > = [options]
  expectTypeOf<Options>().toMatchTypeOf<typeof link>()
  expectTypeOf<readonly [Options]>().toMatchTypeOf<typeof links>()
  expectTypeOf<Options>().toMatchTypeOf<typeof navigate>()
  expectTypeOf<readonly [Options]>().toMatchTypeOf<typeof navigations>()
  expectTypeOf<Options>().toMatchTypeOf<typeof redirect>()
  expectTypeOf<readonly [Options]>().toMatchTypeOf<typeof redirects>()

  const from: orgSettings.ValidateFromPath<'/profile'> = '/profile'
  const to: orgSettings.ValidateToPath<'/profile'> = '/profile'
  const search: orgSettings.ValidateSearch<'/search'> = {
    search: { query: 'hello' },
  }
  const params: orgSettings.ValidateParams<'/profile'> = {
    params: { orgId: '7' },
  }
  const id: orgSettings.ValidateId<'@route-modules/settings:/profile'> =
    '@route-modules/settings:/profile'
  const useSearch: orgSettings.ValidateUseSearchOptions<{
    from: '@route-modules/settings:/profile'
  }> = { from: '@route-modules/settings:/profile' }
  const useParams: orgSettings.ValidateUseParamsOptions<{
    from: '@route-modules/settings:/profile'
  }> = { from: '@route-modules/settings:/profile' }
  void [from, to, search, params, id, useSearch, useParams]

  const foreignPath = {
    to: '/orgs/$orgId',
    params: { orgId: '7' },
  } as const
  const foreignPaths = [foreignPath] as const
  const foreignOrigin = { from: '/orgs/$orgId' } as const
  const wrongSearch = { search: { query: 42 } }
  const wrongParams = { params: { userId: 'u1' } }

  // @ts-expect-error The validation alias is bound to this module's paths.
  const invalidLink: orgSettings.ValidateLinkOptions<typeof foreignPath> =
    foreignPath
  // @ts-expect-error Tuple entries retain the generated scope.
  const invalidLinks: orgSettings.ValidateLinkOptionsArray<
    typeof foreignPaths
  > = foreignPaths
  // @ts-expect-error Navigation wrappers cannot escape the module paths.
  const invalidNavigate: orgSettings.ValidateNavigateOptions<
    typeof foreignPath
  > = foreignPath
  // @ts-expect-error Every navigation array entry is checked.
  const invalidNavigations: orgSettings.ValidateNavigateOptionsArray<
    typeof foreignPaths
  > = foreignPaths
  // @ts-expect-error Redirect wrappers retain module path validation.
  const invalidRedirect: orgSettings.ValidateRedirectOptions<
    typeof foreignPath
  > = foreignPath
  // @ts-expect-error Every redirect array entry is checked.
  const invalidRedirects: orgSettings.ValidateRedirectOptionsArray<
    typeof foreignPaths
  > = foreignPaths
  // @ts-expect-error A route origin must be a path in the module.
  const invalidFrom: orgSettings.ValidateFromPath<'/profile'> = '/orgs/$orgId'
  // @ts-expect-error A destination must be a path in the module.
  const invalidTo: orgSettings.ValidateToPath<'/profile'> = '/orgs/$orgId'
  // @ts-expect-error Search validation follows the generated route schema.
  const invalidSearch: orgSettings.ValidateSearch<'/search'> = wrongSearch
  // @ts-expect-error The named installation requires its own host parameter.
  const invalidParams: orgSettings.ValidateParams<'/profile'> = wrongParams
  // @ts-expect-error A foreign route ID is not a module route.
  const invalidId: orgSettings.ValidateId<'@route-modules/settings:/profile'> =
    '/orgs/$orgId'
  // @ts-expect-error Search selectors must name a route in this module.
  const invalidUseSearch: orgSettings.ValidateUseSearchOptions<
    typeof foreignOrigin
  > = foreignOrigin
  // @ts-expect-error Parameter selectors must name a route in this module.
  const invalidUseParams: orgSettings.ValidateUseParamsOptions<
    typeof foreignOrigin
  > = foreignOrigin
  void [
    invalidLink,
    invalidLinks,
    invalidNavigate,
    invalidNavigations,
    invalidRedirect,
    invalidRedirects,
    invalidFrom,
    invalidTo,
    invalidSearch,
    invalidParams,
    invalidId,
    invalidUseSearch,
    invalidUseParams,
  ]
})
