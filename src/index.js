import React from 'react'
import * as qss from 'qss'

import {
  createBrowserHistory,
  createHashHistory,
  createMemoryHistory,
  parsePath,
  createPath,
} from 'history'

{
  createBrowserHistory, createHashHistory, createMemoryHistory
}

// The shared context for everything
const context = React.createContext()

// Detect if we're in the DOM
const isDOM = Boolean(
  typeof window !== 'undefined' &&
    window.document &&
    window.document.createElement,
)

// This is the default history object if none is defined
const defaultHistory = createBrowserHistory(
  isDOM ? window : createMemoryHistory(),
)

const useIsMounted = () => {
  const isMountedRef = React.useRef(false)

  React.useEffect(() => {
    isMountedRef.current = true

    return () => {
      isMountedRef.current = false
    }
  }, [])

  return isMountedRef.current
}

const LocationRoot = ({
  children,
  history: userHistory,
  basepath: userBasepath,
}) => {
  const isMounted = useIsMounted()
  const getIsMounted = useGetLatest(isMounted)
  const historyRef = React.useRef(userHistory || defaultHistory)
  const historyListenerRef = React.useRef()
  const [location, setLocation] = React.useState(historyRef.current.location)

  if (!historyListenerRef.current) {
    historyListenerRef.current = history.listen((location) => {
      if (getIsMounted()) {
        setLocation(location)
      }
    })
  }

  // Before the component unmounts, unsubscribe from the history
  React.useEffect(() => {
    return historyListenerRef.current
  }, [])

  const basepath = userBasepath || '/'

  const match = React.useMemo(
    () => ({
      path: '/',
      url: '/',
      params: {},
      isExact: location.pathname === '/',
    }),
    [],
  )

  const contextValueRef = React.useMemo(
    () => ({
      match,
      location,
      basepath,
      history: historyRef.current,
    }),
    [location, basepath],
  )

  return (
    <context.Provider value={contextValueRef.current}>
      {children}
    </context.Provider>
  )
}

const parseQuery = (search) => {
  let query = qss.decode(search.substring(1))

  // Try to parse any query params that might be json
  Object.keys(query).forEach((key) => {
    try {
      query[key] = JSON.parse(query[key])
    } catch (err) {
      //
    }
  })

  return query
}

const useLocation = () => {
  const {
    location,
    match,
    match: { params },
    basepath,
    history,
  } = React.useContext(context)

  const { pathname, search, hash: fullHash, state, key } = location

  // Get the hash without the bang
  const [, ...hashParts] = fullHash.split('#')
  const hash = hashParts.join('')

  const previousQueryRef = React.useRef()

  // Parse the query params into an object
  const query = React.useMemo(() => {
    let newQuery = parseQuery(search)
    return replaceEqualDeep(previousQueryRef.current, newQuery)
  }, [search])
  previousQueryRef.current = query

  const href = pathname + (hash ? `#${hash}` : '') + search

  return {
    location,
    match,
    params,
    hash,
    query,
    href,
    state,
    key,
    history,
  }
}

const useNavigate = () => {
  // Make the navigate function
  return React.useCallback(
    (
      to,
      { query: queryUpdater, state: stateUpdater, replace, preview } = {},
    ) => {
      // Allow query params and state to be updated with a function
      const resolvedQuery =
        typeof queryUpdater === 'function'
          ? queryUpdater(navigateRef.current.query)
          : queryUpdater
      const resolvedState =
        typeof stateUpdater === 'function'
          ? stateUpdater(navigateRef.current.state)
          : stateUpdater

      // If the query was updated, serialize all of the subkeys
      if (resolvedQuery) {
        Object.keys(resolvedQuery).forEach((key) => {
          const val = resolvedQuery[key]
          if (typeof val === 'object' && val !== 'null') {
            resolvedQuery[key] = JSON.stringify(val)
          }
        })
      }

      // Then stringify the query params for URL encoding
      const search = qss.encode(resolvedQuery, '?')

      // Construct the final href for the navigation
      const href =
        resolve(
          typeof to === 'function' ? to(params) : to,
          navigateRef.current.basepath,
        ) + (search === '?' ? '' : search)

      // If this is a preview, just return the final href
      if (preview) {
        return href
      }

      // Otherwise, apply the navigation to the history
      return navigateRef.current.history._navigate(href, {
        state: resolvedState,
        replace,
      })
    },
    [],
  )
}

