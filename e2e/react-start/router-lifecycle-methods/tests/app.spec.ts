import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { getEffectiveDefaults } from './utils/dehydrateDefaults'

test.describe('lifecycle methods - SSR', () => {
  test('home page renders root and index lifecycle context', async ({
    page,
  }) => {
    await page.goto('/')

    // Root lifecycle context (always visible)
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )

    // Index route lifecycle context
    await expect(page.getByTestId('index-heading')).toHaveText('Home')
    await expect(page.getByTestId('index-context')).toHaveText('index-context')
    await expect(page.getByTestId('index-beforeLoad')).toHaveText(
      'index-beforeLoad',
    )

    // Index loader data
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')
  })

  test('post detail page renders all lifecycle context for root, posts, and post', async ({
    page,
  }) => {
    await page.goto('/posts/1')

    // Root lifecycle context
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )

    // Posts layout lifecycle context
    await expect(page.getByTestId('posts-heading')).toHaveText('Posts Layout')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('posts-beforeLoad')).toHaveText(
      'posts-beforeLoad',
    )

    // Post detail lifecycle context (param-dependent)
    await expect(page.getByTestId('post-heading')).toHaveText('First Post')
    await expect(page.getByTestId('post-body')).toHaveText(
      'This is the first post body.',
    )
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )
  })

  test('comments page renders full lifecycle context chain', async ({
    page,
  }) => {
    await page.goto('/posts/1/comments')

    // Root
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )

    // Posts
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('posts-beforeLoad')).toHaveText(
      'posts-beforeLoad',
    )

    // Post (param-dependent)
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )

    // Comments (param-dependent)
    await expect(page.getByTestId('comments-heading')).toHaveText('Comments')
    await expect(page.getByTestId('comments-context')).toHaveText(
      'comments-context-1',
    )
    await expect(page.getByTestId('comments-beforeLoad')).toHaveText(
      'comments-beforeLoad-1',
    )

    // Comments loader data
    await expect(page.getByTestId('comment-1')).toHaveText(
      'Alice: Great first post!',
    )
    await expect(page.getByTestId('comment-2')).toHaveText(
      'Bob: Welcome to the blog.',
    )
  })

  test('lifecycle context includes correct param values for post 2', async ({
    page,
  }) => {
    await page.goto('/posts/2')

    await expect(page.getByTestId('post-heading')).toHaveText('Second Post')
    await expect(page.getByTestId('post-body')).toHaveText(
      'This is the second post body.',
    )
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-2',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-2',
    )
  })
})

test.describe('lifecycle methods - client navigation', () => {
  test('navigating from home to post detail renders correct context', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-post-1').click()
    await expect(page.getByTestId('post-heading')).toHaveText('First Post')

    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )

    // Root context should still be visible
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
  })

  test('navigating between posts updates param-dependent context', async ({
    page,
  }) => {
    await page.goto('/posts/1')
    await expect(page.getByTestId('post-heading')).toHaveText('First Post')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )

    await page.getByTestId('link-post-2').click()
    await expect(page.getByTestId('post-heading')).toHaveText('Second Post')

    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-2',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-2',
    )
  })

  test('navigating from post back to home renders index context', async ({
    page,
  }) => {
    await page.goto('/posts/1')
    await expect(page.getByTestId('post-heading')).toHaveText('First Post')

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await expect(page.getByTestId('index-context')).toHaveText('index-context')
    await expect(page.getByTestId('index-beforeLoad')).toHaveText(
      'index-beforeLoad',
    )
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')
  })

  test('navigating to comments renders nested context chain', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-post-1-comments').click()
    await expect(page.getByTestId('comments-heading')).toHaveText('Comments')

    // All levels of context should be visible simultaneously
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('comments-context')).toHaveText(
      'comments-context-1',
    )
    await expect(page.getByTestId('comments-beforeLoad')).toHaveText(
      'comments-beforeLoad-1',
    )
  })
})

