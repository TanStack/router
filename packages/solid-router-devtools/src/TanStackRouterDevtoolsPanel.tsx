import { useRouter, useRouterState } from '@tanstack/solid-router'
import { TanStackRouterDevtoolsPanelCore } from '@tanstack/router-devtools-core'
import { createEffect, createSignal, onCleanup } from 'solid-js'
import type { AnyRouter } from '@tanstack/solid-router'
import type { Component, JSX } from 'solid-js'

export interface TanStackRouterDevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: JSX.CSSProperties
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
}

export const TanStackRouterDevtoolsPanel: Component<
  TanStackRouterDevtoolsPanelOptions
> = (props): JSX.Element | null => {
  const activeRouter = props.router ?? useRouter()
  const activeRouterState = useRouterState({ router: activeRouter })

  const usedProps = {
    ...props,
    router: activeRouter,
    routerState: activeRouterState,
  }

  let devToolRef: HTMLDivElement | undefined
  const [devtools] = createSignal(
    new TanStackRouterDevtoolsPanelCore(usedProps),
  )

  // Update devtools when props change
  createEffect(devtools, (d) => {
    d.setRouter(usedProps.router)
  })

  createEffect(devtools, (d) => {
    d.setRouterState(usedProps.routerState)
  })

  createEffect(devtools, (d) => {
    d.setOptions({
      className: usedProps.className,
      style: usedProps.style,
      shadowDOMTarget: usedProps.shadowDOMTarget,
    })
  })

  createEffect(devtools, (d) => {
    if (devToolRef) {
      d.mount(devToolRef)

      onCleanup(() => {
        d.unmount()
      })
    }
  })

  return (
    <>
      <div ref={devToolRef} />
    </>
  )
}
