/**
 * Generated route trees of React, Solid and Vue apps loaded by the real
 * router: the pages render with each framework's server renderer (React with
 * react-dom, Solid with solid-js/web, Vue with its server renderer and
 * single-file components), and the tree's types agree with the router.
 */
import { describe, test } from 'vitest'
import { rootRoute } from './app'
import { checkApp, pagesApp, routes, sfc } from './real-router'
import type { Case } from './real-router'

const cases: Array<Case> = [
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

describe('the real router on the route trees of each framework', () => {
  test.each(cases)(
    '$name',
    (testCase) => checkApp(testCase, { types: testCase.types ?? true }),
    60_000,
  )
})
