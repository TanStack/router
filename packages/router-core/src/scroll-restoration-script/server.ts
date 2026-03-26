import minifiedScrollRestorationScript from '../scroll-restoration-inline?script-string'
import {
  defaultGetScrollRestorationKey,
  storageKey,
} from '../scroll-restoration'
import { escapeHtml } from '../utils'
import type { AnyRouter } from '../router'

type InlineScrollRestorationScriptOptions = {
  storageKey: string
  key?: string
  behavior?: ScrollToOptions['behavior']
  shouldScrollRestoration?: boolean
}

const defaultInlineScrollRestorationScript = `(${minifiedScrollRestorationScript})(${escapeHtml(
  JSON.stringify({
    storageKey,
    shouldScrollRestoration: true,
  } satisfies InlineScrollRestorationScriptOptions),
)})`

function getScrollRestorationScript(
  options: InlineScrollRestorationScriptOptions,
) {
  if (
    options.storageKey === storageKey &&
    options.shouldScrollRestoration === true &&
    options.key === undefined &&
    options.behavior === undefined
  ) {
    return defaultInlineScrollRestorationScript
  }

  return `(${minifiedScrollRestorationScript})(${escapeHtml(JSON.stringify(options))})`
}

export function getScrollRestorationScriptForRouter(router: AnyRouter) {
  if (
    typeof router.options.scrollRestoration === 'function' &&
    !router.options.scrollRestoration({ location: router.latestLocation })
  ) {
    return null
  }

  const getKey = router.options.getScrollRestorationKey
  if (!getKey) {
    return defaultInlineScrollRestorationScript
  }

  const location = router.latestLocation
  const userKey = getKey(location)
  const defaultKey = defaultGetScrollRestorationKey(location)

  if (userKey === defaultKey) {
    return defaultInlineScrollRestorationScript
  }

  return getScrollRestorationScript({
    storageKey,
    shouldScrollRestoration: true,
    key: userKey,
  })
}