// MatchFirst returns the first matching child Match component or
// any non-null non-Match component and renders only that component.
// Comparable to React-Locations Swtich component
export const MatchFirst = ({ children }) => {
  const matchFirstRef = React.useRef()

  matchFirstRef.current = false

  let comp

  children = React.Children.toArray(children)
  ;[...children.reverse()].forEach((child) => {
    comp = child.type.__isMatch
      ? React.cloneElement(child, {
          ...child.props,
          miss: comp,
          exact: child.props.path === '/',
        })
      : child.type.__isRedirect
      ? React.cloneElement(child, {
          ...child.props,
          miss: comp,
        })
      : child
  })

  return comp
}

// The Match component is used to match paths againts the location and
// render content for that match
const Match = ({ path, element, miss = null }) => {
  // Use the location
  const {
    location,
    match,
    match: { params },
    basepath,
    history,
  } = React.useContext(context)

  // See if the route is currently matched
  let match = React.useMemo(() => isMatch(path), [isMatch, path])

  let newBasePath

  if (match) {
    // If the route is a match, make sure we use
    // the newBasePath from the match. It contains
    // the interpolated path, free of route param
    // identifiers
    newBasePath = match.newBasePath
  }

  const newParams = React.useMemo(
    () => ({
      ...params,
      ...(match ? match.params : {}),
    }),
    [match, params],
  )

  // Update the contex to use hte new basePath and params
  const contextValue = React.useMemo(
    () => ({
      ...locationValue,
      basepath: newBasePath,
      params: newParams,
    }),
    [locationValue, newBasePath, newParams],
  )

  // Not a match? Return a miss
  if (!match) {
    return miss
  }

  // Support just children
  return <context.Provider value={contextValue}>{element}</context.Provider>
}

Match.__isMatch = true

// The Match component is used to match paths againts the location and
// render content for that match
const Redirect = ({ from, to, query, state, replace = true, miss = null }) => {
  // Use the location
  const locationValue = useLocation()
  const { pathname, navigate, isMatch } = locationValue

  // See if the route is currently matched
  let match = React.useMemo(() => !from || isMatch(from), [from, isMatch])

  if (match && from === '/' && !match.isExact) {
    match = false
  }

  React.useLayoutEffect(() => {
    if (match) {
      navigate(to, { query, state, replace })
    }
  }, [match, navigate])

  if (match) {
    return null
  }

  return miss
}

Redirect.__isRedirect = true

function Link({
  to,
  query,
  replace,
  state,
  onClick,
  target,
  style = {},
  className = '',
  getActiveProps = () => ({}),
  activeType,
  children,
  ...rest
}) {
  // Use the useLocation hook
  const location = useLocation()
  const { navigate, pathname, href } = location

  // If this `to` is an external URL, make a normal a href
  if (typeof to === 'string') {
    try {
      const link = new URL(to)
      return (
        <a
          href={link.href}
          target={target}
          style={style}
          className={className}
          {...rest}
        >
          {children}
        </a>
      )
    } catch (e) {
      // if a path is not parsable by URL its a local relative path.
      // Proceed
    }
  }

  // Get the preview href for this link and its variations
  const linkHrefWithQuery = navigate(to, {
    query,
    state,
    replace,
    preview: true,
    params: location.params,
  })
  const linkHrefWithHash = linkHrefWithQuery.split('?')[0]
  const linkHref = linkHrefWithHash.split('#')[0]

  // Detect if this link is active using the different activeType options
  let isCurrent
  if (activeType === 'partial') {
    isCurrent = startsWith(href, linkHrefWithQuery)
  } else if (activeType === 'path') {
    isCurrent = pathname === linkHref
  } else if (activeType === 'hash') {
    isCurrent = pathname === linkHrefWithHash
  } else {
    isCurrent = href === linkHrefWithQuery
  }

  // Get the active props
  const {
    style: activeStyle = {},
    className: activeClassName = '',
    ...activeRest
  } = isCurrent ? getActiveProps(location) : {}

  // The click handler
  const handleClick = (e) => {
    if (onClick) onClick(e)

    if (
      !e.defaultPrevented && // onClick prevented default
      e.button === 0 && // ignore everything but left clicks
      (!target || target === '_self') && // let browser handle "target=_blank" etc.
      !isModifiedEvent(e) // ignore clicks with modifier keys
    ) {
      e.preventDefault()
      // All is well? Navigate!
      navigate(to, { query, state, replace })
    }
  }

  return (
    <a
      href={linkHrefWithQuery}
      target={target}
      onClick={handleClick}
      style={{
        ...style,
        ...activeStyle,
      }}
      className={
        [className, activeClassName].filter(Boolean).join(' ') || undefined
      }
      {...rest}
      {...activeRest}
    >
      {children}
    </a>
  )
}

