import { Outlet, createRoute } from '@tanstack/solid-router'
import {
  createHeadLoaderData,
  createHeadSectionHead,
} from '../../../shared.ts'
import { Route as rootRoute } from './__root'

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/head',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('section', 'root', deps),
  head: ({ loaderData }) => createHeadSectionHead(loaderData!),
  component: HeadLayout,
})

function HeadLayout() {
  const loaderData = Route.useLoaderData()

  return (
    <section
      data-route-marker="head"
      data-head-checksum={loaderData().checksum}
    >
      <Outlet />
    </section>
  )
}
