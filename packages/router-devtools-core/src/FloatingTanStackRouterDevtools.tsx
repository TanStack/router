import { createEffect, createMemo, createSignal } from 'solid-js'
import { dynamic } from '@solidjs/web'

import { DevtoolsOnCloseContext } from './context'
import { BaseTanStackRouterDevtoolsPanel } from './BaseTanStackRouterDevtoolsPanel'
import useLocalStorage from './useLocalStorage'
import { TanStackLogo } from './logo'
import { attachStyles } from './styles'
import type { Accessor } from 'solid-js'
import type { JSX } from '@solidjs/web'
import type { AnyRouter } from '@tanstack/router-core'

export interface FloatingDevtoolsOptions {
  /**
   * Set this true if you want the dev tools to default to being open
   */
  initialIsOpen?: boolean
  /**
   * Use this to add props to the panel. For example, you can add class, style (merge and override default style), etc.
   */
  panelProps?: any & {
    ref?: any
  }
  /**
   * Use this to add props to the close button. For example, you can add class, style (merge and override default style), onClick (extend default handler), etc.
   */
  closeButtonProps?: any & {
    ref?: any
  }
  /**
   * Use this to add props to the toggle button. For example, you can add class, style (merge and override default style), onClick (extend default handler), etc.
   */
  toggleButtonProps?: any & {
    ref?: any
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
  router: Accessor<AnyRouter>
  routerState: Accessor<any>
  /**
   * The element the devtools are mounted in. Its document or shadow root gets
   * the devtools styles.
   */
  mountElement?: Element
  /**
   * Adds the devtools styles to this shadow root instead.
   */
  shadowDOMTarget?: ShadowRoot
}

export function FloatingTanStackRouterDevtools({
  initialIsOpen,
  panelProps = {},
  closeButtonProps = {},
  toggleButtonProps = {},
  position = 'bottom-left',
  containerElement: Container = 'footer',
  router,
  routerState,
  mountElement,
  shadowDOMTarget,
}: FloatingDevtoolsOptions): JSX.Element | null {
  if (mountElement) {
    attachStyles(mountElement, shadowDOMTarget)
  }
  const ContainerElement = dynamic(() => Container)
  const [rootEl, setRootEl] = createSignal<HTMLDivElement>()

  // eslint-disable-next-line prefer-const
  let panelRef: HTMLDivElement | undefined = undefined

  const [isOpen, setIsOpen] = useLocalStorage(
    'tanstackRouterDevtoolsOpen',
    initialIsOpen,
  )

  const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage<number | null>(
    'tanstackRouterDevtoolsHeight',
    null,
  )

  const isResolvedOpen = () => isOpen() ?? false
  const [isResizing, setIsResizing] = createSignal(false)

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

  // Pad the page so the open panel does not cover its bottom.
  createEffect(
    () => ({ open: isResolvedOpen(), parent: rootEl()?.parentElement }),
    ({ open, parent }) => {
      if (!parent) return
      if (!open) {
        // Reset padding when devtools are closed
        parent.removeAttribute('style')
        return
      }
      const previousValue = parent.style.paddingBottom
      const run = () => {
        const containerHeight = panelRef!.getBoundingClientRect().height
        parent.style.paddingBottom = `${containerHeight}px`
      }
      run()
      window.addEventListener('resize', run)
      return () => {
        window.removeEventListener('resize', run)
        parent.style.paddingBottom = previousValue
      }
    },
  )

  createEffect(rootEl, (el) => {
    if (el) {
      el.style.setProperty('--tsrd-font-size', getComputedStyle(el).fontSize)
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

  const resolvedHeight = createMemo(() => devtoolsHeight() ?? 500)

  const basePanelClass = createMemo(() => {
    return [
      'tsrd-devtools-panel-container',
      isOpen() ? '' : 'tsrd-devtools-panel-container-hidden',
      isResizing() ? 'tsrd-devtools-panel-container-resizing' : '',
      // The closed offset comes from `--tsrd-panel-offset`.
      isResolvedOpen() ? '' : 'tsrd-devtools-panel-container-closed',
    ].join(' ')
  })

  const basePanelStyle = createMemo(() => {
    return {
      height: `${resolvedHeight()}px`,
      '--tsrd-panel-offset': `${resolvedHeight() + 16}px`,
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      ...(panelStyle || {}),
    }
  })

  const buttonStyle = createMemo(() => {
    return [
      'tsrd-main-close-btn',
      `tsrd-main-close-btn-${position}`,
      isOpen() ? 'tsrd-main-close-btn-hidden' : '',
      toggleButtonClassName ?? '',
    ].join(' ')
  })

  return (
    <ContainerElement ref={setRootEl} class="TanStackRouterDevtools">
      <DevtoolsOnCloseContext
        value={{
          onCloseClick: onCloseClick ?? (() => {}),
        }}
      >
        {/* {router() ? ( */}
        <BaseTanStackRouterDevtoolsPanel
          ref={panelRef}
          {...otherPanelProps}
          router={router}
          routerState={routerState}
          className={basePanelClass}
          style={basePanelStyle}
          setIsOpen={setIsOpen}
          handleDragStart={(e) => handleDragStart(panelRef, e)}
        />
        {/* ) : (
          <p>No router</p>
        )} */}
      </DevtoolsOnCloseContext>

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
        <div class="tsrd-main-close-btn-icon-container">
          <div class="tsrd-main-close-btn-icon-outer">
            <TanStackLogo />
          </div>
          <div class="tsrd-main-close-btn-icon-inner">
            <TanStackLogo />
          </div>
        </div>
        <div class="tsrd-main-close-btn-divider">-</div>
        <div class="tsrd-router-logo-close-button">TanStack Router</div>
      </button>
    </ContainerElement>
  )
}

export default FloatingTanStackRouterDevtools
