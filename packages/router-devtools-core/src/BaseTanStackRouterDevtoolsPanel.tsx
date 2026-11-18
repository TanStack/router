import {
  getRouteSegments,
  hasKeys,
  hasMissingPathParams,
  interpolatePath,
  rootRouteId,
  trimPath,
} from '@tanstack/router-core'
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
import { attachStyles } from './styles'
import useLocalStorage from './useLocalStorage'
import { Explorer } from './Explorer'
import { getRouteStatusColor, getStatusColor, multiSortBy } from './utils'
import { AgeTicker } from './AgeTicker'
// import type { DevtoolsPanelOptions } from './TanStackRouterDevtoolsPanel'

import { NavigateButton } from './NavigateButton'
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
import type { Accessor } from 'solid-js'
import type { JSX } from '@solidjs/web'

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
   * The element the devtools are mounted in. Its document or shadow root gets
   * the devtools styles.
   */
  mountElement?: Element
  /**
   * Adds the devtools styles to this shadow root instead.
   */
  shadowDOMTarget?: ShadowRoot
}

const HISTORY_LIMIT = 15

function Logo(props: any) {
  return (
    <button {...props} class="tsrd-logo">
      <div class="tsrd-tanstack-logo">TANSTACK</div>
      <div class="tsrd-router-logo">TanStack Router v1</div>
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

function RouteComp({
  routerState,
  pendingMatches,
  router,
  route,
  isRoot,
  activeId,
  setActiveId,
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
}) {
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
    <div>
      <div
        role="button"
        aria-label={`Open match details for ${route.id}`}
        onClick={() => {
          if (match()) {
            setActiveId(activeId() === route.id ? '' : route.id)
          }
        }}
        class={`tsrd-routes-row-container${match() ? ' tsrd-routes-row-container-match' : ''}${route.id === activeId() ? ' tsrd-routes-row-container-active' : ''}`}
      >
        <div
          class={`tsrd-match-indicator tsrd-match-indicator-${getRouteStatusColor(matches(), route)}`}
        />
        <NavigateLink
          class={
            match()
              ? 'tsrd-routes-row'
              : 'tsrd-routes-row tsrd-routes-row-unmatched'
          }
          left={
            <Show when={navigationTarget()}>
              {(navigate) => <NavigateButton to={navigate()} router={router} />}
            </Show>
          }
          right={<AgeTicker match={match()} router={router} />}
        >
          <code class="tsrd-code">
            {isRoot ? rootRouteId : route.path || trimPath(route.id)}{' '}
          </code>
          <code class="tsrd-route-param-info">{param()}</code>
        </NavigateLink>
      </div>
      {route.children?.length ? (
        <div class={isRoot ? '' : 'tsrd-nested-route-row'}>
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
      mountElement,
      shadowDOMTarget,
      ...panelProps
    } = props

    if (mountElement) {
      attachStyles(mountElement, shadowDOMTarget)
    }

    const { onCloseClick } = useDevtoolsOnClose()
    const { className, style, ...otherPanelProps } = panelProps

    // useStore(router.stores.__store)

    const [currentTab, setCurrentTab] = useLocalStorage<
      'routes' | 'matches' | 'history'
    >('tanstackRouterDevtoolsActiveTab', 'routes')

    const [activeId, setActiveId] = useLocalStorage(
      'tanstackRouterDevtoolsActiveRouteId',
      '',
    )

    const [history, setHistory] = createSignal<Array<AnyRouteMatch>>([])
    const [hasHistoryOverflowed, setHasHistoryOverflowed] = createSignal(false)

    const pendingMatches = () => {
      const matches = routerState().matches
      return matches.some((match: AnyRouteMatch) => match.status === 'pending')
        ? matches
        : []
    }
    let cache = untrack(router)._cache
    let cacheMatches = [...cache.values()]
    const [cachedMatches, setCachedMatches] = createSignal(cacheMatches)

    createEffect(router, (currentRouter) => {
      const refreshCache = () => {
        const next = currentRouter._cache
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
      return () => clearInterval(interval)
    })

    createEffect(
      () => routerState().matches,
      (matches) => {
        const currentMatch = matches[matches.length - 1]
        if (!currentMatch) {
          return
        }
        const historyUntracked = untrack(history)
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
      },
    )

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
    const activeMatchLoaderData = createMemo(() => activeMatch()?.loaderData)
    const activeMatchValue = createMemo(() => activeMatch())
    const locationSearchValue = createMemo(() => routerState().location.search)

    return (
      <div
        class={`tsrd-devtools-panel TanStackRouterDevtoolsPanel ${className?.() ?? ''}`}
        style={style ? style() : ''}
        {...otherPanelProps}
      >
        {handleDragStart ? (
          <div class="tsrd-drag-handle" onMouseDown={handleDragStart}></div>
        ) : null}
        <button
          class="tsrd-panel-close-btn"
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
            class="tsrd-panel-close-btn-icon"
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
        <div class="tsrd-first-container">
          <div class="tsrd-row">
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
          <div class="tsrd-router-explorer-container">
            <div class="tsrd-router-explorer">
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
        <div class="tsrd-second-container">
          <div class="tsrd-matches-container">
            <div class="tsrd-details-header">
              <span>Pathname</span>
              {routerState().location.maskedLocation ? (
                <div class="tsrd-masked-badge-container">
                  <span class="tsrd-masked-badge">masked</span>
                </div>
              ) : null}
            </div>
            <div class="tsrd-details-content">
              <code>{routerState().location.pathname}</code>
              {routerState().location.maskedLocation ? (
                <code class="tsrd-masked-location">
                  {routerState().location.maskedLocation?.pathname}
                </code>
              ) : null}
            </div>
            <div class="tsrd-details-header">
              <div class="tsrd-route-matches-toggle">
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('routes')
                  }}
                  disabled={currentTab() === 'routes'}
                  class={`tsrd-route-matches-toggle-btn tsrd-route-matches-toggle-btn-border${currentTab() === 'routes' ? ' tsrd-route-matches-toggle-btn-active' : ''}`}
                >
                  Routes
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('matches')
                  }}
                  disabled={currentTab() === 'matches'}
                  class={`tsrd-route-matches-toggle-btn tsrd-route-matches-toggle-btn-border${currentTab() === 'matches' ? ' tsrd-route-matches-toggle-btn-active' : ''}`}
                >
                  Matches
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCurrentTab('history')
                  }}
                  disabled={currentTab() === 'history'}
                  class={`tsrd-route-matches-toggle-btn${currentTab() === 'history' ? ' tsrd-route-matches-toggle-btn-active' : ''}`}
                >
                  History
                </button>
              </div>
              <div class="tsrd-details-header-info">
                <div>age / staleTime / gcTime</div>
              </div>
            </div>
            <div class="tsrd-routes-container">
              <Switch>
                <Match when={currentTab() === 'routes'}>
                  <Show when={router().routeTree} keyed>
                    {(routeTree) => (
                      <RouteComp
                        routerState={routerState}
                        pendingMatches={pendingMatches}
                        router={router}
                        route={routeTree}
                        isRoot
                        activeId={activeId}
                        setActiveId={setActiveId}
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
                            setActiveId(activeId() === match.id ? '' : match.id)
                          }
                          class={
                            match === activeMatch()
                              ? 'tsrd-match-row tsrd-match-row-active'
                              : 'tsrd-match-row'
                          }
                        >
                          <div
                            class={`tsrd-match-indicator tsrd-match-indicator-${getStatusColor(match)}`}
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
                            <code class="tsrd-match-id">
                              {`${match.routeId === rootRouteId ? rootRouteId : match.pathname}`}
                            </code>
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
                            class={
                              match === activeMatch()
                                ? 'tsrd-match-row tsrd-match-row-active'
                                : 'tsrd-match-row'
                            }
                          >
                            <div
                              class={`tsrd-match-indicator tsrd-match-indicator-${index() === 0 ? 'green' : 'gray'}`}
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
                              <code class="tsrd-match-id">
                                {`${match.routeId === rootRouteId ? rootRouteId : match.pathname}`}
                              </code>
                            </NavigateLink>
                          </li>
                        )}
                      </For>
                      {hasHistoryOverflowed() ? (
                        <li class="tsrd-history-overflow-container">
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
            <div class="tsrd-cached-matches-container">
              <div class="tsrd-details-header">
                <div>Cached Matches</div>
                <div class="tsrd-details-header-info">
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
                        setActiveId(activeId() === match.id ? '' : match.id)
                      }
                      class={
                        match === activeMatch()
                          ? 'tsrd-match-row tsrd-match-row-active'
                          : 'tsrd-match-row'
                      }
                    >
                      <div
                        class={`tsrd-match-indicator tsrd-match-indicator-${getStatusColor(match)}`}
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
                        <code class="tsrd-match-id">{`${match.id}`}</code>
                      </NavigateLink>
                    </div>
                  )
                })}
              </div>
            </div>
          ) : null}
        </div>
        {activeMatch() && activeMatch()?.status ? (
          <div class="tsrd-third-container">
            <div class="tsrd-details-header">Match Details</div>
            <div>
              <div class="tsrd-match-details">
                <div
                  class={`tsrd-match-status tsrd-match-status-${getStatusColor(activeMatch())}`}
                >
                  <div>
                    {activeMatch()?.status === 'success' &&
                    activeMatch()?.isFetching
                      ? 'fetching'
                      : activeMatch()?.status}
                  </div>
                </div>
                <div class="tsrd-match-details-info-label">
                  <div>ID:</div>
                  <div class="tsrd-match-details-info">
                    <code>{activeMatch()?.id}</code>
                  </div>
                </div>
                <div class="tsrd-match-details-info-label">
                  <div>State:</div>
                  <div class="tsrd-match-details-info">
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
                <div class="tsrd-match-details-info-label">
                  <div>Last Updated:</div>
                  <div class="tsrd-match-details-info">
                    {activeMatch()?.updatedAt
                      ? new Date(activeMatch()?.updatedAt).toLocaleTimeString()
                      : 'N/A'}
                  </div>
                </div>
              </div>
            </div>
            {activeMatchLoaderData() ? (
              <>
                <div class="tsrd-details-header">Loader Data</div>
                <div class="tsrd-details-content">
                  <Explorer
                    label="loaderData"
                    value={activeMatchLoaderData}
                    defaultExpanded={{}}
                  />
                </div>
              </>
            ) : null}
            <div class="tsrd-details-header">Explorer</div>
            <div class="tsrd-details-content">
              <Explorer
                label="Match"
                value={activeMatchValue}
                defaultExpanded={{}}
              />
            </div>
          </div>
        ) : null}
        {hasSearch() ? (
          <div class="tsrd-fourth-container">
            <div class="tsrd-details-header">
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
            <div class="tsrd-details-content">
              <Explorer
                value={locationSearchValue}
                defaultExpanded={untrack(() =>
                  Object.keys(routerState().location.search).reduce(
                    (obj: any, next) => {
                      obj[next] = {}
                      return obj
                    },
                    {},
                  ),
                )}
              />
            </div>
          </div>
        ) : null}
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
