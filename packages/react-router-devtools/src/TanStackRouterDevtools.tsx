import { TanStackRouterDevtoolsCore } from '@tanstack/router-devtools-core'
import React, { Fragment, useEffect } from 'react'

interface DevtoolsOptions {
  /**
   * Set this true if you want the dev tools to default to being open
   */
  initialIsOpen?: boolean
  /**
   * Use this to add props to the panel. For example, you can add className, style (merge and override default style), etc.
   */
  panelProps?: React.DetailedHTMLProps<
    React.HTMLAttributes<HTMLDivElement>,
    HTMLDivElement
  >
  /**
   * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  closeButtonProps?: React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  >
  /**
   * Use this to add props to the toggle button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  toggleButtonProps?: React.DetailedHTMLProps<
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    HTMLButtonElement
  >
  /**
   * The position of the TanStack Router logo to open and close the devtools panel.
   * Defaults to 'bottom-left'.
   */
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  /**
   * Use this to render the devtools inside a different type of container element for a11y purposes.
   * Any string which corresponds to a valid intrinsic JSX element is allowed.
   * Defaults to 'footer'.
   */
  containerElement?: string | any
  /**
   * A boolean variable indicating if the "lite" version of the library is being used
   */
  router?: any
  routerState?: any
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

export function TanStackRouterDevtools(props: DevtoolsOptions) {
  const {
    initialIsOpen,
    panelProps,
    closeButtonProps,
    toggleButtonProps,
    position,
    containerElement,
    shadowDOMTarget,
    router,
    routerState,
  } = props

  const devToolRef = React.useRef<HTMLDivElement>(null)
  const [devtools] = React.useState(
    () =>
      new TanStackRouterDevtoolsCore({
        initialIsOpen,
        panelProps,
        closeButtonProps,
        toggleButtonProps,
        position,
        containerElement,
        shadowDOMTarget,
        routerState,
        router,
      }),
  )

  // Update devtools when props change
  useEffect(() => {
    devtools.setRouter(router)
  }, [devtools, router])

  useEffect(() => {
    devtools.setRouterState(routerState)
  }, [devtools, routerState])

  useEffect(() => {
    devtools.setOptions({
      initialIsOpen: initialIsOpen,
      panelProps: panelProps,
      closeButtonProps: closeButtonProps,
      toggleButtonProps: toggleButtonProps,
      position: position,
      containerElement: containerElement,
      shadowDOMTarget: shadowDOMTarget,
    })
  }, [
    devtools,
    initialIsOpen,
    panelProps,
    closeButtonProps,
    toggleButtonProps,
    position,
    containerElement,
    shadowDOMTarget,
  ])

  React.useEffect(() => {
    if (devToolRef.current) {
      devtools.mount(devToolRef.current)
    }

    return () => {
      devtools.unmount()
    }
  }, [devtools])

  return (
    <Fragment>
      <div ref={devToolRef} />
    </Fragment>
  )
}
