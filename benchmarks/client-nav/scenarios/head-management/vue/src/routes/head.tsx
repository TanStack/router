import * as Vue from 'vue'
import { Outlet, createRoute } from '@tanstack/vue-router'
import {
  createHeadLoaderData,
  createHeadSectionHead,
} from '../../../shared.ts'
import { Route as rootRoute } from './__root'

const HeadLayout = Vue.defineComponent({
  setup() {
    const loaderData = Route.useLoaderData()

    return () => (
      <section
        data-route-marker="head"
        data-head-checksum={loaderData.value.checksum}
      >
        <Outlet />
      </section>
    )
  },
})

export const Route = createRoute({
  getParentRoute: () => rootRoute,
  path: '/head',
  loaderDeps: ({ search }) => search,
  loader: ({ deps }) => createHeadLoaderData('section', 'root', deps),
  head: ({ loaderData }) => createHeadSectionHead(loaderData!),
  component: HeadLayout,
})
