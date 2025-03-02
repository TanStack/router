import { clsx as cx } from 'clsx'
import React from 'react'
import { DevtoolsOnCloseContext, ShadowDomTargetContext } from './context'
import { useIsMounted, useSafeState } from './utils'
import { BaseTanStackRouterDevtoolsPanel } from './BaseTanStackRouterDevtoolsPanel'
import useLocalStorage from './useLocalStorage'
import { TanStackLogo } from './logo'
import { useStyles } from './useStyles'
import type { AnyRouter } from '@tanstack/react-router'

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
  router?: AnyRouter
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

export function TanStackRouterDevtools(
  props: DevtoolsOptions,
): React.ReactElement | null {
  const { shadowDOMTarget } = props

  return (
    <ShadowDomTargetContext value={shadowDOMTarget}>
      <FloatingTanStackRouterDevtools {...props} />
    </ShadowDomTargetContext>
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
}: DevtoolsOptions): React.ReactElement | null {
  const [rootEl, setRootEl] = React.useState<HTMLDivElement>()
  const panelRef = React.useRef<HTMLDivElement>(null)
  const [isOpen, setIsOpen] = useLocalStorage(
    'tanstackRouterDevtoolsOpen',
    initialIsOpen,
  )
  const [devtoolsHeight, setDevtoolsHeight] = useLocalStorage<number | null>(
    'tanstackRouterDevtoolsHeight',
    null,
  )
  const [isResolvedOpen, setIsResolvedOpen] = useSafeState(false)
  const [isResizing, setIsResizing] = useSafeState(false)
  const isMounted = useIsMounted()
  const styles = useStyles()

  const handleDragStart = (
    panelElement: HTMLDivElement | null,
    startEvent: React.MouseEvent<HTMLDivElement, MouseEvent>,
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

  const isButtonClosed = isOpen ?? false

  React.useEffect(() => {
    setIsResolvedOpen(isOpen ?? false)
  }, [isOpen, isResolvedOpen, setIsResolvedOpen])

  React.useEffect(() => {
    if (isResolvedOpen) {
      const previousValue = rootEl?.parentElement?.style.paddingBottom

      const run = () => {
        const containerHeight = panelRef.current?.getBoundingClientRect().height
        if (rootEl?.parentElement) {
          rootEl.parentElement.style.paddingBottom = `${containerHeight}px`
        }
      }

      run()

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', run)

        return () => {
          window.removeEventListener('resize', run)
          if (rootEl?.parentElement && typeof previousValue === 'string') {
            rootEl.parentElement.style.paddingBottom = previousValue
          }
        }
      }
    }
    return
  }, [isResolvedOpen, rootEl?.parentElement])

  React.useEffect(() => {
    if (rootEl) {
      const el = rootEl
      const fontSize = getComputedStyle(el).fontSize
      el.style.setProperty('--tsrd-font-size', fontSize)
    }
  }, [rootEl])

  const { style: panelStyle = {}, ...otherPanelProps } = panelProps

  const {
    style: closeButtonStyle = {},
    onClick: onCloseClick,
    ...otherCloseButtonProps
  } = closeButtonProps

  const {
    onClick: onToggleClick,
    className: toggleButtonClassName,
    ...otherToggleButtonProps
  } = toggleButtonProps

  // Do not render on the server
  if (!isMounted) return null

  const resolvedHeight = devtoolsHeight ?? 500

  return (
    <Container ref={setRootEl} className="TanStackRouterDevtools">
      <DevtoolsOnCloseContext
        value={{
          onCloseClick: onCloseClick ?? (() => {}),
        }}
      >
        <BaseTanStackRouterDevtoolsPanel
          ref={panelRef as any}
          {...otherPanelProps}
          router={router}
          className={cx(
            styles.devtoolsPanelContainer,
            styles.devtoolsPanelContainerVisibility(!!isOpen),
            styles.devtoolsPanelContainerResizing(isResizing),
            styles.devtoolsPanelContainerAnimation(
              isResolvedOpen,
              resolvedHeight + 16,
            ),
          )}
          style={{
            height: resolvedHeight,
            ...panelStyle,
          }}
          isOpen={isResolvedOpen}
          setIsOpen={setIsOpen}
          handleDragStart={(e) => handleDragStart(panelRef.current, e)}
          shadowDOMTarget={shadowDOMTarget}
        />
      </DevtoolsOnCloseContext>

      <button
        type="button"
        {...otherToggleButtonProps}
        aria-label="Open TanStack Router Devtools"
        onClick={(e) => {
          setIsOpen(true)
          onToggleClick && onToggleClick(e)
        }}
        className={cx(
          styles.mainCloseBtn,
          styles.mainCloseBtnPosition(position),
          styles.mainCloseBtnAnimation(!isButtonClosed),
          toggleButtonClassName,
        )}
      >
        <div className={styles.mainCloseBtnIconContainer}>
          <div className={styles.mainCloseBtnIconOuter}>
            <TanStackLogo />
          </div>
          <div className={styles.mainCloseBtnIconInner}>
            <TanStackLogo />
          </div>
        </div>
        <div className={styles.mainCloseBtnDivider}>-</div>
        <div className={styles.routerLogoCloseButton}>TanStack Router</div>
      </button>
    </Container>
  )
}
