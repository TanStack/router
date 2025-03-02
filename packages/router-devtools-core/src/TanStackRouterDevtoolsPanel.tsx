import React from "react"
import { DevtoolsOnCloseContext, ShadowDomTargetContext } from "./context"
import { BaseTanStackRouterDevtoolsPanel } from "./BaseTanStackRouterDevtoolsPanel"
import type {
  AnyRouter,
} from '@tanstack/react-router'

export interface DevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: React.CSSProperties
  /**
   * The standard React className property used to style a component with classes
   */
  className?: string
  /**
   * A boolean variable indicating whether the panel is open or closed
   */
  isOpen?: boolean
  /**
   * A function that toggles the open and close state of the panel
   */
  setIsOpen: (isOpen: boolean) => void
  /**
   * Handles the opening and closing the devtools panel
   */
  handleDragStart?: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  /**
   * A boolean variable indicating if the "lite" version of the library is being used
   */
  router?: AnyRouter
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

export const TanStackRouterDevtoolsPanel = React.forwardRef<
  HTMLDivElement,
  DevtoolsPanelOptions
>(function TanStackRouterDevtoolsPanel(props, ref) {
  const { shadowDOMTarget } = props

  return (
    <ShadowDomTargetContext.Provider value={shadowDOMTarget}>
      <DevtoolsOnCloseContext.Provider
        value={{
          onCloseClick: () => {},
        }}
      >
        <BaseTanStackRouterDevtoolsPanel ref={ref} {...props} />
      </DevtoolsOnCloseContext.Provider>
    </ShadowDomTargetContext.Provider>
  )
})