test.describe('lifecycle methods - context accumulation', () => {
  test('all ancestor context is visible when viewing deeply nested route', async ({
    page,
  }) => {
    await page.goto('/posts/1/comments')

    // Root context
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )

    // Posts layout context
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('posts-beforeLoad')).toHaveText(
      'posts-beforeLoad',
    )

    // Post detail context
    await expect(page.getByTestId('post-context')).toHaveText(
      'postId-context-1',
    )
    await expect(page.getByTestId('post-beforeLoad')).toHaveText(
      'postId-beforeLoad-1',
    )

    // Comments own context
    await expect(page.getByTestId('comments-context')).toHaveText(
      'comments-context-1',
    )
    await expect(page.getByTestId('comments-beforeLoad')).toHaveText(
      'comments-beforeLoad-1',
    )
  })

  test('posts layout shows posts index when navigating to /posts', async ({
    page,
  }) => {
    await page.goto('/posts')

    await expect(page.getByTestId('posts-heading')).toHaveText('Posts Layout')
    await expect(page.getByTestId('posts-context')).toHaveText('posts-context')
    await expect(page.getByTestId('posts-beforeLoad')).toHaveText(
      'posts-beforeLoad',
    )

    // Posts index should be rendered in the outlet
    await expect(page.getByTestId('posts-index-text')).toHaveText(
      'Select a post from the list above.',
    )

    // Post-level context should NOT be visible (no post route mounted)
    await expect(page.getByTestId('post-context')).not.toBeVisible()
  })
})

// ============================================================================
// Dehydrate tests — blackbox testing using createIsomorphicFn
//
// Each route's lifecycle methods return 'server-{prefix}-{method}' on server
// and 'client-{prefix}-{method}' on client (via createIsomorphicFn).
//
// Dehydrated methods → server runs handler, value is sent to client via wire
//   → DOM shows 'server-{prefix}-{method}'
// Non-dehydrated methods → client re-executes the handler
//   → DOM shows 'client-{prefix}-{method}'
//
// This applies to both SSR page loads and client-side navigation.
//
// The effective dehydration depends on three levels (highest priority first):
// 1. Method-level: { handler, dehydrate: true/false } on the route option
// 2. Router-level: defaultDehydrate from start.ts (controlled by DEHYDRATE_DEFAULTS env var)
// 3. Builtin defaults: { beforeLoad: true, loader: true, context: false }
// ============================================================================

/**
 * Compute the expected rendered value for a method.
 * @param prefix - Route prefix (e.g. 'dd', 'dat')
 * @param method - Method name (e.g. 'context', 'beforeLoad')
 * @param dehydrated - Whether the method is effectively dehydrated
 */
function expectedValue(
  prefix: string,
  method: string,
  dehydrated: boolean,
): string {
  const env = dehydrated ? 'server' : 'client'
  return `${env}-${prefix}-${method}`
}

// Route-specific dehydrate configs:
// Each entry describes whether each method is effectively dehydrated.
// For routes with explicit dehydrate flags, those always win.
// For routes using function form (no explicit dehydrate), the effective
// default comes from getEffectiveDefaults() which reads DEHYDRATE_DEFAULTS.

interface RouteDehydrateConfig {
  path: string
  prefix: string
  heading: string
  headingTestId: string
  // For each method: true if dehydrate flag is explicit, with the value.
  // null means "use defaults" (function form).
  context: boolean | null
  beforeLoad: boolean | null
  loader: boolean | null
}

const dehydrateRoutes: Array<RouteDehydrateConfig> = [
  {
    path: '/dehydrate-defaults',
    prefix: 'dd',
    heading: 'Dehydrate Defaults',
    headingTestId: 'dd-heading',
    context: null, // function form → uses defaults
    beforeLoad: null,
    loader: null,
  },
  {
    path: '/dehydrate-all-true',
    prefix: 'dat',
    heading: 'Dehydrate All True',
    headingTestId: 'dat-heading',
    context: true,
    beforeLoad: true,
    loader: true,
  },
  {
    path: '/dehydrate-all-false',
    prefix: 'daf',
    heading: 'Dehydrate All False',
    headingTestId: 'daf-heading',
    context: false,
    beforeLoad: false,
    loader: false,
  },
  {
    path: '/dehydrate-mixed',
    prefix: 'dm',
    heading: 'Dehydrate Mixed',
    headingTestId: 'dm-heading',
    context: true,
    beforeLoad: false,
    loader: true,
  },
  {
    path: '/dehydrate-beforeload-false',
    prefix: 'dbf',
    heading: 'Dehydrate BeforeLoad False',
    headingTestId: 'dbf-heading',
    context: null,
    beforeLoad: false,
    loader: null,
  },
  {
    path: '/dehydrate-loader-false',
    prefix: 'dlf',
    heading: 'Dehydrate Loader False',
    headingTestId: 'dlf-heading',
    context: null,
    beforeLoad: null,
    loader: false,
  },
  {
    path: '/dehydrate-context-true',
    prefix: 'dct',
    heading: 'Dehydrate Context True',
    headingTestId: 'dct-heading',
    context: true,
    beforeLoad: null,
    loader: null,
  },
]

