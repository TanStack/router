import { expect } from '@playwright/test'
import { test } from '@tanstack/router-e2e-utils'
import { getEffectiveDefaults } from './utils/serializeDefaults'

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
// Serialize tests — blackbox testing using createIsomorphicFn
//
// Each route's lifecycle methods return 'server-{prefix}-{method}' on server
// and 'client-{prefix}-{method}' on client (via createIsomorphicFn).
//
// Serialized methods → server runs handler, value is sent to client via wire
//   → DOM shows 'server-{prefix}-{method}'
// Non-serialized methods → client re-executes the handler
//   → DOM shows 'client-{prefix}-{method}'
//
// This applies to both SSR page loads and client-side navigation.
//
// The effective serialization depends on three levels (highest priority first):
// 1. Method-level: { handler, serialize: true/false } on the route option
// 2. Router-level: defaultSerialize from start.ts (controlled by SERIALIZE_DEFAULTS env var)
// 3. Builtin defaults: { beforeLoad: true, loader: true, context: false }
// ============================================================================

/**
 * Compute the expected rendered value for a method.
 * @param prefix - Route prefix (e.g. 'sd', 'sat')
 * @param method - Method name (e.g. 'context', 'beforeLoad')
 * @param serialized - Whether the method is effectively serialized
 */
function expectedValue(
  prefix: string,
  method: string,
  serialized: boolean,
): string {
  const env = serialized ? 'server' : 'client'
  return `${env}-${prefix}-${method}`
}

// Route-specific serialize configs:
// Each entry describes whether each method is effectively serialized.
// For routes with explicit serialize flags, those always win.
// For routes using function form (no explicit serialize), the effective
// default comes from getEffectiveDefaults() which reads SERIALIZE_DEFAULTS.

interface RouteSerializeConfig {
  path: string
  prefix: string
  heading: string
  headingTestId: string
  // For each method: true if serialize flag is explicit, with the value.
  // null means "use defaults" (function form).
  context: boolean | null
  beforeLoad: boolean | null
  loader: boolean | null
}

const serializeRoutes: Array<RouteSerializeConfig> = [
  {
    path: '/serialize-defaults',
    prefix: 'sd',
    heading: 'Serialize Defaults',
    headingTestId: 'sd-heading',
    context: null, // function form → uses defaults
    beforeLoad: null,
    loader: null,
  },
  {
    path: '/serialize-all-true',
    prefix: 'sat',
    heading: 'Serialize All True',
    headingTestId: 'sat-heading',
    context: true,
    beforeLoad: true,
    loader: true,
  },
  {
    path: '/serialize-all-false',
    prefix: 'saf',
    heading: 'Serialize All False',
    headingTestId: 'saf-heading',
    context: false,
    beforeLoad: false,
    loader: false,
  },
  {
    path: '/serialize-mixed',
    prefix: 'sm',
    heading: 'Serialize Mixed',
    headingTestId: 'sm-heading',
    context: true,
    beforeLoad: false,
    loader: true,
  },
  {
    path: '/serialize-beforeload-false',
    prefix: 'sbf',
    heading: 'Serialize BeforeLoad False',
    headingTestId: 'sbf-heading',
    context: null,
    beforeLoad: false,
    loader: null,
  },
  {
    path: '/serialize-loader-false',
    prefix: 'slf',
    heading: 'Serialize Loader False',
    headingTestId: 'slf-heading',
    context: null,
    beforeLoad: null,
    loader: false,
  },
  {
    path: '/serialize-context-true',
    prefix: 'sct',
    heading: 'Serialize Context True',
    headingTestId: 'sct-heading',
    context: true,
    beforeLoad: null,
    loader: null,
  },
]

/**
 * Resolve the effective serialize flag for a method on a route.
 * Method-level explicit flag wins; otherwise uses the router-level default.
 */
function isEffectivelySerialized(
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
 *   Serialized methods → server value sent to client via wire → 'server-*'
 *   Non-serialized methods → client re-executes after hydration → 'client-*'
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
  route: RouteSerializeConfig,
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

  // For SSR, serialize config determines which env runs each method
  const contextSerialized = isEffectivelySerialized(
    route.context,
    defaults.context,
  )
  const beforeLoadSerialized = isEffectivelySerialized(
    route.beforeLoad,
    defaults.beforeLoad,
  )
  const loaderSerialized = isEffectivelySerialized(
    route.loader,
    defaults.loader,
  )

  if (mode === 'ssr') {
    return {
      context: expectedValue(prefix, 'context', contextSerialized),
      beforeLoad: expectedValue(prefix, 'beforeLoad', beforeLoadSerialized),
      loader: expectedValue(prefix, 'loader', loaderSerialized),
    }
  }

  // 'roundTrip' mode: SSR page load first, then nav away and back.
  // Cached values retain whatever they were after SSR hydration.
  // Re-running methods always run on the client (no server calls).
  return {
    // context: CACHED from SSR hydration (never re-runs for existing match)
    context: expectedValue(prefix, 'context', contextSerialized),
    // beforeLoad: ALWAYS re-runs on client
    beforeLoad: expectedValue(prefix, 'beforeLoad', false),
    // loader: RE-RUNS on client (staleTime=0, considered stale)
    loader: expectedValue(prefix, 'loader', false),
  }
}

test.describe('serialize - SSR rendering and hydration', () => {
  for (const route of serializeRoutes) {
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

test.describe('serialize - client navigation', () => {
  // Client-side navigation runs all lifecycle methods on the client.
  // No server involvement. We must wait for hydration before clicking links,
  // otherwise the click may trigger a full page navigation (SSR) instead.
  for (const route of serializeRoutes) {
    test(`client nav to ${route.path}: values match serialize config`, async ({
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

  test('navigating between serialize routes preserves root context', async ({
    page,
  }) => {
    await page.goto('/serialize-defaults')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('sd-heading')).toHaveText(
      'Serialize Defaults',
    )
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )

    // Navigate to serialize-all-true
    await page.getByTestId('link-serialize-all-true').click()
    await expect(page.getByTestId('sat-heading')).toHaveText(
      'Serialize All True',
    )

    // Root context should still be correct
    await expect(page.getByTestId('root-context')).toHaveText('root-context')
    await expect(page.getByTestId('root-beforeLoad')).toHaveText(
      'root-beforeLoad',
    )
  })

  test('navigating from serialize route back to home works correctly', async ({
    page,
  }) => {
    await page.goto('/serialize-all-false')
    await expect(page.getByTestId('hydrated')).toHaveText('hydrated')
    await expect(page.getByTestId('saf-heading')).toHaveText(
      'Serialize All False',
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

test.describe('serialize - post-hydration round-trip', () => {
  // After SSR + hydration, navigate away and back. On the return trip:
  // - context: CACHED from SSR (match already exists) → retains SSR hydration value
  // - beforeLoad: ALWAYS re-runs → 'client-*'
  // - loader: RE-RUNS (staleTime=0, considered stale) → 'client-*'
  for (const route of serializeRoutes) {
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
