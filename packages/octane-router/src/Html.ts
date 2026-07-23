import { createElement } from 'octane'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './context'
import type { ComponentBody } from 'octane'

export interface HtmlProps {
  children?: unknown
  [key: string]: unknown
}

export const Html: ComponentBody<HtmlProps> = (props) => {
  const router = useRouter()
  const { children, ...attrs } = props
  if (isServer ?? router.isServer) {
    return createElement('html', attrs, children)
  }
  return children
}
