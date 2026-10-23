import { createFileRoute } from '@tanstack/react-router'

const state = globalThis as typeof globalThis & {
  __bunSharedInitializations?: number
}

const shared = {
  initialization: (state.__bunSharedInitializations =
    (state.__bunSharedInitializations ?? 0) + 1),
}

export const Route = createFileRoute('/about')({
  beforeLoad: () => shared,
  loader: () => shared,
  component: About,
})

function About() {
  const data = Route.useLoaderData()
  return (
    <h1 data-shared-identity={data === shared}>
      ABOUT_NATIVE_BUN {shared.initialization}
    </h1>
  )
}
