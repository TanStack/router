import { createElement, createPortal } from 'octane'
import { isServer } from '@tanstack/router-core/isServer'
import { useRouter } from './context'
import type { ComponentBody } from 'octane'

export interface HeadProps {
  children?: unknown
  [key: string]: unknown
}

export const Head: ComponentBody<HeadProps> = (props) => {
  const router = useRouter()
  const { children, ...attrs } = props
  if (isServer ?? router.isServer) {
    return createElement('head', attrs, children)
  }
  if (typeof document !== 'undefined') {
    return createPortal(children, document.head)
  }
  return null
}
