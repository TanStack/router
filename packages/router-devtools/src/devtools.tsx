import React from 'react'
import {
  invariant,
  AnyRouter,
  Route,
  AnyRoute,
  AnyRootRoute,
  trimPath,
  useRouter,
  useRouterState,
  AnyRouteMatch,
} from '@tanstack/react-router'

import useLocalStorage from './useLocalStorage'
import {
  getRouteStatusColor,
  getStatusColor,
  multiSortBy,
  useIsMounted,
  useSafeState,
} from './utils'
import { css } from 'goober'
import { clsx as cx } from 'clsx'
import { defaultTheme as theme } from './theme'
// import { getQueryStatusLabel, getQueryStatusColor } from './utils'
import Explorer from './Explorer'
import { tokens } from './tokens'

export type PartialKeys<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

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
}

const isServer = typeof window === 'undefined'

function Logo(props: React.HTMLAttributes<HTMLButtonElement>) {
  const { className, ...rest } = props
  return (
    <button {...rest} className={cx(styles.logo, className)}>
      <div className={styles.tanstackLogo}>TANSTACK</div>
      <div className={styles.routerLogo}>React Router v1</div>
    </button>
  )
}

export function TanStackRouterDevtools({
  initialIsOpen,
  panelProps = {},
  closeButtonProps = {},
  toggleButtonProps = {},
  position = 'bottom-left',
  containerElement: Container = 'footer',
  router,
}: DevtoolsOptions): React.ReactElement | null {
  const rootRef = React.useRef<HTMLDivElement>(null)
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
      const newHeight = dragInfo?.originalHeight + delta

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

  React.useEffect(() => {
    setIsResolvedOpen(isOpen ?? false)
  }, [isOpen, isResolvedOpen, setIsResolvedOpen])

  // Toggle panel visibility before/after transition (depending on direction).
  // Prevents focusing in a closed panel.
  React.useEffect(() => {
    const ref = panelRef.current

    if (ref) {
      const handlePanelTransitionStart = () => {
        if (ref && isResolvedOpen) {
          ref.style.visibility = 'visible'
        }
      }

      const handlePanelTransitionEnd = () => {
        if (ref && !isResolvedOpen) {
          ref.style.visibility = 'hidden'
        }
      }

      ref.addEventListener('transitionstart', handlePanelTransitionStart)
      ref.addEventListener('transitionend', handlePanelTransitionEnd)

      return () => {
        ref.removeEventListener('transitionstart', handlePanelTransitionStart)
        ref.removeEventListener('transitionend', handlePanelTransitionEnd)
      }
    }

    return
  }, [isResolvedOpen])

  React[isServer ? 'useEffect' : 'useLayoutEffect'](() => {
    if (isResolvedOpen) {
      const previousValue = rootRef.current?.parentElement?.style.paddingBottom

      const run = () => {
        const containerHeight = panelRef.current?.getBoundingClientRect().height
        if (rootRef.current?.parentElement) {
          rootRef.current.parentElement.style.paddingBottom = `${containerHeight}px`
        }
      }

      run()

      if (typeof window !== 'undefined') {
        window.addEventListener('resize', run)

        return () => {
          window.removeEventListener('resize', run)
          if (
            rootRef.current?.parentElement &&
            typeof previousValue === 'string'
          ) {
            rootRef.current.parentElement.style.paddingBottom = previousValue
          }
        }
      }
    }
    return
  }, [isResolvedOpen])

  const { style: panelStyle = {}, ...otherPanelProps } = panelProps

  const {
    style: closeButtonStyle = {},
    onClick: onCloseClick,
    ...otherCloseButtonProps
  } = closeButtonProps

  const {
    style: toggleButtonStyle = {},
    onClick: onToggleClick,
    ...otherToggleButtonProps
  } = toggleButtonProps

  // Do not render on the server
  if (!isMounted()) return null

  return (
    <Container
      ref={rootRef}
      className="TanStackRouterDevtools"
      style={{
        '--tsrd-font-size': '16px',
      }}
    >
      <TanStackRouterDevtoolsPanel
        ref={panelRef as any}
        {...otherPanelProps}
        router={router}
        style={{
          direction: 'ltr',
          position: 'fixed',
          bottom: '0',
          right: '0',
          zIndex: 99999,
          width: '100%',
          height: devtoolsHeight ?? 500,
          maxHeight: '90%',
          boxShadow: '0 0 20px rgba(0,0,0,.3)',
          borderTop: `1px solid ${theme.gray}`,
          transformOrigin: 'top',
          // visibility will be toggled after transitions, but set initial state here
          visibility: isOpen ? 'visible' : 'hidden',
          ...panelStyle,
          ...(isResizing
            ? {
                transition: `none`,
              }
            : { transition: `all .2s ease` }),
          ...(isResolvedOpen
            ? {
                opacity: 1,
                pointerEvents: 'all',
                transform: `translateY(0) scale(1)`,
              }
            : {
                opacity: 0,
                pointerEvents: 'none',
                transform: `translateY(15px) scale(1.02)`,
              }),
        }}
        isOpen={isResolvedOpen}
        setIsOpen={setIsOpen}
        handleDragStart={(e) => handleDragStart(panelRef.current, e)}
      />
      {/* {isResolvedOpen ? (
          <Button
            type="button"
            aria-label="Close TanStack Router Devtools"
            {...(otherCloseButtonProps as any)}
            onClick={(e) => {
              setIsOpen(false)
              onCloseClick && onCloseClick(e)
            }}
            style={{
              position: 'fixed',
              zIndex: 99999,
              margin: '.5em',
              bottom: 0,
              ...(position === 'top-right'
                ? {
                    right: '0',
                  }
                : position === 'top-left'
                  ? {
                      left: '0',
                    }
                  : position === 'bottom-right'
                    ? {
                        right: '0',
                      }
                    : {
                        left: '0',
                      }),
              ...closeButtonStyle,
            }}
          >
            Close
          </Button>
        ) : null} */}

      {/* {!isResolvedOpen ? (
        <button
          type="button"
          {...otherToggleButtonProps}
          aria-label="Open TanStack Router Devtools"
          onClick={(e) => {
            setIsOpen(true)
            onToggleClick && onToggleClick(e)
          }}
          style={{
            appearance: 'none',
            background: 'none',
            border: 0,
            padding: 0,
            position: 'fixed',
            zIndex: 99999,
            display: 'inline-flex',
            fontSize: '1.5em',
            margin: '.5em',
            cursor: 'pointer',
            width: 'fit-content',
            ...(position === 'top-right'
              ? {
                  top: '0',
                  right: '0',
                }
              : position === 'top-left'
                ? {
                    top: '0',
                    left: '0',
                  }
                : position === 'bottom-right'
                  ? {
                      bottom: '0',
                      right: '0',
                    }
                  : {
                      bottom: '0',
                      left: '0',
                    }),
            ...toggleButtonStyle,
          }}
        >
          <Logo aria-hidden />
        </button>
      ) : null} */}
    </Container>
  )
}

