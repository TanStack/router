import { createRootRoute, createRoute } from '@tanstack/react-router'

export function makeChild(label: string) {
  return createRoute({
    getParentRoute: () => Route,
    path: label,
    component: () => <div>{label}</div>,
  })
}

export const Route = createRootRoute({
  component: () => <div>Root</div>,
})
