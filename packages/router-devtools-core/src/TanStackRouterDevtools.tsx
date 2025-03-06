import { clsx as cx } from 'clsx'
import * as Solid from 'solid-js'
import { createSignal, createEffect } from 'solid-js'
import { render } from 'solid-js/web'
import { DevtoolsOnCloseContext, ShadowDomTargetContext } from './context'
import { useIsMounted, useSafeState } from './utils'
import { BaseTanStackRouterDevtoolsPanel } from './BaseTanStackRouterDevtoolsPanel'
import useLocalStorage from './useLocalStorage'
import { TanStackLogo } from './logo'
import { useStyles } from './useStyles'
import type { AnyRouter } from '@tanstack/solid-router'
import { Dynamic } from 'solid-js/web'

interface DevtoolsOptions {
  /**
   * Set this true if you want the dev tools to default to being open
   */
  initialIsOpen?: boolean
  /**
   * Use this to add props to the panel. For example, you can add class, style (merge and override default style), etc.
   */
  panelProps?: Solid.JSX.HTMLAttributes<HTMLDivElement> & {
    ref?: Solid.Ref<HTMLDivElement>
  }
  /**
   * Use this to add props to the close button. For example, you can add class, style (merge and override default style), onClick (extend default handler), etc.
   */
  closeButtonProps?: Solid.JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: Solid.Ref<HTMLButtonElement>
  }
  /**
   * Use this to add props to the toggle button. For example, you can add class, style (merge and override default style), onClick (extend default handler), etc.
   */
  toggleButtonProps?: Solid.JSX.ButtonHTMLAttributes<HTMLButtonElement> & {
    ref?: Solid.Ref<HTMLButtonElement>
  }
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
  router?: AnyRouter
  routerState: any
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

class TanStackRouterDevtools {
  #router: Solid.Signal<AnyRouter | undefined>
  #routerState: Solid.Signal<any>
  #position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
  #initialIsOpen: boolean
  #shadowDOMTarget?: ShadowRoot
  #isMounted = false
  #dispose?: () => void

  constructor(config: DevtoolsOptions) {
    const {
      router,
      routerState,
      position,
      initialIsOpen,
      shadowDOMTarget,
    } = config

    this.#router = createSignal(router)
    this.#routerState = createSignal(routerState)
    this.#position = position ?? 'bottom-left'
    this.#initialIsOpen = initialIsOpen ?? false
    this.#shadowDOMTarget = shadowDOMTarget
  }

  mount<T extends HTMLElement>(el: T) {
    if (this.#isMounted) {
      throw new Error('Devtools is already mounted')
    }

    const [router] = this.#router
    const [routerState] = this.#routerState
    const position = this.#position
    const initialIsOpen = this.#initialIsOpen
    const shadowDOMTarget = this.#shadowDOMTarget



    const dispose = render(() => (
      <FloatingTanStackRouterDevtools

        position={position}
        initialIsOpen={initialIsOpen}
        shadowDOMTarget={shadowDOMTarget}

        {...{
          get router() {
            return router()
          },
          get routerState() {
            return routerState()
          },
          
        }}
      />
    ), el)

    this.#isMounted = true
    this.#dispose = dispose
  }

  unmount() {
    if (!this.#isMounted) {
      throw new Error('Devtools is not mounted')
    }
    this.#dispose?.()
    this.#isMounted = false
  }

  setRouter(router: AnyRouter | undefined) {
    this.#router[1](router)
  }

