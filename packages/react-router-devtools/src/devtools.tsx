import React from 'react'
import { Router, last } from '@tanstack/react-router'
import { formatDistanceStrict } from 'date-fns'

import useLocalStorage from './useLocalStorage'
import {
  getStatusColor,
  multiSortBy,
  useIsMounted,
  useSafeState,
} from './utils'
import { Panel, Button, Code, ActivePanel } from './styledComponents'
import { ThemeProvider, defaultTheme as theme } from './theme'
// import { getQueryStatusLabel, getQueryStatusColor } from './utils'
import Explorer from './Explorer'
import Logo from './Logo'

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
  router: Router<any, any>
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
  handleDragStart: (e: React.MouseEvent<HTMLDivElement, MouseEvent>) => void
  /**
   * A boolean variable indicating if the "lite" version of the library is being used
   */
  router: Router<any, any>
}

const isServer = typeof window === 'undefined'

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
    <Container ref={rootRef} className="TanStackRouterDevtools">
      <ThemeProvider theme={theme}>
        <TanStackRouterDevtoolsPanel
          ref={panelRef as any}
          {...otherPanelProps}
          router={router}
          style={{
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
        {isResolvedOpen ? (
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
        ) : null}
      </ThemeProvider>
      {!isResolvedOpen ? (
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
      ) : null}
    </Container>
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
    router,
    ...panelProps
  } = props

  const rerender = React.useReducer(() => ({}), {})[1]

  React.useEffect(() => {
    let interval = setInterval(() => {
      router.cleanMatchCache()
      // router.notify()
      rerender()
    }, 250)

    return () => {
      clearInterval(interval)
    }
  }, [])

  const [activeRouteId, setActiveRouteId] = useLocalStorage(
    'tanstackRouterDevtoolsActiveRouteId',
    '',
  )

  const [activeMatchId, setActiveMatchId] = useLocalStorage(
    'tanstackRouterDevtoolsActiveMatchId',
    '',
  )

  React.useEffect(() => {
    setActiveMatchId('')
  }, [activeRouteId])

  const activeMatch =
    Object.values(router.matchCache)?.find(
      (d) => d.match.matchId === activeMatchId,
    )?.match ?? router.state.matches?.find((d) => d.routeId === activeRouteId)

  const matchCacheValues = multiSortBy(
    Object.keys(router.matchCache)
      .filter((key) => {
        const cacheEntry = router.matchCache[key]!
        return cacheEntry.gc > Date.now()
      })
      .map((key) => router.matchCache[key]!),
    [(d) => (d.match.isFetching ? -1 : 1), (d) => -d.match.updatedAt!],
  )

  return (
    <ThemeProvider theme={theme}>
      <Panel ref={ref} className="TanStackRouterDevtoolsPanel" {...panelProps}>
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
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: '100%',
            height: '4px',
            marginBottom: '-4px',
            cursor: 'row-resize',
            zIndex: 100000,
          }}
          onMouseDown={handleDragStart}
        ></div>
        <div
          style={{
            flex: '1 1 500px',
            minHeight: '40%',
            maxHeight: '100%',
            overflow: 'auto',
            borderRight: `1px solid ${theme.grayAlt}`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '.5em',
              background: theme.backgroundAlt,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Logo
              aria-hidden
              style={{
                marginRight: '.5em',
              }}
            />
            <div
              style={{
                marginRight: 'auto',
                fontSize: 'clamp(.8rem, 2vw, 1.3rem)',
                fontWeight: 'bold',
              }}
            >
              TanStack Router{' '}
              <span
                style={{
                  fontWeight: 100,
                }}
              >
                Devtools
              </span>
            </div>
          </div>
          <div
            style={{
              overflowY: 'auto',
              flex: '1',
            }}
          >
            <div
              style={{
                padding: '.5em',
              }}
            >
              <Explorer label="Router" value={router} defaultExpanded={{}} />
            </div>
          </div>
        </div>
        <div
          style={{
            flex: '1 1 500px',
            minHeight: '40%',
            maxHeight: '100%',
            overflow: 'auto',
            borderRight: `1px solid ${theme.grayAlt}`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '.5em',
              background: theme.backgroundAlt,
              position: 'sticky',
              top: 0,
              zIndex: 1,
            }}
          >
            Active Matches
          </div>
          {router.state.matches.map((match, i) => {
            return (
              <div
                key={match.routeId || i}
                role="button"
                aria-label={`Open match details for ${match.routeId}`}
                onClick={() =>
                  setActiveRouteId(
                    activeRouteId === match.routeId ? '' : match.routeId,
                  )
                }
                style={{
                  display: 'flex',
                  borderBottom: `solid 1px ${theme.grayAlt}`,
                  cursor: 'pointer',
                  alignItems: 'center',
                  background:
                    match === activeMatch ? 'rgba(255,255,255,.1)' : undefined,
                }}
              >
                <div
                  style={{
                    flex: '0 0 auto',
                    width: '1.3rem',
                    height: '1.3rem',
                    marginLeft: '.25rem',
                    background: getStatusColor(match, theme),
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 'bold',
                    borderRadius: '.25rem',
                    transition: 'all .2s ease-out',
                  }}
                />

                <Code
                  style={{
                    padding: '.5em',
                  }}
                >
                  {`${match.matchId}`}
                </Code>
              </div>
            )
          })}
          {router.state.pending?.matches.length ? (
            <>
              <div
                style={{
                  marginTop: '2rem',
                  padding: '.5em',
                  background: theme.backgroundAlt,
                  position: 'sticky',
                  top: 0,
                  zIndex: 1,
                }}
              >
                Pending Matches
              </div>
              {router.state.pending?.matches.map((match, i) => {
                return (
                  <div
                    key={match.routeId || i}
                    role="button"
                    aria-label={`Open match details for ${match.routeId}`}
                    onClick={() =>
                      setActiveRouteId(
                        activeRouteId === match.routeId ? '' : match.routeId,
                      )
                    }
                    style={{
                      display: 'flex',
                      borderBottom: `solid 1px ${theme.grayAlt}`,
                      cursor: 'pointer',
                      background:
                        match === activeMatch
                          ? 'rgba(255,255,255,.1)'
                          : undefined,
                    }}
                  >
                    <div
                      style={{
                        flex: '0 0 auto',
                        width: '1.3rem',
                        height: '1.3rem',
                        marginLeft: '.25rem',
                        background: getStatusColor(match, theme),
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontWeight: 'bold',
                        borderRadius: '.25rem',
                        transition: 'all .2s ease-out',
                      }}
                    />

                    <Code
                      style={{
                        padding: '.5em',
                      }}
                    >
                      {`${match.matchId}`}
                    </Code>
                  </div>
                )
              })}
            </>
          ) : null}
          {matchCacheValues.length ? (
            <>
              <div
                style={{
                  marginTop: '2rem',
                  padding: '.5em',
                  background: theme.backgroundAlt,
                  position: 'sticky',
                  top: 0,
                  bottom: 0,
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <div>Match Cache</div>
                <Button
                  onClick={() => {
                    router.matchCache = {}
                    router.notify()
                  }}
                >
                  Clear
                </Button>
              </div>
              {matchCacheValues.map((d, i) => {
                const { match, gc } = d

                return (
                  <div
                    key={match.matchId || i}
                    role="button"
                    aria-label={`Open match details for ${match.matchId}`}
                    onClick={() =>
                      setActiveMatchId(
                        activeMatchId === match.matchId ? '' : match.matchId,
                      )
                    }
                    style={{
                      display: 'flex',
                      borderBottom: `solid 1px ${theme.grayAlt}`,
                      cursor: 'pointer',
                      background:
                        match === activeMatch
                          ? 'rgba(255,255,255,.1)'
                          : undefined,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        padding: '.5rem',
                        gap: '.3rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '.5rem',
                        }}
                      >
                        <div
                          style={{
                            flex: '0 0 auto',
                            width: '1.3rem',
                            height: '1.3rem',
                            background: getStatusColor(match, theme),
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 'bold',
                            borderRadius: '.25rem',
                            transition: 'all .2s ease-out',
                          }}
                        />
                        <Code>{`${match.matchId}`}</Code>
                      </div>
                      <span
                        style={{
                          fontSize: '.7rem',
                          opacity: '.5',
                          lineHeight: 1,
                        }}
                      >
                        Expires{' '}
                        {formatDistanceStrict(new Date(gc), new Date(), {
                          addSuffix: true,
                        })}
                      </span>
                    </div>
                  </div>
                )
              })}
            </>
          ) : null}
        </div>

        {activeMatch ? (
          <ActivePanel>
            <div
              style={{
                padding: '.5em',
                background: theme.backgroundAlt,
                position: 'sticky',
                top: 0,
                bottom: 0,
                zIndex: 1,
              }}
            >
              Match Details
            </div>
            <div>
              <table>
                <tbody>
                  <tr>
                    <td style={{ opacity: '.5' }}>ID</td>
                    <td>
                      <Code
                        style={{
                          lineHeight: '1.8em',
                        }}
                      >
                        {JSON.stringify(activeMatch.matchId, null, 2)}
                      </Code>
                    </td>
                  </tr>
                  <tr>
                    <td style={{ opacity: '.5' }}>Status</td>
                    <td>{activeMatch.status}</td>
                  </tr>
                  <tr>
                    <td style={{ opacity: '.5' }}>Pending</td>
                    <td>{activeMatch.isPending.toString()}</td>
                  </tr>
                  <tr>
                    <td style={{ opacity: '.5' }}>Invalid</td>
                    <td>{activeMatch.isInvalid.toString()}</td>
                  </tr>
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
            <div
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
                onClick={() => {
                  activeMatch.invalidate()
                  router.notify()
                }}
                style={{
                  background: theme.warning,
                  color: theme.inputTextColor,
                }}
              >
                Invalidate
              </Button>{' '}
              <Button
                type="button"
                onClick={() => activeMatch.load()}
                style={{
                  background: theme.gray,
                }}
              >
                Reload
              </Button>
            </div>
            <div
              style={{
                background: theme.backgroundAlt,
                padding: '.5em',
                position: 'sticky',
                top: 0,
                bottom: 0,
                zIndex: 1,
              }}
            >
              Explorer
            </div>
            <div
              style={{
                padding: '.5em',
              }}
            >
              <Explorer
                label="Match"
                value={activeMatch}
                defaultExpanded={{}}
              />
            </div>
          </ActivePanel>
        ) : null}
        <div
          style={{
            flex: '1 1 500px',
            minHeight: '40%',
            maxHeight: '100%',
            overflow: 'auto',
            borderRight: `1px solid ${theme.grayAlt}`,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <div
            style={{
              padding: '.5em',
              background: theme.backgroundAlt,
              position: 'sticky',
              top: 0,
              bottom: 0,
              zIndex: 1,
            }}
          >
            All Loader Data
          </div>
          <div
            style={{
              padding: '.5em',
            }}
          >
            {Object.keys(last(router.state.matches)?.loaderData || {})
              .length ? (
              <Explorer
                value={last(router.state.matches)?.loaderData || {}}
                defaultExpanded={Object.keys(
                  (last(router.state.matches)?.loaderData as {}) || {},
                ).reduce((obj: any, next) => {
                  obj[next] = {}
                  return obj
                }, {})}
              />
            ) : (
              <em style={{ opacity: 0.5 }}>{'{ }'}</em>
            )}
          </div>
          <div
            style={{
              padding: '.5em',
              background: theme.backgroundAlt,
              position: 'sticky',
              top: 0,
              bottom: 0,
              zIndex: 1,
            }}
          >
            Search Params
          </div>
          <div
            style={{
              padding: '.5em',
            }}
          >
            {Object.keys(last(router.state.matches)?.search || {}).length ? (
              <Explorer
                value={last(router.state.matches)?.search || {}}
                defaultExpanded={Object.keys(
                  (last(router.state.matches)?.search as {}) || {},
                ).reduce((obj: any, next) => {
                  obj[next] = {}
                  return obj
                }, {})}
              />
            ) : (
              <em style={{ opacity: 0.5 }}>{'{ }'}</em>
            )}
          </div>
        </div>
      </Panel>
    </ThemeProvider>
  )
})
