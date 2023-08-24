import * as React from 'react'
import {
  ScrollRestorationOptions,
  restoreScrollPositions,
  watchScrollPositions,
} from '@tanstack/router-core'
import { useRouter } from '.'

const useLayoutEffect =
  typeof window !== 'undefined' ? React.useLayoutEffect : React.useEffect

export function useScrollRestoration(options?: ScrollRestorationOptions) {
  const router = useRouter()

  useLayoutEffect(() => {
    return watchScrollPositions(router, options)
  }, [])

  useLayoutEffect(() => {
    restoreScrollPositions(router, options)
  })
}

export function ScrollRestoration(props: ScrollRestorationOptions) {
  useScrollRestoration(props)
  return null
}
