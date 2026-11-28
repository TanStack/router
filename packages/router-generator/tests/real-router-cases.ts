/**
 * Shared test data: the apps whose route trees real-router.test.ts and
 * real-router-frameworks.test.ts check through the real router (runtime),
 * and integration/route-types.test.ts through the real TypeScript compiler
 * (types, J1.13). Helpers: real-router.ts.
 */
import {
  index,
  layout,
  physical,
  rootRoute as virtualRootRoute,
  route as virtualRoute,
} from '@tanstack/virtual-file-routes'
import { rootRoute } from './app'
import { page, pagesApp, routes, sfc } from './real-router'
import type { Case } from './real-router'

/** A React route file rendering `text` (`page` for React). */
const reactPage = (constructor: string, text: string, outlet = false) =>
  page('react', constructor, text, outlet)

/** Route shapes of file names and of a virtual route config (React). */
export const shapeCases: Array<Case> = [
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

// A layout route file in a route group directory: `(group)` folders are
// left out of the URL (file-naming-conventions.md:15) and a `route.tsx`
// file is the route file at its directory's path (:18), so
// `(marketing)/route.tsx` is a layout adding no path segment, like a
// pathless layout (maintained since #4629, fixture
// tests/generator/path-above-route-in-group).
export const groupLayout: Case = {
  name: 'a route group layout',
  files: {
    'src/routes/__root.tsx': reactPage('createRootRoute', 'root', true),
    'src/routes/(marketing)/route.tsx': reactPage(
      'createFileRoute',
      'marketing',
      true,
    ),
    'src/routes/(marketing)/pricing.tsx': reactPage(
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

/** Apps of each framework rendering their pages. */
export const frameworkCases: Array<Case> = [
  {
    name: 'a Vue app with route files and component pieces',
    config: { target: 'vue' },
    files: {
      'src/routes/__root.ts': rootRoute('vue'),
      'src/routes/__root.component.vue': sfc('root'),
      ...routes(
        [
          'index.ts',
          'posts.ts',
          'posts.$postId.ts',
          '_auth.ts',
          '_auth/login.ts',
        ],
        'vue',
      ),
      'src/routes/index.component.vue': sfc('home'),
      'src/routes/posts.component.vue': sfc('posts'),
      'src/routes/posts.$postId.component.vue': sfc('post'),
      'src/routes/_auth.component.vue': sfc('auth'),
      'src/routes/_auth/login.component.vue': sfc('login'),
      // A route with a component piece and no route file
      'src/routes/about.component.vue': sfc('about'),
    },
    expected: {
      __root__: ['/', null],
      '/': ['/', '__root__'],
      '/about': ['/about', '__root__'],
      '/posts': ['/posts', '__root__'],
      '/posts/$postId': ['/posts/$postId', '/posts'],
      '/_auth': ['/', '__root__'],
      '/_auth/login': ['/login', '/_auth'],
    },
    visits: {
      '/': '/',
      '/about': '/about',
      '/posts': '/posts',
      '/posts/1': '/posts/$postId',
      '/login': '/_auth/login',
    },
    pages: {
      '/': ['root', 'home'],
      '/about': ['root', 'about'],
      '/posts/1': ['root', 'posts', 'post'],
      '/login': ['root', 'auth', 'login'],
    },
  },
  pagesApp('react'),
  pagesApp('solid'),
]

/**
 * A pathless layout without child routes yet next to the index route
 * (route-paths.test.ts; its types: integration/route-types.test.ts).
 */
export const childlessLayouts = [
  {
    name: '_auth.tsx',
    file: '_auth.tsx',
    id: '/_auth',
    constructor: 'createFileRoute',
  },
  {
    name: '_auth.lazy.tsx',
    file: '_auth.lazy.tsx',
    id: '/_auth',
    constructor: 'createLazyFileRoute',
  },
  {
    name: '(group)/_layout.tsx',
    file: '(group)/_layout.tsx',
    id: '/(group)/_layout',
    constructor: 'createFileRoute',
  },
  {
    name: '(marketing)/route.tsx',
    file: '(marketing)/route.tsx',
    id: '/(marketing)',
    constructor: 'createFileRoute',
  },
]

export const childlessLayoutCase = ({
  file,
  id,
  constructor,
}: (typeof childlessLayouts)[number]): Case => ({
  name: `a childless ${file} next to the index route`,
  files: {
    'src/routes/__root.tsx': reactPage('createRootRoute', 'root', true),
    'src/routes/index.tsx': reactPage('createFileRoute', 'home'),
    [`src/routes/${file}`]: reactPage(constructor, 'auth', true),
  },
  expected: {
    __root__: ['/', null],
    '/': ['/', '__root__'],
    [id]: ['/', '__root__'],
  },
  visits: { '/': '/' },
  pages: { '/': ['root', 'home'] },
})

/**
 * A pathless layout in a directory under a route with only a lazy route file
 * (route-paths.test.ts, with the bug it pins; its types:
 * integration/route-types.test.ts).
 */
export const lazyOnlyAnchorLayoutInDirectory: Case = {
  name: 'a pathless layout in a directory under a lazy-only route',
  files: {
    'src/routes/__root.tsx': reactPage('createRootRoute', 'root', true),
    'src/routes/app.tsx': reactPage('createFileRoute', 'app', true),
    'src/routes/app/posts.lazy.tsx': reactPage(
      'createLazyFileRoute',
      'posts',
      true,
    ),
    'src/routes/app/posts/drafts/_layout.tsx': reactPage(
      'createFileRoute',
      'layout',
      true,
    ),
    'src/routes/app/posts/drafts/_layout/child.tsx': reactPage(
      'createFileRoute',
      'child',
    ),
  },
  expected: {
    __root__: ['/', null],
    '/app': ['/app', '__root__'],
    '/app/posts': ['/app/posts', '/app'],
    '/app/posts/drafts/_layout': ['/app/posts/drafts', '/app/posts'],
    '/app/posts/drafts/_layout/child': [
      '/app/posts/drafts/child',
      '/app/posts/drafts/_layout',
    ],
  },
  visits: {
    '/app/posts/drafts/child': '/app/posts/drafts/_layout/child',
  },
  pages: {
    '/app/posts/drafts/child': ['root', 'app', 'posts', 'layout', 'child'],
  },
}

/**
 * A pathless layout with only a lazy route file (real-router.test.ts, with
 * the bug it pins; its types: integration/route-types.test.ts).
 */
export const lazyOnlyPathlessLayout: Case = {
  name: 'a lazy-only pathless layout',
  files: {
    'src/routes/__root.tsx': reactPage('createRootRoute', 'root', true),
    'src/routes/settings/_layout.lazy.tsx': reactPage(
      'createLazyFileRoute',
      'settings',
      true,
    ),
    'src/routes/settings/_layout/profile.tsx': reactPage(
      'createFileRoute',
      'profile',
    ),
  },
  expected: {
    __root__: ['/', null],
    '/settings/_layout': ['/settings', '__root__'],
    '/settings/_layout/profile': ['/settings/profile', '/settings/_layout'],
  },
  visits: { '/settings/profile': '/settings/_layout/profile' },
  pages: { '/settings/profile': ['root', 'settings', 'profile'] },
}
