import { useRouter, useRouterState } from '@tanstack/solid-router'
import { TanStackRouterDevtoolsPanelCore } from '@tanstack/router-devtools-core'
import { createEffect, createSignal, untrack } from 'solid-js'
import type { AnyRouter } from '@tanstack/solid-router'
import type { Component } from 'solid-js'
import type { JSX } from '@solidjs/web'

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
  const activeRouter = untrack(() => props.router) ?? useRouter()
  const activeRouterState = useRouterState({ router: activeRouter })

  const options = () => ({
    className: props.className,
    style: props.style,
    shadowDOMTarget: props.shadowDOMTarget,
  })

  const [devToolRef, setDevToolRef] = createSignal<HTMLDivElement>()
  const [devtools] = createSignal(
    new TanStackRouterDevtoolsPanelCore({
      ...untrack(options),
      isOpen: untrack(() => props.isOpen),
      setIsOpen: untrack(() => props.setIsOpen),
      handleDragStart: untrack(() => props.handleDragStart),
      router: activeRouter,
      routerState: untrack(activeRouterState),
    }),
  )

  createEffect(devtools, (d) => {
    d.setRouter(activeRouter)
  })

  createEffect(
    () => ({ d: devtools(), state: activeRouterState() }),
    ({ d, state }) => {
      d.setRouterState(state)
    },
  )

  createEffect(
    () => ({ d: devtools(), options: options() }),
    ({ d, options }) => {
      d.setOptions(options)
    },
  )

  createEffect(
    () => ({ d: devtools(), el: devToolRef() }),
    ({ d, el }) => {
      if (el) {
        d.mount(el)
        return () => d.unmount()
      }
      return undefined
    },
  )

  return (
    <>
      <div ref={setDevToolRef} />
    </>
  )
}