/**
 * Resolve the effective dehydrate flag for a method on a route.
 * Method-level explicit flag wins; otherwise uses the router-level default.
 */
function isEffectivelyDehydrated(
  explicitFlag: boolean | null,
  defaultFlag: boolean,
): boolean {
  if (explicitFlag !== null) return explicitFlag
  return defaultFlag
}

/**
 * Execution path modes for getExpectedValues:
 *
 * 'ssr' — Direct page.goto(route). All 3 methods run on server during SSR.
 *   Dehydrated methods → server value sent to client via wire → 'server-*'
 *   Non-dehydrated methods → client re-executes after hydration → 'client-*'
 *
 * 'clientNav' — Client-side navigation (link click) after hydration. No server
 *   involvement. All methods run locally on the client → 'client-*' for everything.
 *
 * 'roundTrip' — page.goto(route), nav to '/', nav back to route. Route was
 *   visited during SSR, so caches may exist. On the return client navigation:
 *   - context: CACHED (match already exists, never re-runs) → retains SSR hydration value
 *   - beforeLoad: ALWAYS re-runs on client → 'client-*'
 *   - loader: RE-RUNS on client (staleTime=0) → 'client-*'
 */
type ExecutionPath = 'ssr' | 'clientNav' | 'roundTrip'

/**
 * Get the full set of expected values for a route, given the current defaults
 * and the execution path.
 */
function getExpectedValues(
  route: RouteDehydrateConfig,
  mode: ExecutionPath = 'ssr',
) {
  const defaults = getEffectiveDefaults()
  const { prefix } = route

  if (mode === 'clientNav') {
    // Client navigation: everything runs on the client, no server calls
    return {
      context: expectedValue(prefix, 'context', false),
      beforeLoad: expectedValue(prefix, 'beforeLoad', false),
      loader: expectedValue(prefix, 'loader', false),
    }
  }

  // For SSR, dehydrate config determines which env runs each method
  const contextDehydrated = isEffectivelyDehydrated(
    route.context,
    defaults.context,
  )
  const beforeLoadDehydrated = isEffectivelyDehydrated(
    route.beforeLoad,
    defaults.beforeLoad,
  )
  const loaderDehydrated = isEffectivelyDehydrated(
    route.loader,
    defaults.loader,
  )

  if (mode === 'ssr') {
    return {
      context: expectedValue(prefix, 'context', contextDehydrated),
      beforeLoad: expectedValue(prefix, 'beforeLoad', beforeLoadDehydrated),
      loader: expectedValue(prefix, 'loader', loaderDehydrated),
    }
  }

  // 'roundTrip' mode: SSR page load first, then nav away and back.
  // Cached values retain whatever they were after SSR hydration.
  // Re-running methods always run on the client (no server calls).
  return {
    // context: CACHED from SSR hydration (never re-runs for existing match)
    context: expectedValue(prefix, 'context', contextDehydrated),
    // beforeLoad: ALWAYS re-runs on client
    beforeLoad: expectedValue(prefix, 'beforeLoad', false),
    // loader: RE-RUNS on client (staleTime=0, considered stale)
    loader: expectedValue(prefix, 'loader', false),
  }
}

test.describe('dehydrate - SSR rendering and hydration', () => {
  for (const route of dehydrateRoutes) {
    test(`${route.path}: renders correct values after hydration`, async ({
      page,
    }) => {
      await page.goto(route.path)

      const expected = getExpectedValues(route)

      // Wait for the route to load
      await expect(page.getByTestId(route.headingTestId)).toHaveText(
        route.heading,
      )

      // Assert all 3 lifecycle method values
      await expect(page.getByTestId(`${route.prefix}-context`)).toHaveText(
        expected.context,
      )
      await expect(page.getByTestId(`${route.prefix}-beforeLoad`)).toHaveText(
        expected.beforeLoad,
      )
      await expect(page.getByTestId(`${route.prefix}-loader`)).toHaveText(
        expected.loader,
      )
    })
  }
})