  setRouterState(routerState: any) {
    this.#routerState[1](routerState)
    console.log('Update router state', this.#routerState[0]())
  }

  setOptions(options: Partial<DevtoolsOptions>) {
    if (options.position !== undefined) {
      this.#position = options.position
    }

    if (options.initialIsOpen !== undefined) {
      this.#initialIsOpen = options.initialIsOpen
    }

    if (options.shadowDOMTarget !== undefined) {
      this.#shadowDOMTarget = options.shadowDOMTarget
    }
  }
}

function FloatingTanStackRouterDevtools({
  initialIsOpen,
  panelProps = {},
  closeButtonProps = {},
  toggleButtonProps = {},
  position = 'bottom-left',
  containerElement: Container = 'footer',
  router,
  routerState,
  shadowDOMTarget,
}: DevtoolsOptions): Solid.JSX.Element | null {
  const [rootEl, setRootEl] = createSignal<HTMLDivElement>()
  let panelRef: HTMLDivElement | undefined = undefined

  const [isOpen, setIsOpen] = useLocalStorage(
    'tanstackRouterDevtoolsOpen',
    initialIsOpen,
  )

  const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage<number | null>(
    'tanstackRouterDevtoolsHeight',
    null,
  )

  const [isResolvedOpen, setIsResolvedOpen] = createSignal(false)
  const [isResizing, setIsResizing] = createSignal(false)
  const isMounted = useIsMounted()
  const styles = useStyles()

  const handleDragStart = (
    panelElement: HTMLDivElement | undefined,
    startEvent: any,
  ) => {
    if (startEvent.button !== 0) return // Only allow left click for drag

    setIsResizing(true)

    const dragInfo = {
      originalHeight: panelElement?.getBoundingClientRect().height ?? 0,
      pageY: startEvent.pageY,
    }

    const run = (moveEvent: MouseEvent) => {
      const delta = dragInfo.pageY - moveEvent.pageY
      const newHeight = dragInfo.originalHeight + delta

      setDevtoolsHeight(newHeight)

      if (newHeight < 70) {
        setIsOpen(false)
      } else {
        setIsOpen(true)
      }
    }

    const unsub = () => {
      setIsResizing(false)
      document.removeEventListener('mousemove', run)
      document.removeEventListener('mouseUp', unsub)
    }

    document.addEventListener('mousemove', run)
    document.addEventListener('mouseup', unsub)
  }

  const isButtonClosed = isOpen() ?? false
  
  createEffect(() => {
    setIsResolvedOpen(isOpen() ?? false)
  })

  createEffect(() => {
    if (isResolvedOpen()) {
      const previousValue = rootEl()?.parentElement?.style.paddingBottom

      const run = () => {

        console.log('panelRef', panelRef)

        const containerHeight = panelRef?.getBoundingClientRect().height
        if (rootEl()?.parentElement) {
          setRootEl((prev) => {
            if (prev?.parentElement) {
              prev.parentElement.style.paddingBottom = `${containerHeight}px`
            }
            return prev
          })
        }
      }

      run()

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', run)

        return () => {
          window.removeEventListener('resize', run)
          if (rootEl()?.parentElement && typeof previousValue === 'string') {
            setRootEl((prev) => {
              prev!.parentElement!.style.paddingBottom = previousValue
              return prev
            })
          }
        }
      }
    }
    return
  })

  createEffect(() => {
    if (rootEl()) {
      const el = rootEl()
      const fontSize = getComputedStyle(el!).fontSize
      el?.style.setProperty('--tsrd-font-size', fontSize)
    }
  })

  const { style: panelStyle = {}, ...otherPanelProps } = panelProps as {
    style?: Record<string, any>
  }

  const {
    style: closeButtonStyle = {},
    onClick: onCloseClick,
    ...otherCloseButtonProps
  } = closeButtonProps

  const {
    onClick: onToggleClick,
    class: toggleButtonClassName,
    ...otherToggleButtonProps
  } = toggleButtonProps

  // Do not render on the server
  if (!isMounted) return null

  const resolvedHeight = devtoolsHeight() ?? 500

  const basePanelStyle = Solid.createMemo(() => {
    return cx(
      styles().devtoolsPanelContainer,
      styles().devtoolsPanelContainerVisibility(!!isOpen()),
      styles().devtoolsPanelContainerResizing(isResizing),
      styles().devtoolsPanelContainerAnimation(
        isResolvedOpen(),
        resolvedHeight + 16,
      ),
    )
  })

  const buttonStyle = Solid.createMemo(() => {
    return cx(
      styles().mainCloseBtn,
      styles().mainCloseBtnPosition(position),
      styles().mainCloseBtnAnimation(!isButtonClosed),
      toggleButtonClassName,
    )
  })

  return (
    <Dynamic
      component={Container}
      ref={setRootEl}
      class="TanStackRouterDevtools"
    >
      <DevtoolsOnCloseContext.Provider
        value={{
          // @ts-ignore
          onCloseClick: onCloseClick ?? (() => {}),
        }}
      >
        {router ? 
        <BaseTanStackRouterDevtoolsPanel
          ref={panelRef as any}
          {...otherPanelProps}
          router={router}
          routerState={routerState}
          className={basePanelStyle}
          style={{
            height: `${resolvedHeight}px`,
            ...(panelStyle || {}),
          }}
          isOpen={isResolvedOpen()}
          setIsOpen={setIsOpen}
          handleDragStart={(e) => handleDragStart(panelRef, e)}
          shadowDOMTarget={shadowDOMTarget}
        />
      : <p>No router</p>}
      </DevtoolsOnCloseContext.Provider>

      <button
        type="button"
        {...otherToggleButtonProps}
        aria-label="Open TanStack Router Devtools"
        onClick={(e) => {
          setIsOpen(true)
          onToggleClick && onToggleClick(e)
        }}
        class={buttonStyle()}
      >
        <div class={styles().mainCloseBtnIconContainer}>
          <div class={styles().mainCloseBtnIconOuter}>
            <TanStackLogo />
          </div>
          <div class={styles().mainCloseBtnIconInner}>
            <TanStackLogo />
          </div>
        </div>
        <div class={styles().mainCloseBtnDivider}>-</div>
        <div class={styles().routerLogoCloseButton}>TanStack Router</div>
      </button>
    </Dynamic>
  )
}

export { TanStackRouterDevtools }
