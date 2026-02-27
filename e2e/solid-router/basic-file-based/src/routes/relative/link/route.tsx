import {
  Link,
  Outlet,
  createFileRoute,
  useNavigate,
} from '@tanstack/solid-router'
import { createTrackedEffect } from 'solid-js'

export const Route = createFileRoute('/relative/link')({
  component: RouteComponent,
})

function RouteComponent() {
  const navigate = useNavigate()

  createTrackedEffect(() => {
    console.log('navigate')
  })

  return (
    <div class="p-2">
      <div class="border-b" data-testid="relative-link-header">
        Relative Routing - Links - Index
      </div>
      <div>
        <Link
          to="/relative"
          data-testid="relative-link-home"
          class="mr-2 underline"
        >
          Return To Home
        </Link>
        <Link
          to="/relative/link"
          data-testid="relative-link-index"
          class="mr-2"
        >
          Return To Index
        </Link>
        <Link to="." data-testid="relative-link-reload" class="mr-2 underline">
          Reload
        </Link>
        <Link to=".." data-testid="relative-link-back" class="mr-2 underline">
          Back
        </Link>
        <Link
          to="/relative/link/relative-link-a"
          data-testid="relative-link-a"
          class="mr-2 underline"
        >
          To Relative Link A
        </Link>
        <Link
          to="/relative/link/relative-link-b"
          data-testid="relative-link-b"
          class="mr-2 underline"
        >
          To Relative Link B
        </Link>
        <Link
          to="/relative/link/nested/deep"
          data-testid="relative-link-deeply-nested"
          class="mr-2 underline"
        >
          To Deeply Nested
        </Link>
        <Link
          to="/relative/link/path/$path"
          params={{ path: 'a' }}
          data-testid="relative-link-path"
          class="mr-2 underline"
        >
          To Path Param A
        </Link>
        <Link
          to="/relative/link/with-search"
          search={{ searchParam: '1' }}
          data-testid="relative-link-withSearch"
          class="mr-2 underline"
        >
          To With Search Params
        </Link>
      </div>
      <div>
        <Outlet />
      </div>
    </div>
  )
}
