import { Fragment, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { Link } from '@tanstack/react-router'
import { linkListTestId, linkRows } from '../../shared'

let linksVisible = false
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getLinksVisible() {
  return linksVisible
}

export function resetLinksVisible() {
  linksVisible = false
}

// `flushSync` commits the render and its passive effects before returning, so
// a step includes every Link's mount or unmount work.
export function setLinksVisible(visible: boolean) {
  flushSync(() => {
    linksVisible = visible
    for (const listener of listeners) {
      listener()
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
  const visible = useSyncExternalStore(subscribe, getLinksVisible)

  return visible ? <LinkList /> : null
}
