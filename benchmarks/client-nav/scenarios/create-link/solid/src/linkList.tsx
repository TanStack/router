import { For, Show, createSignal, splitProps } from 'solid-js'
import { createLink } from '@tanstack/solid-router'
import {
  customLinkClass,
  linkListRevision,
  linkListTestId,
  linkRows,
} from '../../shared'
import type { ComponentProps } from 'solid-js'
import type { LinkListState } from '../../shared'

// A design-system style anchor: forwards its props and adds its own class.
function BasicAnchor(props: ComponentProps<'a'>) {
  const [local, rest] = splitProps(props, ['class'])
  return (
    <a
      {...rest}
      class={
        local.class ? `${customLinkClass} ${local.class}` : customLinkClass
      }
    />
  )
}

const CustomLink = createLink(BasicAnchor)

const [linkListState, setLinkListStateSignal] =
  createSignal<LinkListState>('hidden')

export function resetLinkListState() {
  setLinkListStateSignal('hidden')
}

// Outside a batch, Solid applies the update and runs its effects before the
// setter returns, so a step includes every Link's mount, update or unmount
// work.
export function setLinkListState(state: LinkListState) {
  setLinkListStateSignal(state)
}

function LinkList(props: { revision: number }) {
  return (
    <div data-testid={linkListTestId} data-revision={props.revision}>
      <For each={linkRows}>
        {({ postId, page }) => (
          <>
            <CustomLink to="/about">About</CustomLink>
            <CustomLink
              to="/posts/$postId"
              params={{ postId }}
              search={{ page }}
              activeProps={{ class: 'active-link' }}
            >
              {`Post ${postId}`}
            </CustomLink>
          </>
        )}
      </For>
    </div>
  )
}

// Unkeyed `Show` keeps the list mounted between `mounted` and `rerendered`;
// only its reactive revision updates.
export function LinkListToggle() {
  return (
    <Show when={linkListState() !== 'hidden'}>
      <LinkList revision={linkListRevision(linkListState())} />
    </Show>
  )
}
