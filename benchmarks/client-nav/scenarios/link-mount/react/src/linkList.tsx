import { Fragment, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { Link } from '@tanstack/react-router'
import { linkListTestId, linkRows } from '../../shared'

let linksVisible = false
const setters = new Set<(visible: boolean) => void>()

export function resetLinksVisible() {
  linksVisible = false
}

// `flushSync` commits the render and its passive effects before returning, so
// a step includes every Link's mount or unmount work.
export function setLinksVisible(visible: boolean) {
  linksVisible = visible
  flushSync(() => {
    for (const setVisible of setters) {
      setVisible(visible)
    }
  })
}

function LinkList() {
  return (
    <div data-testid={linkListTestId}>
      {linkRows.map(({ postId, page }) => (
        <Fragment key={postId}>
          <Link to="/about">About</Link>
          <Link
            to="/posts/$postId"
            params={{ postId }}
            search={{ page }}
            activeProps={{ className: 'active-link' }}
          >
            {`Post ${postId}`}
          </Link>
        </Fragment>
      ))}
    </div>
  )
}

export function LinkListToggle() {
  const [visible, setVisible] = useState(() => linksVisible)

  // Register in a layout effect, which runs in the commit that renders the
  // ready marker. `useSyncExternalStore` subscribes in a passive effect, which
  // can still be pending when the first step runs, so that step would be lost.
  useLayoutEffect(() => {
    setters.add(setVisible)
    return () => {
      setters.delete(setVisible)
    }
  }, [])

  return visible ? <LinkList /> : null
}
