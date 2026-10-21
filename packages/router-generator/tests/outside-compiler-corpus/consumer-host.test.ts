/** Observer control: a generated re-export cannot own a fixture Route. */
import { expect, test } from 'vitest'
import { createApp, fileRoute, generate, rootRoute } from '../app'
import { routesOf } from '../route-tree'

test('compares fixture source identity even when the generated tree re-exports its Route', async () => {
  const root = await createApp({
    'src/routes/__root.tsx': rootRoute(),
    'src/routes/posts.tsx': fileRoute('/posts'),
  })
  const { generatedRouteTree } = await generate(root, {
    routeTreeFileFooter: [`export { Route } from './routes/posts'`],
  })
  expect(await routesOf(generatedRouteTree)).toEqual({
    __root__: 'routes/__root.tsx',
    '/posts': 'routes/posts.tsx',
  })
})
