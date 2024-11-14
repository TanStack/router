import { router } from './router'
export { router }
export { PostNotFoundError } from './fetch/posts'
// By re exporting the api from TanStack router, we can enforce that other packages
// rely on this one instead, making the type register being applied
export {
  Outlet,
  Link,
  useRouteContext,
  useRouter,
  RouterProvider,
  getRouteApi,
  ErrorComponent,
} from '@tanstack/react-router'
