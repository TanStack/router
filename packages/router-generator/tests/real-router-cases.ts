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
