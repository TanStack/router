import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/not-found/')({
  component: () => {
    const preload = Route.useSearch({ select: (s) => s.preload })
    return (
      <div>
        <div className="mb-2">
          <Link
            from={Route.fullPath}
            to="./via-beforeLoad"
            preload={preload}
            data-testid="via-beforeLoad"
          >
            via-beforeLoad
          </Link>
        </div>
        <div className="mb-2">
          <Link
            from={Route.fullPath}
            to="./via-loader"
            preload={preload}
            data-testid="via-loader"
          >
            via-loader
          </Link>
        </div>
      </div>
    )
  },
})
