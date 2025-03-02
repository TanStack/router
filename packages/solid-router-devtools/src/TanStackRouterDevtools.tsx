import { clsx as cx } from 'clsx'
import * as Solid from 'solid-js'
import { DevtoolsOnCloseContext, ShadowDomTargetContext } from './context'
import { useIsMounted, useSafeState } from './utils'
import { BaseTanStackRouterDevtoolsPanel } from './BaseTanStackRouterDevtoolsPanel'
import useLocalStorage from './useLocalStorage'
import { TanStackLogo } from './logo'
import { useStyles } from './useStyles'
import type { AnyRouter } from '@tanstack/solid-router'
import { Dynamic } from 'solid-js/web'
import { makePersisted } from '@solid-primitives/storage'
import { createStore } from 'solid-js/store'

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
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

export function TanStackRouterDevtools(
  props: DevtoolsOptions,
): Solid.JSX.Element | null {
  const { shadowDOMTarget } = props

  console.log('props', props)

  return (
    <ShadowDomTargetContext.Provider value={shadowDOMTarget}>
      <FloatingTanStackRouterDevtools {...props} />
    </ShadowDomTargetContext.Provider>
  )
}

function FloatingTanStackRouterDevtools({
  initialIsOpen,
  panelProps = {},
  closeButtonProps = {},
  toggleButtonProps = {},
  position = 'bottom-left',
  containerElement: Container = 'footer',
  router,
  shadowDOMTarget,
}: DevtoolsOptions): Solid.JSX.Element | null {
  console.log('toggleButtonProps', toggleButtonProps)

  const [rootEl, setRootEl] = Solid.createSignal<HTMLDivElement>()
  let panelRef: HTMLDivElement | undefined = undefined

  console.log(initialIsOpen, 'initialIsOpen')
  const [isOpen, setIsOpen, init] = makePersisted(
    createStore({ isOpen: initialIsOpen }),
    { name: 'tanstackRouterDevtoolsOpen' },
  )

  Solid.createEffect(() => {
    console.log('IsOpenEffect', isOpen.isOpen)
  })

  const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage<number | null>(
    'tanstackRouterDevtoolsHeight',
    null,
  )

  const [isResizing, setIsResizing] = Solid.createSignal(false)
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
        setIsOpen({ isOpen: false })
      } else {
        setIsOpen({ isOpen: true })
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

  Solid.createEffect(() => {
    if (isOpen.isOpen) {
      const previousValue = rootEl()?.parentElement?.style.paddingBottom

      const run = () => {
        const containerHeight = panelRef!.getBoundingClientRect().height
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

            // rootEl()?.parentElement?.style.paddingBottom = previousValue
          }
        }
      }
    }
    return
  })

  Solid.createEffect(() => {
    if (rootEl) {
      const el = rootEl
      const fontSize = getComputedStyle(el()!).fontSize
      el()?.style.setProperty('--tsrd-font-size', fontSize)
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
    console.log('basePanelStyle', isOpen.isOpen)
    return cx(
      styles().devtoolsPanelContainer,
      styles().devtoolsPanelContainerVisibility(!!isOpen.isOpen),
      styles().devtoolsPanelContainerResizing(isResizing),
      styles().devtoolsPanelContainerAnimation(
        !!isOpen.isOpen,
        resolvedHeight + 16,
      ),
    )
  })

  const buttonStyle = Solid.createMemo(() => {
    return cx(
      styles().mainCloseBtn,
      styles().mainCloseBtnPosition(position),
      // @ts-ignore
      styles().mainCloseBtnAnimation(!!isOpen.isOpen),
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
        {JSON.stringify(basePanelStyle())}
        <BaseTanStackRouterDevtoolsPanel
          ref={panelRef as any}
          {...otherPanelProps}
          router={router}
          className={basePanelStyle}
          style={{
            height: `${resolvedHeight}px`,
            ...(panelStyle || {}),
          }}
          isOpen={isOpen.isOpen}
          setIsOpen={setIsOpen}
          handleDragStart={(e) => handleDragStart(panelRef, e)}
          shadowDOMTarget={shadowDOMTarget}
        />
      </DevtoolsOnCloseContext.Provider>

      <button
        type="button"
        {...otherToggleButtonProps}
        aria-label="Open TanStack Router Devtools"
        onClick={(e) => {
          setIsOpen({ isOpen: !isOpen.isOpen })
          console.log('isOpen4', isOpen.isOpen)

          // @ts-ignore
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
