import { clsx as cx } from 'clsx'
import {
  getRouteSegments,
  hasKeys,
  hasMissingPathParams,
  interpolatePath,
  rootRouteId,
  trimPath,
} from '@tanstack/router-core'
import { getRouteModuleId } from '@tanstack/router-core/_internal/route-module'
import {
  For,
  Match,
  Show,
  Switch,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  untrack,
} from 'solid-js'
import { useDevtoolsOnClose } from './context'
import { useStyles } from './useStyles'
import useLocalStorage from './useLocalStorage'
import { Explorer } from './Explorer'
import { getRouteStatusColor, getStatusColor, multiSortBy } from './utils'
import { AgeTicker } from './AgeTicker'
// import type { DevtoolsPanelOptions } from './TanStackRouterDevtoolsPanel'

import { NavigateButton } from './NavigateButton'
import {
  getModuleIds,
  getModuleLocalPath,
  getModuleRoot,
  getModuleRootId,
  getModuleRoutes,
  getParentModuleId,
} from './routeModules'
import type {
  AnyContext,
  AnyRoute,
  AnyRouteMatch,
  AnyRouter,
  FileRouteTypes,
  MakeRouteMatchUnion,
  Route,
  RouterState,
} from '@tanstack/router-core'
import type { Accessor, JSX } from 'solid-js'

export interface BaseDevtoolsPanelOptions {
  /**
   * The standard React style object used to style a component with inline styles
   */
  style?: Accessor<JSX.CSSProperties>
  /**
   * The standard React class property used to style a component with classes
   */
  className?: Accessor<string>
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
  router: Accessor<AnyRouter>
  routerState: Accessor<any>
  /**
   * Use this to attach the devtool's styles to specific element in the DOM.
   */
  shadowDOMTarget?: ShadowRoot
}

const HISTORY_LIMIT = 15

function Logo(props: any) {
  const { className, ...rest } = props
  const styles = useStyles()
  return (
    <button {...rest} class={cx(styles().logo, className ? className() : '')}>
      <div class={styles().tanstackLogo}>TANSTACK</div>
      <div class={styles().routerLogo}>TanStack Router v1</div>
    </button>
  )
}

function NavigateLink(props: {
  class?: string
  left?: JSX.Element
  children?: JSX.Element
  right?: JSX.Element
}) {
  return (
    <div
      class={props.class}
      style={{
        display: 'flex',
        'align-items': 'center',
        width: '100%',
      }}
    >
      {props.left}
      <div style={{ 'flex-grow': 1, 'min-width': 0 }}>{props.children}</div>
      {props.right}
    </div>
  )
}

/** How the panel shows route modules: collapsed groups and module details. */
interface ModuleControls {
  isCollapsed: (moduleId: string) => boolean
  toggle: (moduleId: string) => void
  open: (moduleId: string) => void
}

function ModuleBadge(props: {
  moduleId: string
  open: (moduleId: string) => void
}) {
  const styles = useStyles()
  return (
    <button
      type="button"
      class={styles().moduleBadge}
      aria-label={`Open module details for ${props.moduleId}`}
      onClick={(e) => {
        e.stopPropagation()
        props.open(props.moduleId)
      }}
    >
      {props.moduleId}
    </button>
  )
}

