import React from 'react'
import {
  invariant,
  rootRouteId,
  trimPath,
  useRouter,
  useRouterState,
} from '@tanstack/react-router'

import * as goober from 'goober'
import { clsx as cx } from 'clsx'
import useLocalStorage from './useLocalStorage'
import {
  getRouteStatusColor,
  getStatusColor,
  multiSortBy,
  useIsMounted,
  useSafeState,
} from './utils'
import Explorer from './Explorer'
import { tokens } from './tokens'
import { TanStackLogo } from './logo'
import {
  DevtoolsOnCloseContext,
  ShadowDomTargetContext,
  useDevtoolsOnClose,
} from './context'
import type {
  AnyRootRoute,
  AnyRoute,
  AnyRouteMatch,
  AnyRouter,
  Route,
} from '@tanstack/react-router'

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

interface DevtoolsPanelOptions {
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

const isServer = typeof window === 'undefined'

function Logo(props: React.HTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props
  const styles = useStyles()
  return (
    <button {...rest} className={cx(styles.logo, className)}>
      <div className={styles.tanstackLogo}>TANSTACK</div>
      <div className={styles.routerLogo}>React Router v1</div>
    </button>
  )
}

export function TanStackRouterDevtools(
  props: DevtoolsOptions,
): React.ReactElement | null {
  const { shadowDOMTarget } = props

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
  if (!isMounted()) return null

  const resolvedHeight = devtoolsHeight ?? 500

  return (
    <Container ref={setRootEl} className="TanStackRouterDevtools">
      <DevtoolsOnCloseContext.Provider
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
      </DevtoolsOnCloseContext.Provider>

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

function RouteComp({
  router,
  route,
  isRoot,
  activeId,
  setActiveId,
}: {
  router: AnyRouter
  route: AnyRootRoute | AnyRoute
  isRoot?: boolean
  activeId: string | undefined
  setActiveId: (id: string) => void
}) {
  const routerState = useRouterState({
    router,
  } as any)
  const styles = useStyles()
  const matches = routerState.pendingMatches || routerState.matches
  const match = routerState.matches.find((d) => d.routeId === route.id)

  const param = React.useMemo(() => {
    try {
      if (match?.params) {
        const p = match.params
        const r: string = route.path || trimPath(route.id)
        if (r.startsWith('$')) {
          const trimmed = r.slice(1)
          if (p[trimmed]) {
            return `(${p[trimmed]})`
          }
        }
      }
      return ''
    } catch (error) {
      return ''
    }
  }, [match, route])

  return (
    <div>
      <div
        role="button"
        aria-label={`Open match details for ${route.id}`}
        onClick={() => {
          if (match) {
            setActiveId(activeId === route.id ? '' : route.id)
          }
        }}
        className={cx(
          styles.routesRowContainer(route.id === activeId, !!match),
        )}
      >
        <div
          className={cx(
            styles.matchIndicator(getRouteStatusColor(matches, route)),
          )}
        />
        <div className={cx(styles.routesRow(!!match))}>
          <div>
            <code className={styles.code}>
              {isRoot ? rootRouteId : route.path || trimPath(route.id)}{' '}
            </code>
            <code className={styles.routeParamInfo}>{param}</code>
          </div>
          <AgeTicker match={match} router={router} />
        </div>
      </div>
      {route.children?.length ? (
        <div className={styles.nestedRouteRow(!!isRoot)}>
          {[...(route.children as Array<Route>)]
            .sort((a, b) => {
              return a.rank - b.rank
            })
            .map((r) => (
              <RouteComp
                key={r.id}
                router={router}
                route={r}
                activeId={activeId}
                setActiveId={setActiveId}
              />
            ))}
        </div>
      ) : null}
    </div>
  )
}

const BaseTanStackRouterDevtoolsPanel = React.forwardRef<
  HTMLDivElement,
  DevtoolsPanelOptions
>(function BaseTanStackRouterDevtoolsPanel(props, ref): React.ReactElement {
  const {
    isOpen = true,
    setIsOpen,
    handleDragStart,
    router: userRouter,
    shadowDOMTarget,
    ...panelProps
  } = props

  const { onCloseClick } = useDevtoolsOnClose()
  const styles = useStyles()
  const { className, ...otherPanelProps } = panelProps

  const contextRouter = useRouter({ warn: false })
  const router = userRouter ?? contextRouter
  const routerState = useRouterState({
    router,
  } as any)

  invariant(
    router,
    'No router was found for the TanStack Router Devtools. Please place the devtools in the <RouterProvider> component tree or pass the router instance to the devtools manually.',
  )

  // useStore(router.__store)

  const [showMatches, setShowMatches] = useLocalStorage(
    'tanstackRouterDevtoolsShowMatches',
    true,
  )

  const [activeId, setActiveId] = useLocalStorage(
    'tanstackRouterDevtoolsActiveRouteId',
    '',
  )

  const activeMatch = React.useMemo(() => {
    const matches = [
      ...(routerState.pendingMatches ?? []),
      ...routerState.matches,
      ...routerState.cachedMatches,
    ]
    return matches.find((d) => d.routeId === activeId || d.id === activeId)
  }, [
    activeId,
    routerState.cachedMatches,
    routerState.matches,
    routerState.pendingMatches,
  ])

  const hasSearch = Object.keys(routerState.location.search).length

  const explorerState = {
    ...router,
    state: router.state,
  }

  return (
    <div
      ref={ref}
      className={cx(
        styles.devtoolsPanel,
        'TanStackRouterDevtoolsPanel',
        className,
      )}
      {...otherPanelProps}
    >
      {handleDragStart ? (
        <div className={styles.dragHandle} onMouseDown={handleDragStart}></div>
      ) : null}
      <button
        className={styles.panelCloseBtn}
        onClick={(e) => {
          setIsOpen(false)
          onCloseClick(e)
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="10"
          height="6"
          fill="none"
          viewBox="0 0 10 6"
          className={styles.panelCloseBtnIcon}
        >
          <path
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.667"
            d="M1 1l4 4 4-4"
          ></path>
        </svg>
      </button>
      <div className={styles.firstContainer}>
        <div className={styles.row}>
          <Logo
            aria-hidden
            onClick={(e) => {
              setIsOpen(false)
              onCloseClick(e)
            }}
          />
        </div>
        <div className={styles.routerExplorerContainer}>
          <div className={styles.routerExplorer}>
            <Explorer
              label="Router"
              value={Object.fromEntries(
                multiSortBy(
                  Object.keys(explorerState),
                  (
                    [
                      'state',
                      'routesById',
                      'routesByPath',
                      'flatRoutes',
                      'options',
                      'manifest',
                    ] as const
                  ).map((d) => (dd) => dd !== d),
                )
                  .map((key) => [key, (explorerState as any)[key]])
                  .filter(
                    (d) =>
                      typeof d[1] !== 'function' &&
                      ![
                        '__store',
                        'basepath',
                        'injectedHtml',
                        'subscribers',
                        'latestLoadPromise',
                        'navigateTimeout',
                        'resetNextScroll',
                        'tempLocationKey',
                        'latestLocation',
                        'routeTree',
                        'history',
                      ].includes(d[0]),
                  ),
              )}
              defaultExpanded={{
                state: {} as any,
                context: {} as any,
                options: {} as any,
              }}
              filterSubEntries={(subEntries) => {
                return subEntries.filter((d) => typeof d.value !== 'function')
              }}
            />
          </div>
        </div>
      </div>
      <div className={styles.secondContainer}>
        <div className={styles.matchesContainer}>
          <div className={styles.detailsHeader}>
            <span>Pathname</span>
            {routerState.location.maskedLocation ? (
              <div className={styles.maskedBadgeContainer}>
                <span className={styles.maskedBadge}>masked</span>
              </div>
            ) : null}
          </div>
          <div className={styles.detailsContent}>
            <code>{routerState.location.pathname}</code>
            {routerState.location.maskedLocation ? (
              <code className={styles.maskedLocation}>
                {routerState.location.maskedLocation.pathname}
              </code>
            ) : null}
          </div>
          <div className={styles.detailsHeader}>
            <div className={styles.routeMatchesToggle}>
              <button
                type="button"
                onClick={() => {
                  setShowMatches(false)
                }}
                disabled={!showMatches}
                className={cx(styles.routeMatchesToggleBtn(!showMatches, true))}
              >
                Routes
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowMatches(true)
                }}
                disabled={showMatches}
                className={cx(
                  styles.routeMatchesToggleBtn(!!showMatches, false),
                )}
              >
                Matches
              </button>
            </div>
            <div className={styles.detailsHeaderInfo}>
              <div>age / staleTime / gcTime</div>
            </div>
          </div>
          <div className={cx(styles.routesContainer)}>
            {!showMatches ? (
              <RouteComp
                router={router}
                route={router.routeTree}
                isRoot
                activeId={activeId}
                setActiveId={setActiveId}
              />
            ) : (
              <div>
                {(routerState.pendingMatches?.length
                  ? routerState.pendingMatches
                  : routerState.matches
                ).map((match, i) => {
                  return (
                    <div
                      key={match.id || i}
                      role="button"
                      aria-label={`Open match details for ${match.id}`}
                      onClick={() =>
                        setActiveId(activeId === match.id ? '' : match.id)
                      }
                      className={cx(styles.matchRow(match === activeMatch))}
                    >
                      <div
                        className={cx(
                          styles.matchIndicator(getStatusColor(match)),
                        )}
                      />

                      <code
                        className={styles.matchID}
                      >{`${match.routeId === rootRouteId ? rootRouteId : match.pathname}`}</code>
                      <AgeTicker match={match} router={router} />
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
        {routerState.cachedMatches.length ? (
          <div className={styles.cachedMatchesContainer}>
            <div className={styles.detailsHeader}>
              <div>Cached Matches</div>
              <div className={styles.detailsHeaderInfo}>
                age / staleTime / gcTime
              </div>
            </div>
            <div>
              {routerState.cachedMatches.map((match) => {
                return (
                  <div
                    key={match.id}
                    role="button"
                    aria-label={`Open match details for ${match.id}`}
                    onClick={() =>
                      setActiveId(activeId === match.id ? '' : match.id)
                    }
                    className={cx(styles.matchRow(match === activeMatch))}
                  >
                    <div
                      className={cx(
                        styles.matchIndicator(getStatusColor(match)),
                      )}
                    />

                    <code className={styles.matchID}>{`${match.id}`}</code>

                    <AgeTicker match={match} router={router} />
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}
      </div>
      {activeMatch ? (
        <div className={styles.thirdContainer}>
          <div className={styles.detailsHeader}>Match Details</div>
          <div>
            <div className={styles.matchDetails}>
              <div
                className={styles.matchStatus(
                  activeMatch.status,
                  activeMatch.isFetching,
                )}
              >
                <div>
                  {activeMatch.status === 'success' && activeMatch.isFetching
                    ? 'fetching'
                    : activeMatch.status}
                </div>
              </div>
              <div className={styles.matchDetailsInfoLabel}>
                <div>ID:</div>
                <div className={styles.matchDetailsInfo}>
                  <code>{activeMatch.id}</code>
                </div>
              </div>
              <div className={styles.matchDetailsInfoLabel}>
                <div>State:</div>
                <div className={styles.matchDetailsInfo}>
                  {routerState.pendingMatches?.find(
                    (d) => d.id === activeMatch.id,
                  )
                    ? 'Pending'
                    : routerState.matches.find((d) => d.id === activeMatch.id)
                      ? 'Active'
                      : 'Cached'}
                </div>
              </div>
              <div className={styles.matchDetailsInfoLabel}>
                <div>Last Updated:</div>
                <div className={styles.matchDetailsInfo}>
                  {activeMatch.updatedAt
                    ? new Date(activeMatch.updatedAt).toLocaleTimeString()
                    : 'N/A'}
                </div>
              </div>
            </div>
          </div>
          {activeMatch.loaderData ? (
            <>
              <div className={styles.detailsHeader}>Loader Data</div>
              <div className={styles.detailsContent}>
                <Explorer
                  label="loaderData"
                  value={activeMatch.loaderData}
                  defaultExpanded={{}}
                />
              </div>
            </>
          ) : null}
          <div className={styles.detailsHeader}>Explorer</div>
          <div className={styles.detailsContent}>
            <Explorer label="Match" value={activeMatch} defaultExpanded={{}} />
          </div>
        </div>
      ) : null}
      {hasSearch ? (
        <div className={styles.fourthContainer}>
          <div className={styles.detailsHeader}>Search Params</div>
          <div className={styles.detailsContent}>
            <Explorer
              value={routerState.location.search}
              defaultExpanded={Object.keys(routerState.location.search).reduce(
                (obj: any, next) => {
                  obj[next] = {}
                  return obj
                },
                {},
              )}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
})

function AgeTicker({
  match,
  router,
}: {
  match?: AnyRouteMatch
  router: AnyRouter
}) {
  const styles = useStyles()
  const rerender = React.useReducer(
    () => ({}),
    () => ({}),
  )[1]

  React.useEffect(() => {
    const interval = setInterval(() => {
      rerender()
    }, 1000)

    return () => {
      clearInterval(interval)
    }
  }, [rerender])

  if (!match) {
    return null
  }

  const route = router.looseRoutesById[match.routeId]!

  if (!route.options.loader) {
    return null
  }

  const age = Date.now() - match.updatedAt
  const staleTime =
    route.options.staleTime ?? router.options.defaultStaleTime ?? 0
  const gcTime =
    route.options.gcTime ?? router.options.defaultGcTime ?? 30 * 60 * 1000

  return (
    <div className={cx(styles.ageTicker(age > staleTime))}>
      <div>{formatTime(age)}</div>
      <div>/</div>
      <div>{formatTime(staleTime)}</div>
      <div>/</div>
      <div>{formatTime(gcTime)}</div>
    </div>
  )
}

function formatTime(ms: number) {
  const units = ['s', 'min', 'h', 'd']
  const values = [ms / 1000, ms / 60000, ms / 3600000, ms / 86400000]

  let chosenUnitIndex = 0
  for (let i = 1; i < values.length; i++) {
    if (values[i]! < 1) break
    chosenUnitIndex = i
  }

  const formatter = new Intl.NumberFormat(navigator.language, {
    compactDisplay: 'short',
    notation: 'compact',
    maximumFractionDigits: 0,
  })

  return formatter.format(values[chosenUnitIndex]!) + units[chosenUnitIndex]
}

const stylesFactory = (shadowDOMTarget?: ShadowRoot) => {
  const { colors, font, size, alpha, shadow, border } = tokens
  const { fontFamily, lineHeight, size: fontSize } = font
  const css = shadowDOMTarget
    ? goober.css.bind({ target: shadowDOMTarget })
    : goober.css

  return {
    devtoolsPanelContainer: css`
      direction: ltr;
      position: fixed;
      bottom: 0;
      right: 0;
      z-index: 99999;
      width: 100%;
      max-height: 90%;
      border-top: 1px solid ${colors.gray[700]};
      transform-origin: top;
    `,
    devtoolsPanelContainerVisibility: (isOpen: boolean) => {
      return css`
        visibility: ${isOpen ? 'visible' : 'hidden'};
      `
    },
    devtoolsPanelContainerResizing: (isResizing: boolean) => {
      if (isResizing) {
        return css`
          transition: none;
        `
      }

      return css`
        transition: all 0.4s ease;
      `
    },
    devtoolsPanelContainerAnimation: (isOpen: boolean, height: number) => {
      if (isOpen) {
        return css`
          pointer-events: auto;
          transform: translateY(0);
        `
      }
      return css`
        pointer-events: none;
        transform: translateY(${height}px);
      `
    },
    logo: css`
      cursor: pointer;
      display: flex;
      flex-direction: column;
      background-color: transparent;
      border: none;
      font-family: ${fontFamily.sans};
      gap: ${tokens.size[0.5]};
      padding: 0px;
      &:hover {
        opacity: 0.7;
      }
      &:focus-visible {
        outline-offset: 4px;
        border-radius: ${border.radius.xs};
        outline: 2px solid ${colors.blue[800]};
      }
    `,
    tanstackLogo: css`
      font-size: ${font.size.md};
      font-weight: ${font.weight.bold};
      line-height: ${font.lineHeight.xs};
      white-space: nowrap;
      color: ${colors.gray[300]};
    `,
    routerLogo: css`
      font-weight: ${font.weight.semibold};
      font-size: ${font.size.xs};
      background: linear-gradient(to right, #84cc16, #10b981);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,
    devtoolsPanel: css`
      display: flex;
      font-size: ${fontSize.sm};
      font-family: ${fontFamily.sans};
      background-color: ${colors.darkGray[700]};
      color: ${colors.gray[300]};

      @media (max-width: 700px) {
        flex-direction: column;
      }
      @media (max-width: 600px) {
        font-size: ${fontSize.xs};
      }
    `,
    dragHandle: css`
      position: absolute;
      left: 0;
      top: 0;
      width: 100%;
      height: 4px;
      cursor: row-resize;
      z-index: 100000;
      &:hover {
        background-color: ${colors.purple[400]}${alpha[90]};
      }
    `,
    firstContainer: css`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${colors.gray[700]};
      display: flex;
      flex-direction: column;
    `,
    routerExplorerContainer: css`
      overflow-y: auto;
      flex: 1;
    `,
    routerExplorer: css`
      padding: ${tokens.size[2]};
    `,
    row: css`
      display: flex;
      align-items: center;
      padding: ${tokens.size[2]} ${tokens.size[2.5]};
      gap: ${tokens.size[2.5]};
      border-bottom: ${colors.darkGray[500]} 1px solid;
      align-items: center;
    `,
    detailsHeader: css`
      font-family: ui-sans-serif, Inter, system-ui, sans-serif, sans-serif;
      position: sticky;
      top: 0;
      z-index: 2;
      background-color: ${colors.darkGray[600]};
      padding: 0px ${tokens.size[2]};
      font-weight: ${font.weight.medium};
      font-size: ${font.size.xs};
      min-height: ${tokens.size[8]};
      line-height: ${font.lineHeight.xs};
      text-align: left;
      display: flex;
      align-items: center;
    `,
    maskedBadge: css`
      background: ${colors.yellow[900]}${alpha[70]};
      color: ${colors.yellow[300]};
      display: inline-block;
      padding: ${tokens.size[0]} ${tokens.size[2.5]};
      border-radius: ${border.radius.full};
      font-size: ${font.size.xs};
      font-weight: ${font.weight.normal};
      border: 1px solid ${colors.yellow[300]};
    `,
    maskedLocation: css`
      color: ${colors.yellow[300]};
    `,
    detailsContent: css`
      padding: ${tokens.size[1.5]} ${tokens.size[2]};
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: ${font.size.xs};
    `,
    routeMatchesToggle: css`
      display: flex;
      align-items: center;
      border: 1px solid ${colors.gray[500]};
      border-radius: ${border.radius.sm};
      overflow: hidden;
    `,
    routeMatchesToggleBtn: (active: boolean, showBorder: boolean) => {
      const base = css`
        appearance: none;
        border: none;
        font-size: 12px;
        padding: 4px 8px;
        background: transparent;
        cursor: pointer;
        font-family: ${fontFamily.sans};
        font-weight: ${font.weight.medium};
      `
      const classes = [base]

      if (active) {
        const activeStyles = css`
          background: ${colors.darkGray[400]};
          color: ${colors.gray[300]};
        `
        classes.push(activeStyles)
      } else {
        const inactiveStyles = css`
          color: ${colors.gray[500]};
          background: ${colors.darkGray[800]}${alpha[20]};
        `
        classes.push(inactiveStyles)
      }

      if (showBorder) {
        classes.push(css`
          border-right: 1px solid ${tokens.colors.gray[500]};
        `)
      }

      return classes
    },
    detailsHeaderInfo: css`
      flex: 1;
      justify-content: flex-end;
      display: flex;
      align-items: center;
      font-weight: ${font.weight.normal};
      color: ${colors.gray[400]};
    `,
    matchRow: (active: boolean) => {
      const base = css`
        display: flex;
        border-bottom: 1px solid ${colors.darkGray[400]};
        cursor: pointer;
        align-items: center;
        padding: ${size[1]} ${size[2]};
        gap: ${size[2]};
        font-size: ${fontSize.xs};
        color: ${colors.gray[300]};
      `
      const classes = [base]

      if (active) {
        const activeStyles = css`
          background: ${colors.darkGray[500]};
        `
        classes.push(activeStyles)
      }

      return classes
    },
    matchIndicator: (
      color: 'green' | 'red' | 'yellow' | 'gray' | 'blue' | 'purple',
    ) => {
      const base = css`
        flex: 0 0 auto;
        width: ${size[3]};
        height: ${size[3]};
        background: ${colors[color][900]};
        border: 1px solid ${colors[color][500]};
        border-radius: ${border.radius.full};
        transition: all 0.25s ease-out;
        box-sizing: border-box;
      `
      const classes = [base]

      if (color === 'gray') {
        const grayStyles = css`
          background: ${colors.gray[700]};
          border-color: ${colors.gray[400]};
        `
        classes.push(grayStyles)
      }

      return classes
    },
    matchID: css`
      flex: 1;
      line-height: ${lineHeight['xs']};
    `,
    ageTicker: (showWarning: boolean) => {
      const base = css`
        display: flex;
        gap: ${size[1]};
        font-size: ${fontSize.xs};
        color: ${colors.gray[400]};
        font-variant-numeric: tabular-nums;
        line-height: ${lineHeight['xs']};
      `

      const classes = [base]

      if (showWarning) {
        const warningStyles = css`
          color: ${colors.yellow[400]};
        `
        classes.push(warningStyles)
      }

      return classes
    },
    secondContainer: css`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      border-right: 1px solid ${colors.gray[700]};
      display: flex;
      flex-direction: column;
    `,
    thirdContainer: css`
      flex: 1 1 500px;
      overflow: auto;
      display: flex;
      flex-direction: column;
      height: 100%;
      border-right: 1px solid ${colors.gray[700]};

      @media (max-width: 700px) {
        border-top: 2px solid ${colors.gray[700]};
      }
    `,
    fourthContainer: css`
      flex: 1 1 500px;
      min-height: 40%;
      max-height: 100%;
      overflow: auto;
      display: flex;
      flex-direction: column;
    `,
    routesContainer: css`
      overflow-x: auto;
      overflow-y: visible;
    `,
    routesRowContainer: (active: boolean, isMatch: boolean) => {
      const base = css`
        display: flex;
        border-bottom: 1px solid ${colors.darkGray[400]};
        align-items: center;
        padding: ${size[1]} ${size[2]};
        gap: ${size[2]};
        font-size: ${fontSize.xs};
        color: ${colors.gray[300]};
        cursor: ${isMatch ? 'pointer' : 'default'};
        line-height: ${lineHeight['xs']};
      `
      const classes = [base]

      if (active) {
        const activeStyles = css`
          background: ${colors.darkGray[500]};
        `
        classes.push(activeStyles)
      }

      return classes
    },
    routesRow: (isMatch: boolean) => {
      const base = css`
        flex: 1 0 auto;
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: ${fontSize.xs};
        line-height: ${lineHeight['xs']};
      `

      const classes = [base]

      if (!isMatch) {
        const matchStyles = css`
          color: ${colors.gray[400]};
        `
        classes.push(matchStyles)
      }

      return classes
    },
    routeParamInfo: css`
      color: ${colors.gray[400]};
      font-size: ${fontSize.xs};
      line-height: ${lineHeight['xs']};
    `,
    nestedRouteRow: (isRoot: boolean) => {
      const base = css`
        margin-left: ${isRoot ? 0 : size[3.5]};
        border-left: ${isRoot ? '' : `solid 1px ${colors.gray[700]}`};
      `
      return base
    },
    code: css`
      font-size: ${fontSize.xs};
      line-height: ${lineHeight['xs']};
    `,
    matchesContainer: css`
      flex: 1 1 auto;
      overflow-y: auto;
    `,
    cachedMatchesContainer: css`
      flex: 1 1 auto;
      overflow-y: auto;
      max-height: 50%;
    `,
    maskedBadgeContainer: css`
      flex: 1;
      justify-content: flex-end;
      display: flex;
    `,
    matchDetails: css`
      display: flex;
      flex-direction: column;
      padding: ${tokens.size[2]};
      font-size: ${tokens.font.size.xs};
      color: ${tokens.colors.gray[300]};
      line-height: ${tokens.font.lineHeight.sm};
    `,
    matchStatus: (
      status: 'pending' | 'success' | 'error' | 'notFound' | 'redirected',
      isFetching: false | 'beforeLoad' | 'loader',
    ) => {
      const colorMap = {
        pending: 'yellow',
        success: 'green',
        error: 'red',
        notFound: 'purple',
        redirected: 'gray',
      } as const

      const color =
        isFetching && status === 'success'
          ? isFetching === 'beforeLoad'
            ? 'purple'
            : 'blue'
          : colorMap[status]

      return css`
        display: flex;
        justify-content: center;
        align-items: center;
        height: 40px;
        border-radius: ${tokens.border.radius.sm};
        font-weight: ${tokens.font.weight.normal};
        background-color: ${tokens.colors[color][900]}${tokens.alpha[90]};
        color: ${tokens.colors[color][300]};
        border: 1px solid ${tokens.colors[color][600]};
        margin-bottom: ${tokens.size[2]};
        transition: all 0.25s ease-out;
      `
    },
    matchDetailsInfo: css`
      display: flex;
      justify-content: flex-end;
      flex: 1;
    `,
    matchDetailsInfoLabel: css`
      display: flex;
    `,
    mainCloseBtn: css`
      background: ${colors.darkGray[700]};
      padding: ${size[1]} ${size[2]} ${size[1]} ${size[1.5]};
      border-radius: ${border.radius.md};
      position: fixed;
      z-index: 99999;
      display: inline-flex;
      width: fit-content;
      cursor: pointer;
      appearance: none;
      border: 0;
      gap: 8px;
      align-items: center;
      border: 1px solid ${colors.gray[500]};
      font-size: ${font.size.xs};
      cursor: pointer;
      transition: all 0.25s ease-out;

      &:hover {
        background: ${colors.darkGray[500]};
      }
    `,
    mainCloseBtnPosition: (
      position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right',
    ) => {
      const base = css`
        ${position === 'top-left' ? `top: ${size[2]}; left: ${size[2]};` : ''}
        ${position === 'top-right' ? `top: ${size[2]}; right: ${size[2]};` : ''}
        ${position === 'bottom-left'
          ? `bottom: ${size[2]}; left: ${size[2]};`
          : ''}
        ${position === 'bottom-right'
          ? `bottom: ${size[2]}; right: ${size[2]};`
          : ''}
      `
      return base
    },
    mainCloseBtnAnimation: (isOpen: boolean) => {
      if (isOpen) {
        return css`
          opacity: 1;
          pointer-events: auto;
          visibility: visible;
        `
      }
      return css`
        opacity: 0;
        pointer-events: none;
        visibility: hidden;
      `
    },
    routerLogoCloseButton: css`
      font-weight: ${font.weight.semibold};
      font-size: ${font.size.xs};
      background: linear-gradient(to right, #98f30c, #00f4a3);
      background-clip: text;
      -webkit-background-clip: text;
      line-height: 1;
      -webkit-text-fill-color: transparent;
      white-space: nowrap;
    `,
    mainCloseBtnDivider: css`
      width: 1px;
      background: ${tokens.colors.gray[600]};
      height: 100%;
      border-radius: 999999px;
      color: transparent;
    `,
    mainCloseBtnIconContainer: css`
      position: relative;
      width: ${size[5]};
      height: ${size[5]};
      background: pink;
      border-radius: 999999px;
      overflow: hidden;
    `,
    mainCloseBtnIconOuter: css`
      width: ${size[5]};
      height: ${size[5]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      filter: blur(3px) saturate(1.8) contrast(2);
    `,
    mainCloseBtnIconInner: css`
      width: ${size[4]};
      height: ${size[4]};
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
    `,
    panelCloseBtn: css`
      position: absolute;
      cursor: pointer;
      z-index: 100001;
      display: flex;
      align-items: center;
      justify-content: center;
      outline: none;
      background-color: ${colors.darkGray[700]};
      &:hover {
        background-color: ${colors.darkGray[500]};
      }

      top: 0;
      right: ${size[2]};
      transform: translate(0, -100%);
      border-right: ${colors.darkGray[300]} 1px solid;
      border-left: ${colors.darkGray[300]} 1px solid;
      border-top: ${colors.darkGray[300]} 1px solid;
      border-bottom: none;
      border-radius: ${border.radius.sm} ${border.radius.sm} 0px 0px;
      padding: ${size[1]} ${size[1.5]} ${size[0.5]} ${size[1.5]};

      &::after {
        content: ' ';
        position: absolute;
        top: 100%;
        left: -${size[2.5]};
        height: ${size[1.5]};
        width: calc(100% + ${size[5]});
      }
    `,
    panelCloseBtnIcon: css`
      color: ${colors.gray[400]};
      width: ${size[2]};
      height: ${size[2]};
    `,
  }
}

let _styles: ReturnType<typeof stylesFactory> | null = null

function useStyles() {
  const shadowDomTarget = React.useContext(ShadowDomTargetContext)
  if (_styles) return _styles
  _styles = stylesFactory(shadowDomTarget)

  return _styles
}