test.describe('dehydrate - client navigation', () => {
  // Client-side navigation runs all lifecycle methods on the client.
  // No server involvement. We must wait for hydration before clicking links,
  // otherwise the click may trigger a full page navigation (SSR) instead.
  for (const route of dehydrateRoutes) {
    test(`client nav to ${route.path}: values match dehydrate config`, async ({
      page,
    }) => {
      await page.goto('/')
      // Wait for hydration to complete before clicking any links
      await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
      await expect(page.getByTestId('index-heading')).toHaveText('Home')

      await page.getByTestId(`link-${route.path.slice(1)}`).click()
      await expect(page.getByTestId(route.headingTestId)).toHaveText(
        route.heading,
      )

      const expected = getExpectedValues(route, 'clientNav')

      await expect(page.getByTestId(`${route.prefix}-context`)).toHaveText(
        expected.context,
      )
      await expect(page.getByTestId(`${route.prefix}-beforeLoad`)).toHaveText(
        expected.beforeLoad,
      )
      await expect(page.getByTestId(`${route.prefix}-loader`)).toHaveText(
        expected.loader,
      )
    })
  }

  test('navigating between dehydrate routes preserves root context', async ({
    page,
  }) => {
    await page.goto('/dehydrate-defaults')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('dd-heading')).toHaveText(
      'Dehydrate Defaults',
    )
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )

    // Navigate to dehydrate-all-true
    await page.getByTestId('link-dehydrate-all-true').click()
    await expect(page.getByTestId('dat-heading')).toHaveText(
      'Dehydrate All True',
    )

    // Root context should still be correct
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )
  })

  test('navigating from dehydrate route back to home works correctly', async ({
    page,
  }) => {
    await page.goto('/dehydrate-all-false')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('daf-heading')).toHaveText(
      'Dehydrate All False',
    )

    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await expect(page.getByTestId('index-context')).toHaveText('index-context')
    await expect(page.getByTestId('index-beforeLoad')).toHaveText(
      'index-beforeLoad',
    )
    await expect(page.getByTestId('index-loader')).toHaveText('index-loader')
  })
})

test.describe('dehydrate - post-hydration round-trip', () => {
  // After SSR + hydration, navigate away and back. On the return trip:
  // - context: CACHED from SSR (match already exists) → retains SSR hydration value
  // - beforeLoad: ALWAYS re-runs → 'client-*'
  // - loader: RE-RUNS (staleTime=0, considered stale) → 'client-*'
  for (const route of dehydrateRoutes) {
    test(`${route.path}: round-trip has correct caching behavior`, async ({
      page,
    }) => {
      // Step 1: SSR page load — wait for hydration
      await page.goto(route.path)
      await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
      await expect(page.getByTestId(route.headingTestId)).toHaveText(
        route.heading,
      )

      const ssrExpected = getExpectedValues(route, 'ssr')

      // Verify SSR values
      await expect(page.getByTestId(`${route.prefix}-context`)).toHaveText(
        ssrExpected.context,
      )
      await expect(page.getByTestId(`${route.prefix}-beforeLoad`)).toHaveText(
        ssrExpected.beforeLoad,
      )
      await expect(page.getByTestId(`${route.prefix}-loader`)).toHaveText(
        ssrExpected.loader,
      )

      // Step 2: Navigate away
      await page.getByTestId('link-home').click()
      await expect(page.getByTestId('index-heading')).toHaveText('Home')

      // Step 3: Navigate back (client navigation with existing caches)
      await page.getByTestId(`link-${route.path.slice(1)}`).click()
      await expect(page.getByTestId(route.headingTestId)).toHaveText(
        route.heading,
      )

      const roundTripExpected = getExpectedValues(route, 'roundTrip')

      await expect(page.getByTestId(`${route.prefix}-context`)).toHaveText(
        roundTripExpected.context,
      )
      await expect(page.getByTestId(`${route.prefix}-beforeLoad`)).toHaveText(
        roundTripExpected.beforeLoad,
      )
      await expect(page.getByTestId(`${route.prefix}-loader`)).toHaveText(
        roundTripExpected.loader,
      )
    })
  }
})

