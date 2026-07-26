import { expectTypeOf } from 'vitest'
import {
  createFileRoute,
  createLink,
  createRootRoute,
  createRootRouteWithContext,
  createRoute,
  createRouter,
  linkOptions,
} from '../src'
import type { ComponentBody } from 'octane'
import type { AnyRoute } from '@tanstack/router-core'

const contextualRoot = createRootRouteWithContext<{ userId: string }>()({
  loader: ({ context }) => ({ owner: context.userId }),
})

const projectRoute = createRoute({
  getParentRoute: () => contextualRoot,
  path: 'projects/$projectId',
  loader: ({ params, context }) => ({
    projectId: params.projectId,
    owner: context.userId,
  }),
})

const routeTree = contextualRoot.addChildren([projectRoute])
const _router = createRouter({
  routeTree,
  context: { userId: 'tanner' },
})

expectTypeOf(projectRoute.id).toEqualTypeOf<'/projects/$projectId'>()
expectTypeOf(projectRoute.fullPath).toEqualTypeOf<'/projects/$projectId'>()
expectTypeOf(projectRoute.useParams<typeof _router>()).toEqualTypeOf<{
  projectId: string
}>()
expectTypeOf(projectRoute.useLoaderData<typeof _router>()).toEqualTypeOf<{
  projectId: string
  owner: string
}>()
expectTypeOf(contextualRoot.useRouteContext<typeof _router>()).toEqualTypeOf<{
  userId: string
}>()

const reusableLink = linkOptions<
  {
    from: '/projects/$projectId'
    to: '/projects/$projectId'
    params: { projectId: string }
  },
  typeof _router
>({
  from: '/projects/$projectId',
  to: '/projects/$projectId',
  params: { projectId: 'router' },
})
expectTypeOf(reusableLink.params).toEqualTypeOf<{ projectId: string }>()

const DesignLink: ComponentBody<{
  variant: 'primary'
  href?: string
  children?: unknown
}> = () => {}
const CustomLink = createLink(DesignLink)
CustomLink<typeof _router>({
  variant: 'primary',
  to: '/',
})

const _fileRoot = createRootRoute()

declare module '@tanstack/router-core' {
  interface FileRoutesByPath {
    '/posts/$postId': {
      preLoaderRoute: AnyRoute
      parentRoute: typeof _fileRoot
      id: '/posts/$postId'
      fullPath: '/posts/$postId'
      path: 'posts/$postId'
    }
  }
}

const postRoute = createFileRoute('/posts/$postId')({
  loader: ({ params }) => params.postId,
})

expectTypeOf(postRoute.id).toEqualTypeOf<'/posts/$postId'>()
expectTypeOf(postRoute.path).toEqualTypeOf<'posts/$postId'>()
expectTypeOf(postRoute.types.loaderData).toEqualTypeOf<string>()
