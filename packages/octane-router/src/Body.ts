import { HYDRATION_RANGE_BOUNDARY, createElement } from 'octane'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './context'
import type { ComponentBody } from 'octane'

export interface BodyProps {
  children?: unknown
  [key: string]: unknown
}

const HydrationRangeOwner: ComponentBody<Pick<BodyProps, 'children'>> = (
  props,
) => props.children

;(
  HydrationRangeOwner as typeof HydrationRangeOwner & {
    [HYDRATION_RANGE_BOUNDARY]: 'owner'
  }
)[HYDRATION_RANGE_BOUNDARY] = 'owner'

export const Body: ComponentBody<BodyProps> = (props) => {
  const router = useRouter()
  const { children, ...attrs } = props
  if (isServer ?? router.isServer) {
    return createElement(
      'body',
      attrs,
      createElement(
        'div',
        { id: '__app' },
        createElement(HydrationRangeOwner, {}, children),
      ),
    )
  }
  return createElement(HydrationRangeOwner, {}, children)
}
