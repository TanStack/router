import {
  createLink,
  createRouter,
  useNavigate as tsrUseNavigate,
} from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'
import type { AnyRouter, FromPathOption } from '@tanstack/react-router'

export const router = createRouter({
  routeTree,
  defaultPreload: 'intent',
  defaultStaleTime: 5000,
})

export const Link = createLink('a', router)
// should be provided by @tanstack/react-router
function createUseNavigate<TRouter extends AnyRouter>(router: TRouter) {
  return <TDefaultFrom extends string = string>(_defaultOpts?: {
    from?: FromPathOption<TRouter, TDefaultFrom>
  }) => {
    return tsrUseNavigate<TRouter, TDefaultFrom>(_defaultOpts)
  }
}
export const useNavigate = createUseNavigate(router)
