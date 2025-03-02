import * as Solid from 'solid-js'
import { DevtoolsOnCloseContext, ShadowDomTargetContext } from './context'
import { BaseTanStackRouterDevtoolsPanel } from './BaseTanStackRouterDevtoolsPanel'
import type { AnyRouter } from '@tanstack/solid-router'

export interface DevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: Solid.JSX.CSSProperties
  /**
   * The standard React class property used to style a component with classes
   */
  className?: Solid.Accessor<string>
  /**
   * A boolean variable indicating whether the panel is open or closed
   */
  isOpen?: boolean
  /**
   * A function that toggles the open and close state of the panel
   */
  setIsOpen: (isOpen: { isOpen: boolean }) => void
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

export const TanStackRouterDevtoolsPanel =
  function TanStackRouterDevtoolsPanel({
    ref,
    ...props
  }: DevtoolsPanelOptions & { ref?: HTMLDivElement | undefined }) {
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
  }
