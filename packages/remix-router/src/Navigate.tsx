/** @jsxRuntime automatic */
/** @jsxImportSource @remix-run/ui */
import { useNavigate } from './useNavigate'
import type { Handle, RemixNode } from '@remix-run/ui'
import type {
  AnyRouter,
  NavigateOptions,
  RegisteredRouter,
} from '@tanstack/router-core'

export type NavigateProps<
  TRouter extends AnyRouter = RegisteredRouter,
  TFrom extends string = string,
  TTo extends string | undefined = undefined,
  TMaskFrom extends string = TFrom,
  TMaskTo extends string = '',
> = NavigateOptions<TRouter, TFrom, TTo, TMaskFrom, TMaskTo>

/**
 * Component that triggers a navigation when rendered. Navigation runs once
 * per render via a queued task — equivalent to React's `useLayoutEffect`
 * pattern in `@tanstack/react-router`.
 *
 * @link https://tanstack.com/router/latest/docs/framework/react/api/router/navigateComponent
 */
export function Navigate(handle: Handle<NavigateProps>) {
  const navigate = useNavigate(handle)

  let lastProps: NavigateProps | null = null

  return (props: NavigateProps): RemixNode => {
    if (props !== lastProps) {
      lastProps = props
      handle.queueTask(() => {
        void navigate(props as any)
      })
    }
    return null
  }
}
