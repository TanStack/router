import { Fragment, forwardRef, useLayoutEffect, useState } from 'react'
import { flushSync } from 'react-dom'
import { createLink } from '@tanstack/react-router'
import {
  customLinkClass,
  linkListRevision,
  linkListTestId,
  linkRows,
} from '../../shared'
import type { AnchorHTMLAttributes } from 'react'
import type { LinkListState } from '../../shared'

// A design-system style anchor: forwards its ref and adds its own class.
const BasicAnchor = forwardRef<
  HTMLAnchorElement,
  AnchorHTMLAttributes<HTMLAnchorElement>
>(function BasicAnchor({ className, ...props }, ref) {
  return (
    <a
      ref={ref}
      {...props}
      className={
        className ? `${customLinkClass} ${className}` : customLinkClass
      }
    />
  )
})

const CustomLink = createLink(BasicAnchor)

let linkListState: LinkListState = 'hidden'
const setters = new Set<(state: LinkListState) => void>()

export function resetLinkListState() {
  linkListState = 'hidden'
}

// `flushSync` commits the render and its passive effects before returning, so
// a step includes every Link's mount, update or unmount work.
export function setLinkListState(state: LinkListState) {
  linkListState = state
  flushSync(() => {
    for (const setState of setters) {
      setState(state)
    }
  })
}

function LinkList({ revision }: { revision: number }) {
  return (
    <div data-testid={linkListTestId} data-revision={revision}>
      {linkRows.map(({ postId, page }) => (
        <Fragment key={postId}>
          <CustomLink to="/about">About</CustomLink>
          <CustomLink
            to="/posts/$postId"
            params={{ postId }}
            search={{ page }}
            activeProps={{ className: 'active-link' }}
          >
            {`Post ${postId}`}
          </CustomLink>
        </Fragment>
      ))}
    </div>
  )
}

export function LinkListToggle() {
  const [state, setState] = useState(() => linkListState)

  // Register in a layout effect, which runs in the commit that renders the
  // ready marker. `useSyncExternalStore` subscribes in a passive effect, which
  // can still be pending when the first step runs, so that step would be lost.
  useLayoutEffect(() => {
    setters.add(setState)
    return () => {
      setters.delete(setState)
    }
  }, [])

  return state === 'hidden' ? null : (
    <LinkList revision={linkListRevision(state)} />
  )
}
