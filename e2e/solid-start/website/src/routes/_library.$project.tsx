import { Outlet, createFileRoute } from '@tanstack/solid-router'
import { getProject } from 'src/server/projects'
import { seo } from 'src/utils/seo'

export const Route = createFileRoute('/_library/$project')({
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