// ============================================================================
// Dehydrate functions — dehydrate/hydrate function pairs
//
// The dehydrate-fn route uses Date objects in each lifecycle method.
// dehydrate converts Date → ISO string for the wire.
// hydrate reconstructs Date from ISO string on the client.
//
// Server dates are 2020-* and client dates are 2099-*.
// After SSR hydration, all values should be server dates (dehydrated + hydrated).
// After client navigation, all values should be client dates (handler runs locally).
// ============================================================================

test.describe('dehydrate-fn - dehydrate/hydrate function pairs', () => {
  test('SSR: all dates are server-side and hydrated as Date instances', async ({
    page,
  }) => {
    await page.goto('/dehydrate-fn')
    await expect(page.getByTestId('dfn-heading')).toHaveText(
      'Dehydrate Functions',
    )

    // All values should be server dates (dehydrated from server, hydrated on client)
    await expect(page.getByTestId('dfn-context')).toHaveText(
      '2020-01-01T00:00:00.000Z',
    )
    await expect(page.getByTestId('dfn-beforeLoad')).toHaveText(
      '2020-06-15T00:00:00.000Z',
    )
    await expect(page.getByTestId('dfn-loader')).toHaveText(
      '2020-12-25T00:00:00.000Z',
    )

    // Verify hydrate correctly reconstructed Date instances
    await expect(page.getByTestId('dfn-context-type')).toHaveText('Date')
    await expect(page.getByTestId('dfn-beforeLoad-type')).toHaveText('Date')
    await expect(page.getByTestId('dfn-loader-type')).toHaveText('Date')
  })

  test('client nav: all dates are client-side Date instances', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-dehydrate-fn').click()
    await expect(page.getByTestId('dfn-heading')).toHaveText(
      'Dehydrate Functions',
    )

    // All values should be client dates (handler runs locally)
    await expect(page.getByTestId('dfn-context')).toHaveText(
      '2099-01-01T00:00:00.000Z',
    )
    await expect(page.getByTestId('dfn-beforeLoad')).toHaveText(
      '2099-06-15T00:00:00.000Z',
    )
    await expect(page.getByTestId('dfn-loader')).toHaveText(
      '2099-12-25T00:00:00.000Z',
    )

    // Verify Date instances
    await expect(page.getByTestId('dfn-context-type')).toHaveText('Date')
    await expect(page.getByTestId('dfn-beforeLoad-type')).toHaveText('Date')
    await expect(page.getByTestId('dfn-loader-type')).toHaveText('Date')
  })

  test('round-trip: context retains SSR date, beforeLoad/loader re-run on client', async ({
    page,
  }) => {
    // Step 1: SSR page load
    await page.goto('/dehydrate-fn')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('dfn-heading')).toHaveText(
      'Dehydrate Functions',
    )

    // Verify SSR values
    await expect(page.getByTestId('dfn-context')).toHaveText(
      '2020-01-01T00:00:00.000Z',
    )
    await expect(page.getByTestId('dfn-beforeLoad')).toHaveText(
      '2020-06-15T00:00:00.000Z',
    )
    await expect(page.getByTestId('dfn-loader')).toHaveText(
      '2020-12-25T00:00:00.000Z',
    )

    // Step 2: Navigate away
    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    // Step 3: Navigate back (client navigation with existing caches)
    await page.getByTestId('link-dehydrate-fn').click()
    await expect(page.getByTestId('dfn-heading')).toHaveText(
      'Dehydrate Functions',
    )

    // context: CACHED from SSR hydration → retains server date
    await expect(page.getByTestId('dfn-context')).toHaveText(
      '2020-01-01T00:00:00.000Z',
    )
    // beforeLoad: ALWAYS re-runs on client → client date
    await expect(page.getByTestId('dfn-beforeLoad')).toHaveText(
      '2099-06-15T00:00:00.000Z',
    )
    // loader: RE-RUNS on client (staleTime=0) → client date
    await expect(page.getByTestId('dfn-loader')).toHaveText(
      '2099-12-25T00:00:00.000Z',
    )

    // All should still be Date instances
    await expect(page.getByTestId('dfn-context-type')).toHaveText('Date')
    await expect(page.getByTestId('dfn-beforeLoad-type')).toHaveText('Date')
    await expect(page.getByTestId('dfn-loader-type')).toHaveText('Date')
  })
})

