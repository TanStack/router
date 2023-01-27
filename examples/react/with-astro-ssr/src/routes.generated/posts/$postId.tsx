import { lazy } from '@tanstack/react-router'
import { routeConfig as parentRouteConfig } from '../posts'
export type PostType = {
  id: string
  title: string
  body: string
}
export const tanner = 'foo'
const routeConfig = new Route({
  getParentRoute: () => parentRouteConfig,
  path: '$postId',
  component: lazy(() =>
    import('./$postId-component').then((d) => ({
      default: d.component,
    })),
  ),
  onLoad: (...args) =>
    import('./$postId-loader').then((d) =>
      d.loader.apply(d.loader, args as any),
    ),
})
export { routeConfig }
