import { Outlet, createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/dashboard/projects/$projectId')({
  component: ProjectPage,
})

function ProjectPage() {
  const params = Route.useParams()

  return (
    <>
      <div data-route-marker="project" data-project-id={params.projectId} />
      <Outlet />
    </>
  )
}
