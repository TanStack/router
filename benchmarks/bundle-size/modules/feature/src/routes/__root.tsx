import { Outlet } from '@tanstack/react-router'
import { Link, createModuleRoot } from '../routeScope.gen'

export const Route = createModuleRoot()({
  component: FeatureLayout,
})

function FeatureLayout() {
  return (
    <>
      <Link to="/">Feature home</Link>
      <Outlet />
    </>
  )
}
