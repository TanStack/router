import { createFileRoute } from '@tanstack/solid-router'
import { Hydrate } from '@tanstack/solid-start'
import { idle, visible } from '@tanstack/solid-start/hydration'

export const Route = createFileRoute('/about')({
  component: AboutComponent,
})

function AboutComponent() {
  return (
    <Hydrate when={visible()} prefetch={idle()}>
      <div>hello about</div>
    </Hydrate>
  )
}