function trimSlashes(str) {
  return str.replace(/(^\/+|\/+$)/g, '')
}

function resolve(to, base) {
  to = String(to)
  if (startsWith(to, '/')) {
    return to
  }

  const toSegments = segmentize(to)
  const baseSegments = segmentize(base)

  if (toSegments[0] === '') {
    return base
  }

  if (!startsWith(toSegments[0], '.')) {
    const pathname = baseSegments.concat(toSegments).join('/')
    return (base === '/' ? '' : '/') + pathname
  }

  const allSegments = baseSegments.concat(toSegments)

  const segments = []

  for (let i = 0, l = allSegments.length; i < l; i++) {
    const segment = allSegments[i]
    if (segment === '..') segments.pop()
    else if (segment !== '.') segments.push(segment)
  }

  return `/${segments.join('/')}`
}

function isMatch(path, parentPath) {
  const pathSegments = segmentize(path)
  const parentPathSegments = segmentize(parentPath)

  let newBasePath = []
  const params = {}

  const isMatched = pathSegments.every((segment, i) => {
    if (segment === parentPathSegments[i]) {
      newBasePath[i] = parentPathSegments[i]
      return true
    }
    if (startsWith(segment, ':') && parentPathSegments[i]) {
      const paramName = trimLeading(segment, ':')
      params[paramName] = parentPathSegments[i]
      newBasePath[i] = parentPathSegments[i]
      return true
    }
    return false
  })

  newBasePath = newBasePath.join('/')

  const isExact = pathSegments.length === pathnameSegments.length

  return isMatched ? { params, newBasePath, isExact } : false
}

function startsWith(string, search) {
  return string.substring(0, search.length) === search
}

function trimLeading(string, search) {
  return string.substring(string.indexOf(search) + search.length)
}

function segmentize(uri) {
  if (!uri) {
    return []
  }
  return trimSlashes(uri).split('/')
}

function isModifiedEvent(e) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

function getResolvedBasepath(path, basepath) {
  return path === '/'
    ? basepath
    : `${trimSlashes(basepath)}/${trimSlashes(path)}`
}

/**
 * This function returns `a` if `b` is deeply equal.
 * If not, it will replace any deeply equal children of `b` with those of `a`.
 * This can be used for structural sharing between JSON values for example.
 */
function replaceEqualDeep(a, b) {
  if (a === b) {
    return a
  }

  const array = Array.isArray(a) && Array.isArray(b)

  if (array || (isPlainObject(a) && isPlainObject(b))) {
    const aSize = array ? a.length : Object.keys(a).length
    const bItems = array ? b : Object.keys(b)
    const bSize = bItems.length
    const copy = array ? [] : {}

    let equalItems = 0

    for (let i = 0; i < bSize; i++) {
      const key = array ? i : bItems[i]
      copy[key] = replaceEqualDeep(a[key], b[key])
      if (copy[key] === a[key]) {
        equalItems++
      }
    }

    return aSize === bSize && equalItems === aSize ? a : copy
  }

  return b
}

// Copied from: https://github.com/jonschlinkert/is-plain-object
function isPlainObject(o) {
  if (!hasObjectPrototype(o)) {
    return false
  }

  // If has modified constructor
  const ctor = o.constructor
  if (typeof ctor === 'undefined') {
    return true
  }

  // If has modified prototype
  const prot = ctor.prototype
  if (!hasObjectPrototype(prot)) {
    return false
  }

  // If constructor does not have an Object-specific method
  if (!prot.hasOwnProperty('isPrototypeOf')) {
    return false
  }

  // Most likely a plain Object
  return true
}

function hasObjectPrototype(o) {
  return Object.prototype.toString.call(o) === '[object Object]'
}
