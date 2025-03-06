import { TanStackRouterDevtools } from '@tanstack/router-devtools-core'
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

export function ReactRouterDevtools(props: DevtoolsOptions) {
  const usedProps = {
    ...props,
    router: props.router,
    routerState: props.routerState,
  }

  const devToolRef = React.useRef<HTMLDivElement>(null)
  const [devtools] = React.useState(() => new TanStackRouterDevtools(usedProps))

  // Update devtools when props change
  useEffect(() => {
    devtools.setRouter(usedProps.router)
  }, [devtools, usedProps.router])

  useEffect(() => {
    console.log("Router state change")
    devtools.setRouterState(usedProps.routerState)
  }, [devtools, usedProps.routerState])

  useEffect(() => {
    devtools.setOptions({
      initialIsOpen: usedProps.initialIsOpen,
      panelProps: usedProps.panelProps,
      closeButtonProps: usedProps.closeButtonProps,
      toggleButtonProps: usedProps.toggleButtonProps,
      position: usedProps.position,
      containerElement: usedProps.containerElement,
      shadowDOMTarget: usedProps.shadowDOMTarget,
    })
  }, [
    devtools,
    usedProps.initialIsOpen,
    usedProps.panelProps,
    usedProps.closeButtonProps,
    usedProps.toggleButtonProps,
    usedProps.position,
    usedProps.containerElement,
    usedProps.shadowDOMTarget,
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
