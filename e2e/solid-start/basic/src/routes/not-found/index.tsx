import { Link, createFileRoute } from '@tanstack/solid-router'

export const Route = createFileRoute('/not-found/')({
  component: () => {
    const preload = Route.useSearch({ select: (s) => s.preload })
    return (
      <div>
        <div class="mb-2">
          <Link
            from={Route.fullPath}
            to="./via-beforeLoad"
            preload={preload()}
            data-testid="via-beforeLoad"
          >
            via-beforeLoad
          </Link>
        </div>
        <div class="mb-2">
          <Link
            from={Route.fullPath}
            to="./via-loader"
            preload={preload()}
            data-testid="via-loader"
          >
            via-loader
          </Link>
        </div>
        <div class="mb-2">
          <Link
            from={Route.fullPath}
            to="./via-head"
            preload={preload()}
            data-testid="via-head"
          >
            via-head
          </Link>
        </div>
        <div class="mb-2">
          <Link
            from={Route.fullPath}
            to="./via-loaders"
            preload={preload()}
            data-testid="via-loaders"
          >
            via-loaders
          </Link>
        </div>
      </div>
    )
  },
})
