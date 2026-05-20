export default function (options: { storageKey: string; key?: string }) {
  let byKey

  try {
    byKey = JSON.parse(sessionStorage.getItem(options.storageKey) || '{}')
  } catch (error) {
    console.error(error)
    return
  }

  const resolvedKey = options.key || window.history.state?.__TSR_key
  const elementEntries = resolvedKey ? byKey[resolvedKey] : undefined
  let windowRestored = false

  if (elementEntries && typeof elementEntries === 'object') {
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
        })
        windowRestored = true
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
  }

  if (windowRestored) return

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

  window.scrollTo({ top: 0, left: 0 })
}
