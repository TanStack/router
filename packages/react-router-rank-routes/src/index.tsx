import { Route, parsePathname } from '@tanstack/react-router'

export function rankRoutes<T extends Route>(routes: T[]): T[] {
  return [...routes]
    .map((d, i) => {
      return { ...d, index: i }
    })
    .sort((a, b) => {
      // if (a.search || b.search) {
      //   if (!b.search) return -1
      //   if (!a.search) return 1
      // }

      const aSegments = parsePathname(a.fullPath)
      const bSegments = parsePathname(b.fullPath)

      // Multi-sort by each segment
      for (let i = 0; i < aSegments.length; i++) {
        const aSegment = aSegments[i]
        const bSegment = bSegments[i]

        if (aSegment && bSegment) {
          let sort: -1 | 1 | 0 = 0
          ;(
            [
              {
                key: 'value',
                value: '*',
              },
              {
                key: 'value',
                value: '/',
              },
              {
                key: 'type',
                value: 'param',
              },
            ] as const
          ).some((condition) => {
            if (
              [aSegment[condition.key], bSegment[condition.key]].includes(
                condition.value,
              ) &&
              aSegment[condition.key] !== bSegment[condition.key]
            ) {
              sort = aSegment[condition.key] === condition.value ? 1 : -1
              return true
            }

            return false
          })

          if (sort !== 0) {
            return sort
          }
        } else {
          // Then shorter segments last
          return aSegment ? -1 : 1
        }
      }

      // Keep things stable by route index
      return a.index - b.index
    })
}