function RouteComp({
  routerState,
  pendingMatches,
  router,
  route,
  isRoot,
  activeId,
  setActiveId,
  modules,
}: {
  routerState: Accessor<
    RouterState<
      Route<
        any,
        any,
        any,
        '/',
        '/',
        string,
        '__root__',
        undefined,
        {},
        {},
        AnyContext,
        AnyContext,
        {},
        undefined,
        any,
        FileRouteTypes,
        unknown,
        undefined
      >,
      MakeRouteMatchUnion
    >
  >
  pendingMatches: Accessor<Array<AnyRouteMatch>>
  router: Accessor<AnyRouter>
  route: AnyRoute
  isRoot?: boolean
  activeId: Accessor<string | undefined>
  setActiveId: (id: string) => void
  modules: ModuleControls
}) {
  const styles = useStyles()
  // A route module's root heads a collapsible group of the module's routes.
  const moduleId = getModuleRootId(route)
  const collapsed = () =>
    moduleId !== undefined && modules.isCollapsed(moduleId)
  const matches = createMemo(() =>
    pendingMatches().length ? pendingMatches() : routerState().matches,
  )
  const match = createMemo(() =>
    routerState().matches.find((d) => d.routeId === route.id),
  )

  const param = createMemo(() => {
    try {
      if (match()?.params) {
        const p = match()?.params
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
  })

  const navigationTarget = createMemo<string | undefined>(() => {
    if (isRoot) return undefined // rootRouteId has no path
    if (!route.path) return undefined // no path to navigate to

    // flatten all params in the router state, into a single object
    const allParams = Object.assign({}, ...matches().map((m) => m.params))

    const segments = getRouteSegments(route)
    const pathname = segments
      ? interpolatePath(
          route.fullPath,
          segments,
          allParams,
          router().pathParamsDecoder,
        )
      : route.fullPath

    return segments && hasMissingPathParams(segments, allParams)
      ? undefined
      : pathname
  })

  return (
    <div
      role={moduleId === undefined ? undefined : 'group'}
      aria-label={
        moduleId === undefined ? undefined : `Route module ${moduleId}`
      }
    >
      <div
        role="button"
        aria-label={`Open match details for ${route.id}`}
        onClick={() => {
          if (match()) {
            setActiveId(activeId() === route.id ? '' : route.id)
          }
        }}
        class={cx(
          styles().routesRowContainer(route.id === activeId(), !!match()),
        )}
      >
        <div
          class={cx(
            styles().matchIndicator(getRouteStatusColor(matches(), route)),
          )}
        />
        <NavigateLink
          class={cx(styles().routesRow(!!match()))}
          left={
            <Show when={navigationTarget()}>
              {(navigate) => <NavigateButton to={navigate()} router={router} />}
            </Show>
          }
          right={<AgeTicker match={match()} router={router} />}
        >
          <Show when={moduleId}>
            {(id) => (
              <button
                type="button"
                class={styles().moduleToggle}
                aria-label={`${collapsed() ? 'Expand' : 'Collapse'} ${id()}`}
                aria-expanded={!collapsed()}
                onClick={(e) => {
                  e.stopPropagation()
                  modules.toggle(id())
                }}
              >
                {collapsed() ? '▸' : '▾'}
              </button>
            )}
          </Show>
          <code class={styles().code}>
            {isRoot ? rootRouteId : route.path || trimPath(route.id)}{' '}
          </code>
          <code class={styles().routeParamInfo}>{param()}</code>
          <Show when={moduleId}>
            {(id) => <ModuleBadge moduleId={id()} open={modules.open} />}
          </Show>
        </NavigateLink>
      </div>
      {route.children?.length && !collapsed() ? (
        <div
          class={cx(
            styles().nestedRouteRow(!!isRoot),
            moduleId !== undefined && styles().moduleChildren,
          )}
        >
          {[...(route.children as Array<AnyRoute>)]
            .sort((a, b) => {
              return a.rank - b.rank
            })
            .map((r) => (
              <RouteComp
                routerState={routerState}
                pendingMatches={pendingMatches}
                router={router}
                route={r}
                activeId={activeId}
                setActiveId={setActiveId}
                modules={modules}
              />
            ))}
        </div>
      ) : null}
    </div>
  )
}

export const BaseTanStackRouterDevtoolsPanel =
  function BaseTanStackRouterDevtoolsPanel({
    ...props
  }: BaseDevtoolsPanelOptions): JSX.Element {
    const {
      isOpen = true,
      setIsOpen,
      handleDragStart,
      router,
      routerState,
      shadowDOMTarget,
      ...panelProps
    } = props

    const { onCloseClick } = useDevtoolsOnClose()
    const styles = useStyles()
    const { className, style, ...otherPanelProps } = panelProps

    // useStore(router.stores.__store)

    const [currentTab, setCurrentTab] = useLocalStorage<
      'routes' | 'matches' | 'history'
    >('tanstackRouterDevtoolsActiveTab', 'routes')

    const [activeId, setActiveId] = useLocalStorage(
      'tanstackRouterDevtoolsActiveRouteId',
      '',
    )

    // Route modules: collapsed groups, the module shown in the details pane,
    // and the module the route tree is narrowed to.
    const [collapsedModules, setCollapsedModules] = useLocalStorage<
      Array<string>
    >('tanstackRouterDevtoolsCollapsedModules', [])
    const [activeModuleId, setActiveModuleId] = useLocalStorage(
      'tanstackRouterDevtoolsActiveModuleId',
      '',
    )
    const [moduleFilter, setModuleFilter] = createSignal('')
    const moduleIds = createMemo(() => getModuleIds(router()))
    const selectMatch = (id: string) => {
      setActiveModuleId('')
      setActiveId(id)
    }
    const modules: ModuleControls = {
      isCollapsed: (moduleId) => (collapsedModules() ?? []).includes(moduleId),
      toggle: (moduleId) =>
        setCollapsedModules((previous = []) =>
          previous.includes(moduleId)
            ? previous.filter((id) => id !== moduleId)
            : [...previous, moduleId],
        ),
      open: (moduleId) => {
        setActiveId('')
        setActiveModuleId(moduleId)
      },
    }
    const activeModule = createMemo(() => {
      const moduleId = activeModuleId()
      return moduleId && getModuleRoot(router(), moduleId)
        ? moduleId
        : undefined
    })
    const routeTreeRoot = createMemo(
      () =>
        (moduleFilter() && getModuleRoot(router(), moduleFilter())) ||
        router().routeTree,
    )

    const [history, setHistory] = createSignal<Array<AnyRouteMatch>>([])
    const [hasHistoryOverflowed, setHasHistoryOverflowed] = createSignal(false)

    const pendingMatches = () => {
      const matches = routerState().matches
      return matches.some((match: AnyRouteMatch) => match.status === 'pending')
        ? matches
        : []
    }
    let cache = router()._cache
    let cacheMatches = [...cache.values()]
    const [cachedMatches, setCachedMatches] = createSignal(cacheMatches)

    createEffect(() => {
      const refreshCache = () => {
        const next = router()._cache
        let valuesChanged = next.size !== cacheMatches.length
        if (!valuesChanged) {
          let index = 0
          for (const match of next.values()) {
            if (match !== cacheMatches[index++]) {
              valuesChanged = true
              break
            }
          }
        }

        if (next !== cache || valuesChanged) {
          cache = next
          cacheMatches = [...next.values()]
          setCachedMatches(cacheMatches)
        }
      }
      refreshCache()
      const interval = setInterval(refreshCache, 500)
      onCleanup(() => clearInterval(interval))
    })

    createEffect(() => {
      const matches = routerState().matches
      const currentMatch = matches[matches.length - 1]
      if (!currentMatch) {
        return
      }
      // Read history WITHOUT tracking it to avoid infinite loops
      const historyUntracked = untrack(() => history())
      const lastMatch = historyUntracked[0]
      const sameLocation =
        lastMatch &&
        lastMatch.pathname === currentMatch.pathname &&
        JSON.stringify(lastMatch.search ?? {}) ===
          JSON.stringify(currentMatch.search ?? {})
      if (!lastMatch || !sameLocation) {
        if (historyUntracked.length >= HISTORY_LIMIT) {
          setHasHistoryOverflowed(true)
        }
        setHistory((prev) => {
          const newHistory = [currentMatch, ...prev]
          // truncate to ensure we don't overflow too much the ui
          newHistory.splice(HISTORY_LIMIT)
          return newHistory
        })
      }
    })

    const activeMatch = createMemo(() => {
      const matches = [
        ...pendingMatches(),
        ...routerState().matches,
        ...cachedMatches(),
      ]
      return matches.find(
        (d) => d.routeId === activeId() || d.id === activeId(),
      )
    })

    const hasSearch = createMemo(() => hasKeys(routerState().location.search))

    const explorerState = createMemo(() => {
      return {
        ...router(),
        state: routerState(),
      }
    })

    const routerExplorerValue = createMemo(() =>
      Object.fromEntries(
        multiSortBy(
          Object.keys(explorerState()),
          (
            [
              'state',
              'routesById',
              'routesByPath',
              'options',
              'manifest',
            ] as const
          ).map((d) => (dd) => dd !== d),
        )
          .map((key) => [key, (explorerState() as any)[key]])
          .filter(
            (d) =>
              typeof d[1] !== 'function' &&
              ![
                'stores',
                'basepath',
                'subscribers',
                '_scroll',
                'tempLocationKey',
                'latestLocation',
                'routeTree',
                'history',
              ].includes(d[0]),
          ),
      ),
    )
    const activeMatchModuleRoute = createMemo(() => {
      const routeId = activeMatch()?.routeId
      return routeId !== undefined && getRouteModuleId(routeId) !== undefined
        ? (router().routesById[routeId] as AnyRoute | undefined)
        : undefined
    })
    const activeMatchLoaderData = createMemo(() => activeMatch()?.loaderData)
    const activeMatchValue = createMemo(() => activeMatch())
    const locationSearchValue = createMemo(() => routerState().location.search)

    return (
      <div
        class={cx(
          styles().devtoolsPanel,
          'TanStackRouterDevtoolsPanel',
          className ? className() : '',
        )}
        style={style ? style() : ''}
        {...otherPanelProps}
      >
        {handleDragStart ? (
          <div class={styles().dragHandle} onMouseDown={handleDragStart}></div>
        ) : null}
        <button
          class={styles().panelCloseBtn}
          onClick={(e: any) => {
            if (setIsOpen) {
              setIsOpen(false)
            }
            onCloseClick(e)
          }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="10"
            height="6"
            fill="none"
            viewBox="0 0 10 6"
            class={styles().panelCloseBtnIcon}
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
        <div class={styles().firstContainer}>
          <div class={styles().row}>
            <Logo
              aria-hidden
              onClick={(e: any) => {
                if (setIsOpen) {
                  setIsOpen(false)
                }
                onCloseClick(e)
              }}
            />
          </div>
          <div class={styles().routerExplorerContainer}>
            <div class={styles().routerExplorer}>
              <Explorer
                label="Router"
                value={routerExplorerValue}
                defaultExpanded={{
                  state: {} as any,
                  context: {} as any,
                  options: {} as any,
                }}
                filterSubEntries={(subEntries) => {
                  return subEntries.filter(
                    (d: any) => typeof d.value() !== 'function',
                  )
                }}
              />
            </div>
          </div>
        </div>
        <div class={styles().secondContainer}>
          <div class={styles().matchesContainer}>
            <div class={styles().detailsHeader}>
              <span>Pathname</span>
              {routerState().location.maskedLocation ? (
                <div class={styles().maskedBadgeContainer}>
                  <span class={styles().maskedBadge}>masked</span>
                </div>
              ) : null}
            </div>
            <div class={styles().detailsContent}>
              <code>{routerState().location.pathname}</code>
              {routerState().location.maskedLocation ? (
                <code class={styles().maskedLocation}>
                  {routerState().location.maskedLocation?.pathname}
                </code>
              ) : null}
            </div>
            <div class={styles().detailsHeader}>
              <div class={styles().routeMatchesToggle}>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('routes')
                  }}
                  disabled={currentTab() === 'routes'}
                  class={cx(
                    styles().routeMatchesToggleBtn(
                      currentTab() === 'routes',
                      true,
                    ),
                  )}
                >
                  Routes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('matches')
                  }}
                  disabled={currentTab() === 'matches'}
                  class={cx(
                    styles().routeMatchesToggleBtn(
                      currentTab() === 'matches',
                      true,
                    ),
                  )}
                >
                  Matches
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('history')
                  }}
                  disabled={currentTab() === 'history'}
                  class={cx(
                    styles().routeMatchesToggleBtn(
                      currentTab() === 'history',
                      false,
                    ),
                  )}
                >
                  History
                </button>
              </div>
              <div class={styles().detailsHeaderInfo}>
                <div>age / staleTime / gcTime</div>
              </div>
            </div>
            <div class={cx(styles().routesContainer)}>
              <Switch>
                <Match when={currentTab() === 'routes'}>
                  <Show when={moduleIds().length}>
                    <div class={styles().moduleFilter}>
                      <select
                        aria-label="Show routes of"
                        value={moduleFilter()}
                        onChange={(e) => setModuleFilter(e.currentTarget.value)}
                      >
                        <option value="">All routes</option>
                        <For each={moduleIds()}>
                          {(moduleId) => (
                            <option value={moduleId}>{moduleId}</option>
                          )}
                        </For>
                      </select>
                    </div>
                  </Show>
                  <Show when={routeTreeRoot()} keyed>
                    {(route) => (
                      <RouteComp
                        routerState={routerState}
                        pendingMatches={pendingMatches}
                        router={router}
                        route={route}
                        isRoot={route === router().routeTree}
                        activeId={activeId}
                        setActiveId={selectMatch}
                        modules={modules}
                      />
                    )}
                  </Show>
                </Match>
                <Match when={currentTab() === 'matches'}>
                  <div>
                    {(pendingMatches().length
                      ? pendingMatches()
                      : routerState().matches
                    ).map((match: any, _i: any) => {
                      return (
                        <div
                          role="button"
                          aria-label={`Open match details for ${match.id}`}
                          onClick={() =>
                            selectMatch(activeId() === match.id ? '' : match.id)
                          }
                          class={cx(styles().matchRow(match === activeMatch()))}
                        >
                          <div
                            class={cx(
                              styles().matchIndicator(getStatusColor(match)),
                            )}
                          />
                          <NavigateLink
                            left={
                              <NavigateButton
                                to={match.pathname}
                                params={match.params}
                                search={match.search}
                                router={router}
                              />
                            }
                            right={<AgeTicker match={match} router={router} />}
                          >
                            <code class={styles().matchID}>
                              {`${match.routeId === rootRouteId ? rootRouteId : match.pathname}`}
                            </code>
                            <Show when={getRouteModuleId(match.routeId)}>
                              {(moduleId) => (
                                <ModuleBadge
                                  moduleId={moduleId()}
                                  open={modules.open}
                                />
                              )}
                            </Show>
                          </NavigateLink>
                        </div>
                      )
                    })}
                  </div>
                </Match>
                <Match when={currentTab() === 'history'}>
                  <div>
                    <ul>
                      <For each={history()}>
                        {(match, index) => (
                          <li
                            class={cx(
                              styles().matchRow(match === activeMatch()),
                            )}
                          >
                            <div
                              class={cx(
                                styles().matchIndicator(
                                  index() === 0 ? 'green' : 'gray',
                                ),
                              )}
                            />
                            <NavigateLink
                              left={
                                <NavigateButton
                                  to={match.pathname}
                                  params={match.params}
                                  search={match.search}
                                  router={router}
                                />
                              }
                              right={
                                <AgeTicker match={match} router={router} />
                              }
                            >
                              <code class={styles().matchID}>
                                {`${match.routeId === rootRouteId ? rootRouteId : match.pathname}`}
                              </code>
                            </NavigateLink>
                          </li>
                        )}
                      </For>
                      {hasHistoryOverflowed() ? (
                        <li class={styles().historyOverflowContainer}>
                          This panel displays the most recent {HISTORY_LIMIT}{' '}
                          navigations.
                        </li>
                      ) : null}
                    </ul>
                  </div>
                </Match>
              </Switch>
            </div>
          </div>
          {cachedMatches().length ? (
            <div class={styles().cachedMatchesContainer}>
              <div class={styles().detailsHeader}>
                <div>Cached Matches</div>
                <div class={styles().detailsHeaderInfo}>
                  age / staleTime / gcTime
                </div>
              </div>
              <div>
                {cachedMatches().map((match: any) => {
                  return (
                    <div
                      role="button"
                      aria-label={`Open match details for ${match.id}`}
                      onClick={() =>
                        selectMatch(activeId() === match.id ? '' : match.id)
                      }
                      class={cx(styles().matchRow(match === activeMatch()))}
                    >
                      <div
                        class={cx(
                          styles().matchIndicator(getStatusColor(match)),
                        )}
                      />
                      <NavigateLink
                        left={
                          <NavigateButton
                            to={match.pathname}
                            params={match.params}
                            search={match.search}
                            router={router}
                          />
                        }
                        right={<AgeTicker match={match} router={router} />}
                      >
                        <code class={styles().matchID}>{`${match.id}`}</code>
                      </NavigateLink>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        {activeModule() ? (
          <ModuleDetails
            moduleId={activeModule()!}
            router={router}
            routerState={routerState}
            open={modules.open}
            selectMatch={selectMatch}
          />
        ) : activeMatch() && activeMatch()?.status ? (
          <div class={styles().thirdContainer}>
            <div class={styles().detailsHeader}>Match Details</div>
            <div>
              <div class={styles().matchDetails}>
                <div
                  class={styles().matchStatus(
                    activeMatch()?.status,
                    activeMatch()?.isFetching,
                  )}
                >
                  <div>
                    {activeMatch()?.status === 'success' &&
                    activeMatch()?.isFetching
                      ? 'fetching'
                      : activeMatch()?.status}
                  </div>
                </div>
                <div class={styles().matchDetailsInfoLabel}>
                  <div>ID:</div>
                  <div class={styles().matchDetailsInfo}>
                    <code>{activeMatch()?.id}</code>
                  </div>
                </div>
                <Show when={activeMatchModuleRoute()}>
                  {(route) => (
                    <>
                      <div class={styles().matchDetailsInfoLabel}>
                        <div>Module:</div>
                        <div class={styles().matchDetailsInfo}>
                          <ModuleBadge
                            moduleId={getRouteModuleId(route().id)!}
                            open={modules.open}
                          />
                        </div>
                      </div>
                      <div class={styles().matchDetailsInfoLabel}>
                        <div>Local path:</div>
                        <div class={styles().matchDetailsInfo}>
                          <code>{getModuleLocalPath(router(), route())}</code>
                        </div>
                      </div>
                      <div class={styles().matchDetailsInfoLabel}>
                        <div>Path:</div>
                        <div class={styles().matchDetailsInfo}>
                          <code>{route().fullPath}</code>
                        </div>
                      </div>
                    </>
                  )}
                </Show>
                <div class={styles().matchDetailsInfoLabel}>
                  <div>State:</div>
                  <div class={styles().matchDetailsInfo}>
                    {pendingMatches().find(
                      (d: AnyRouteMatch) => d.id === activeMatch()?.id,
                    )
                      ? 'Pending'
                      : routerState().matches.find(
                            (d: any) => d.id === activeMatch()?.id,
                          )
                        ? 'Active'
                        : 'Cached'}
                  </div>
                </div>
                <div class={styles().matchDetailsInfoLabel}>
                  <div>Last Updated:</div>
                  <div class={styles().matchDetailsInfo}>
                    {activeMatch()?.updatedAt
                      ? new Date(activeMatch()?.updatedAt).toLocaleTimeString()
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
            {activeMatchLoaderData() ? (
              <>
                <div class={styles().detailsHeader}>Loader Data</div>
                <div class={styles().detailsContent}>
                  <Explorer
                    label="loaderData"
                    value={activeMatchLoaderData}
                    defaultExpanded={{}}
                  />
                </div>
              </>
            ) : null}
            <div class={styles().detailsHeader}>Explorer</div>
            <div class={styles().detailsContent}>
              <Explorer
                label="Match"
                value={activeMatchValue}
                defaultExpanded={{}}
              />
            </div>
          </div>
        ) : null}
        {hasSearch() ? (
          <div class={styles().fourthContainer}>
            <div class={styles().detailsHeader}>
              <span>Search Params</span>
              {typeof navigator !== 'undefined' ? (
                <span style="margin-left: 0.5rem;">
                  <CopyButton
                    getValue={() => {
                      const search = routerState().location.search
                      return JSON.stringify(search)
                    }}
                  />
                </span>
              ) : null}
            </div>
            <div class={styles().detailsContent}>
              <Explorer
                value={locationSearchValue}
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

function ModuleDetails(props: {
  moduleId: string
  router: Accessor<AnyRouter>
  routerState: Accessor<any>
  open: (moduleId: string) => void
  selectMatch: (id: string) => void
}) {
  const styles = useStyles()
  const root = () => getModuleRoot(props.router(), props.moduleId)!
  const parentModuleId = () => getParentModuleId(props.router(), props.moduleId)
  const routes = () => getModuleRoutes(props.router(), props.moduleId)
  const matches = () =>
    (props.routerState().matches as Array<AnyRouteMatch>).filter(
      (match) => getRouteModuleId(match.routeId) === props.moduleId,
    )
  return (
    <div
      class={styles().thirdContainer}
      role="region"
      aria-label="Module details"
    >
      <div class={styles().detailsHeader}>Module Details</div>
      <div class={styles().matchDetails}>
        <div class={styles().matchDetailsInfoLabel}>
          <div>Module:</div>
          <div class={styles().matchDetailsInfo}>
            <code>{props.moduleId}</code>
          </div>
        </div>
        <div class={styles().matchDetailsInfoLabel}>
          <div>Mount path:</div>
          <div class={styles().matchDetailsInfo}>
            <code>{root().fullPath}</code>
          </div>
        </div>
        <div class={styles().matchDetailsInfoLabel}>
          <div>Parent module:</div>
          <div class={styles().matchDetailsInfo}>
            <Show when={parentModuleId()} fallback="Application">
              {(id) => <ModuleBadge moduleId={id()} open={props.open} />}
            </Show>
          </div>
        </div>
      </div>
      <div class={styles().detailsHeader}>Routes (local / final path)</div>
      <For each={routes()}>
        {(route) => (
          <div class={styles().moduleRouteRow} title={route.id}>
            <code>{getModuleLocalPath(props.router(), route)}</code>
            <code>{route.fullPath}</code>
          </div>
        )}
      </For>
      <div class={styles().detailsHeader}>Active Matches</div>
      <Show
        when={matches().length}
        fallback={<div class={styles().moduleRouteRow}>None</div>}
      >
        <For each={matches()}>
          {(match) => (
            <div
              role="button"
              aria-label={`Open match details for ${match.id}`}
              class={styles().moduleRouteRow}
              onClick={() => props.selectMatch(match.id)}
            >
              <code>{match.pathname}</code>
            </div>
          )}
        </For>
      </Show>
    </div>
  )
}

function CopyButton({ getValue }: { getValue: () => string }) {
  const [copied, setCopied] = createSignal(false)

  let timeoutId: ReturnType<typeof setTimeout> | null = null

  const handleCopy = async () => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      console.warn('TanStack Router Devtools: Clipboard API unavailable')
      return
    }
    try {
      const value = getValue()
      await navigator.clipboard.writeText(value)
      setCopied(true)
      if (timeoutId) clearTimeout(timeoutId)
      timeoutId = setTimeout(() => setCopied(false), 2500)
    } catch (e) {
      console.error('TanStack Router Devtools: Failed to copy', e)
    }
  }

  onCleanup(() => {
    if (timeoutId) clearTimeout(timeoutId)
  })

  return (
    <button
      type="button"
      style="cursor: pointer;"
      onClick={handleCopy}
      aria-label="Copy value to clipboard"
      title={copied() ? 'Copied!' : 'Copy'}
    >
      {copied() ? '✅' : '📋'}
    </button>
  )
}

export default BaseTanStackRouterDevtoolsPanel
