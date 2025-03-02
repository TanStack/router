import * as Solid from 'solid-js'
import { clsx as cx } from 'clsx'
import {
  invariant,
  rootRouteId,
  trimPath,
  useRouter,
  useRouterState,
} from '@tanstack/solid-router'
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
} from '@tanstack/solid-router'

function Logo(props: any) {
  const { className, ...rest } = props
  const styles = useStyles()
  return (
    <button {...rest} class={cx(styles()().logo, className)}>
      <div class={styles()().tanstackLogo}>TANSTACK</div>
      <div class={styles()().routerLogo}>TanStack Router v1</div>
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
  const matches = routerState().pendingMatches || routerState().matches
  const match = routerState().matches.find((d) => d.routeId === route.id)

  const param = Solid.createMemo(() => {
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
        class={cx(
          styles()().routesRowContainer(route.id === activeId, !!match),
        )}
      >
        <div
          class={cx(
            styles()().matchIndicator(getRouteStatusColor(matches, route)),
          )}
        />
        <div class={cx(styles()().routesRow(!!match))}>
          <div>
            <code class={styles()().code}>
              {isRoot ? rootRouteId : route.path || trimPath(route.id)}{' '}
            </code>
            <code class={styles()().routeParamInfo}>{param()}</code>
          </div>
          <AgeTicker match={match} router={router} />
        </div>
      </div>
      {route.children?.length ? (
        <div class={styles()().nestedRouteRow(!!isRoot)}>
          {[...(route.children as Array<Route>)]
            .sort((a, b) => {
              return a.rank - b.rank
            })
            .map((r) => (
              <RouteComp
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
    ref?: HTMLDivElement | undefined
  }): Solid.JSX.Element {
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

    const activeMatch = Solid.createMemo(() => {
      const matches = [
        ...(routerState().pendingMatches ?? []),
        ...routerState().matches,
        ...routerState().cachedMatches,
      ]
      return matches.find(
        (d) => d.routeId === activeId() || d.id === activeId(),
      )
    })

    const hasSearch = Object.keys(routerState().location.search).length

    const explorerState = {
      ...router,
      state: router.state,
    }

    return (
      <div
        ref={ref}
        class={cx(
          styles()().devtoolsPanel,
          'TanStackRouterDevtoolsPanel',
          className,
        )}
        {...otherPanelProps}
      >
        {handleDragStart ? (
          <div
            class={styles()().dragHandle}
            onMouseDown={handleDragStart}
          ></div>
        ) : null}
        <button
          class={styles()().panelCloseBtn}
          onClick={(e: any) => {
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
            class={styles()().panelCloseBtnIcon}
          >
            <path
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.667"
              d="M1 1l4 4 4-4"
            ></path>
          </svg>
        </button>
        <div class={styles()().firstContainer}>
          <div class={styles()().row}>
            <Logo
              aria-hidden
              onClick={(e: any) => {
                setIsOpen(false)
                onCloseClick(e)
              }}
            />
          </div>
          <div class={styles()().routerExplorerContainer}>
            <div class={styles()().routerExplorer}>
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
        <div class={styles()().secondContainer}>
          <div class={styles()().matchesContainer}>
            <div class={styles()().detailsHeader}>
              <span>Pathname</span>
              {routerState().location.maskedLocation ? (
                <div class={styles()().maskedBadgeContainer}>
                  <span class={styles()().maskedBadge}>masked</span>
                </div>
              ) : null}
            </div>
            <div class={styles()().detailsContent}>
              <code>{routerState().location.pathname}</code>
              {routerState().location.maskedLocation ? (
                <code class={styles()().maskedLocation}>
                  {routerState().location.maskedLocation?.pathname}
                </code>
              ) : null}
            </div>
            <div class={styles()().detailsHeader}>
              <div class={styles()().routeMatchesToggle}>
                <button
                  type="button"
                  onClick={() => {
                    setShowMatches(false)
                  }}
                  disabled={!showMatches()}
                  class={cx(
                    styles()().routeMatchesToggleBtn(!showMatches(), true),
                  )}
                >
                  Routes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowMatches(true)
                  }}
                  disabled={showMatches()}
                  class={cx(
                    styles()().routeMatchesToggleBtn(!!showMatches(), false),
                  )}
                >
                  Matches
                </button>
              </div>
              <div class={styles()().detailsHeaderInfo}>
                <div>age / staleTime / gcTime</div>
              </div>
            </div>
            <div class={cx(styles()().routesContainer)}>
              {!showMatches() ? (
                <RouteComp
                  router={router}
                  route={router.routeTree}
                  isRoot
                  activeId={activeId()}
                  setActiveId={setActiveId}
                />
              ) : (
                <div>
                  {(routerState().pendingMatches?.length
                    ? routerState().pendingMatches
                    : routerState().matches
                  )?.map((match, i) => {
                    return (
                      <div
                        role="button"
                        aria-label={`Open match details for ${match.id}`}
                        onClick={() =>
                          setActiveId(activeId() === match.id ? '' : match.id)
                        }
                        class={cx(styles()().matchRow(match === activeMatch()))}
                      >
                        <div
                          class={cx(
                            styles()().matchIndicator(getStatusColor(match)),
                          )}
                        />

                        <code
                          class={styles()().matchID}
                        >{`${match.routeId === rootRouteId ? rootRouteId : match.pathname}`}</code>
                        <AgeTicker match={match} router={router} />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
          {routerState().cachedMatches.length ? (
            <div class={styles()().cachedMatchesContainer}>
              <div class={styles()().detailsHeader}>
                <div>Cached Matches</div>
                <div class={styles()().detailsHeaderInfo}>
                  age / staleTime / gcTime
                </div>
              </div>
              <div>
                {routerState().cachedMatches.map((match) => {
                  return (
                    <div
                      role="button"
                      aria-label={`Open match details for ${match.id}`}
                      onClick={() =>
                        setActiveId(activeId() === match.id ? '' : match.id)
                      }
                      class={cx(styles()().matchRow(match === activeMatch()))}
                    >
                      <div
                        class={cx(
                          styles()().matchIndicator(getStatusColor(match)),
                        )}
                      />

                      <code class={styles()().matchID}>{`${match.id}`}</code>

                      <AgeTicker match={match} router={router} />
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        {activeMatch ? (
          <div class={styles()().thirdContainer}>
            <div class={styles()().detailsHeader}>Match Details</div>
            <div>
              <div class={styles()().matchDetails}>
                <div
                  class={styles()().matchStatus(
                    activeMatch()!.status,
                    activeMatch()!.isFetching,
                  )}
                >
                  <div>
                    {activeMatch()!.status === 'success' &&
                    activeMatch()!.isFetching
                      ? 'fetching'
                      : activeMatch()!.status}
                  </div>
                </div>
                <div class={styles()().matchDetailsInfoLabel}>
                  <div>ID:</div>
                  <div class={styles()().matchDetailsInfo}>
                    <code>{activeMatch()!.id}</code>
                  </div>
                </div>
                <div class={styles()().matchDetailsInfoLabel}>
                  <div>State:</div>
                  <div class={styles()().matchDetailsInfo}>
                    {routerState().pendingMatches?.find(
                      (d) => d.id === activeMatch()!.id,
                    )
                      ? 'Pending'
                      : routerState().matches.find(
                            (d) => d.id === activeMatch()!.id,
                          )
                        ? 'Active'
                        : 'Cached'}
                  </div>
                </div>
                <div class={styles()().matchDetailsInfoLabel}>
                  <div>Last Updated:</div>
                  <div class={styles()().matchDetailsInfo}>
                    {activeMatch()!.updatedAt
                      ? new Date(activeMatch()!.updatedAt).toLocaleTimeString()
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
            {activeMatch()!.loaderData ? (
              <>
                <div class={styles()().detailsHeader}>Loader Data</div>
                <div class={styles()().detailsContent}>
                  <Explorer
                    label="loaderData"
                    value={activeMatch()!.loaderData}
                    defaultExpanded={{}}
                  />
                </div>
              </>
            ) : null}
            <div class={styles()().detailsHeader}>Explorer</div>
            <div class={styles()().detailsContent}>
              <Explorer
                label="Match"
                value={activeMatch}
                defaultExpanded={{}}
              />
            </div>
          </div>
        ) : null}
        {hasSearch ? (
          <div class={styles()().fourthContainer}>
            <div class={styles()().detailsHeader}>Search Params</div>
            <div class={styles()().detailsContent}>
              <Explorer
                value={routerState().location.search}
                defaultExpanded={Object.keys(
                  routerState().location.search,
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