function RouteComp({
  route,
  isRoot,
  activeId,
  setActiveId,
}: {
  route: AnyRootRoute | AnyRoute
  isRoot?: boolean
  activeId: string | undefined
  setActiveId: (id: string) => void
}) {
  const routerState = useRouterState()
  const matches =
    routerState.status === 'pending'
      ? routerState.pendingMatches ?? []
      : routerState.matches

  const match = routerState.matches.find((d) => d.routeId === route.id)

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
        style={{
          display: 'flex',
          borderBottom: `solid 1px ${theme.grayAlt}`,
          cursor: match ? 'pointer' : 'default',
          alignItems: 'center',
          background:
            route.id === activeId ? 'rgba(255,255,255,.1)' : undefined,
          padding: '.25rem .5rem',
          gap: '.5rem',
        }}
      >
        {isRoot ? null : (
          <div
            style={{
              flex: '0 0 auto',
              width: '.7rem',
              height: '.7rem',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              borderRadius: '100%',
              transition: 'all .2s ease-out',
              background: getRouteStatusColor(matches, route, theme),
              opacity: match ? 1 : 0.3,
            }}
          />
        )}
        <div
          style={{
            flex: '1 0 auto',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: isRoot ? '0 .25rem' : 0,
            opacity: match ? 1 : 0.7,
            fontSize: '0.7rem',
          }}
        >
          <code>{route.path || trimPath(route.id)} </code>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '.5rem',
            }}
          >
            {match ? <code style={{ opacity: 0.3 }}>{match.id}</code> : null}
            <AgeTicker match={match} />
          </div>
        </div>
      </div>
      {(route.children as Route[])?.length ? (
        <div
          style={{
            marginLeft: isRoot ? 0 : '1rem',
            borderLeft: isRoot ? '' : `solid 1px ${theme.grayAlt}`,
          }}
        >
          {[...(route.children as Route[])]
            .sort((a, b) => {
              return a.rank - b.rank
            })
            .map((r) => (
              <RouteComp
                key={r.id}
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

export const TanStackRouterDevtoolsPanel = React.forwardRef<
  HTMLDivElement,
  DevtoolsPanelOptions
>(function TanStackRouterDevtoolsPanel(props, ref): React.ReactElement {
  const {
    isOpen = true,
    setIsOpen,
    handleDragStart,
    router: userRouter,
    ...panelProps
  } = props

  const { className, ...otherPanelProps } = panelProps

  const contextRouter = useRouter({ warn: false })
  const router = userRouter ?? contextRouter
  const routerState = useRouterState({
    router,
  } as any)

  const matches = [
    ...(routerState.pendingMatches ?? []),
    ...routerState.matches,
    ...routerState.cachedMatches,
  ]

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

  const activeMatch = React.useMemo(
    () => matches.find((d) => d.routeId === activeId || d.id === activeId),
    [matches, activeId],
  )

  const hasSearch = Object.keys(routerState.location.search || {}).length

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
      <style
        dangerouslySetInnerHTML={{
          __html: `

            .TanStackRouterDevtoolsPanel * {
              scrollbar-color: ${theme.backgroundAlt} ${theme.gray};
            }

            .TanStackRouterDevtoolsPanel *::-webkit-scrollbar, .TanStackRouterDevtoolsPanel scrollbar {
              width: 1em;
              height: 1em;
            }

            .TanStackRouterDevtoolsPanel *::-webkit-scrollbar-track, .TanStackRouterDevtoolsPanel scrollbar-track {
              background: ${theme.backgroundAlt};
            }

            .TanStackRouterDevtoolsPanel *::-webkit-scrollbar-thumb, .TanStackRouterDevtoolsPanel scrollbar-thumb {
              background: ${theme.gray};
              border-radius: .5em;
              border: 3px solid ${theme.backgroundAlt};
            }

            .TanStackRouterDevtoolsPanel table {
              width: 100%;
            }

            .TanStackRouterDevtoolsPanel table tr {
              border-bottom: 2px dotted rgba(255, 255, 255, .2);
            }

            .TanStackRouterDevtoolsPanel table tr:last-child {
              border-bottom: none
            }

            .TanStackRouterDevtoolsPanel table td {
              padding: .25rem .5rem;
              border-right: 2px dotted rgba(255, 255, 255, .05);
            }

            .TanStackRouterDevtoolsPanel table td:last-child {
              border-right: none
            }

          `,
        }}
      />
      {handleDragStart ? (
        <div className={styles.dragHandle} onMouseDown={handleDragStart}></div>
      ) : null}
      <div className={styles.firstContainer}>
        <div className={styles.row}>
          <Logo aria-hidden />
        </div>
        <div
          style={{
            overflowY: 'auto',
            flex: '1',
          }}
        >
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
        <div
          style={{
            flex: '1 1 auto',
            overflowY: 'auto',
          }}
        >
          <div className={styles.detailsHeader}>
            <span>Pathname</span>
            {routerState.location.maskedLocation ? (
              <div
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  display: 'flex',
                }}
              >
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
          {!showMatches ? (
            <RouteComp
              route={router.routeTree}
              isRoot
              activeId={activeId}
              setActiveId={setActiveId}
            />
          ) : (
            <div>
              {(routerState.status === 'pending'
                ? routerState.pendingMatches ?? []
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

                    <code className={styles.matchID}>{`${match.id}`}</code>
                    <AgeTicker match={match} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
        {routerState.cachedMatches?.length ? (
          <div
            style={{
              flex: '1 1 auto',
              overflowY: 'auto',
              maxHeight: '50%',
            }}
          >
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

                    <AgeTicker match={match} />
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
            <table
              style={{
                fontSize: '0.8rem',
              }}
            >
              <tbody>
                <tr>
                  <td style={{ opacity: '.5' }}>ID</td>
                  <td>
                    <code
                      style={{
                        lineHeight: '1.8em',
                      }}
                    >
                      {JSON.stringify(activeMatch.id, null, 2)}
                    </code>
                  </td>
                </tr>
                <tr>
                  <td style={{ opacity: '.5' }}>Status</td>
                  <td>
                    {routerState.pendingMatches?.find(
                      (d) => d.id === activeMatch.id,
                    )
                      ? 'Pending'
                      : routerState.matches?.find(
                            (d) => d.id === activeMatch.id,
                          )
                        ? 'Active'
                        : 'Cached'}{' '}
                    - {activeMatch.status}
                  </td>
                </tr>
                {/* <tr>
                    <td style={{ opacity: '.5' }}>Invalid</td>
                    <td>{activeMatch.getIsInvalid().toString()}</td>
                  </tr> */}
                <tr>
                  <td style={{ opacity: '.5' }}>Last Updated</td>
                  <td>
                    {activeMatch.updatedAt
                      ? new Date(
                          activeMatch.updatedAt as number,
                        ).toLocaleTimeString()
                      : 'N/A'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          {/* <div
              style={{
                background: theme.backgroundAlt,
                padding: '.5em',
                position: 'sticky',
                top: 0,
                bottom: 0,
                zIndex: 1,
              }}
            >
              Actions
            </div>
            <div
              style={{
                padding: '0.5em',
              }}
            >
              <Button
                type="button"
                onClick={() => activeMatch.__store.setState(d => ({...d, status: 'pending'}))}
                style={{
                  background: theme.gray,
                }}
              >
                Reload
              </Button>
            </div> */}
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
              value={routerState.location.search || {}}
              defaultExpanded={Object.keys(
                (routerState.location.search as {}) || {},
              ).reduce((obj: any, next) => {
                obj[next] = {}
                return obj
              }, {})}
            />
          </div>
        </div>
      ) : null}
    </div>
  )
})

function AgeTicker({ match }: { match?: AnyRouteMatch }) {
  const router = useRouter()

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
  }, [])

  if (!match) {
    return null
  }

  const route = router.looseRoutesById[match?.routeId]!

  if (!route.options.loader) {
    return null
  }

  const age = Date.now() - match?.updatedAt
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

const stylesFactory = () => {
  const { colors, font, size, alpha, shadow, border } = tokens
  const { fontFamily, lineHeight, size: fontSize } = font

  return {
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
      top: -2px;
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
        const border = css`
          border-right: 1px solid ${tokens.colors.gray[500]};
        `
        classes.push(border)
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
        padding: ${size[1.5]} ${size[2]};
        gap: ${size[2]};
        font-size: ${fontSize.xs};
        color: ${colors.gray[300]};
      `
      const classes = [base]

      if (active) {
        const activeStyles = css`
          background: ${colors.darkGray[600]};
        `
        classes.push(activeStyles)
      }

      return classes
    },
    matchIndicator: (color: 'green' | 'red' | 'yellow' | 'gray') => {
      const base = css`
        flex: 0 0 auto;
        width: ${size[3]};
        height: ${size[3]};
        background: ${colors[color][900]};
        border: 1px solid ${colors[color][500]};
        border-radius: ${border.radius.full};
        transition: all 0.2s ease-out;
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
    `,
    ageTicker: (showWarning: boolean) => {
      const base = css`
        display: flex;
        gap: ${size[1]};
        font-size: ${fontSize.xs};
        color: ${colors.gray[400]};
        font-variant-numeric: tabular-nums;
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
  }
}

const styles = stylesFactory()
