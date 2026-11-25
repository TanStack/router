'use client'

import { useRouter, useRouterState } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanelCore } from '@tanstack/router-devtools-core'
import React, { useEffect, useRef, useState } from 'react'
import type { AnyRouter } from '@tanstack/react-router'

export interface TanStackRouterDevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: any
  /**
   * The standard React class property used to style a component with classes
   */
  className?: string
  /**
   * A boolean variable indicating whether the panel is open or closed
   */
  isOpen?: boolean
  /**
   * A function that toggles the open and close state of the panel
   */
  setIsOpen?: (isOpen: boolean) => void
  /**
   * Handles the opening and closing the devtools panel
   */
  handleDragStart?: (e: any) => void
  /**
   * A boolean variable indicating if the "lite" version of the library is being used
   */
  router?: AnyRouter
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
  /**
   * The Trusted Types policy the devtools use to create their HTML templates.
   * Pass one when your page enforces `require-trusted-types-for 'script'`.
   * The devtools only pass it their own markup.
   */
  trustedTypesPolicy?: { createHTML: (html: string) => unknown }
}

export const TanStackRouterDevtoolsPanel: React.FC<
  TanStackRouterDevtoolsPanelOptions
> = (props): React.ReactElement | null => {
  const { router: propsRouter, ...rest } = props
  const hookRouter = useRouter({ warn: false })
  const activeRouter = propsRouter ?? hookRouter
  const activeRouterState = useRouterState({ router: activeRouter })

  const devToolRef = useRef<HTMLDivElement>(null)
  const [devtools] = useState(
    () =>
      new TanStackRouterDevtoolsPanelCore({
        ...rest,
        router: activeRouter,
        routerState: activeRouterState,
      }),
  )

  // Update devtools when props change
  useEffect(() => {
    devtools.setRouter(activeRouter)
  }, [devtools, activeRouter])

  useEffect(() => {
    devtools.setRouterState(activeRouterState)
  }, [devtools, activeRouterState])

  useEffect(() => {
    devtools.setOptions({
      className: props.className,
      style: props.style,
      shadowDOMTarget: props.shadowDOMTarget,
    })
  }, [devtools, props.className, props.style, props.shadowDOMTarget])

  useEffect(() => {
    if (devToolRef.current) {
      devtools.mount(devToolRef.current)
    }

    return () => {
      devtools.unmount()
    }
  }, [devtools])

  return (
    <>
      <div ref={devToolRef} />
    </>
  )
}
