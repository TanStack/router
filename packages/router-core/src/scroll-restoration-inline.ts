export default function (options: {
  storageKey: string
  key?: string
  behavior?: ScrollToOptions['behavior']
  shouldScrollRestoration?: boolean
}) {
  let byKey

  try {
    byKey = JSON.parse(sessionStorage.getItem(options.storageKey) || '{}')
  } catch (error) {
    console.error(error)
    return
  }

  const resolvedKey = options.key || window.history.state?.__TSR_key
  const elementEntries = resolvedKey ? byKey[resolvedKey] : undefined

  if (
    options.shouldScrollRestoration &&
    elementEntries &&
    typeof elementEntries === 'object' &&
    Object.keys(elementEntries).length > 0
  ) {
    for (const elementSelector in elementEntries) {
      const entry = elementEntries[elementSelector]

      if (!entry || typeof entry !== 'object') {
        continue
      }

      const scrollX = entry.scrollX
      const scrollY = entry.scrollY

      if (!Number.isFinite(scrollX) || !Number.isFinite(scrollY)) {
        continue
      }

      if (elementSelector === 'window') {
        window.scrollTo({
          top: scrollY,
          left: scrollX,
          behavior: options.behavior,
        })
      } else if (elementSelector) {
        let element

        try {
          element = document.querySelector(elementSelector)
        } catch {
          continue
        }

        if (element) {
          element.scrollLeft = scrollX
          element.scrollTop = scrollY
        }
      }
    }

    return
  }

  const hash = window.location.hash.split('#', 2)[1]

  if (hash) {
    const hashScrollIntoViewOptions =
      window.history.state?.__hashScrollIntoViewOptions ?? true

    if (hashScrollIntoViewOptions) {
      const el = document.getElementById(hash)
      if (el) {
        el.scrollIntoView(hashScrollIntoViewOptions)
      }
    }

    return
  }

  window.scrollTo({ top: 0, left: 0, behavior: options.behavior })
}
