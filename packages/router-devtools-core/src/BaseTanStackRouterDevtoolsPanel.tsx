import React from 'react'
import { clsx as cx } from 'clsx'
import { default as invariant } from 'tiny-invariant'
import { rootRouteId, trimPath } from '@tanstack/router-core'
import { useRouter, useRouterState } from '@tanstack/react-router'
import { useDevtoolsOnClose } from './context'
import { useStyles } from './useStyles'
import useLocalStorage from './useLocalStorage'
import Explorer from './Explorer'
import { getRouteStatusColor, getStatusColor, multiSortBy } from './utils'
import { AgeTicker } from './AgeTicker'
import type { DevtoolsPanelOptions } from './TanStackRouterDevtoolsPanel'

import type {
  AnyRootRoute,
  AnyRoute,
  AnyRouter,
  Route,
} from '@tanstack/react-router'

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

export const BaseTanStackRouterDevtoolsPanel =
  function BaseTanStackRouterDevtoolsPanel({
    ref,
    ...props
  }: DevtoolsPanelOptions & {
    ref?: React.RefObject<HTMLDivElement | null>
  }): React.ReactElement {
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
          <div
            className={styles.dragHandle}
            onMouseDown={handleDragStart}
          ></div>
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
                  className={cx(
                    styles.routeMatchesToggleBtn(!showMatches, true),
                  )}
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
              <Explorer
                label="Match"
                value={activeMatch}
                defaultExpanded={{}}
              />
            </div>
          </div>
        ) : null}
        {hasSearch ? (
          <div className={styles.fourthContainer}>
            <div className={styles.detailsHeader}>Search Params</div>
            <div className={styles.detailsContent}>
              <Explorer
                value={routerState.location.search}
                defaultExpanded={Object.keys(
                  routerState.location.search,
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
  }
