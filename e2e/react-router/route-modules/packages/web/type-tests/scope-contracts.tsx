import * as React from 'react'
import { expectTypeOf, test } from 'vitest'
import { orgSettings, personSettings } from '../src/routeScope.gen'
import * as settings from '@route-modules/settings/scope'

test('reusable options preserve their installation through spreads and arrays', () => {
  const user = personSettings.linkOptions({
    to: '/members',
    params: () => ({ personId: 'u1', orgId: '7' }),
  })
  expectTypeOf(
    user._module,
  ).toEqualTypeOf<'@route-modules/settings#personSettings'>()
  const same = <personSettings.Link {...user} />
  const { _module, ...neutral } = user
  const compatiblePathsAndParams = <orgSettings.Link {...neutral} />
  void compatiblePathsAndParams
  void _module
  // @ts-expect-error An explicit sibling installation is a conflicting scope.
  const different = <orgSettings.Link {...user} />
  // @ts-expect-error Rewrapping must not erase the conflicting scope.
  orgSettings.linkOptions({ ...user })
  // @ts-expect-error Arrays preserve each entry's destination scope.
  orgSettings.linkOptions([user])
  // @ts-expect-error Redirects enforce the same receiving-scope contract.
  orgSettings.redirect(user)
  orgSettings.linkOptions({
    to: '/members',
    params: { orgId: '7' },
    // @ts-expect-error A mask cannot silently retarget another installation's options.
    mask: user,
  })
  // @ts-expect-error Hook defaults must retain and check a reusable scope stamp.
  orgSettings.useNavigate({ ...user, from: '/profile' })
  // @ts-expect-error The callback checks the same destination stamp.
  orgSettings.useNavigate()(user)
  void same
  void different
})

test('module-typed helper targets only known route IDs', () => {
  settings.notFound({ routeId: '@route-modules/settings:' })
  settings.notFound()
  // @ts-expect-error This route is not declared by the module.
  settings.notFound({ routeId: '@route-modules/settings:/absent' })
})

test('blocker locations describe the entire application and raw URL values', () => {
  settings.useBlocker({
    shouldBlockFn: ({ current, next }) => {
      expectTypeOf(current.routeId).toEqualTypeOf<string>()
      expectTypeOf(next.fullPath).toEqualTypeOf<string>()
      expectTypeOf(next.params).toEqualTypeOf<
        Record<string, string | undefined>
      >()
      expectTypeOf(next.search).toEqualTypeOf<Record<string, unknown>>()
      return false
    },
  })
})

test('match selectors expose foreign data and the generated guard restores known data', () => {
  settings.useMatch({
    strict: false,
    select: (match) => {
      expectTypeOf(match.context).toBeUnknown()
      expectTypeOf(match.loaderData).toBeUnknown()
      return match.routeId
    },
  })
  settings.useMatches({
    select: (matches) => {
      expectTypeOf(matches[0]!.context).toBeUnknown()
      for (const match of matches) {
        if (
          settings.isScopedMatch(match) &&
          match.localRouteId === '@route-modules/settings:/members'
        ) {
          expectTypeOf(match.loaderData).toEqualTypeOf<
            { label: 'members' } | undefined
          >()
          expectTypeOf(match.fullPath).toEqualTypeOf<string>()
        }
      }
      return matches.length
    },
  })
})

test('MatchRoute accepts only the scope paths in JSX', () => {
  const own = <settings.MatchRoute to="/profile" />
  // @ts-expect-error This path is not a module route.
  const foreign = <settings.MatchRoute to="/outside" />
  void own
  void foreign
})
