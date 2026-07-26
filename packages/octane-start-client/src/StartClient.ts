import { HYDRATION_RANGE_BOUNDARY, createElement, useEffect } from 'octane'
import { RouterProvider } from '@tanstack/octane-router'
import type { AnyRouter } from '@tanstack/router-core'

export interface StartClientProps {
  router: AnyRouter
}

export function StartClient({ router }: StartClientProps) {
  useEffect(() => {
    window.$_TSR?.h()
  }, [])

  return createElement(RouterProvider, { router })
}

;(
  StartClient as typeof StartClient & {
    [HYDRATION_RANGE_BOUNDARY]: 'passthrough'
  }
)[HYDRATION_RANGE_BOUNDARY] = 'passthrough'
