import { Link, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/redirect/$target/')({
  component: () => (
    <div>
      <Link
        from={Route.fullPath}
        to="./via-beforeLoad"
        activeProps={{
          className: 'font-bold',
        }}
      >
        via-beforeLoad
      </Link>{' '}
      <Link
        from={Route.fullPath}
        to="./via-loader"
        activeProps={{
          className: 'font-bold',
        }}
      >
        via-loader
      </Link>{' '}
    </div>
  ),
})
