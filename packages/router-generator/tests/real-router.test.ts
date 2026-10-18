/**
 * Generated route trees loaded by the real router: the app's router package
 * builds a router from the tree (`createRouter`), and each route gets the id,
 * full path and parent its file name or virtual route config gives it; URLs
 * match the expected routes, pages render (React with react-dom), and the
 * tree's types agree with the router (checked by the real TypeScript compiler
 * with the real router types). Helpers: real-router.ts.
 */
import { describe, test } from 'vitest'
import {
  index,
  layout,
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { rootRoute } from './app'
import { checkApp, page, routes } from './real-router'
import type { Case } from './real-router'

// (the frameworks' pages: real-router-frameworks.test.ts)
const cases: Array<Case> = [
  {
    name: 'flat, directory, layout, pathless, group, lazy and param routes',
    files: {
      'src/routes/__root.tsx': rootRoute(),
      ...routes([
        'index.tsx',
        'about.tsx',
        'about.lazy.tsx',
        'contact.lazy.tsx',
        'posts.tsx',
        'posts.index.tsx',
        'posts.$postId.tsx',
        'posts_.$postId.edit.tsx',
        'blog/route.tsx',
        'blog/index.tsx',
        'blog/$slug.tsx',
        '_auth.tsx',
        '_auth/login.tsx',
        '_auth/_admin.tsx',
        '_auth/_admin/users.tsx',
        '(marketing)/pricing.tsx',
        '(legal)/terms.tsx',
        '{-$locale}/help.tsx',
        'files.$.tsx',
        '[_]internal.tsx',
        'docs.[guide].tsx',
        'settings/_layout.tsx',
        'settings/_layout/profile.tsx',
      ]),
    },
    expected: {
      __root__: ['/', null],
      '/': ['/', '__root__'],
      '/about': ['/about', '__root__'],
      '/contact': ['/contact', '__root__'],
      '/posts': ['/posts', '__root__'],
      '/posts/': ['/posts/', '/posts'],
      '/posts/$postId': ['/posts/$postId', '/posts'],
      '/posts_/$postId/edit': ['/posts/$postId/edit', '__root__'],
      '/blog': ['/blog', '__root__'],
      '/blog/': ['/blog/', '/blog'],
      '/blog/$slug': ['/blog/$slug', '/blog'],
      '/_auth': ['/', '__root__'],
      '/_auth/login': ['/login', '/_auth'],
      '/_auth/_admin': ['/', '/_auth'],
      '/_auth/_admin/users': ['/users', '/_auth/_admin'],
      '/(marketing)/pricing': ['/pricing', '__root__'],
      '/(legal)/terms': ['/terms', '__root__'],
      '/{-$locale}/help': ['/{-$locale}/help', '__root__'],
      '/files/$': ['/files/$', '__root__'],
      '/_internal': ['/_internal', '__root__'],
      '/docs/guide': ['/docs/guide', '__root__'],
      '/settings/_layout': ['/settings', '__root__'],
      '/settings/_layout/profile': ['/settings/profile', '/settings/_layout'],
    },
    visits: {
      '/': '/',
      '/about': '/about',
      '/contact': '/contact',
      '/posts': '/posts/',
      '/posts/1': '/posts/$postId',
      '/posts/1/edit': '/posts_/$postId/edit',
      '/blog/hello': '/blog/$slug',
      '/login': '/_auth/login',
      '/users': '/_auth/_admin/users',
      '/pricing': '/(marketing)/pricing',
      '/terms': '/(legal)/terms',
      '/help': '/{-$locale}/help',
      '/fr/help': '/{-$locale}/help',
      '/files/a/b': '/files/$',
      '/_internal': '/_internal',
      '/docs/guide': '/docs/guide',
      '/settings/profile': '/settings/_layout/profile',
    },
  },
  {
    name: 'a virtual route config with layouts, an index and a physical mount',
    files: {
      'src/routes/root.tsx': rootRoute(),
      ...routes([
        'home.tsx',
        'posts/layout.tsx',
        'posts/list.tsx',
        'posts/detail.tsx',
        'auth-layout.tsx',
        'login.tsx',
        'legacy/about.tsx',
        'legacy/index.tsx',
      ]),
    },
    config: {
      virtualRouteConfig: virtualRootRoute('root.tsx', [
        index('home.tsx'),
        virtualRoute('/posts', 'posts/layout.tsx', [
          index('posts/list.tsx'),
          virtualRoute('$postId', 'posts/detail.tsx'),
        ]),
        layout('auth', 'auth-layout.tsx', [
          virtualRoute('/login', 'login.tsx'),
        ]),
        physical('/legacy', 'legacy'),
      ]),
    },
    expected: {
      __root__: ['/', null],
      '/': ['/', '__root__'],
      '/posts': ['/posts', '__root__'],
      '/posts/': ['/posts/', '/posts'],
      '/posts/$postId': ['/posts/$postId', '/posts'],
      '/_auth': ['/', '__root__'],
      '/_auth/login': ['/login', '/_auth'],
      '/legacy/about': ['/legacy/about', '__root__'],
      '/legacy/': ['/legacy/', '__root__'],
    },
    visits: {
      '/': '/',
      '/posts': '/posts/',
      '/posts/1': '/posts/$postId',
      '/login': '/_auth/login',
      '/legacy/about': '/legacy/about',
      '/legacy': '/legacy/',
    },
  },
]

describe('the real router on a generated route tree', () => {
  test.each(cases)(
    '$name',
    (testCase) => checkApp(testCase, { types: testCase.types ?? true }),
    60_000,
  )

  // A layout route file in a route group directory: `(group)` folders are
  // left out of the URL (file-naming-conventions.md:15) and a `route.tsx`
  // file is the route file at its directory's path (:18), so
  // `(marketing)/route.tsx` is a layout adding no path segment, like a
  // pathless layout (maintained since #4629, fixture
  // tests/generator/path-above-route-in-group).
  const groupLayout: Case = {
    name: 'a route group layout',
    files: {
      'src/routes/__root.tsx': page('react', 'createRootRoute', 'root', true),
      'src/routes/(marketing)/route.tsx': page(
        'react',
        'createFileRoute',
        'marketing',
        true,
      ),
      'src/routes/(marketing)/pricing.tsx': page(
        'react',
        'createFileRoute',
        'pricing',
      ),
    },
    expected: {
      __root__: ['/', null],
      '/(marketing)': ['/', '__root__'],
      '/(marketing)/pricing': ['/pricing', '/(marketing)'],
    },
    visits: { '/pricing': '/(marketing)/pricing' },
    pages: { '/pricing': ['root', 'marketing', 'pricing'] },
  }

  test(
    'the layout route of a route group directory adds no path segment and renders around its children',
    () => checkApp(groupLayout, { types: false }),
    60_000,
  )

  // Bug: the route tree types the layout route of a route group directory
  // (`(marketing)/route.tsx`) with `fullPath: ''` in `FileRoutesByPath`,
  // while the router gives it the full path `/` (the test above; a pathless
  // layout, `_auth.tsx`, is typed `/`, and agrees).
  // Source: src/utils.ts:929-950 (`inferFullPath`: `/(marketing)` without
  // its group is `/`, which is not an index path, so its trailing slash is
  // dropped), printed at src/utils.ts:1260.
  // Impact: `Route.fullPath` and the types derived from it (`from` of
  // links and hooks) say `''` in such a layout while the app sees `/`.
  test.fails(
    'the layout route of a route group directory has the full path of the router in the types',
    () => checkApp(groupLayout, { runtime: false }),
    60_000,
  )

  // Bug: a pathless layout with only a lazy route file
  // (`settings/_layout.lazy.tsx`, no `settings/_layout.tsx`) gets no `path`
  // in the route tree, so the router drops the `/settings` prefix its
  // directory gives it: the child matches `/profile`, not
  // `/settings/profile`. The tree's types say `/settings/profile`. Lazy-only
  // route files are supported (guide/code-splitting.md:222-224: a virtual
  // route anchors the code-split files; SPEC J1.8). Same bug as the G1 pin
  // in route-paths.test.ts, checked here with matching, rendering and types.
  // Source: src/generator.ts (the `path:` option of `createUpdateRoutes`:
  // printed only for non-pathless nodes and nodes typed `pathless_layout`;
  // a layout without a route file is typed `static`).
  // Impact: the pages under such a layout are served at the wrong URL, and
  // typed links to them lead nowhere.
  test.fails(
    'a pathless layout with only a lazy route file keeps its directory path',
    () =>
      checkApp({
        name: 'a lazy-only pathless layout',
        files: {
          'src/routes/__root.tsx': page(
            'react',
            'createRootRoute',
            'root',
            true,
          ),
          'src/routes/settings/_layout.lazy.tsx': page(
            'react',
            'createLazyFileRoute',
            'settings',
            true,
          ),
          'src/routes/settings/_layout/profile.tsx': page(
            'react',
            'createFileRoute',
            'profile',
          ),
        },
        expected: {
          __root__: ['/', null],
          '/settings/_layout': ['/settings', '__root__'],
          '/settings/_layout/profile': [
            '/settings/profile',
            '/settings/_layout',
          ],
        },
        visits: { '/settings/profile': '/settings/_layout/profile' },
        pages: { '/settings/profile': ['root', 'settings', 'profile'] },
      }),
    60_000,
  )
})
