import { Outlet } from '@tanstack/solid-router'
import { getProject } from '~/server/projects'
import { seo } from '~/utils/seo'

export const Route = createFileRoute({
  loader: ({ params: { project } }) => getProject({ data: project }),
  head: ({ loaderData }) => ({
    meta: seo({ title: `TanStack ${loaderData?.name || 'Project'}` }),
  }),
  component: () => (
    <div class="p-2">
      <Outlet />
    </div>
  ),
})
