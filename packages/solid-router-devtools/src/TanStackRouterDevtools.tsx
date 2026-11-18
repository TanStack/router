import { useRouter, useRouterState } from '@tanstack/solid-router'
import { TanStackRouterDevtoolsCore } from '@tanstack/router-devtools-core'
import { createEffect, createSignal, untrack } from 'solid-js'
import type { AnyRouter } from '@tanstack/solid-router'
import type { Component } from 'solid-js'
import type { JSX } from '@solidjs/web'

export interface TanStackRouterDevtoolsOptions {
  /**
   * Set this true if you want the dev tools to default to being open
   */
  initialIsOpen?: boolean
  /**
   * Use this to add props to the panel. For example, you can add className, style (merge and override default style), etc.
   */
  panelProps?: JSX.HTMLAttributes<HTMLDivElement>
  /**
   * Use this to add props to the close button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  closeButtonProps?: JSX.ButtonHTMLAttributes<HTMLButtonElement>
  /**
   * Use this to add props to the toggle button. For example, you can add className, style (merge and override default style), onClick (extend default handler), etc.
   */
  toggleButtonProps?: JSX.ButtonHTMLAttributes<HTMLButtonElement>
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
   * The router instance to use for the devtools.
   */
  router?: AnyRouter
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

export const TanStackRouterDevtools: Component<
  TanStackRouterDevtoolsOptions
> = (props): JSX.Element | null => {
  const activeRouter = untrack(() => props.router) ?? useRouter()
  const activeRouterState = useRouterState({ router: activeRouter })

  const options = () => ({
    initialIsOpen: props.initialIsOpen,
    panelProps: props.panelProps,
    closeButtonProps: props.closeButtonProps,
    toggleButtonProps: props.toggleButtonProps,
    position: props.position,
    containerElement: props.containerElement,
    shadowDOMTarget: props.shadowDOMTarget,
  })

  const [devToolRef, setDevToolRef] = createSignal<HTMLDivElement>()
  const [devtools] = createSignal(
    new TanStackRouterDevtoolsCore({
      ...untrack(options),
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
      <div
        ref={(el) => {
          setDevToolRef(el)
        }}
      />
    </>
  )
}