// ============================================================================
// Revalidate context tests
//
// The revalidate-context route has a context handler that tracks how many times
// it has been called (global counter). It uses revalidate: true to re-run the
// handler when the route is invalidated.
//
// The route also dehydrates the context (dehydrate: true) so SSR values
// are sent via wire.
// ============================================================================

test.describe('revalidate-context - context revalidation', () => {
  test('SSR: context shows server source and runCount=1', async ({ page }) => {
    await page.goto('/revalidate-context')
    await expect(page.getByTestId('rc-heading')).toHaveText(
      'Revalidate Context',
    )

    await expect(page.getByTestId('rc-context-source')).toHaveText('server')
    await expect(page.getByTestId('rc-context-runCount')).toHaveText('1')
  })

  test('client nav: context shows client source and runCount=1', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-revalidate-context').click()
    await expect(page.getByTestId('rc-heading')).toHaveText(
      'Revalidate Context',
    )

    await expect(page.getByTestId('rc-context-source')).toHaveText('client')
    await expect(page.getByTestId('rc-context-runCount')).toHaveText('1')
  })

  test('invalidation: clicking invalidate re-runs context handler', async ({
    page,
  }) => {
    // Use client-side navigation to avoid server module counter interference
    // between tests (the server process persists across test cases).
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')

    // Client-nav to revalidate-context route (server counter not involved)
    await page.getByTestId('link-revalidate-context').click()
    await expect(page.getByTestId('rc-heading')).toHaveText(
      'Revalidate Context',
    )

    // After client navigation, handler runs on client — runCount=1, source='client'
    await expect(page.getByTestId('rc-context-source')).toHaveText('client')
    await expect(page.getByTestId('rc-context-runCount')).toHaveText('1')

    // Click invalidate — should trigger revalidation since revalidate: true
    await page.getByTestId('rc-invalidate-btn').click()

    // After invalidation the handler re-runs on the client.
    // Client module counter increments: 1→2
    await expect(page.getByTestId('rc-context-source')).toHaveText('client')
    await expect(page.getByTestId('rc-context-runCount')).toHaveText('2')
  })
})

// ============================================================================
// Revalidate context function tests
//
// The revalidate-context-fn route uses `revalidate` as a function and reads
// `ctx.prev` to derive the next context value. This verifies the callback path
// (not just `revalidate: true`) and confirms `prev` is wired correctly.
// ============================================================================

test.describe('revalidate-context-fn - functional revalidation with prev', () => {
  test('SSR: context comes from handler (not revalidate fn)', async ({
    page,
  }) => {
    await page.goto('/revalidate-context-fn')
    await expect(page.getByTestId('rcf-heading')).toHaveText(
      'Revalidate Context Function',
    )

    await expect(page.getByTestId('rcf-context-source')).toHaveText('server')
    await expect(page.getByTestId('rcf-context-value')).toHaveText('1')
    await expect(page.getByTestId('rcf-context-revalidated')).toHaveText(
      'false',
    )
    await expect(page.getByTestId('rcf-context-revalidateRunCount')).toHaveText(
      '0',
    )
  })

  test('client nav: initial context comes from handler on client', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-revalidate-context-fn').click()
    await expect(page.getByTestId('rcf-heading')).toHaveText(
      'Revalidate Context Function',
    )

    await expect(page.getByTestId('rcf-context-source')).toHaveText('client')
    await expect(page.getByTestId('rcf-context-value')).toHaveText('1')
    await expect(page.getByTestId('rcf-context-revalidated')).toHaveText(
      'false',
    )
    await expect(page.getByTestId('rcf-context-revalidateRunCount')).toHaveText(
      '0',
    )
  })

  test('invalidation: revalidate fn runs and uses prev value', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await page.getByTestId('link-revalidate-context-fn').click()
    await expect(page.getByTestId('rcf-heading')).toHaveText(
      'Revalidate Context Function',
    )

    await expect(page.getByTestId('rcf-context-value')).toHaveText('1')
    await expect(page.getByTestId('rcf-context-revalidated')).toHaveText(
      'false',
    )
    await expect(page.getByTestId('rcf-context-revalidateRunCount')).toHaveText(
      '0',
    )

    // First invalidation: prev.value=1 -> revalidate returns value=2
    await page.getByTestId('rcf-invalidate-btn').click()
    await expect(page.getByTestId('rcf-context-source')).toHaveText('client')
    await expect(page.getByTestId('rcf-context-value')).toHaveText('2')
    await expect(page.getByTestId('rcf-context-revalidated')).toHaveText('true')
    await expect(page.getByTestId('rcf-context-revalidateRunCount')).toHaveText(
      '1',
    )

    // Second invalidation: prev.value=2 -> revalidate returns value=3
    await page.getByTestId('rcf-invalidate-btn').click()
    await expect(page.getByTestId('rcf-context-value')).toHaveText('3')
    await expect(page.getByTestId('rcf-context-revalidateRunCount')).toHaveText(
      '2',
    )
  })
})

