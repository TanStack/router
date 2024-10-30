import { createServerFn } from '@tanstack/start'
import { notFound } from '@tanstack/react-router'
import { capitalize } from '~/utils/seo'

const projects = ['router', 'table', 'query', 'form', 'ranger']

export const getProjects = createServerFn('GET', async () => {
  await new Promise((resolve) => setTimeout(resolve, 200))

  return projects
})

export const getProject = createServerFn('GET', async (project: string) => {
  await new Promise((resolve) => setTimeout(resolve, 200))

  const selectedProject = projects.find((p) => p === project.toLowerCase())

  if (!selectedProject) {
    throw notFound()
  }

  return {
    id: selectedProject,
    name: capitalize(selectedProject),
    versions: ['latest', 'v2', 'v1'],
    frameworks: ['react', 'vue', 'solidjs', 'svelte'],
    examples: ['basic', 'kitchen-sink'],
  }
})
