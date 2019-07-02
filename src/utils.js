// Most of these utilities have been respectfully
// copied or modified from @reach/router by Ryan Florence. Thanks Ryan!
import React from 'react'

export function trimSlashes(str) {
  return str.replace(/(^\/+|\/+$)/g, '')
}

export function resolve(to, base) {
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

export function isMatch(path, pathname) {
  const pathSegments = segmentize(path)
  const pathnameSegments = segmentize(pathname)

  const isExact = pathSegments.length === pathnameSegments.length

  let newBasePath = []
  const params = {}

  const isMatched = pathSegments.every((segment, i) => {
    if (segment === pathnameSegments[i]) {
      newBasePath[i] = pathnameSegments[i]
      return true
    }
    if (startsWith(segment, ':') && pathnameSegments[i]) {
      const paramName = trimLeading(segment, ':')
      params[paramName] = pathnameSegments[i]
      newBasePath[i] = pathnameSegments[i]
      return true
    }
    return false
  })

  newBasePath = newBasePath.join('/')

  return isMatched ? { params, newBasePath, isExact } : false
}

export function startsWith(string, search) {
  return string.substring(0, search.length) === search
}

export function trimLeading(string, search) {
  return string.substring(string.indexOf(search) + search.length)
}

export function segmentize(uri) {
  if (!uri) {
    return []
  }
  return trimSlashes(uri).split('/')
}

export function isModifiedEvent(e) {
  return !!(e.metaKey || e.altKey || e.ctrlKey || e.shiftKey)
}

export function getResolvedBasepath(path, basepath) {
  return path === '/'
    ? basepath
    : `${trimSlashes(basepath)}/${trimSlashes(path)}`
}

export function useForceUpdate() {
  const [_, setCount] = React.useState(0)
  const mountedRef = React.useRef()

  React.useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  return React.useCallback(() => {
    if (mountedRef.current) {
      setCount(old => old + 1)
    }
  }, [])
}