// ============================================================================
// Dehydrate partial — partial hydration of mixed serializable/non-serializable
//
// Each lifecycle returns an object with both serializable fields (string,
// number, array) and non-serializable fields (Date, function, RegExp).
// `dehydrate` strips the non-serializable parts for the wire payload.
// `hydrate` reconstructs the full shape on the client from the wire data.
//
// Server prefixes are "server-*", client prefixes are "client-*".
// After SSR: serializable fields show server values, non-serializable parts
// are reconstructed via hydrate.
// After client nav: everything runs locally with client prefixes.
// ============================================================================

test.describe('dehydrate-partial - partial hydration', () => {
  test('SSR: all fields present with server origin, non-serializable parts reconstructed', async ({
    page,
  }) => {
    await page.goto('/dehydrate-partial')
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    // Serializable fields — server origin
    await expect(page.getByTestId('dp-context-label')).toHaveText('server-ctx')
    await expect(page.getByTestId('dp-beforeLoad-tag')).toHaveText('server-bl')
    await expect(page.getByTestId('dp-loader-title')).toHaveText('server-ldr')
    await expect(page.getByTestId('dp-beforeLoad-count')).toHaveText('42')

    // Non-serializable: Date reconstructed via hydrate
    await expect(page.getByTestId('dp-context-date')).toHaveText(
      '2024-03-15T12:00:00.000Z',
    )
    await expect(page.getByTestId('dp-context-date-type')).toHaveText('Date')

    // Non-serializable: function reconstructed via hydrate
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[server-ctx] test',
    )
    await expect(page.getByTestId('dp-context-format-type')).toHaveText(
      'function',
    )

    // Non-serializable: RegExp reconstructed via hydrate
    await expect(page.getByTestId('dp-beforeLoad-pattern')).toHaveText(
      '^hello-\\d+$',
    )
    await expect(page.getByTestId('dp-beforeLoad-pattern-type')).toHaveText(
      'RegExp',
    )
    await expect(page.getByTestId('dp-beforeLoad-pattern-test')).toHaveText(
      'true',
    )

    // Non-serializable: computeAvg function reconstructed via hydrate
    await expect(page.getByTestId('dp-loader-scores')).toHaveText('10,20,30')
    await expect(page.getByTestId('dp-loader-avg')).toHaveText('20')
    await expect(page.getByTestId('dp-loader-avg-type')).toHaveText('function')
  })

  test('client nav: all fields present with client origin', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-dehydrate-partial').click()
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    // Serializable fields — client origin
    await expect(page.getByTestId('dp-context-label')).toHaveText('client-ctx')
    await expect(page.getByTestId('dp-beforeLoad-tag')).toHaveText('client-bl')
    await expect(page.getByTestId('dp-loader-title')).toHaveText('client-ldr')
    await expect(page.getByTestId('dp-beforeLoad-count')).toHaveText('42')

    // Non-serializable: all types present (handler ran locally)
    await expect(page.getByTestId('dp-context-date-type')).toHaveText('Date')
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[client-ctx] test',
    )
    await expect(page.getByTestId('dp-context-format-type')).toHaveText(
      'function',
    )
    await expect(page.getByTestId('dp-beforeLoad-pattern-type')).toHaveText(
      'RegExp',
    )
    await expect(page.getByTestId('dp-beforeLoad-pattern-test')).toHaveText(
      'true',
    )
    await expect(page.getByTestId('dp-loader-avg')).toHaveText('20')
    await expect(page.getByTestId('dp-loader-avg-type')).toHaveText('function')
  })

  test('round-trip: context retains SSR hydrated values, beforeLoad/loader re-run on client', async ({
    page,
  }) => {
    // Step 1: SSR page load
    await page.goto('/dehydrate-partial')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    // Verify SSR values
    await expect(page.getByTestId('dp-context-label')).toHaveText('server-ctx')
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[server-ctx] test',
    )

    // Step 2: Navigate away
    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    // Step 3: Navigate back (client navigation with existing caches)
    await page.getByTestId('link-dehydrate-partial').click()
    await expect(page.getByTestId('dp-heading')).toHaveText('Dehydrate Partial')

    // context: CACHED from SSR hydration → retains server values
    await expect(page.getByTestId('dp-context-label')).toHaveText('server-ctx')
    await expect(page.getByTestId('dp-context-date-type')).toHaveText('Date')
    await expect(page.getByTestId('dp-context-format')).toHaveText(
      '[server-ctx] test',
    )
    await expect(page.getByTestId('dp-context-format-type')).toHaveText(
      'function',
    )

    // beforeLoad: ALWAYS re-runs → client values
    await expect(page.getByTestId('dp-beforeLoad-tag')).toHaveText('client-bl')
    await expect(page.getByTestId('dp-beforeLoad-pattern-type')).toHaveText(
      'RegExp',
    )

    // loader: RE-RUNS (staleTime=0) → client values
    await expect(page.getByTestId('dp-loader-title')).toHaveText('client-ldr')
    await expect(page.getByTestId('dp-loader-avg-type')).toHaveText('function')
  })
})

