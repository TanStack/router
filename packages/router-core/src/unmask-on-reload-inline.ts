export default function (options: { routeMaskSources: Array<string> }) {
  const maskedRoutePathPatterns = options.routeMaskSources.map(
    (source) => new RegExp(source),
  )
  const tempLocation = window.history.state?.__tempLocation

  if (!tempLocation?.pathname) return

  if (
    tempLocation.pathname === window.location.pathname &&
    (tempLocation.search ?? '') === window.location.search &&
    (tempLocation.hash ?? '') === window.location.hash
  )
    return

  if (!maskedRoutePathPatterns.some((pattern) => pattern.test(tempLocation.pathname)))
    return

  window.location.replace(
    tempLocation.pathname + (tempLocation.search ?? '') + (tempLocation.hash ?? ''),
  )
}
