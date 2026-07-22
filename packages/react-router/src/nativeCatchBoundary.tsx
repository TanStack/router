'use client'

import * as React from 'react'
import { CatchBoundary as ReactCatchBoundary } from './CatchBoundary'
import { useRouterRenderer } from './routerRenderer'

export function CatchBoundary(
  props: React.ComponentProps<typeof ReactCatchBoundary>,
) {
  const renderer = useRouterRenderer()
  return (
    <ReactCatchBoundary
      {...props}
      errorComponent={props.errorComponent ?? renderer?.errorComponent}
    />
  )
}