// ============================================================================
// Stale revalidate — staleTime-triggered context revalidation
//
// The route uses staleTime: 200ms with revalidate: true. When the context
// cache is older than 200ms, navigating back to the route triggers the
// context handler to re-run.
// ============================================================================

test.describe('stale-revalidate - staleTime-triggered context revalidation', () => {
  test('SSR: context shows server source and runCount=1', async ({ page }) => {
    await page.goto('/stale-revalidate')
    await expect(page.getByTestId('sr-heading')).toHaveText('Stale Revalidate')

    await expect(page.getByTestId('sr-context-source')).toHaveText('server')
    await expect(page.getByTestId('sr-context-runCount')).toHaveText('1')
  })

  test('client nav: context shows client source and runCount=1', async ({
    page,
  }) => {
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    await page.getByTestId('link-stale-revalidate').click()
    await expect(page.getByTestId('sr-heading')).toHaveText('Stale Revalidate')

    await expect(page.getByTestId('sr-context-source')).toHaveText('client')
    await expect(page.getByTestId('sr-context-runCount')).toHaveText('1')
  })

  test('stale revalidation: context re-runs after staleTime elapses', async ({
    page,
  }) => {
    // Step 1: Navigate to the page (client-side, fresh context)
    await page.goto('/')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')

    await page.getByTestId('link-stale-revalidate').click()
    await expect(page.getByTestId('sr-heading')).toHaveText('Stale Revalidate')
    await expect(page.getByTestId('sr-context-runCount')).toHaveText('1')

    // Step 2: Navigate away
    await page.getByTestId('link-home').click()
    await expect(page.getByTestId('index-heading')).toHaveText('Home')

    // Step 3: Wait past the staleTime (200ms + buffer)
    await page.waitForTimeout(400)

    // Step 4: Navigate back — context is now stale, should re-run
    await page.getByTestId('link-stale-revalidate').click()
    await expect(page.getByTestId('sr-heading')).toHaveText('Stale Revalidate')

    // Context handler re-ran due to staleness → runCount incremented
    await expect(page.getByTestId('sr-context-runCount')).toHaveText('2')
    await expect(page.getByTestId('sr-context-source')).toHaveText('client')
  })
})
