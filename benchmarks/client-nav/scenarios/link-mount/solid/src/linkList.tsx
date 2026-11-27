import { For, Show, createSignal } from 'solid-js'
import { Link } from '@tanstack/solid-router'
import { linkListTestId, linkRows } from '../../shared'

const [linksVisible, setLinksVisibleSignal] = createSignal(false)

export function resetLinksVisible() {
  setLinksVisibleSignal(false)
}

// Outside a batch, Solid applies the update and runs its effects before the
// setter returns, so a step includes every Link's mount or unmount work.
export function setLinksVisible(visible: boolean) {
  setLinksVisibleSignal(visible)
}

function LinkList() {
  return (
    <div data-testid={linkListTestId}>
      <For each={linkRows}>
        {({ postId, page }) => (
          <>
            <Link to="/about">About</Link>
            <Link
              to="/posts/$postId"
              params={{ postId }}
              search={{ page }}
              activeProps={{ class: 'active-link' }}
            >
              {`Post ${postId}`}
            </Link>
          </>
        )}
      </For>
    </div>
  )
}

export function LinkListToggle() {
  return (
    <Show when={linksVisible()}>
      <LinkList />
    </Show>
  )
}
